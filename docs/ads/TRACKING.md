# Partner-click tracking

Every click on a panel or sheet link sends `ad_click` to the trends Worker with:
- `source: "ad"`;
- the card id, tab and place;
- **`link_type`**: one of `hotel | flight | car | things | cruise | klook`.

`klook` is reserved for the Klook rail. Unknown values are stored as `hotel`.

Worker changes:
- `workers/trends-ingest/migrations/0003_ad_links.sql` adds `events.link_type` and a new `daily_ad` rollup table (day, card, link_type → clicks).
- `GET /v1/report/places` now returns `ad_links` per place (e.g. `{"flight":2,"car":1}`) plus a top-level `ad_links` total.
- The `cruises` tab is accepted.

Dashboard (`pages/trends.html`): a "Partner clicks (Nd): Hotels n · Flights n · …" line under the KPIs.
