# Crypto / stablecoin payments — findings (2026-10-09)

**Bottom line:** Stripe's crypto option can't be added to the current card-hold links. Stripe has to approve it first (request it in the Dashboard). Even after approval, crypto can't be held: a crypto buyer pays up front, and a rejected listing gets a refund.

| Question | Answer (Stripe docs: docs.stripe.com/payments/stablecoin-payments) |
| --- | --- |
| Works for a US business? | Yes. The US is a supported business location. |
| Which coins? | USDC (Tempo, Ethereum, Solana, Polygon, Base), USDP and USDG (US only). **RLUSD / XRPL is not supported by Stripe.** |
| Payment Links? | Yes, but only through *dynamic payment methods* (Dashboard setting). The Payment Links API rejects `payment_method_types=crypto`: we tried it in test mode on 2026-10-09 and got "Invalid payment_method_types". |
| Manual capture (card hold)? | **Not supported.** A crypto payment is charged immediately. Hold links only show payment methods that can be held, so crypto never appears on our 6 hold links. They are also fixed to `card`. |
| Fees | 1.5% of the USD amount (cards: 2.9% + 30¢). |
| Payout | Settles to the Stripe balance in **USD** and pays out to the bank on the normal schedule. **No wallet address needed.** |
| Refunds | Full or partial refunds are possible. They go back **in stablecoin to the buyer's original wallet**. |
| Disputes | No chargebacks. |
| Limit | $10,000 per transaction. |
| Account status | The account has no `crypto_payments` capability yet, so crypto is not requested or approved. |

## To turn it on (only BoOnE can do this)
1. Open dashboard.stripe.com → **Settings → Payments → Payment methods**.
2. Find **Stablecoins and Crypto** and click **Request access / Turn on**. It shows **Pending** while Stripe reviews the business (they may email questions).
3. After approval, tell the assistant. It will then create separate **pay-now** links (automatic capture, dynamic payment methods) for crypto buyers. It will also add a "Pay with crypto (USDC)" option and this policy text to the page:
   *"Crypto (USDC) payments can't be held, so they're charged right away. If your listing is rejected, we refund the full amount in USDC to the wallet you paid from."*
   Rejecting a crypto submission = **Refund** in the Dashboard, not Cancel. The Dashboard has no automatic refund, so BoOnE has to click Refund for every rejected crypto order.
