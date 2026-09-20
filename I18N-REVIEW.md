# Stay or Stray — i18n / language switcher review

**Reviewer:** Frontend (executor)  
**Date:** 2026-09-20 14:35 CDT  
**Scope:** `/workspace/listings/stay-or-stray/site/` (CoS-owned StayorStray/website — no push)

## Requirements

| # | Requirement | Result | Notes |
|---|-------------|--------|-------|
| 1 | Top-right language switcher: EN / ES / FR / DE / RU | **PASS** | `js/i18n.js` mounts `#lang-switcher` as last header child; button shows `EN`/`ES`/`FR`/`DE`/`RU`; menu lists English / Español / Français / Deutsch / Русский. Present on `index.html` + all `pages/*.html` via shared `i18n.js`. |
| 2 | Same position after language selected (no jump) | **PASS** (polished) | Header is `position: sticky; top: 0`. Switcher uses flex `order: 10` (stats `order: 9`) so it stays trailing/top-right. Language change now **updates in place** (`syncSwitcherState`) instead of remove+recreate. |
| 3 | Persist choice in localStorage | **PASS** | Key `sos_lang`; read on boot (`getStoredLang`), write on change (`setStoredLang`). Invalid values fall back to `en`. |
| 4 | No swipe regression on Home / Hidden Gems | **PASS** | Touch handlers untouched by i18n. Deck keyboard arrows skip when focus is inside `.lang-switcher`. `onChange` only re-renders chrome/tabs/card copy. Smoke: Home + HG both include `i18n.js` + `swipe.js`. |
| 5 | A11y: labeled control, keyboard usable | **PASS** | Button: `aria-label` / `title` from `lang_aria`, `aria-haspopup`, `aria-expanded`, `aria-controls`. Menu: `role="menu"`, options `menuitemradio` + `aria-checked`. Keys: Enter/Space/ArrowDown open; Escape closes; ArrowUp/Down/Home/End in menu; outside click closes. |

## Smoke (`python3 -m http.server 8770` in site root)

| Asset | Status |
|-------|--------|
| `GET /` (index) | 200 |
| `GET /js/i18n.js` | 200 |
| `GET /data/i18n/en.json` | 200 |
| `GET /js/swipe.js` | 200 |

Server killed after smoke.

## Locale files

All five `data/i18n/{en,es,fr,de,ru}.json` load; each has 42 `ui` keys including `lang_aria`, `lang_menu_aria`, chrome strings, and matching `tabs` / `cards` structures.

## Related product rules (awareness only — no Frontend bug fix)

| Rule | Code state |
|------|------------|
| Stay/Stray may be permanent localStorage **lists** | Counts already persist via `sos_stay_count` / `sos_stray_count` (localStorage, not sessionStorage). **Lists of places not implemented yet** — leave for CoS/product. |
| Daily rotation from `data/decks/` | `js/daily.js` + `data/decks/` (manifest, `hidden-gems/`) present. **`daily.js` not script-included**; `swipe.js` still loads `data/{tab}.json`. Wiring is CoS-owned — not changed here. |
| Do not push to GitHub | Honored. |

## Fixes applied (this review)

1. **`js/i18n.js`** — `syncSwitcherState()` + in-place update on language change (avoids remount jump); button also gets `title`.
2. **`css/site.css`** — `.session-stats { order: 9 }`, `.lang-switcher { order: 10 }` to pin switcher top-right; removed duplicate `@media (max-width: 420px)` block.

## Hot-or-Not leftovers (scrubbed 2026-09-20)

| Path | Line | Snippet |
|------|------|---------|
| `index.html` | 27 | `intro-blurb`: “Swipe real places — Stay or Stray…” (scrubbed) |
| `data/i18n/en.json` | 15 | `ui.intro_blurb` |
| `data/i18n/es.json` | 15 | `ui.intro_blurb` |
| `data/i18n/fr.json` | 15 | `ui.intro_blurb` |
| `data/i18n/de.json` | 15 | `ui.intro_blurb` |
| `data/i18n/ru.json` | 15 | `ui.intro_blurb` |
| `data/decks/README.md` | 39 | Process note telling CoS/Frontend to scrub (meta; not product UI) |

## One-line status for Lead

**i18n switcher PASS (EN/ES/FR/DE/RU, localStorage `sos_lang`, a11y + no swipe regression); light polish applied to prevent control jump; Hot-or-Not intros scrubbed; Stay or Stray wording only.**
