# Trends — punch list (Trends Lead)

**Status 2026-10-08: all three parts built (branch `trends-analytics`), client shipped DISABLED.** Activation: `WORKER-SETUP.md`. D1 database: `spotandtravel-trends`. UI labels are Travel (= `stay`) / Skip (= `stray`); storage keys unchanged.

Ship order: **Ingest → Client → Reporter**. Client ships with `SOS_TRENDS.enabled = false` until a real Worker URL is pasted.

## 1. Trends Ingest (Worker + D1)

| Path | Work |
|------|------|
| `workers/trends-ingest/wrangler.toml` | Worker name, D1 binding `DB`, routes |
| `workers/trends-ingest/src/index.js` | `POST /v1/events` ingest; `OPTIONS` CORS; reject PII fields |
| `workers/trends-ingest/migrations/0001_events.sql` | `events` table matching frozen schema |
| `workers/trends-ingest/README.md` | Deploy + paste URL steps (see also `docs/trends/WORKER-SETUP.md`) |

Hard: rate-limit by CF colo + coarse fingerprint only (no raw IP store). Drop `name`, `email`, `wheel_home_country`, `removedIds`, `lat`/`lng`/`GPS`, raw IP. `visitor_country` = Cloudflare `request.cf.country` only.

## 2. Trends Client (static site)

| Path | Work |
|------|------|
| `js/trends.js` | `SOS_TRENDS = { enabled: false, endpoint: '' }`; queue + `navigator.sendBeacon` / `fetch` keepalive; no-op when disabled or network fails |
| `js/swipe.js` | Hook stay / stray / undo / ad_click / deck_end — fire only if `card.id` exists in loaded deck |
| `js/daily.js` | No change needed (deck_end is sent from `swipe.js`) |
| Wheel / randomizer (when present) | Hook `spin` / `spin_remove` — **do not** read or send `stayorstray.wheel.v1` home-country or `removedIds` |
| `index.html` + `pages/*.html` | `<script src="…/js/trends.js">` before `swipe.js` |
| Footer (all pages + `data/i18n/*.json`) | Privacy blurb (see `PRIVACY-BLURB.md`) |

Hard: never mutate `sos_stay_list`, `sos_stray_list`, or `stayorstray.wheel.v1`. Failures must not block swipe UI.

## 3. Trends Reporter (rollups + dashboard)

| Path | Work |
|------|------|
| `workers/trends-ingest/migrations/0002_rollups.sql` | Optional rollup tables / views |
| `workers/trends-ingest/src/report.js` | Per-place Travel/Skip, score (Travel share %), change vs prior window, 7-day rolling series; tab totals |
| `pages/trends.html` | Private dashboard (noindex, not in nav), REPORT_KEY in sessionStorage, risers/fallers, stock-style chart, sortable table, category filter, labelled SAMPLE DATA mode |
| `css/site.css` | Untouched — dashboard styles are inline in `pages/trends.html` |

## Out of scope

- Photo catalog / `data/*.json` place inventory
- AI images, new locations, account systems
