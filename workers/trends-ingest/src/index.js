/**
 * Spot and Travel — trends ingest + report Worker (Cloudflare Workers + D1, free tier).
 *
 *   POST /v1/events           anonymous swipe events (schema v1, docs/trends/EVENT-SCHEMA.md)
 *   GET  /v1/report/places    per-place travel/skip totals, score, change vs prior period, daily series
 *   GET  /v1/report/visitors  unique visitors (salted hashes) + pageviews, top pages/referrers
 *   GET  /v1/report/tabs      per-category totals + deck_end counts
 *   GET  /v1/health           liveness (no auth, no data)
 *
 * Report routes need the REPORT_KEY Worker secret (Authorization: Bearer <key> or X-Report-Key).
 * Privacy: allowlisted fields only; no raw IP stored or logged; visitor_country = request.cf.country.
 * Wire names keep "stay"/"stray" (shown to visitors as Travel/Skip).
 */
import { buildPlacesReport, buildTabsReport, buildVisitorsReport } from './report.js';

const ACTIONS = new Set(['stay', 'stray', 'undo', 'spin', 'spin_remove', 'ad_click', 'deck_end']);
const SOURCES = new Set(['swipe', 'keyboard', 'button', 'wheel', 'ad', 'system']);
const TABS = new Set([
  'hidden-gems', 'cities', 'pubs', 'countries', 'arenas', 'beaches',
  'parks', 'landmarks', 'islands', 'luxury', 'cruises',
]);
const LINK_TYPES = new Set(['hotel', 'flight', 'car', 'things', 'cruise', 'klook']);
const CARD_SCOPED = new Set(['stay', 'stray', 'undo', 'spin_remove', 'ad_click']);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BODY = 32 * 1024;
const MAX_EVENTS = 50;
const MAX_SKEW_MS = 2 * 24 * 3600 * 1000;

// Basic per-isolate rate limit keyed on a coarse, hashed fingerprint (colo + country + UA + language).
// Nothing here is persisted; the raw IP is never read.
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = { ingest: 120, report: 60 };
const rlBuckets = new Map();

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Report-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return { headers: h, ok: !origin || allowed.includes(origin) };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}),
  });
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function rateLimited(request, kind) {
  const cf = request.cf || {};
  const ua = (request.headers.get('User-Agent') || '').slice(0, 160);
  const lang = (request.headers.get('Accept-Language') || '').slice(0, 32);
  const key = kind + ':' + (await sha256Hex([cf.colo || '', cf.country || '', ua, lang].join('|'))).slice(0, 24);
  const now = Date.now();
  let b = rlBuckets.get(key);
  if (!b || now - b.start > RL_WINDOW_MS) {
    b = { start: now, n: 0 };
    rlBuckets.set(key, b);
  }
  b.n += 1;
  if (rlBuckets.size > 5000) {
    for (const [k, v] of rlBuckets) if (now - v.start > RL_WINDOW_MS) rlBuckets.delete(k);
  }
  return b.n > RL_MAX[kind];
}

function str(v, max) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

/** Allowlist-only sanitizer. Anything not listed (name, email, ip, lat, lng, removedIds,
 *  wheel_home_country, list dumps, …) is dropped simply by never being copied. */
