# Frozen event schema (v1)

One JSON object per event. Server may add `received_at`. Client never sends PII.

| Field | Type | Notes |
|-------|------|--------|
| `event_id` | string (UUID v4) | Client-generated; ingest dedupes |
| `session_id` | string | Random per browser tab session (memory or sessionStorage); not tied to Stay/Stray lists |
| `ts` | string (ISO-8601 UTC) | Client event time |
| `hour` | integer 0–23 | UTC hour of `ts` (rollup helper; server may recompute) |
| `action` | string enum | See allowed actions |
| `source` | string enum | `swipe` \| `keyboard` \| `button` \| `wheel` \| `ad` \| `system` |
| `card_id` | string \| null | Must exist in `data/{tab}.json` when action is card-scoped; null for bare `spin` if no card |
| `tab` | string \| null | Tab slug (`hidden-gems`, `cities`, …) |
| `place` | string \| null | Card `name` at fire time (denormalized; catalog is source of truth) |
| `card_country` | string \| null | Card `country` field only — **not** wheel home-country |
| `visitor_country` | string \| null | **Server-only** from Cloudflare `request.cf.country`; client omits or sends null |
| `path` | string | `location.pathname` (e.g. `/website/pages/islands.html`) |

## Allowed `action` values

`stay` | `stray` | `undo` | `spin` | `spin_remove` | `ad_click` | `deck_end`

## Forbidden in payload (drop if present)

`name` (person), `email`, `wheel_home_country`, `removedIds`, `lat`, `lng`, `ip`, GPS, Stay/Stray list dumps.
