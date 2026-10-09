# Go-live checklist — Submit a Place checkout (card hold)

Today the site runs Stripe **TEST** mode (`checkoutMode: 'test'` in `config/submit.js`).
Do these steps to take real money. Nothing here can be done with the test key.

## Before you start

- [ ] Stripe account fully activated for live payments (business details, bank account
      for payouts, identity verification) — Dashboard shows no "Activate" banner.
- [ ] Settings → Public details: business name **Spot and Travel**, support email,
      statement descriptor (e.g. `SPOTANDTRAVEL`) — this is what buyers see on the hold.
- [ ] Settings → Branding: logo/colours for the checkout page (test mode already shows the logo).
- [ ] Settings → Payments → Link: turn **off "Pay later with Klarna"** (keeps every
      checkout a card/Link hold that you capture or cancel).
- [ ] Settings → Customer emails: enable **Successful payments** receipts (sent on capture).

## 1. Live API key (restricted)

Create a **live** restricted key (Developers → API keys → Create restricted key) with:

| Resource | Permission |
| --- | --- |
| Products | Write |
| Prices | Write |
| Payment Links | Write |
| Checkout Sessions | Read |
| PaymentIntents | Write (to look up / capture / cancel holds) |

Give it to the assistant as env var `STRIPE_LIVE_RESTRICTED_KEY` (never paste it in
the repo or chat logs).

## 2. Recreate the 6 Payment Links in live mode

    python3 docs/checkout/tools/stripe_setup.py live

This creates (or reuses) the 4 live products/prices — Founding Standard $39.99,
Standard $49.99, Hidden Gems $99.99, 7-day pin $39.99 (USD, one-time) — and 6 links
(3 listing types × with/without pin), each with:

- `payment_intent_data.capture_method = manual` (card hold)
- after payment → redirect to `pages/submit-a-place.html?checkout=success`
- metadata `sku`, `pin_7d`; card payments; email collected
- the "you're only authorized now" message under the Pay button

Note: the older live prices in `config/submit.js → prices.live` (`price_1UJO…`) were
made before this flow; the script makes its own (lookup keys `sat_live_*`). Archive
the old ones in the Dashboard if you don't need them.

## 3. Switch the site

In `config/submit.js`:

- [ ] Paste the 6 printed live URLs into `paymentLinks.live` (same keys as `.test`).
- [ ] Change `checkoutMode: 'test'` → `checkoutMode: 'live'`.
- [ ] Commit, merge to `main`, push (GitHub Pages deploys in ~1 minute).

If a live link is missing, the page never charges: it records the submission and
tells the buyer a payment link will be emailed.

## 4. Verify live

- [ ] Submit a real test listing with your own card for the cheapest SKU.
- [ ] Stripe Dashboard (live) → Payments → it shows **Uncaptured**, right amount,
      your email; Basin email has the same `SAT-…` ref.
- [ ] **Cancel** that payment (you are not charged). Optionally repeat and **Capture**
      once to confirm capture works, then refund it.
- [ ] Back button from checkout shows "Checkout wasn't completed…" and a Continue button.

## 5. After launch

- Check Payments → **Uncaptured** at least every few days; holds expire after 7 days.
- Follow `APPROVE-OR-REJECT.md` for each submission.