export function sanitizeEvent(raw, ctx) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const action = raw.action;
  if (!ACTIONS.has(action)) return null;
  const source = SOURCES.has(raw.source) ? raw.source : 'system';
  const event_id = typeof raw.event_id === 'string' && UUID_RE.test(raw.event_id) ? raw.event_id.toLowerCase() : null;
  const session_id = typeof raw.session_id === 'string' && SESSION_RE.test(raw.session_id) ? raw.session_id : null;
  if (!event_id || !session_id) return null;

  let card_id = typeof raw.card_id === 'string' && ID_RE.test(raw.card_id) ? raw.card_id : null;
  const tab = typeof raw.tab === 'string' && TABS.has(raw.tab) ? raw.tab : null;
  if (CARD_SCOPED.has(action) && (!card_id || !tab)) return null;
  if (action === 'spin' && card_id && !tab) card_id = null;
  if (action === 'deck_end') card_id = null;
  // card ids are "<tab>-<nnn>": keep tab/card consistent.
  if (card_id && tab && !card_id.startsWith(tab + '-')) return null;

  let t = Date.parse(typeof raw.ts === 'string' ? raw.ts : '');
  if (!Number.isFinite(t) || Math.abs(t - ctx.now) > MAX_SKEW_MS) t = ctx.now;
  const d = new Date(t);
  const ts = d.toISOString();

  let undo_of = null;
  if (action === 'undo') {
    undo_of = raw.undo_of === 'stay' || raw.undo_of === 'stray' ? raw.undo_of : null;
    if (!undo_of) return null;
  }
  let path = str(raw.path, 200);
  if (path && !path.startsWith('/')) path = null;
  if (path) path = path.split('?')[0].split('#')[0];

  return {
    event_id, session_id, ts,
    day: ts.slice(0, 10),
    hour: d.getUTCHours(),
    action, source, card_id, tab,
    place: card_id ? str(raw.place, 120) : null,
    card_country: card_id ? str(raw.card_country, 60) : null,
    visitor_country: ctx.country,
    path, undo_of,
    link_type: action === 'ad_click' ? (LINK_TYPES.has(raw.link_type) ? raw.link_type : 'hotel') : null,
    received_at: new Date(ctx.now).toISOString(),
  };
}

// ---- Pageviews / unique visitors (migration 0004) ----
const PATH_RE = /^\/[A-Za-z0-9._\/-]{0,120}$/;
const REF_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const OWN_HOSTS = new Set(['spotandtravel.com', 'www.spotandtravel.com', 'stayorstray.github.io']);

function normPath(p) {
  if (typeof p !== 'string') return null;
  p = p.split('?')[0].split('#')[0];
  if (p.startsWith('/website/')) p = p.slice(8); // old github.io project path
  if (p === '' || p === '/index.html') p = '/';
  return PATH_RE.test(p) ? p : null;
}

export function sanitizePageview(raw, ctx) {
  if (!raw || typeof raw !== 'object' || raw.action !== 'pageview') return null;
  const event_id = typeof raw.event_id === 'string' && UUID_RE.test(raw.event_id) ? raw.event_id.toLowerCase() : null;
  const vid = typeof raw.vid === 'string' && UUID_RE.test(raw.vid) ? raw.vid.toLowerCase() : null;
  const path = normPath(raw.path);
  if (!event_id || !vid || !path || path.startsWith('/pages/trends')) return null;
  let ref = typeof raw.ref === 'string' ? raw.ref.toLowerCase().replace(/^www\./, '').slice(0, 80) : '';
  if (!REF_RE.test(ref) || OWN_HOSTS.has(ref) || OWN_HOSTS.has('www.' + ref)) ref = null;
  const ts = new Date(ctx.now).toISOString(); // server time: salts/day boundaries are UTC
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' }).format(new Date(ctx.now));
  return { event_id, vid, path, ref, ts, day: ts.slice(0, 10), month: ts.slice(0, 7), year,
    visit_start: raw.visit_start === true, visitor_country: ctx.country };
}

async function saltFor(db, period) {
  const row = await db.prepare('SELECT salt FROM visit_salts WHERE period = ?1').bind(period).first();
  if (row) return row.salt;
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  const salt = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  await db.prepare('INSERT OR IGNORE INTO visit_salts (period, salt) VALUES (?1, ?2)').bind(period, salt).run();
  return (await db.prepare('SELECT salt FROM visit_salts WHERE period = ?1').bind(period).first()).salt;
}

