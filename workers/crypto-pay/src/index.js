/**
 * Spot and Travel — "Pay with Xaman" crypto checkout (PREVIEW).
 *
 *   POST /v1/quote            {sku, pin, currency, email?, place_name?} → locked 10-min quote + Xaman payload (QR/deeplink)
 *   GET  /v1/status?ref=...   checks the Xaman payload, verifies the tx ON-LEDGER, records the result in D1
 *   POST /v1/xaman-webhook    optional Xaman callback; body is never trusted, it only triggers the same verify
 *   GET  /v1/health
 *
 * Secrets: XAMAN_API_KEY, XAMAN_API_SECRET (Worker secrets). No seed / signing key exists anywhere: receive-only wallet.
 * Method + guards: docs/checkout/CRYPTO-XAMAN.md
 */
const XAMAN = 'https://xumm.app/api/v1/platform';
const RPCS = ['https://xrplcluster.com/', 'https://xrpl.ws/', 'https://xrpl.link/', 'https://s2.ripple.com:51234/', 'https://s1.ripple.com:51234/'];
const RLUSD = { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' };
const XRH = { currency: 'XRH', issuer: 'r9xu7pdBEx4DdiatMqAUFodgxaPkfFU1Zw' };
const XRH_AMM = 'rf5BUNqEYi159nP3Hew1i1rkoWvguZEpdX';
const SKUS = { founding_standard: 3999, standard: 4999, hidden_gems: 9999 };
const PINS = { none: 0, '7d': 3999, '30d': 9999 };
const SKU_LABEL = { founding_standard: 'Founding Standard', standard: 'Standard', hidden_gems: 'Hidden Gems' };
const LOCK_MIN = 10;
const XRH_DISCOUNT_PCT = 10;
const G = {
  xrpCrossCheckMaxPct: 3,      // ledger mid vs public API
  xrpMaxSpreadPct: 2,          // RLUSD/XRP book spread
  xrhMaxDeviationPct: 15,      // AMM spot vs trailing average
  xrhMinTrades: 5,             // trades in the averaging window
  xrhWindowSec: 72 * 3600,
  xrhMinPoolXrp: 500,          // AMM XRP reserve
  xrhMaxQuoteShareOfPool: 0.10 // quote's XRP value vs AMM XRP reserve
};
const RIPPLE_EPOCH = 946684800;

class Refuse extends Error { constructor(code, msg, detail) { super(msg); this.code = code; this.detail = detail; } }

function cors(req, env) {
  const o = req.headers.get('Origin') || '';
  const ok = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).includes(o);
  // (admin routes are not CORS-enabled for browsers; use curl with the report key)
  return ok ? { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {};
}
function json(body, status, h) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, h || {}) });
}
async function rpc(method, params) {
  let last;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let round = 0; round < 3; round++) for (const url of RPCS) {
    if (round || url !== RPCS[0]) await sleep(150 + round * 400);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params: [params] }) });
      const j = await r.json();
      if (j && j.result && j.result.status === 'success') return j.result;
      if (j && j.result && j.result.error === 'txnNotFound') return j.result;
      last = new Error(method + ': ' + JSON.stringify(j && j.result && j.result.error));
    } catch (e) { last = e; }
  }
  throw last;
}
async function xaman(env, path, init) {
  const r = await fetch(XAMAN + path, Object.assign({}, init, { headers: { 'Content-Type': 'application/json', 'X-API-Key': env.XAMAN_API_KEY, 'X-API-Secret': env.XAMAN_API_SECRET } }));
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error('xaman ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return j;
}
const hex = (s) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

// ---- exact decimal compare (strings, up to 15 dp) ----
function units(v) {
  let s = String(v).trim();
  if (/e/i.test(s)) s = Number(s).toFixed(15);
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const [i, f = ''] = s.split('.');
  const n = BigInt(i || '0') * 10n ** 15n + BigInt((f + '0'.repeat(15)).slice(0, 15) || '0');
  return neg ? -n : n;
}

// ---- prices ----
function offerPrice(o, side) { // returns RLUSD per XRP
  const xrp = (v) => Number(v) / 1e6;
  if (side === 'ask') return Number(o.TakerPays.value) / xrp(o.TakerGets); // sells XRP for RLUSD
  return Number(o.TakerGets.value) / xrp(o.TakerPays);                     // sells RLUSD for XRP
}
async function publicXrpUsd() {
  try {
    const j = await (await fetch('https://api.kraken.com/0/public/Ticker?pair=XRPUSD')).json();
    const t = j.result && (j.result.XXRPZUSD || Object.values(j.result)[0]);
    const v = Number(t && t.c && t.c[0]); if (v > 0) return { src: 'kraken', usd: v };
  } catch (e) {}
  const j = await (await fetch('https://api.coinbase.com/v2/prices/XRP-USD/spot')).json();
  const v = Number(j && j.data && j.data.amount); if (v > 0) return { src: 'coinbase', usd: v };
  throw new Refuse('rate_unavailable', 'No public XRP/USD price available right now.');
}
async function xrpUsd() {
  const a = await rpc('book_offers', { taker_gets: { currency: 'XRP' }, taker_pays: RLUSD, limit: 5 });
  const b = await rpc('book_offers', { taker_gets: RLUSD, taker_pays: { currency: 'XRP' }, limit: 5 });
  const funded = (o) => o.owner_funds === undefined || Number(o.owner_funds) > 0;
  const ask = (a.offers || []).filter(funded)[0], bid = (b.offers || []).filter(funded)[0];
  if (!ask || !bid) throw new Refuse('thin_book', 'RLUSD/XRP order book is empty on one side.');
  const pa = offerPrice(ask, 'ask'), pb = offerPrice(bid, 'bid');
  const mid = (pa + pb) / 2, spreadPct = (pa - pb) / mid * 100;
  const pub = await publicXrpUsd();
  const diffPct = Math.abs(mid - pub.usd) / pub.usd * 100;
  const info = { ledger_index: a.ledger_index, ledger_bid: pb, ledger_ask: pa, ledger_mid: mid, spread_pct: +spreadPct.toFixed(3), public_src: pub.src, public_usd: pub.usd, diff_pct: +diffPct.toFixed(3) };
  if (spreadPct > G.xrpMaxSpreadPct || spreadPct < 0) throw new Refuse('wide_spread', 'RLUSD/XRP spread too wide to quote.', info);
  if (diffPct > G.xrpCrossCheckMaxPct) throw new Refuse('rate_mismatch', 'Ledger and public XRP prices disagree by more than ' + G.xrpCrossCheckMaxPct + '%.', info);
  return info;
}
function ammRatioFromMeta(meta) {
  let xrp = null, xrh = null;
  for (const n of meta.AffectedNodes || []) {
    const d = n.ModifiedNode || n.CreatedNode; if (!d) continue;
    const f = d.FinalFields || d.NewFields || {};
    if (d.LedgerEntryType === 'AccountRoot' && f.Account === XRH_AMM) xrp = Number(f.Balance) / 1e6;
    if (d.LedgerEntryType === 'RippleState' && f.Balance && f.Balance.currency === 'XRH' &&
        [f.HighLimit && f.HighLimit.issuer, f.LowLimit && f.LowLimit.issuer].includes(XRH_AMM)) xrh = Math.abs(Number(f.Balance.value));
  }
  return xrp && xrh ? xrp / xrh : null;
}
async function xrhXrp(override) {
  const amm = await rpc('amm_info', { amm_account: XRH_AMM });
  const hist = await rpc('account_tx', { account: XRH_AMM, limit: 30 });
  const a = amm.amm;
  const poolXrp = Number(a.amount) / 1e6, poolXrh = Number(a.amount2.value);
  const spot = poolXrp / poolXrh;
  const now = Date.now() / 1000;
  const pts = [];
  for (const t of hist.transactions || []) {
    if (!t.validated || !t.meta || t.meta.TransactionResult !== 'tesSUCCESS') continue;
    const ts = (t.tx.date || 0) + RIPPLE_EPOCH;
    if (now - ts > G.xrhWindowSec) continue;
    const r = ammRatioFromMeta(t.meta); if (r) pts.push(r);
  }
  const avg = pts.length ? pts.reduce((s, x) => s + x, 0) / pts.length : null;
  const info = { amm: XRH_AMM, pool_xrp: poolXrp, pool_xrh: poolXrh, spot_xrp_per_xrh: spot, avg_xrp_per_xrh: avg, trades_in_window: pts.length, window_h: G.xrhWindowSec / 3600, frozen: !!a.asset2_frozen };
  if (override && override.spot_mult) { info.spot_xrp_per_xrh = spot * override.spot_mult; info.test_override = override; }
  if (override && override.pool_xrp) { info.pool_xrp = override.pool_xrp; info.test_override = override; }
  if (info.frozen) throw new Refuse('frozen', 'XRH pool is frozen.', info);
  if (info.pool_xrp < G.xrhMinPoolXrp) throw new Refuse('thin_liquidity', 'XRH liquidity is too thin to quote right now.', info);
  if (pts.length < G.xrhMinTrades) throw new Refuse('thin_liquidity', 'Not enough recent XRH trades to price it safely.', info);
  info.deviation_pct = +(Math.abs(info.spot_xrp_per_xrh - avg) / avg * 100).toFixed(3);
  if (info.deviation_pct > G.xrhMaxDeviationPct) throw new Refuse('price_deviation', 'XRH spot price moved more than ' + G.xrhMaxDeviationPct + '% from its average; try again later.', info);
  return info;
}

async function buildQuote(currency, chargeCents, override) {
  const usd = chargeCents / 100;
  if (currency === 'RLUSD') {
    const value = (chargeCents / 100).toFixed(2);
    return { amount: Object.assign({ value }, RLUSD), display: value + ' RLUSD', rate: { method: 'RLUSD = USD 1:1' } };
  }
  const x = await xrpUsd();
  if (currency === 'XRP') {
    const drops = Math.ceil(usd / x.ledger_mid * 1e6);
    return { amount: String(drops), display: (drops / 1e6).toFixed(6) + ' XRP', rate: Object.assign({ method: 'USD / RLUSD-XRP book mid, cross-checked', usd_per_xrp: x.ledger_mid }, x) };
  }
  if (currency === 'XRH') {
    const h = await xrhXrp(override);
    const usdPerXrh = h.avg_xrp_per_xrh * x.ledger_mid;
    const quoteXrp = usd / x.ledger_mid;
    if (quoteXrp > h.pool_xrp * G.xrhMaxQuoteShareOfPool) throw new Refuse('thin_liquidity', 'This amount is too large for current XRH liquidity.', Object.assign({ quote_xrp: quoteXrp }, h));
    const value = String(Math.ceil(usd / usdPerXrh));
    return { amount: Object.assign({ value }, XRH), display: Number(value).toLocaleString('en-US') + ' XRH', rate: { method: 'USD / (trailing avg of post-trade XRH/XRP AMM ratios × XRP/USD)', usd_per_xrh: usdPerXrh, xrp: x, xrh: h } };
  }
  throw new Refuse('bad_currency', 'Unknown currency.');
}

async function logEvent(env, ref, kind, detail) {
  try { await env.DB.prepare('INSERT INTO crypto_events (ts, ref, kind, detail) VALUES (?,?,?,?)').bind(Date.now(), ref || null, kind, JSON.stringify(detail).slice(0, 4000)).run(); } catch (e) {}
}

async function handleQuote(req, env) {
  const b = await req.json().catch(() => ({}));
  const sku = String(b.sku || ''), pin = String(b.pin || 'none'), currency = String(b.currency || '').toUpperCase();
  if (!(sku in SKUS) || !(pin in PINS) || !['RLUSD', 'XRP', 'XRH'].includes(currency)) return { status: 400, body: { ok: false, error: 'bad_request' } };
  const subRef = String(b.submission_ref || '');
  if (subRef && !/^SAT-\d{6}-[A-Z0-9]{6}$/.test(subRef)) return { status: 400, body: { ok: false, error: 'bad_submission_ref' } };
  if (env.PREVIEW !== 'true' && !subRef) return { status: 400, body: { ok: false, error: 'submission_required', message: 'Please submit the listing form first.' } };
  const listCents = SKUS[sku] + PINS[pin];
  const chargeCents = currency === 'XRH' ? Math.round(listCents * (100 - XRH_DISCOUNT_PCT) / 100) : listCents;
  // Guard-test overrides (simulate a price spike / thin pool) only in PREVIEW, and they never create a payload.
  const override = env.PREVIEW === 'true' && b.test_override && typeof b.test_override === 'object'
    ? { spot_mult: Number(b.test_override.spot_mult) || undefined, pool_xrp: Number(b.test_override.pool_xrp) || undefined } : null;
  let q;
  try { q = await buildQuote(currency, chargeCents, override); }
  catch (e) {
    if (e instanceof Refuse) { await logEvent(env, null, 'quote_refused', { sku, pin, currency, code: e.code, msg: e.message, detail: e.detail }); return { status: 409, body: { ok: false, refused: true, code: e.code, message: e.message, detail: e.detail } }; }
    throw e;
  }
  if (override) return { status: 200, body: { ok: true, dry_run: true, note: 'test_override: quote computed, no payload created', amount_display: q.display, rate: q.rate } };

  const now = Date.now(), expires = now + LOCK_MIN * 60 * 1000;
  let tag, ref;
  for (let i = 0; i < 5; i++) {
    tag = 100000000 + Math.floor(Math.random() * 4000000000);
    ref = 'SAT-' + tag;
    const ex = await env.DB.prepare('SELECT 1 FROM crypto_orders WHERE dest_tag=?').bind(tag).first();
    if (!ex) break;
  }
  const label = SKU_LABEL[sku] + (pin !== 'none' ? ' + ' + pin + ' pin' : '');
  const payload = await xaman(env, '/payload', { method: 'POST', body: JSON.stringify({
    txjson: { TransactionType: 'Payment', Destination: env.DEST_WALLET, DestinationTag: tag, Amount: q.amount,
      Memos: [{ Memo: { MemoType: hex('spotandtravel/listing'), MemoData: hex(ref) } }] },
    options: { submit: true, expire: LOCK_MIN },
    custom_meta: { identifier: ref, blob: { submission_ref: subRef }, instruction: 'Spot and Travel listing ' + (subRef || ref) + ' (payment ' + ref + ')' + ': ' + label + ' — ' + q.display + '. Charged up front; refunded in full if the listing is not approved.' },
  }) });
  await env.DB.prepare(`INSERT INTO crypto_orders (ref,dest_tag,sku,pin,usd_cents,charge_usd_cents,currency,amount_json,amount_display,rate_json,payload_uuid,email,place_name,preview,created_at,expires_at,status,submission_ref)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'awaiting_payment',?)`).bind(ref, tag, sku, pin, listCents, chargeCents, currency,
    JSON.stringify(q.amount), q.display, JSON.stringify(q.rate), payload.uuid, String(b.email || '').slice(0, 200) || null,
    String(b.place_name || '').slice(0, 200) || null, env.PREVIEW === 'true' ? 1 : 0, now, expires, subRef || null).run();
  await logEvent(env, ref, 'quote', { currency, display: q.display, uuid: payload.uuid });
  return { status: 200, body: { ok: true, ref, submission_ref: subRef || null, destination_tag: tag, destination: env.DEST_WALLET, currency, list_usd: (listCents / 100).toFixed(2), charge_usd: (chargeCents / 100).toFixed(2),
    discount_pct: currency === 'XRH' ? XRH_DISCOUNT_PCT : 0, amount: q.amount, amount_display: q.display, rate: q.rate, expires_at: expires,
    xaman: { uuid: payload.uuid, qr_png: payload.refs && payload.refs.qr_png, deeplink: payload.next && payload.next.always } } };
}

function sameAsset(want, got) {
  if (typeof want === 'string') return typeof got === 'string';
  return typeof got === 'object' && got && got.currency === want.currency && got.issuer === want.issuer;
}

async function verify(env, ref) {
  const o = await env.DB.prepare('SELECT * FROM crypto_orders WHERE ref=?').bind(ref).first();
  if (!o) return { status: 404, body: { ok: false, error: 'not_found' } };
  if (['paid', 'rejected_payment'].includes(o.status)) return { status: 200, body: { ok: true, ref, status: o.status, tx_hash: o.tx_hash, note: o.verify_note } };
  const p = await xaman(env, '/payload/' + o.payload_uuid, { method: 'GET' });
  const m = p.meta || {}, txid = p.response && p.response.txid;
  const set = async (status, note, hash, delivered) => {
    await env.DB.prepare('UPDATE crypto_orders SET status=?, verify_note=?, tx_hash=COALESCE(?,tx_hash), delivered_json=COALESCE(?,delivered_json), verified_at=? WHERE ref=?')
      .bind(status, note, hash || null, delivered ? JSON.stringify(delivered) : null, Date.now(), ref).run();
    await logEvent(env, ref, 'verify', { status, note, hash });
    return { status: 200, body: { ok: true, ref, status, note, tx_hash: hash || null, amount_display: o.amount_display } };
  };
  if (!m.signed || !txid) {
    if (m.resolved && !m.signed) return set('declined', 'Payer declined in Xaman.');
    if (m.expired || Date.now() > o.expires_at + 60000) return set('expired', 'Quote expired unpaid.');
    return { status: 200, body: { ok: true, ref, status: 'awaiting_payment', opened: !!m.opened, expires_at: o.expires_at } };
  }
  const tx = await rpc('tx', { transaction: txid });
  if (tx.error === 'txnNotFound' || !tx.validated) return { status: 200, body: { ok: true, ref, status: 'pending_validation', tx_hash: txid } };
  const want = JSON.parse(o.amount_json), meta = tx.meta || {};
  const delivered = meta.delivered_amount;
  const problems = [];
  if (tx.TransactionType !== 'Payment') problems.push('not a Payment');
  if (meta.TransactionResult !== 'tesSUCCESS') problems.push('result ' + meta.TransactionResult);
  if (tx.Destination !== env.DEST_WALLET) problems.push('wrong destination');
  if (Number(tx.DestinationTag) !== Number(o.dest_tag)) problems.push('wrong destination tag');
  if (delivered === undefined || delivered === 'unavailable') problems.push('delivered_amount unavailable');
  else if (!sameAsset(want, delivered)) problems.push('wrong currency/issuer');
  else {
    const got = typeof delivered === 'string' ? BigInt(delivered) * 10n ** 9n : units(delivered.value);
    const need = typeof want === 'string' ? BigInt(want) * 10n ** 9n : units(want.value);
    if (got < need) problems.push('short delivery (partial payment?)');
  }
  const dupe = await env.DB.prepare('SELECT ref FROM crypto_orders WHERE tx_hash=? AND ref<>?').bind(txid, ref).first();
  if (dupe) problems.push('tx already used for ' + dupe.ref);
  if (problems.length) return set('rejected_payment', problems.join('; '), dupe ? null : txid, delivered);
  const res = await set('paid', 'Verified on-ledger: delivered_amount, destination, tag, currency and issuer match.', txid, delivered);
  await alertPaid(env, Object.assign({}, o, { tx_hash: txid, delivered_json: JSON.stringify(delivered) }));
  return res;
}

// Same alert path as new submissions: a Basin form post, which emails BoOnE.
async function alertPaid(env, o, test) {
  if (!env.ALERT_FORM_ENDPOINT) return { ok: false, error: 'no endpoint' };
  const fd = new FormData();
  const subj = (test ? '[TEST] ' : '') + 'Spot and Travel CRYPTO PAID ' + (o.submission_ref || o.ref) + ': ' + o.amount_display;
  const f = { _subject: subj, submission_ref: o.submission_ref || '', crypto_ref: o.ref, place_name: o.place_name || '', email: o.email || '',
    sku: o.sku, pin: o.pin, currency: o.currency, amount: o.amount_display, usd_charged: (o.charge_usd_cents / 100).toFixed(2),
    tx_hash: o.tx_hash || '', explorer: o.tx_hash ? 'https://livenet.xrpl.org/transactions/' + o.tx_hash : '', delivered: o.delivered_json || '',
    note: (test ? 'TEST ALERT ONLY - no payment. ' : '') + 'Crypto charged up front. If rejected, refund in full by hand (docs/checkout/CRYPTO-XAMAN.md).' };
  for (const k in f) fd.append(k, String(f[k]));
  try {
    const r = await fetch(env.ALERT_FORM_ENDPOINT, { method: 'POST', body: fd, headers: { Accept: 'application/json', Origin: 'https://spotandtravel.com', Referer: 'https://spotandtravel.com/pages/submit-a-place.html' } });
    const t = await r.text();
    await logEvent(env, o.ref, 'alert', { status: r.status, body: t.slice(0, 300), test: !!test });
    return { ok: r.ok, status: r.status, body: t.slice(0, 300) };
  } catch (e) { await logEvent(env, o.ref, 'alert', { error: String(e) }); return { ok: false, error: String(e) }; }
}
function authed(req, env, url) {
  const k = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('X-Report-Key') || '';
  return !!env.REPORT_KEY && k.length === env.REPORT_KEY.length && k === env.REPORT_KEY;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      if (url.pathname === '/v1/health') return json({ ok: true, preview: env.PREVIEW === 'true' }, 200, h);
      if (url.pathname === '/v1/quote' && req.method === 'POST') { const r = await handleQuote(req, env); return json(r.body, r.status, h); }
      if (url.pathname === '/v1/status' && req.method === 'GET') {
        const ref = url.searchParams.get('ref') || '';
        if (!/^SAT-\d{9,10}$/.test(ref)) return json({ ok: false, error: 'bad_ref' }, 400, h);
        const r = await verify(env, ref); return json(r.body, r.status, h);
      }
      if (url.pathname.startsWith('/v1/admin/')) {
        if (!authed(req, env, url)) return json({ ok: false, error: 'unauthorized' }, 401);
        if (url.pathname === '/v1/admin/orders' && req.method === 'GET') {
          const st = url.searchParams.get('status') || 'paid';
          const lim = Math.min(200, Number(url.searchParams.get('limit')) || 50);
          const q = st === 'all' ? env.DB.prepare('SELECT * FROM crypto_orders ORDER BY created_at DESC LIMIT ?').bind(lim)
            : env.DB.prepare('SELECT * FROM crypto_orders WHERE status=? ORDER BY created_at DESC LIMIT ?').bind(st, lim);
          const r = await q.all();
          return json({ ok: true, status: st, count: r.results.length, orders: r.results.map((o) => Object.assign({}, o, { created_ct: new Date(o.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) })) });
        }
        if (url.pathname === '/v1/admin/test-alert' && req.method === 'POST') {
          return json(await alertPaid(env, { ref: 'SAT-000000000', submission_ref: 'SAT-000000-TEST00', amount_display: '0 TEST', sku: 'test', pin: 'none', currency: 'TEST', charge_usd_cents: 0, place_name: 'TEST alert (no payment)' }, true));
        }
        return json({ ok: false, error: 'not_found' }, 404);
      }
      if (url.pathname === '/v1/xaman-webhook' && req.method === 'POST') {
        // Body is untrusted: we only read the payload uuid, then re-fetch everything from Xaman + the ledger.
        const b = await req.json().catch(() => ({}));
        const uuid = String((b.payloadResponse && b.payloadResponse.payload_uuidv4) || (b.meta && b.meta.payload_uuidv4) || '');
        const o = uuid ? await env.DB.prepare('SELECT ref FROM crypto_orders WHERE payload_uuid=?').bind(uuid).first() : null;
        await logEvent(env, o && o.ref, 'webhook', { uuid, known: !!o });
        if (o) await verify(env, o.ref);
        return json({ ok: true }, 200);
      }
      return json({ ok: false, error: 'not_found' }, 404, h);
    } catch (e) {
      return json({ ok: false, error: 'server_error', message: String(e && e.message || e).slice(0, 200) }, 502, h);
    }
  },
};
