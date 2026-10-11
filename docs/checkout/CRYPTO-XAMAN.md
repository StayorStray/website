# Pay with Xaman (crypto) — LIVE (since 2026-10-11)

Status: **live** as a secondary option on `pages/submit-a-place.html` ("How to pay"), UI in `js/crypto-pay.js`.
Card hold (Stripe links in `config/submit.js`, unchanged) stays the default. The buyer submits the form first (same Basin
POST, same `submission_ref` as card orders, with `pay_method=crypto_xaman` and `crypto_currency`), then gets the Xaman quote.
The old preview page now redirects to the real page.

## Seeing crypto orders
- Paid orders trigger a Basin alert (same inbox as new submissions), subject `Spot and Travel CRYPTO PAID <submission ref>: <amount>`.
- List orders (report key in `/home/box/secrets/spotandtravel-report-key.txt`):
  `curl -s -H "Authorization: Bearer $(cat /home/box/secrets/spotandtravel-report-key.txt)" "https://spotandtravel-crypto-pay.spotandtravel.workers.dev/v1/admin/orders?status=paid"`
  (`status=` paid | awaiting_payment | expired | declined | rejected_payment | refunded | all; `&limit=` up to 200).
- Payment status updates when the buyer's page polls, or via the optional webhook. If a buyer closes the page right after
  paying, open `GET /v1/status?ref=SAT-<tag>` once (from the admin list) to verify and record it.

- Worker: `workers/crypto-pay` → `https://spotandtravel-crypto-pay.spotandtravel.workers.dev` (`PREVIEW = "false"`; preview `test_override` is ignored in live mode)
- Secrets (Worker secrets only, never in repo/browser): `XAMAN_API_KEY`, `XAMAN_API_SECRET`
- Receiving wallet (receive-only, no seed held anywhere): `rDV2dFozB1jqCYXQnAMVAWVZEUQKpeQ4Yo`
- D1: shared `spotandtravel-trends` DB, tables `crypto_orders`, `crypto_events` (`migrations/0001_crypto.sql`)

## Flow
1. `POST /v1/quote {sku, pin, currency}` → computes the price, creates a Xaman `Payment` payload
   (Destination = wallet, exact Amount, unique **DestinationTag** = listing ref `SAT-<tag>`, plus a Memo with the ref),
   `expire: 10` min. The page shows Xaman's QR + deeplink and a 10-minute countdown.
2. `GET /v1/status?ref=SAT-…` (page polls every 4 s) → reads the payload from Xaman; if signed, fetches the tx hash from
   the XRP Ledger and requires: validated, `tesSUCCESS`, `Payment`, correct Destination + DestinationTag, exact currency **and
   issuer**, and **`meta.delivered_amount` ≥ quoted amount** (never `Amount`, so partial payments are rejected). A tx hash can
   only pay one order. Result (`paid` / `rejected_payment` / `expired` / `declined`) is written to `crypto_orders`.
3. Optional webhook `POST /v1/xaman-webhook`: its body is not trusted; it only triggers the same re-fetch + ledger verify.

## Pricing
| Currency | Amount |
|---|---|
| RLUSD (issuer `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`) | USD price exactly (39.99 → 39.99 RLUSD) |
| XRP | USD ÷ midpoint of the on-ledger RLUSD/XRP order book (best funded bid/ask), rounded **up** to the drop |
| XRH (issuer `r9xu7pdBEx4DdiatMqAUFodgxaPkfFU1Zw`) | (USD × 0.90) ÷ (avg XRH/XRP × XRP/USD), rounded **up** to whole XRH |

**XRH average:** the XRH/XRP AMM (`rf5BUNqEYi159nP3Hew1i1rkoWvguZEpdX`) pool ratio after each of its last 30 successful
transactions within 72 h (each post-trade ratio is the price that trade left behind), simple mean. Spot = current pool ratio.

## Guards (quote is refused, HTTP 409, logged to `crypto_events`)
- XRP: ledger mid vs public API (Kraken, fallback Coinbase) differ > **3 %**; book spread > 2 %; empty side of book.
- XRH: spot deviates > **15 %** from the average; fewer than 5 trades in 72 h; AMM XRP reserve < 500 XRP;
  quote worth > 10 % of the AMM XRP reserve; pool frozen.
- Preview only (ignored when PREVIEW=false): `test_override` (`spot_mult`, `pool_xrp`) simulates a spike / thin pool and returns a dry run (no payload).

## Refunds (by hand)
Crypto is charged up front. If a listing is rejected, BoOnE refunds it **in full, by hand, from his own wallet** in Xaman:
1. Look up the order: `npx wrangler@3 d1 execute spotandtravel-trends --remote --command "SELECT ref,currency,amount_display,tx_hash,status FROM crypto_orders WHERE ref='SAT-…'"`.
2. Open the `tx_hash` in an explorer (e.g. https://livenet.xrpl.org/transactions/<hash>) to get the payer's `Account`
   (and their SourceTag if their exchange needs a destination tag — if the payer was an exchange, ask them for a refund address + tag).
3. In Xaman, send back the **same currency and the exact `delivered_amount`** (same issuer). Refund what was received in crypto,
   not a re-converted USD value. Payment fees (~0.00001 XRP) are on us.
4. Record it: `UPDATE crypto_orders SET status='refunded', verify_note='refund tx <hash>' WHERE ref='SAT-…'`.
Never share the wallet seed with anyone (including Grok Bot); refunds are always signed by BoOnE in Xaman.

## Tests
`node workers/crypto-pay/test/verify.test.mjs` (on-ledger verification) and `node workers/crypto-pay/test/guards.test.mjs` (quote guards, live mode).
