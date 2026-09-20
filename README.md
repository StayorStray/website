# Stay or Stray — Phase 0 static site

**Brand:** Stay or Stray  
**Tagline:** Swipe a place. Stay or stray.

Vanilla HTML/CSS/JS, mobile-first. No framework. Home features the **Hidden Gems** deck; ten category pages share the same swipe UX.

## How to run

Serve this folder over HTTP (ES modules / `fetch` need a server; opening `index.html` as `file://` will fail JSON loads).

```bash
cd /workspace/listings/stay-or-stray/site
python3 -m http.server 8080
# open http://localhost:8080
```

Alternatives:

```bash
npx --yes serve -l 8080 .
# or
php -S localhost:8080
```

## What’s in Phase 0

| Item | Status |
|------|--------|
| `index.html` Home + Hidden Gems deck | Done |
| `pages/{tab}.html` × 10 + Home button | Done |
| Swipe UX (buttons, ←/→ keys, touch, ~300ms fly-off, undo, prefetch, session counts) | Done |
| Ad slot “Find a stay in {name}” via `config/affiliates.js` | Done (placeholders) |
| Footer disclosure + About + photo credits | Done |
| `data/hidden-gems.json` — **3 real** Commons photos | Done |
| Other tabs’ JSON | Empty `[]` (end-of-deck UI) |

### Sample cards (Hidden Gems)

| id | Place | Photo | License |
|----|-------|-------|---------|
| hidden-gems-001 | Giethoorn, Netherlands | `File:Giethoorn Canal 1.jpg` (KarelJanda) | **CC BY-SA 4.0** |
| hidden-gems-002 | Chefchaouen, Morocco | `File:Chefchaouen-the-blue-city-of-morocco-with-palm-trees-and-the-mountain-view-in-the-backrgound.jpg` (Badr Rachadi) | **CC BY-SA 4.0** |
| hidden-gems-003 | Hallstatt, Austria | `File:1 hallstatt austria.jpg` (chensiyuan) | **CC BY-SA 4.0** |

Source: Wikimedia Commons. JPGs copied from Scout downloads under `../images/hidden-gems/`. Facts drawn from Fact Writer drafts + tourism/Wikipedia sources listed in each card’s `facts.sources`. **No AI images.**

## Affiliates

Edit `config/affiliates.js`:

- Replace every `YOUR_AFFILIATE_ID` with the real Hotels.com / Expedia / Booking (or Travelpayouts) ID after you join a program.
- Set `primaryNetwork` to `'hotels.com' | 'expedia' | 'booking'`.
- Do **not** invent IDs. Links may contain the placeholder string until you paste real ones — that is expected.

Footer always shows: *As an affiliate we may earn from qualifying bookings.*

## Tree

```
site/
├── index.html
├── README.md
├── css/site.css
├── js/swipe.js
├── config/affiliates.js
├── pages/
│   ├── hidden-gems.html
│   ├── cities.html
│   ├── pubs.html
│   ├── countries.html
│   ├── arenas.html
│   ├── beaches.html
│   ├── parks.html
│   ├── landmarks.html
│   ├── islands.html
│   └── luxury.html
├── data/
│   ├── manifest.json
│   ├── hidden-gems.json      # 3 cards
│   └── {other-tabs}.json     # []
└── images/hidden-gems/
    ├── hidden-gems-001.jpg
    ├── hidden-gems-002.jpg
    └── hidden-gems-003.jpg
```

## Phase 1 punch-list

1. **Image Scout:** finish 20 license-clean Hidden Gems → `data/raw-images/hidden-gems.json` + JPGs (Scout already has ~17 JPGs in parent `images/`; write metadata JSON + fill remaining 3).
2. **Fact Writer:** merge drafts into full `data/hidden-gems.json` (20 cards) with sources.
3. **Ad Connector:** run fill so every card has matching `destination_query` + deeplinks.
4. **Accuracy Auditor:** approve/reject; only approved cards in live JSON; update `manifest.json` + `qa-report.md`.
5. Repeat Scout → Facts → Ads → Auditor for the other nine tabs (20 each for MVP).
6. Human pastes real affiliate IDs into `config/affiliates.js`; spot-check 10 deeplinks.
7. Scale toward 100 unique approved cards per tab (Phase 2).

## Hard rules (unchanged)

- No AI-generated images.
- Photo must depict the named place; skip locations without a clean reusable license.
- Ads must search the same destination as the card.
- Nothing public without Accuracy Auditor sign-off.
