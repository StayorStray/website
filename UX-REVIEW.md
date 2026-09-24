# Stay or Stray — UX review

**Reviewer:** Stay Frontend (workspace polish)  
**Date:** 2026-09-20 (America/Chicago)  
**Scope:** `/workspace/listings/stay-or-stray/site/` only

## Checklist vs FRONTEND-UX.md / Bot 2

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | Home: brand, tagline, 10-tab nav, Hidden Gems first | **PASS** | `index.html` brand + “Swipe a place. Stay or stray.”; nav from `TABS`; featured Hidden Gems deck |
| 2 | One page per tab + Home top-left | **PASS** | All 10 under `pages/`; `data-show-home="true"` + `../index.html` |
| 3 | Tab slugs locked | **PASS** | hidden-gems → luxury match blueprint |
| 4 | Stay right / Stray left; keys; touch; 280–350ms fly-off; next preloaded | **PASS** | Fly 300ms; →/←; touch + mouse; next card kept in DOM (`.card-next`) during fly-off |
| 5 | Prefetch next 3 images | **PASS** | Prefetch `i+1 … i+3` via `new Image()` |
| 6 | Facts readable; collapse only on tiny screens after 2 sentences | **PASS** | Full facts always; ≤380px collapses `why_go` after 2 sentences with More/Less |
| 7 | Ad slot + affiliates.js | **PASS** | “Stay nearby” + `Find a stay in {name}` via `destination_query` |
| 8 | Footer disclosure / credits / About | **PASS** | On Home + every tab page |
| 9 | End-of-deck copy | **PASS** | Exact: “You’ve swiped this list. Try another tab.” + quick tab links |
| 10 | Session Stay/Stray counts (localStorage) | **PASS** | `sos_stay_count` / `sos_stray_count` in header |
| 11 | A11y | **PASS** | aria-labels Stay/Stray; alt=name; ≥44px taps; aria-live progress; focus returns to Stay |
| 12 | Visual travel-magazine | **PASS** | Dark photo + light name overlay; serif display / UI sans |
| 13 | Load `/data/{tab}.json`, images `/images/{tab}/` | **PASS** | Via `data-asset-root` |
| 14 | Relative paths from `pages/*` | **PASS** | `../css`, `../js`, `../data`, `../images`, `../config`, `../index.html` |

## Also checked

| Check | Result |
|-------|--------|
| `data/hidden-gems.json` — 3 Commons cards, real JPGs on disk | **PASS** (`hidden-gems-001..003.jpg`, JPEG magic `\xff\xd8\xff`) |
| Empty tabs → end-of-deck, not broken JS | **PASS** (`[]` → end UI) |
| No broken relative asset links | **PASS** (spot-checked all 10 pages + Home) |
| README `python3 -m http.server` from site root | **PASS** (see smoke test below) |

## What was fixed in this pass

1. **Prefetch range** — was including current card; now `i+1…i+3` only.
2. **End-of-deck copy** — aligned to spec wording; added a few “try another tab” links.
3. **Next card in DOM** — `.card-next` peek under active card so fly-off never shows a blank/spinner frame.
4. **Mouse swipe listener leak** — AbortController tears down window mouse listeners on re-render.
5. **Facts collapse** — sentence-based (first 2) + More/Less on `max-width: 380px` only.
6. **Tap targets** — tab nav min-height 40→44px; focus-visible on buttons; focus Stay after each card.
7. **Home polish** — cleaner intro blurb / title; `[hidden]` Home button forced off via CSS.
8. **Visual** — explicit light color on `.place-name` over photo gradient.

## Still open (not Frontend’s job)

- Content pipeline: Scout → Facts → Ads → Auditor for 20/tab MVP (other tabs still `[]`).
- Auditor sign-off (`qa.auditor_status` still `pending` on the 3 sample cards).
- Real affiliate IDs in `config/affiliates.js` (placeholders expected).
- Brand home / Origin repo under **stayorstray** org — HOLD; no GitHub push / CloudAgent from this pass.
- Optional: dedicated About / Photo credits pages (anchors on Home are enough for now).

## Smoke test (local)

```bash
cd /workspace/listings/stay-or-stray/site
python3 -m http.server 8765
# curl index, pages/cities.html, data/hidden-gems.json → 200
```

## Preview readiness

**Home + swipe are usable for Lead/user preview** over HTTP. Open `http://localhost:8080` (or 8765), swipe the 3 Hidden Gems, open any empty tab to confirm end-of-deck.
