# Frozen event schema (v1)

One JSON object per event. Server may add `received_at`. Client never sends PII.

| Field | Type | Notes |
|-------|------|--------|
| `event_id` | string (UUID v4) | Client-generated; ingest dedupes |
| `session_id` | string | Random per browser tab session (sessionStorage `sat_trends_session`); not tied to the Travel/Skip lists |
| `ts` | string (ISO-8601 UTC) | Client event time |
| `hour` | integer 0–23 | UTC hour of `ts` (rollup helper; server may recompute) |
| `action` | string enum | See allowed actions |
| `source` | string enum | `swipe` \| `keyboard` \| `button` \| `wheel` \| `ad` \| `system` |
| `card_id` | string \| null | Must exist in `data/{tab}.json` when action is card-scoped; null for bare `spin` if no card |
| `tab` | string \| null | Tab slug (`hidden-gems`, `cities`, …) |
| `place` | string \| null | Card `name` at fire time (denormalized; catalog is source of truth) |
| `card_country` | string \| null | Card `country` field only — **not** wheel home-country |
| `visitor_country` | string \| null | **Server-only** from Cloudflare `request.cf.country`; client omits or sends null |
| `path` | string | `location.pathname` (e.g. `/website/pages/islands.html`); server strips query/hash |
| `undo_of` | `stay` \| `stray` | **v1.1 additive**, required when `action = undo` so rollups can subtract the right count |

## Allowed `action` values

`stay` | `stray` | `undo` | `spin` | `spin_remove` | `ad_click` | `deck_end`

Wire names are unchanged from the Stay or Stray era: `stay` = the **Travel** button / right swipe, `stray` = the **Skip** button / left swipe.

Transport: `POST {endpoint}/v1/events` with body `{"v":1,"events":[…]}` (≤50 events), sent as `text/plain` via `navigator.sendBeacon` or `fetch(keepalive)` so no CORS preflight is needed.

## Forbidden in payload (drop if present)

`name` (person), `email`, `wheel_home_country`, `removedIds`, `lat`, `lng`, `ip`, GPS, Travel/Skip list dumps. The Worker copies only the allowlisted fields above, so anything else is dropped.
