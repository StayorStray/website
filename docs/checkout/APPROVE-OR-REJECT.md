# Approve or reject a paid submission (Stripe card hold)

Every "Submit a Place" checkout **only places a hold** on the buyer's card (Stripe
"manual capture"). Nobody is charged until you approve. You have **7 days** from
checkout to decide — after that Stripe releases the hold on its own and you can no
longer charge it.

| Decision | What you click in Stripe | What the buyer sees |
| --- | --- | --- |
| **Approve** (listing goes live) | **Capture** | The pending amount becomes a normal charge |
| **Reject** | **Cancel payment** | The pending amount disappears; they pay nothing |

> Test mode right now: the site uses Stripe **test** links, so only test cards
> (4242 4242 4242 4242) work and no real money moves. Turn on the **Test mode / Sandbox**
> toggle in the Stripe Dashboard to see these payments. See `GO-LIVE.md` to switch.

## 1. Find the submission (Basin email)

Each submission is emailed to you by Basin before the buyer is sent to checkout.
The subject looks like:

    Spot and Travel submission SAT-261009-WJSZR2: <place name>

The email contains `submission_ref` (e.g. `SAT-261009-WJSZR2`), the buyer's email,
`sku`, `pin_7d`, `estimated_total`, and the photo.

## 2. Find the matching payment (Stripe Dashboard)

1. Open **dashboard.stripe.com → Payments** (for now, with **Test mode / Sandbox** on).
2. Filter **Status = Uncaptured** (these are the holds waiting for you).
3. Match the payment to the Basin email by **customer email + amount + date/time**.
   The payment description says what was bought, e.g.
   `Spot and Travel listing hold — standard + 7-day pin`, and the payment's metadata
   shows `sku` and `pin_7d`.
4. The submission reference is saved on Stripe's checkout session as
   **Client reference ID** (`client_reference_id = SAT-…`). Where the payment page
   shows the checkout session / client reference ID, it must equal the Basin
   `submission_ref`. (An assistant with the API key can also look a ref up directly.)
   Amounts: Founding $39.99 · Standard $49.99 · Hidden Gems $99.99 · +$39.99 for the pin.

## 3a. Approve → Capture

1. Click the uncaptured payment.
2. Click **Capture** (top right) → keep the full amount → **Capture**.
3. Status changes to **Succeeded**. Publish the listing; the pin clock starts at go-live.

Tip: if the listing is approved but the 7-day pin can't be honoured (25-pin cap
full), you can capture **less** than the full amount — enter only the listing price
(e.g. 49.99 instead of 89.98). Stripe releases the rest.

## 3b. Reject → Cancel

1. Click the uncaptured payment.
2. Click **Cancel payment** (or **⋯ → Cancel payment**), pick a reason, confirm.
3. Status changes to **Canceled**. The buyer is not charged; their bank drops the
   pending amount (usually within a few days, depending on the bank).
4. Optionally email the buyer (Basin email has their address) to say why.

## Good to know

- **Deadline:** capture within 7 days of checkout. After that the hold expires
  (status becomes Canceled) — you would have to ask the buyer to pay again.
- Receipts: Stripe emails a receipt when you capture if "Successful payments" emails
  are enabled in Settings → Customer emails.
- A buyer who abandons checkout leaves no payment at all — only the Basin email.
  The page tells them their submission is saved and lets them return to checkout.
- Klarna / bank options via Link: the checkout may show **Bank** and **Klarna**
  (powered by Link). Card and Link card/bank payments are holds; to keep everything a
  pure card hold, turn off **Pay later with Klarna** in Settings → Payments → Link.
