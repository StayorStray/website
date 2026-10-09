// Smoke test: node test/smoke.mjs [baseUrl] [reportKey] [allowedOrigin]
// Writes a few TEST votes (islands-001/002, beaches-003, islands deck_end).
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const KEY = process.argv[3] || 'local-dev-key-123456';
const ORIGIN = process.argv[4] || 'https://stayorstray.github.io';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sid = crypto.randomUUID();
const ev = (action, card_id, tab, extra = {}) => Object.assign({
  event_id: crypto.randomUUID(), session_id: sid, ts: new Date().toISOString(), hour: new Date().getUTCHours(),
  action, source: 'swipe', card_id, tab, place: null, card_country: null,
  path: '/website/pages/islands.html?x=1',
}, extra);
const post = (body, headers = {}) => fetch(BASE + '/v1/events', { method: 'POST', body: JSON.stringify(body),
  headers: Object.assign({ 'Content-Type': 'text/plain;charset=UTF-8', Origin: ORIGIN }, headers) });

const report = async () => (await (await fetch(BASE + '/v1/report/places?days=7', { headers: { Origin: ORIGIN, Authorization: 'Bearer ' + KEY } })).json()).places;
const get = (ps, id) => ps.find((p) => p.card_id === id) || { travel: 0, skip: 0 };
const before = await report();
const pii = ev('stay', 'islands-001', 'islands', { name: 'Jane Doe', email: 'j@x.com', ip: '1.2.3.4', lat: 1, lng: 2,
  wheel_home_country: 'US', removedIds: ['a'], sos_stay_list: ['x'] });
let r = await post({ v: 1, events: [pii, ev('stay', 'islands-001', 'islands'), ev('stray', 'islands-001', 'islands'),
  ev('stay', 'islands-002', 'islands'), ev('undo', 'islands-002', 'islands', { undo_of: 'stay' }),
  ev('deck_end', null, 'islands', { source: 'system' }), ev('spin', 'beaches-003', 'beaches', { source: 'wheel' }),
  ev('bogus', 'islands-001', 'islands'), ev('stay', 'beaches-001', 'islands'), ev('stay', "x'; DROP TABLE events;--", 'islands')] });
let j = await r.json();
ok(r.status === 200 && j.accepted === 7 && j.rejected === 3, `ingest batch accepted=7 rejected=3 (got ${JSON.stringify(j)})`);
ok(r.headers.get('access-control-allow-origin') === ORIGIN, 'CORS echoes allowed origin');
r = await post({ events: [pii] }); j = await r.json();
ok(j.accepted === 0, 'duplicate event_id is deduped');
r = await post({ events: [ev('stay', 'islands-001', 'islands')] }, { Origin: 'https://evil.example' });
ok(r.status === 403, 'disallowed origin rejected (403)');
r = await fetch(BASE + '/v1/events', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
ok(r.status === 204, 'preflight 204');
r = await post('not json'); ok(r.status === 400 || r.status === 200, 'bad body handled without 500 (' + r.status + ')');
r = await fetch(BASE + '/v1/events', { method: 'POST', body: '{', headers: { Origin: ORIGIN } }); ok(r.status === 400, 'malformed JSON -> 400');
r = await fetch(BASE + '/v1/report/places?days=7', { headers: { Origin: ORIGIN } }); ok(r.status === 401, 'report without key -> 401');
r = await fetch(BASE + '/v1/report/places?days=7', { headers: { Origin: ORIGIN, Authorization: 'Bearer wrong-key-xxxxxxxx' } }); ok(r.status === 401, 'report wrong key -> 401');
r = await fetch(BASE + '/v1/report/places?days=7', { headers: { Origin: ORIGIN, Authorization: 'Bearer ' + KEY } });
j = await r.json();
const p1 = j.places.find((p) => p.card_id === 'islands-001');
const p2 = j.places.find((p) => p.card_id === 'islands-002');
ok(r.status === 200 && j.sample === false, 'report 200, sample=false');
const b1 = get(before, 'islands-001'), b2 = get(before, 'islands-002');
ok(p1 && p1.travel - b1.travel === 2 && p1.skip - b1.skip === 1, 'islands-001 +2 Travel / +1 Skip counted');
ok(p2 && p2.travel - b2.travel === 0, 'undo cancels the Travel for islands-002');
ok(!JSON.stringify(j).match(/Jane|j@x\.com|1\.2\.3\.4|removedIds|wheel_home_country/), 'no PII in report');
r = await fetch(BASE + '/v1/report/tabs?days=7', { headers: { Authorization: 'Bearer ' + KEY } }); j = await r.json();
ok(j.tabs.some((t) => t.tab === 'islands' && t.deck_ends >= 1), 'tabs report has deck_end');
// ad_click + link_type (migration 0003)
const adBefore = (get(await report(), 'islands-001').ad_links || {});
r = await post({ events: [
  ev('ad_click', 'islands-001', 'islands', { source: 'ad', link_type: 'flight' }),
  ev('ad_click', 'islands-001', 'islands', { source: 'ad', link_type: 'car' }),
  ev('ad_click', 'islands-001', 'islands', { source: 'ad', link_type: 'evil<script>' }),
] }); j = await r.json();
ok(j.accepted === 3, 'ad_click events accepted (' + JSON.stringify(j) + ')');
const adAfter = (get(await report(), 'islands-001').ad_links || {});
ok((adAfter.flight || 0) - (adBefore.flight || 0) === 1 && (adAfter.car || 0) - (adBefore.car || 0) === 1,
  'ad_links counts flight/car');
ok((adAfter.hotel || 0) - (adBefore.hotel || 0) === 1 && !JSON.stringify(adAfter).includes('script'),
  'unknown link_type falls back to hotel');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
