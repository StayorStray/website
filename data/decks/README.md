# Deck archives (daily rotation)

BoOnE (2026-09-20): daily deck rotation via **archived sets**. Personal Stay / Stray
lists stay on-device in `localStorage` (keys `sos_stay_list` / `sos_stray_list`) and
are never replaced by a server push.

## Rotation rules (locked)

Timezone: **America/Chicago**.

1. **One set per tab per day** — up to **100** cards. If fewer than 100 approved
   cards exist for a tab, serve the full available inventory only (never invent
   places or photos).
2. **Daily rotation** — a different 100 (or a different order/window over the pool)
   each calendar day, chosen deterministically from `data/decks/manifest.json`.
3. **Weekly remix** — each ISO week re-partitions the pool and, when a place has
   multiple image variants across archive sets, re-pairs the week’s image. No
   week’s daily 100s are identical to a previous week’s.
4. **Personal lists** — Stay/Stray are permanent on-device, keyed by place `id`.
   Daily deck changes do not clear them.

Frontend: `site/js/daily.js` (`StayOrStrayDaily.selectDailyDeck`).

## Layout

```
data/decks/
  manifest.json              # rotation config + set index per tab
  README.md
  {tab}/
    set-001.json             # archived Auditor-approved batch
    set-002.json
    …
```

Live swipe JSON remains `data/{tab}.json` (and `site/data/{tab}.json` after sync).
Archives are snapshots for rotation — Frontend picks today’s set via the rules above.

Copy this tree into `site/data/decks/` for GitHub Pages / static deploy.

## Set file shape

```json
{
  "id": "hidden-gems-set-001",
  "tab": "hidden-gems",
  "label": "Hidden Gems — Set 1 (001–020)",
  "card_ids": ["hidden-gems-001", "…"],
  "count": 20,
  "auditor": "all approved …",
  "created": "ISO-8601",
  "cards": [ /* full card objects */ ]
}
```

## How to add a new daily archive set

1. After Accuracy Auditor approves a batch (target 20 toward 100 per tab), write
   `data/decks/{tab}/set-00N.json` with full `cards` (and `card_ids`).
2. Append the set to `manifest.json` → `tabs.{tab}.sets` (`id`, `file`, `card_ids`,
   `status: "approved"`).
3. Sync into `site/data/decks/` so Pages serves the new archive.
4. Do not invent photos. Only Auditor-approved cards.
5. When a tab reaches 100+ cards across sets, daily rotation will serve 100-card
   windows / set rotation; weekly remix will differentiate weeks.

## Product copy

No “Hot or Not” / “Hot-or-Not” wording in user-facing UI (scrubbed).

## Current

- `hidden-gems/set-001.json` — approved 001–020 (serves all 20 until more land)
- Next: `set-002` after 021–040 clears Auditor
