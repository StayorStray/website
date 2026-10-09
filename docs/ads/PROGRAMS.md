# Affiliate programs to join, and how to switch each link on

Account: Travelpayouts **marker (partner ID) 779952**, **project (trs) 576993**. Both come from the
Klook widget already on the site.

Travelpayouts' documented universal deep-link format (Help Center, e.g. "Airalo affiliate links"):

    https://tp.media/r?marker=779952&trs=576993&p=<PROGRAM_ID>&u=<URL-encoded brand URL>[&campaign_id=<ID>]

The site builds this automatically for any brand whose `tp.p` is set in `config/affiliates.js`.
Program ids are **not** guessed. Only these two are published on Travelpayouts' own offer pages, and
both were verified on 2026-10-09 to redirect with `marker=779952`:

| Brand | p (program id) | Source | Verified redirect |
|---|---|---|---|
| Aviasales | 4114 | travelpayouts.com/en/offers/aviasales-affiliate-program/ | tp.media → aviasales.com/?marker=779952… (200) |
| QEEQ | 4845 | travelpayouts.com/en/offers/qeeq-affiliate-program/ | tp.media → qeeq.com?sub_id=…-779952 (200) |

These are not used in the panel yet. Aviasales links need a departure airport, which the site does not
know. QEEQ has no documented per-city URL.

## Join these programs (Travelpayouts → Programs → search → "Join", project 576993)

1. **EconomyBookings** (car rental): https://www.travelpayouts.com/en/offers/economybookings-affiliate-program/
2. **Klook** (things to do; you are already in it for the widget): https://www.travelpayouts.com/en/offers/klook-affiliate-program/
3. Optional for later: **Aviasales** https://www.travelpayouts.com/en/offers/aviasales-affiliate-program/
   and **QEEQ** https://www.travelpayouts.com/en/offers/qeeq-affiliate-program/

Then, for each of EconomyBookings and Klook (2 minutes each):

1. Travelpayouts → **Tools → Link generator** (or "Create link"), project 576993, choose the brand.
2. Paste any search URL from that brand, e.g. `https://www.economybookings.com/en?idpick=Milan` or
   `https://www.klook.com/en-US/search/result/?query=Paris`, then click **Generate**.
3. Open the generated short link in https://linkunshorten.com and copy the `p=` value (and `campaign_id=`
   if present).
4. Paste them into `config/affiliates.js`:
   `planTrip.cars.tp = { p: '<p>', campaign_id: '<id or null>' }` and the same for `planTrip.things.tp`.
   Every card's link is then wrapped automatically, still pointing at that card's city or airport.

## Hotels (largest revenue). Not on Travelpayouts any more, so sign up directly

- **Hotels.com / Expedia**: Expedia Group Affiliate Program (Travel Creator): https://affiliates.expediagroup.com/
  Paste the id into `affiliates.hotels.affiliateId` (Hotels.com, `affid=`) or switch `primaryNetwork`.
- **Booking.com**: Booking.com Affiliate Partner Program: https://www.booking.com/affiliate-program/v2/index.html
  Paste the `aid` into `affiliates.booking.affiliateId` and set `primaryNetwork: 'booking'`.

Until a real id is pasted, the hotel link is a plain search: the placeholder is stripped and never sent.

## Not affiliated by design
- **Flights**: Google Flights (no program; it picks the visitor's own departure airport).
- **Cruises**: no cruise brand on Travelpayouts. CruiseDirect runs on CJ, if you want to apply later:
  https://www.cj.com/ (advertiser "CruiseDirect").