async function recordPageview(db, pv) {
  const vh_day = await sha256Hex((await saltFor(db, 'd:' + pv.day)) + '|' + pv.vid);
  const vh_month = await sha256Hex((await saltFor(db, 'm:' + pv.month)) + '|' + pv.vid);
  // Raw visitor id is dropped here; only the two salted hashes are stored.
  const seenSite = await db.prepare('SELECT 1 FROM pageviews WHERE day = ?1 AND vh_day = ?2 LIMIT 1').bind(pv.day, vh_day).first();
  const seenPage = await db.prepare('SELECT 1 FROM pageviews WHERE day = ?1 AND path = ?2 AND vh_day = ?3 LIMIT 1').bind(pv.day, pv.path, vh_day).first();
  const res = await db.prepare(
    'INSERT OR IGNORE INTO pageviews (event_id, ts, day, path, ref, visitor_country, vh_day, vh_month) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
  ).bind(pv.event_id, pv.ts, pv.day, pv.path, pv.ref, pv.visitor_country, vh_day, vh_month).run();
  if (!(res.meta && res.meta.changes === 1)) return false;
  const up = 'INSERT INTO daily_visits (day, path, pageviews, uniques) VALUES (?1, ?2, 1, ?3) ' +
    'ON CONFLICT(day, path) DO UPDATE SET pageviews = pageviews + 1, uniques = uniques + excluded.uniques';
  await db.prepare(up).bind(pv.day, '*', seenSite ? 0 : 1).run();
  await db.prepare(up).bind(pv.day, pv.path, seenPage ? 0 : 1).run();
  if (pv.visit_start) {
    await db.prepare('INSERT INTO yearly_visits (year, visits) VALUES (?1, 1) ' +
      'ON CONFLICT(year) DO UPDATE SET visits = visits + 1').bind(pv.year).run();
  }
  if (pv.ref) {
    await db.prepare('INSERT INTO daily_ref (day, ref, pageviews) VALUES (?1, ?2, 1) ' +
      'ON CONFLICT(day, ref) DO UPDATE SET pageviews = pageviews + 1').bind(pv.day, pv.ref).run();
  }
  return true;
}

function rollupStatement(db, e) {
  if (e.action === 'deck_end') {
    if (!e.tab) return null;
    return db.prepare(
      'INSERT INTO daily_tab (day, tab, deck_ends) VALUES (?1, ?2, 1) ' +
      'ON CONFLICT(day, tab) DO UPDATE SET deck_ends = deck_ends + 1'
    ).bind(e.day, e.tab);
  }
  if (!e.card_id) return null;
  const col = {
    stay: 'travel', stray: 'skip', spin: 'spins', spin_remove: 'spin_removes', ad_click: 'ad_clicks',
  }[e.action] || (e.action === 'undo' ? (e.undo_of === 'stay' ? 'undo_travel' : 'undo_skip') : null);
  if (!col) return null;
  return db.prepare(
    `INSERT INTO daily_place (day, card_id, tab, place, card_country, ${col}) VALUES (?1, ?2, ?3, ?4, ?5, 1) ` +
    `ON CONFLICT(day, card_id) DO UPDATE SET ${col} = ${col} + 1, ` +
    'place = COALESCE(excluded.place, place), card_country = COALESCE(excluded.card_country, card_country)'
  ).bind(e.day, e.card_id, e.tab, e.place, e.card_country);
}

async function handleIngest(request, env) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json({ error: 'too_large' }, 413);
  const text = await request.text(); // text/plain from sendBeacon avoids CORS preflight
  if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad_json' }, 400); }
  const list = Array.isArray(body) ? body : Array.isArray(body && body.events) ? body.events : [body];
  const ctx = { now: Date.now(), country: str((request.cf || {}).country, 2) };
  const slice = list.slice(0, MAX_EVENTS);
  let accepted = 0;
  let pvCount = 0;
  for (const r of slice) {
    if (!r || r.action !== 'pageview') continue;
    const pv = sanitizePageview(r, ctx);
    if (pv) { pvCount += 1; if (await recordPageview(env.DB, pv)) accepted += 1; }
  }
  const events = slice.filter((r) => !r || r.action !== 'pageview').map((r) => sanitizeEvent(r, ctx)).filter(Boolean);
  for (const e of events) {
    const res = await env.DB.prepare(
      'INSERT OR IGNORE INTO events (event_id, session_id, ts, day, hour, action, source, card_id, tab, place, ' +
      'card_country, visitor_country, path, undo_of, received_at, link_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)'
    ).bind(e.event_id, e.session_id, e.ts, e.day, e.hour, e.action, e.source, e.card_id, e.tab, e.place,
      e.card_country, e.visitor_country, e.path, e.undo_of, e.received_at, e.link_type).run();
    if (res.meta && res.meta.changes === 1) {
      accepted += 1;
      const st = rollupStatement(env.DB, e);
      if (st) await st.run();
      if (e.action === 'ad_click' && e.card_id && e.link_type) {
        await env.DB.prepare(
          'INSERT INTO daily_ad (day, card_id, tab, link_type, clicks) VALUES (?1, ?2, ?3, ?4, 1) ' +
          'ON CONFLICT(day, card_id, link_type) DO UPDATE SET clicks = clicks + 1'
        ).bind(e.day, e.card_id, e.tab, e.link_type).run();
      }
    }
  }
  return json({ ok: true, received: list.length, accepted, rejected: slice.length - events.length - pvCount });
}

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

