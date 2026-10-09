/**
 * Reporter: reads daily rollups only (no raw events, no PII columns).
 *
 * Score  = travel share in %, i.e. 100 * travel / (travel + skip) for the window.
 * Change = score(current window) - score(prior window of equal length), in points.
 * "Price" series for stock-style charts = 7-day rolling travel share per day.
 * Travel = stay - undone stays; Skip = stray - undone strays.
 */
const ROLL = 7;

function dayStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function windows(days, now) {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const curStart = today - (days - 1) * 86400000;
  const priorStart = curStart - days * 86400000;
  const seriesStart = curStart - (ROLL - 1) * 86400000;
  return {
    today: dayStr(today), curStart: dayStr(curStart), priorStart: dayStr(priorStart),
    priorEnd: dayStr(curStart - 86400000), seriesStart: dayStr(seriesStart),
    dayList: Array.from({ length: days }, (_, i) => dayStr(curStart + i * 86400000)),
    seriesDays: Array.from({ length: days + ROLL - 1 }, (_, i) => dayStr(seriesStart + i * 86400000)),
  };
}

function share(t, s) {
  const n = t + s;
  return n > 0 ? Math.round((1000 * t) / n) / 10 : null;
}

export async function buildPlacesReport(db, { days, tab, now }) {
  const w = windows(days, now);
  const tabSql = tab ? ' AND tab = ?3' : '';
  const binds = tab ? [w.priorStart, w.today, tab] : [w.priorStart, w.today];
  const rows = (await db.prepare(
    'SELECT day, card_id, tab, place, card_country, ' +
    'MAX(travel - undo_travel, 0) AS travel, MAX(skip - undo_skip, 0) AS skip, spins, ad_clicks ' +
    'FROM daily_place WHERE day >= ?1 AND day <= ?2' + tabSql + ' ORDER BY day'
  ).bind(...binds).all()).results || [];

  const byCard = new Map();
  for (const r of rows) {
    let p = byCard.get(r.card_id);
    if (!p) {
      p = { card_id: r.card_id, tab: r.tab, place: r.place, card_country: r.card_country,
        travel: 0, skip: 0, prior_travel: 0, prior_skip: 0, spins: 0, ad_clicks: 0, perDay: new Map() };
      byCard.set(r.card_id, p);
    }
    if (r.place) p.place = r.place;
    if (r.day >= w.curStart) {
      p.travel += r.travel; p.skip += r.skip; p.spins += r.spins || 0; p.ad_clicks += r.ad_clicks || 0;
    } else if (r.day <= w.priorEnd) {
      p.prior_travel += r.travel; p.prior_skip += r.skip;
    }
    if (r.day >= w.seriesStart) p.perDay.set(r.day, [r.travel, r.skip]);
  }

  const places = [];
  for (const p of byCard.values()) {
    const daily = [];
    let rt = 0, rs = 0;
    const win = [];
    for (const d of w.seriesDays) {
      const v = p.perDay.get(d) || [0, 0];
      win.push(v); rt += v[0]; rs += v[1];
      if (win.length > ROLL) { const o = win.shift(); rt -= o[0]; rs -= o[1]; }
      if (d >= w.curStart) daily.push({ day: d, travel: v[0], skip: v[1], score7: share(rt, rs) });
    }
    const score = share(p.travel, p.skip);
    const prior = share(p.prior_travel, p.prior_skip);
    places.push({
      card_id: p.card_id, tab: p.tab, place: p.place, card_country: p.card_country,
      travel: p.travel, skip: p.skip, votes: p.travel + p.skip, net: p.travel - p.skip,
      score, prior_score: prior,
      change: score !== null && prior !== null ? Math.round((score - prior) * 10) / 10 : null,
      prior_votes: p.prior_travel + p.prior_skip,
      spins: p.spins, ad_clicks: p.ad_clicks,
      daily,
    });
  }
  // Partner-link breakdown (daily_ad, migration 0003). Missing table => empty breakdown.
  let adRows = [];
  try {
    adRows = (await db.prepare(
      'SELECT card_id, link_type, SUM(clicks) AS clicks FROM daily_ad WHERE day >= ?1 AND day <= ?2' +
      (tab ? ' AND tab = ?3' : '') + ' GROUP BY card_id, link_type'
    ).bind(...(tab ? [w.curStart, w.today, tab] : [w.curStart, w.today])).all()).results || [];
  } catch (e) { adRows = []; }
  const adByCard = new Map();
  const ad_links = {};
  for (const r of adRows) {
    const m = adByCard.get(r.card_id) || {};
    m[r.link_type] = (m[r.link_type] || 0) + (r.clicks || 0);
    adByCard.set(r.card_id, m);
    ad_links[r.link_type] = (ad_links[r.link_type] || 0) + (r.clicks || 0);
  }
  for (const p of places) p.ad_links = adByCard.get(p.card_id) || {};
  places.sort((a, b) => b.votes - a.votes);
  return {
    ad_links,
    sample: false,
    generated_at: new Date(now).toISOString(),
    days, tab: tab || null,
    window: { start: w.curStart, end: w.today, prior_start: w.priorStart, prior_end: w.priorEnd },
    score_definition: 'travel share % = 100*travel/(travel+skip); change = points vs prior equal-length window; score7 = 7-day rolling travel share',
    places,
  };
}

export async function buildTabsReport(db, { days, now }) {
  const w = windows(days, now);
  const votes = (await db.prepare(
    'SELECT tab, SUM(MAX(travel - undo_travel, 0)) AS travel, SUM(MAX(skip - undo_skip, 0)) AS skip ' +
    'FROM daily_place WHERE day >= ?1 AND day <= ?2 GROUP BY tab'
  ).bind(w.curStart, w.today).all()).results || [];
  const ends = (await db.prepare(
    'SELECT tab, SUM(deck_ends) AS deck_ends FROM daily_tab WHERE day >= ?1 AND day <= ?2 GROUP BY tab'
  ).bind(w.curStart, w.today).all()).results || [];
  const m = new Map();
  for (const v of votes) m.set(v.tab, { tab: v.tab, travel: v.travel || 0, skip: v.skip || 0, deck_ends: 0 });
  for (const e of ends) {
    const t = m.get(e.tab) || { tab: e.tab, travel: 0, skip: 0, deck_ends: 0 };
    t.deck_ends = e.deck_ends || 0; m.set(e.tab, t);
  }
  const tabs = [...m.values()].map((t) => Object.assign(t, { votes: t.travel + t.skip, score: share(t.travel, t.skip) }));
  tabs.sort((a, b) => b.votes - a.votes);
  return { sample: false, generated_at: new Date(now).toISOString(), days, window: { start: w.curStart, end: w.today }, tabs };
}
