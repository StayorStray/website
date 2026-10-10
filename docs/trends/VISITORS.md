# Anonymous visitor counting

Client (`js/trends.js`): once per page load sends `{action:'pageview', event_id, ts, path, vid, ref, visit_start}`.
- `vid`: random UUID in localStorage `sat_vid` (never touches sos_stay_list / sos_stray_list / stayorstray.wheel.v1).
- `ref`: referrer hostname only, null when same site or none.
- `visit_start`: true on the first pageview of a visit; a visit ends after 30 min without a pageview (sessionStorage `sat_visit`).
- `/pages/trends.html` never sends a pageview.

Worker (migration 0004):
- The raw `vid` is never stored. `pageviews` keeps `vh_day = sha256(daily salt | vid)` and `vh_month = sha256(monthly salt | vid)`.
- Salts are random, stored in `visit_salts`, and deleted by the cron once their period is over (day salt after 1 day, month salt after 1 month).
- Rollups: `daily_visits` (path '*' = whole site; pageviews + uniques), `daily_ref` and `yearly_visits` (America/Chicago year, never pruned).
- Raw `pageviews` are pruned with `events` at RAW_RETENTION_DAYS.
- Report: `GET /v1/report/visitors?days=N`.

Accuracy: daily uniques are exact per UTC day. 7/30-day uniques count distinct month-salted hashes, so a visitor seen in two calendar months inside the window counts twice. Visits are sessions, not pageviews.
