# Opt-in auto-renewal: PREVIEW (Stripe TEST mode, branch `auto-renew-preview`, not merged)

## Buyer flow
- **The choice.** The Submit page shows an **"Automatically renew"** checkbox. It is unchecked by default, and the renewal terms for the chosen listing and pin sit right next to it:
  - Founding Standard: $39.99 for year 1, then $49.99/yr.
  - Standard: $49.99/yr.
  - Hidden Gems: $99.99/yr.
  - 30-day pin: $99/mo.
  - 7-day pin: one-time only.
- **If checked:** the visitor goes to one of the 9 `*_renew` Payment Links. Each one is still a card **hold** (manual capture) and also has:
  - `setup_future_usage=off_session`, so the card is saved for renewals;
  - `customer_creation=always`;
  - `metadata.renew=yes`;
  - the renewal terms repeated on Stripe's Pay button text.
- **When BoOnE approves:** capturing the hold triggers `payment_intent.succeeded` → the billing Worker (`workers/billing-preview`). The Worker creates the subscriptions on the saved card:
  - the listing on a yearly price, `trial_end` = go-live + 1 year;
  - for the 30-day pin, a second subscription on the monthly $99 price, `trial_end` = go-live + 30 days.

  No charge is made until then. go-live = `metadata.go_live_at` if BoOnE sets it on the PaymentIntent before capturing, otherwise the capture time. Idempotency keys make Stripe's webhook retries safe.
- **When BoOnE rejects:** he cancels the hold. No subscription is created and the buyer pays nothing.
- **If unchecked:** a one-time hold, as today. On capture, the Worker stores the term in D1. A daily cron emails a renewal link to the matching Payment Link (email prefilled) **7 days before the term ends**.

Why trial_end and not a subscription schedule or billing_cycle_anchor: it's one API call. It allows up to 2 years, so a 1-year start is safely in range. It charges nothing now, and Stripe's own renewal emails and the customer portal work on it. The only cost: Stripe's emails and receipts may call the free period a "trial".

## Stripe TEST objects created
- Recurring prices:
  - `price_1UOmkIECBucDnUAX2anGInHt`: $49.99/yr, Standard product (also used for Founding renewals)
  - `price_1UOmkUECBucDnUAXciJo91kd`: $99.99/yr, Hidden Gems
  - `price_1UOmkUECBucDnUAXy8frB35B`: $99/mo, Pin 30 days
- 9 card-hold auto-renew links: see `paymentLinks.test.*_renew` in `config/submit.js`.

## What BoOnE must set up (before this can go live)
1. **Restricted key permissions.** Customers, Setup Intents, Webhook Endpoints, Payment Methods, Events and Invoices already work. Add these:
   - **Subscriptions: Write**. This is required: the test failed with `more_permissions_required` / `subscription_write`.
   - **Customer portal: Write**, for the portal configuration and sessions (currently denied).
   - Optional: Subscription schedules: Write.
2. **Dashboard → Settings → Billing → Subscriptions and emails.**
   - Turn on **"Send emails about upcoming renewals"**, at 7 days or more. This meets the annual-reminder rules.
   - Turn on **"Send emails about expiring cards"**.
   - Turn on the "link to a Stripe-hosted page to manage subscriptions" in emails.
3. **Dashboard → Settings → Billing → Customer portal.**
   - Enable it with **cancel subscriptions** (at period end), **update payment method** and **invoice history**.
   - Copy the "customer portal login link" into receipts, the site footer and the renewal emails.
4. **Deploy the billing Worker.**
   - `wrangler d1 create spotandtravel-billing-preview`, then put its id in `workers/billing-preview/wrangler.toml` and apply the migrations.
   - `wrangler secret put STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
   - `wrangler deploy`.
   - Add a Stripe webhook endpoint `https://<worker>/v1/stripe/webhook` for `payment_intent.succeeded`.
5. **One-time reminder emails** (Stripe doesn't send these for one-time payments).
   - Create a **Resend** account (free tier, 3,000/mo) and add `spotandtravel.com` as a sending domain. Its SPF/DKIM DNS records can be added through the Cloudflare API.
   - `wrangler secret put RESEND_API_KEY`.
   - Until that key exists, the cron only logs what it would have sent and doesn't mark the reminder as sent.
6. **Copy.** The Founding SKU label currently says "Renewal is a separate purchase at the standard rate". If auto-renew ships, change it to "renews at $49.99/yr if you opt in".

## Auto-renewal law checklist (US: FTC ROSCA + state ARLs such as CA BPC §17600, NY, IL, VA; EU/UK consumer rules)
- **Clear terms before payment, next to the consent:** price, frequency, that it continues until cancelled, when the first renewal happens, and how to cancel. Done (checkbox terms and Stripe button text).
- **Affirmative consent:** an unchecked box the buyer must tick. Done. Its value is stored with the submission (`auto_renew`, `auto_renew_terms`) and in PaymentIntent metadata.
- **Acknowledgment after purchase:** Stripe's receipt plus a subscription-created email. Add the terms and the portal link to the receipt footer.
- **Easy online cancel, as easy as signing up:** the Stripe customer portal ("click to cancel"). Link it in every renewal email.
- **Reminder before each yearly renewal:** Stripe upcoming-renewal emails (CA requires 15–45 days notice for terms of 1 year or more). Set the Stripe reminder to **30 days** for the yearly prices. Monthly pins don't need it.
- **Material changes:** email notice before any price change.
- **Pre-renewal notice when a trial converts:** our trial is the paid first term, but some states ask for a notice 3–21 days before the trial ends. Stripe's "trial ending" email (7 days) covers this.
- This is a summary, not legal advice. Have the final copy reviewed.
