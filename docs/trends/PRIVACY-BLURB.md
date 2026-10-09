# Privacy blurb (footer, all pages)

Shown on every page (`#privacy-blurb`, i18n key `privacy_blurb` in all 10 locales). Worded so it is accurate whether trends are switched on or off ("may count").

> Privacy: Spot and Travel may count anonymous Travel/Skip swipes per place to show which destinations are trending. A vote may be tagged with your approximate country, but we never store your IP address, name, email or exact location, or the home country you set on the wheel. Your saved lists stay on this device.

Accuracy notes: the Worker stores `visitor_country` from Cloudflare `request.cf.country` (country level only). It never stores the IP, names, emails, lat/lng, the wheel home country, `removedIds`, or the saved Travel/Skip lists. If `visitor_country` is ever dropped, the second sentence can be shortened, but it must not be removed while it is collected.