function authorized(request, env) {
  const key = env.REPORT_KEY;
  if (!key || key.length < 12) return false;
  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('X-Report-Key') || '';
  return given.length > 0 && timingSafeEqual(given, key);
}

import { buildScores } from './scores.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    if (!cors.ok) return json({ error: 'origin_not_allowed' }, 403, cors.headers);

    try {
      if (url.pathname === '/v1/health') return json({ ok: true }, 200, cors.headers);

      if (url.pathname === '/v1/events') {
        if (request.method !== 'POST') return json({ error: 'method' }, 405, cors.headers);
        if (await rateLimited(request, 'ingest')) return json({ error: 'rate_limited' }, 429, cors.headers);
        const res = await handleIngest(request, env);
        for (const [k, v] of Object.entries(cors.headers)) res.headers.set(k, v);
        return res;
      }

      if (url.pathname === '/v1/scores') {
        if (request.method !== 'GET') return json({ error: 'method' }, 405, cors.headers);
        if (await rateLimited(request, 'report')) return json({ error: 'rate_limited' }, 429, cors.headers);
        const res = json(await buildScores(env.DB, Date.now()), 200, cors.headers);
        res.headers.set('Cache-Control', 'public, max-age=600');
        return res;
      }

      if (url.pathname.startsWith('/v1/report/')) {
        if (request.method !== 'GET') return json({ error: 'method' }, 405, cors.headers);
        if (await rateLimited(request, 'report')) return json({ error: 'rate_limited' }, 429, cors.headers);
        if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401, cors.headers);
        const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10) || 30));
        const tab = url.searchParams.get('tab');
        const tabFilter = tab && TABS.has(tab) ? tab : null;
        if (url.pathname === '/v1/report/places') {
          return json(await buildPlacesReport(env.DB, { days, tab: tabFilter, now: Date.now() }), 200, cors.headers);
        }
        if (url.pathname === '/v1/report/visitors') {
          return json(await buildVisitorsReport(env.DB, { days, now: Date.now() }), 200, cors.headers);
        }
        if (url.pathname === '/v1/report/tabs') {
          return json(await buildTabsReport(env.DB, { days, now: Date.now() }), 200, cors.headers);
        }
      }
      return json({ error: 'not_found' }, 404, cors.headers);
    } catch (err) {
      // Never echo request data; log only the error message.
      console.error('trends error', err && err.message);
      return json({ error: 'server' }, 500, cors.headers);
    }
  },

  async scheduled(event, env) {
    const keep = Math.max(30, parseInt(env.RAW_RETENTION_DAYS || '120', 10) || 120);
    const cutoff = new Date(Date.now() - keep * 86400000).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM events WHERE day < ?1').bind(cutoff).run();
    await env.DB.prepare('DELETE FROM pageviews WHERE day < ?1').bind(cutoff).run();
    // Forget salts once their period is over (keep yesterday's day salt and last month's
    // month salt one extra period for late events). Old hashes can then never be re-linked.
    const now = Date.now();
    const yday = new Date(now - 86400000).toISOString().slice(0, 10);
    const d = new Date(now);
    const prevMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    await env.DB.prepare("DELETE FROM visit_salts WHERE (period LIKE 'd:%' AND period < ?1) OR (period LIKE 'm:%' AND period < ?2)")
      .bind('d:' + yday, 'm:' + prevMonth).run();
  },
};
