// Offline test of on-ledger verification (mocked Xaman + rippled; nothing is signed or paid).
import worker from '../src/index.js';
const W = 'rDV2dFozB1jqCYXQnAMVAWVZEUQKpeQ4Yo';
const RL = { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' };
let orders = {}, tx = null;
const DB = { prepare(sql) { return { bind(...a) { return {
  first: async () => sql.startsWith('SELECT * FROM crypto_orders') ? orders[a[0]] || null
    : sql.includes('tx_hash=?') ? Object.values(orders).find((o) => o.tx_hash === a[0] && o.ref !== a[1]) || null : null,
  run: async () => { if (sql.startsWith('UPDATE')) Object.assign(orders[a[5]], { status: a[0], verify_note: a[1], tx_hash: a[2] || orders[a[5]].tx_hash }); } }; } }; } };
globalThis.fetch = async (url) => ({ ok: true, json: async () => String(url).includes('xumm')
  ? { meta: { signed: true, resolved: true }, response: { txid: 'H' + url.slice(-1) } } : { result: Object.assign({ status: 'success', validated: true }, tx) } });
const env = { DB, DEST_WALLET: W, PREVIEW: 'true' };
function order(ref, amount) { orders[ref] = { ref, dest_tag: 123456789, payload_uuid: 'u' + ref.slice(-1), amount_json: JSON.stringify(amount), status: 'awaiting_payment', expires_at: Date.now() + 6e5, amount_display: 'x' }; }
const base = (amt, delivered, extra) => Object.assign({ TransactionType: 'Payment', Destination: W, DestinationTag: 123456789, Amount: amt, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: delivered } }, extra);
const cases = [
  ['RLUSD exact', { value: '39.99', ...RL }, base({ value: '39.99', ...RL }, { value: '39.99', ...RL }), 'paid'],
  ['RLUSD partial (Amount ok, delivered short)', { value: '39.99', ...RL }, base({ value: '39.99', ...RL }, { value: '0.01', ...RL }, { Flags: 131072 }), 'rejected_payment'],
  ['fake RLUSD issuer', { value: '39.99', ...RL }, base({ value: '39.99', currency: RL.currency, issuer: 'rFAKE' }, { value: '39.99', currency: RL.currency, issuer: 'rFAKE' }), 'rejected_payment'],
  ['XRP exact', '28445685', base('28445685', '28445685'), 'paid'],
  ['XRP 1 drop short', '28445685', base('28445685', '28445684'), 'rejected_payment'],
  ['wrong destination', '28445685', base('28445685', '28445685', { Destination: 'rOther' }), 'rejected_payment'],
  ['wrong tag', '28445685', base('28445685', '28445685', { DestinationTag: 1 }), 'rejected_payment'],
  ['XRH paid as IOU of XRP-type mismatch', { value: '922043', currency: 'XRH', issuer: 'r9xu7pdBEx4DdiatMqAUFodgxaPkfFU1Zw' }, base('922043', '922043'), 'rejected_payment'],
  ['tec failure', '28445685', base('28445685', '28445685', { meta: { TransactionResult: 'tecPATH_PARTIAL', delivered_amount: '0' } }), 'rejected_payment'],
];
let fail = 0, i = 0;
for (const [name, want, t, expect] of cases) {
  orders = {}; const ref = 'SAT-12345678' + (i++ % 10); order(ref, want); tx = t;
  const r = await worker.fetch(new Request('https://w/v1/status?ref=' + ref), env); const j = await r.json();
  const ok = j.status === expect; if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, '→', j.status, j.note || '');
}
// replay: same tx hash already used by another order
orders = {}; order('SAT-123456780', '28445685'); order('SAT-123456781', '28445685'); orders['SAT-123456780'].tx_hash = 'H1'; orders['SAT-123456780'].status = 'paid';
tx = base('28445685', '28445685');
const j = await (await worker.fetch(new Request('https://w/v1/status?ref=SAT-123456781'), env)).json();
console.log(j.status === 'rejected_payment' ? 'PASS' : 'FAIL', 'replayed tx hash →', j.status, j.note); if (j.status !== 'rejected_payment') fail++;
process.exit(fail ? 1 : 0);
