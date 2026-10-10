# Klook rail ("Find experiences on Klook")

- Link (always shown): tp.media/r?marker=779952&trs=576993&p=4110&campaign_id=137 wrapping
  the card's Klook city page (`/destination/c{id}-{slug}/1-things-to-do/`) or, if Klook has
  no city for the card, a Klook search for the card name. p=4110 verified to redirect to
  affiliate.klook.com with pid 779952.
- Widget (tpemb.com, promo_id 4497): only for cards that map to a Klook city in
  `assets/klook-cities.json` (316 cities, ids read from Klook's widget API), or a card with
  `ad.klook_city_id` (+ optional `ad.klook_city_slug`). `city_id` in widgetSrc is replaced per card.
  The script is appended inside `[data-klook-mount]` (it renders next to its own tag). The mount
  stays collapsed until Klook inserts its iframe; if the script fails/is blocked or nothing renders
  within 8 s, the box stays link-only. Never shows another city's tours.
- Emerald (emrld.ltd) is injected after window `load`; its `entrypoint_config` request is
  CORS-blocked by Travelpayouts until spotandtravel.com is added to project 576993.
