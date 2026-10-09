# "Plan this trip" — location-focused partner links

Every swipe card now carries a **Plan your trip to <place>** panel (under the card facts, above
the Klook rail). After a **Travel** swipe, a small sheet slides up for the place just saved
("Loved <place>? Plan it now"). It closes itself after 12 s, on ×, or on the next Skip/Undo.
It never covers the photo, so swiping is unaffected.

| Link | Shown for | Built from the card | Destination | Affiliate status today |
|---|---|---|---|---|
| 🏨 Hotels near <place> | normal cards | `ad.destination_query`, else `name, country` | Hotels.com search (`config/affiliates.js` → `primaryNetwork`) | **Plain**: `YOUR_AFFILIATE_ID` is still a placeholder and is stripped from the URL |
| 🚢 Book a cruise on <ship> | cruise cards (replaces hotels) | `ad.cruise_url` → official cruise-line site (`cruiseLines`) → Google search "<ship> <line> cruise" | cruise line | **Plain**: no cruise program on Travelpayouts |
| ✈️ Flights to <city> (IATA) | all (cruise: only with a port) | `ad.iata`, else the nearest airport to `lat`/`lng` | Google Flights `?q=Flights to XXX` | **Plain**: Google Flights is not an affiliate program |
| 🚗 Car rental in <city> | all (cruise: only with a port) | same airport (`idpickval=IATA`), else `idpick=<city>` | EconomyBookings, using the template documented by Travelpayouts | **Plain until** `planTrip.cars.tp.p` is filled in |
| 🎟️ Things to do in <city> | all (cruise: only with a port) | `ad.city`, else a large airport's city within 60 km, else the place name | Klook search | **Plain until** `planTrip.things.tp.p` is filled in |
| Klook rail (existing) | all | not per-card | `klook.tpx.gr/cVdJs2X5` + widget | **Affiliated** (marker 779952) |

The nearest airport comes from `assets/airports.json`. That is 3,244 large and medium airports with scheduled service and an IATA code, taken from OurAirports (public domain). The file loads lazily, once. Until it arrives, or when a card has no coordinates, the links use the place name instead.

All partner links use `target="_blank" rel="sponsored noopener"`. The panel note says *some* links are affiliate links. The footer disclosure, "As an affiliate we may earn from qualifying bookings.", is unchanged and stays accurate: the Klook links are affiliated today.

How each link becomes affiliated: see **PROGRAMS.md**. Optional card fields: **CARD-FIELDS.md**.
Click tracking: **TRACKING.md**.
