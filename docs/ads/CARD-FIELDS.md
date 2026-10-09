# Optional per-card fields used by the "Plan this trip" panel

None of these fields is required. Every one has a fallback, so current cards work unchanged and the
content team can add them gradually. (`data/decks/README.md` is owned by the content worker. These
fields are documented here instead.)

| Field | Type | Used for | Fallback when missing |
|---|---|---|---|
| `ad.destination_query` | string | hotel search text | `"<name>, <country>"` |
| `ad.city` (or `city`) | string | label/search city for flights, cars, things to do | nearest airport's city (≤ 200 km), else `name` |
| `ad.iata` (or `iata`) | 3 capital letters | flights + car pickup airport | nearest scheduled airport to `lat`/`lng` (≤ 400 km), else city search |
| `lat`, `lng` | numbers | nearest airport | city/name based links |
| `kind: "cruise"` / `tab: "cruises"` | string | marks a cruise-ship card | — |
| `ad.cruise_line` (or `cruise_line`) | string, e.g. `"Royal Caribbean"` | cruise link + marks card as cruise | Google search for the ship |
| `ad.ship` (or `ship`) | string | cruise label/search | `name` |
| `ad.cruise_url` | `https://` URL | exact booking page for that ship | official line site from `cruiseLines`, then Google search |

Cruise-ship cards: the cruise link **replaces** the hotel link. Flights, cars and things to do appear only
when the card has a homeport (`ad.city`, `ad.iata`, or `lat`/`lng` at the port). Example:

```json
{ "id": "cruises-001", "tab": "cruises", "kind": "cruise", "name": "Icon of the Seas",
  "country": "United States", "lat": 25.7781, "lng": -80.1794,
  "ad": { "cruise_line": "Royal Caribbean", "ship": "Icon of the Seas", "city": "Miami", "iata": "MIA" } }
```

Note: the trends Worker now accepts the `cruises` tab. Card ids must still start with `<tab>-`.
