# trends-ingest (Cloudflare Worker + D1)

Anonymous Travel/Skip trends for Spot and Travel. Activation steps: [`docs/trends/WORKER-SETUP.md`](../../docs/trends/WORKER-SETUP.md).

| Route | Auth | Purpose |
|---|---|---|
| `POST /v1/events` | none (CORS: `ALLOWED_ORIGINS`) | Batch of up to 50 schema-v1 events (`text/plain` JSON body, ≤32 KB) |
| `GET /v1/report/places?days=7\|30\|90&tab=<slug>` | `Authorization: Bearer <REPORT_KEY>` | Per-place Travel/Skip totals, score (Travel share %), change vs prior window (pts), daily series with 7-day rolling score |
| `GET /v1/report/tabs?days=N` | same | Per-category totals and `deck_end` counts |
| `GET /v1/health` | none | Liveness |

Privacy: fields are allowlisted (see `sanitizeEvent` in `src/index.js`); anything else (name, email, ip, lat/lng,
`wheel_home_country`, `removedIds`, list dumps) is dropped. The raw IP is never read or stored. `visitor_country`
comes from Cloudflare's `request.cf.country` only. Rate limit: per-isolate, keyed by a hash of colo + country + UA + language.

Files: `wrangler.toml`, `src/index.js` (ingest, auth, CORS, cron prune), `src/report.js` (reporter),
`migrations/0001_events.sql`, `migrations/0002_rollups.sql`, `test/smoke.mjs`, `.dev.vars.example`.
