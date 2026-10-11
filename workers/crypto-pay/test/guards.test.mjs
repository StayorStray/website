// Offline guard tests in LIVE mode (PREVIEW=false): mocked ledger/APIs, no payload is ever created.
import worker from '../src/index.js';
const AMM = 'rf5BUNqEYi159nP3Hew1i1rkoWvguZEpdX', RL = { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' };
let S, xamanCalls = 0;
const now = Math.floor(Date.now() / 1000) - 946684800;
const trade = (xrp, xrh) => ({ validated: true, tx: { date: now - 600 }, meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [
  { ModifiedNode: { LedgerEntryType: 'AccountRoot', FinalFields: { Account: AMM, Balance: String(xrp * 1e6) } } },
  { ModifiedNode: { LedgerEntryType: 'RippleState', FinalFields: { Balance: { currency: 'XRH', value: '-' + xrh }, HighLimit: { issuer: AMM }, LowLimit: { issuer: 'rX' } } } }] } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('xumm')) { xamanCalls++; return { ok: true, json: async () => ({ uuid: 'x', refs: {}, next: {} }) }; }
  if (u.includes('kraken')) return { ok: true, json: async () => ({ result: { XXRPZUSD: { c: [String(S.pub)] } } }) };
  const m = JSON.parse(init.body); const p = m.params[0]; let r;
  if (m.method === 'book_offers') r = p.taker_gets.currency === 'XRP'
    ? { offers: [{ TakerGets: '1000000', TakerPays: Object.assign({ value: String(S.ask) }, RL) }] }
    : { offers: [{ TakerGets: Object.assign({ value: String(S.bid) }, RL), TakerPays: '1000000' }] };
  if (m.method === 'amm_info') r = { amm: { amount: String(S.pool * 1e6), amount2: { value: String(S.pool / S.spot) } } };
  if (m.method === 'account_tx') r = { transactions: Array.from({ length: S.trades }, () => trade(1000, 1000 / S.avg)) };
  return { ok: true, json: async () => ({ result: Object.assign({ status: 'success' }, r) }) };
};
const env = { PREVIEW: 'false', DEST_WALLET: 'rDV2dFozB1jqCYXQnAMVAWVZEUQKpeQ4Yo', DB: { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}) }) }) } };
const base = { ask: 1.41, bid: 1.40, pub: 1.405, pool: 1440, spot: 2.78e-5, avg: 2.78e-5, trades: 18 };
const cases = [
  ['XRP: ledger vs public differ >3%', 'XRP', { pub: 1.50 }, 'rate_mismatch'],
  ['XRP: spread >2%', 'XRP', { ask: 1.45, bid: 1.38 }, 'wide_spread'],
  ['XRH: spot 20% above average', 'XRH', { spot: 2.78e-5 * 1.2 }, 'price_deviation'],
  ['XRH: pool under 500 XRP', 'XRH', { pool: 400 }, 'thin_liquidity'],
  ['XRH: too few trades', 'XRH', { trades: 3 }, 'thin_liquidity'],
  ['XRH: quote >10% of pool', 'XRH', { pool: 900 }, 'thin_liquidity', 'hidden_gems', '30d'],
  ['LIVE requires a submission_ref', 'RLUSD', {}, 'submission_required', 'founding_standard', 'none', null, ''],
];
let fail = 0;
for (const [name, cur, o, want, sku = 'founding_standard', pin = 'none', ov = null, sub = 'SAT-261011-ABC123'] of cases) {
  S = Object.assign({}, base, o); xamanCalls = 0;
  const body = { sku, pin, currency: cur, submission_ref: sub }; if (ov) body.test_override = ov;
  const j = await (await worker.fetch(new Request('https://w/v1/quote', { method: 'POST', body: JSON.stringify(body) }), env)).json();
  const got = j.code || j.error; const ok = got === want && xamanCalls === 0; if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, '→', got, '| xaman payloads created:', xamanCalls);
}
// Simulate switch: pool_xrp:100 would force thin_liquidity in PREVIEW; LIVE must ignore it and quote normally.
for (const [mode, expectRefused] of [['true', true], ['false', false]]) {
  S = Object.assign({}, base); xamanCalls = 0;
  const j = await (await worker.fetch(new Request('https://w/v1/quote', { method: 'POST', body: JSON.stringify({ sku: 'founding_standard', pin: 'none', currency: 'XRH', submission_ref: 'SAT-261011-ABC123', test_override: { pool_xrp: 100 } }) }), Object.assign({}, env, { PREVIEW: mode }))).json();
  const ok = expectRefused ? j.code === 'thin_liquidity' : (j.ok === true && !j.dry_run && xamanCalls === 1);
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', 'test_override with PREVIEW=' + mode, '→', j.code || (j.dry_run ? 'dry_run' : j.ok ? 'normal quote ' + j.amount_display : JSON.stringify(j)));
}
process.exit(fail ? 1 : 0);
