/**
 * Spot and Travel — affiliate / booking deeplink config (browser)
 *
 * Paste real IDs from Expedia Group Travel Creator / Hotels.com / Booking / Travelpayouts.
 * Keep YOUR_AFFILIATE_ID until then — never invent live keys.
 *
 * Switch primary network via affiliates.primaryNetwork.
 */
(function (global) {
  'use strict';

  const affiliates = {
    primaryNetwork: 'expedia',
    hotels: {
      affiliateId: 'YOUR_AFFILIATE_ID',
      searchTemplate:
        'https://www.hotels.com/Hotel-Search?destination={destination}&affid={affiliateId}',
    },
    expedia: {
      // Expedia Group Travel Creator program via Partnerize (publisher 1101l440577).
      // Tracking = prf.hn deeplink wrapper with camref; pubref = card slug.
      affiliateId: '1011l6u48u',
      camref: '1011l6u48u',
      deeplink: 'https://prf.hn/click/camref:{camref}/pubref:{pubref}/destination:{url}',
      searchTemplate: 'https://www.expedia.com/Hotel-Search?destination={destination}',
      flightTemplate: 'https://www.expedia.com/Flights-Search?trip=oneway&leg1=from:,to:{to}&mode=search',
      shopUrl: 'https://expedia.com/shop/spot-and-travel',
      widgetScript: 'https://creator.expediagroup.com/products/widgets/assets/eg-widgets.js',
    },
    booking: {
      affiliateId: 'YOUR_AFFILIATE_ID',
      searchTemplate:
        'https://www.booking.com/searchresults.html?ss={destination}&aid={affiliateId}',
    },
    klook: {
      sidebarUrl: 'https://klook.tpx.gr/cVdJs2X5',
      // Travelpayouts Klook program (verified: tp.media/r?p=4110 -> affiliate.klook.com, pid 779952).
      tp: { p: '4110', campaign_id: '137' },
      // city_id is replaced per card from assets/klook-cities.json (Klook city ids).
      widgetSrc: 'https://tpemb.com/content?currency=USD&trs=583983&shmarker=779952&locale=en&city_id=2&category=4&amount=3&powered_by=true&campaign_id=137&promo_id=4497',
    },
    ctaLabelTemplate: 'Find a stay in {name}',

    // ---- Travelpayouts (BoOnE's account). marker = partner ID, trs = project ID
    // (both taken from the Klook widget generated in his dashboard). A brand link is
    // only wrapped in tp.media when that brand's program id `p` is filled in below
    // AND the project has joined that program. See docs/ads/PROGRAMS.md.
    // Documented universal format (Travelpayouts Help Center):
    //   https://tp.media/r?marker=MARKER&trs=PROJECT&p=PROGRAM&u=ENCODED_URL[&campaign_id=ID]
    travelpayouts: {
      marker: '779952',
      trs: '583983',
      redirect: 'https://tp.media/r',
    },

    // ---- "Plan this trip" panel (js/swipe.js). One link per kind, built from the card
    // shown (name / city / country / lat-lng). `tp.p: null` = no verified program id yet,
    // so the link is a plain, UNAFFILIATED search URL (it still works for visitors).
    planTrip: {
      // Hotels use primaryNetwork above (Hotels.com search). Affiliated only once a real
      // affiliateId replaces YOUR_AFFILIATE_ID (the placeholder is stripped from the URL).
      flights: {
        brand: 'Google Flights',
        // Destination-only search; Google picks the visitor's origin. Not an affiliate program.
        template: 'https://www.google.com/travel/flights?q={query}',
        tp: null,
      },
      cars: {
        brand: 'EconomyBookings',
        // Templates documented by Travelpayouts ("Links from Economybookings").
        templateIata: 'https://www.economybookings.com/en?idpickval={iata}',
        templateCity: 'https://www.economybookings.com/en?idpick={city}',
        // Fill from a link generated in Travelpayouts → Tools after joining EconomyBookings.
        tp: { p: null, campaign_id: null },
      },
      things: {
        brand: 'Klook',
        template: 'https://www.klook.com/en-US/search/result/?query={query}',
        tp: { p: '4110', campaign_id: '137' }, // verified Klook program
      },
      cruise: {
        brand: 'Cruise line',
        // Used only when the card has no ad.cruise_url and the line is not in cruiseLines.
        searchTemplate: 'https://www.google.com/search?q={query}',
        tp: null,
      },
    },

    // Official booking sites for common cruise lines (plain links, no affiliate program).
    cruiseLines: {
      'royal caribbean': 'https://www.royalcaribbean.com/cruises',
      'carnival': 'https://www.carnival.com/cruise-search',
      'norwegian': 'https://www.ncl.com/vacations',
      'msc': 'https://www.msccruisesusa.com/deals',
      'celebrity': 'https://www.celebritycruises.com/cruises',
      'princess': 'https://www.princess.com/cruise-search/results/',
      'holland america': 'https://www.hollandamerica.com/en/us/cruise-destinations',
      'disney': 'https://disneycruise.disney.go.com/cruises-destinations/list/',
      'virgin voyages': 'https://www.virginvoyages.com/book/voyage-planner/find-a-voyage',
      'cunard': 'https://www.cunard.com/en-us/find-a-cruise',
      'viking': 'https://www.vikingcruises.com/oceans/cruise-destinations/index.html',
      'costa': 'https://www.costacruises.com/cruises.html',
      'oceania': 'https://www.oceaniacruises.com/cruise-finder',
      'regent seven seas': 'https://www.rssc.com/cruises',
      'silversea': 'https://www.silversea.com/destinations.html',
      'seabourn': 'https://www.seabourn.com/en/find-a-cruise',
      'p&o': 'https://www.pocruises.com/find-a-cruise',
      'azamara': 'https://www.azamara.com/cruises',
      'hurtigruten': 'https://www.hurtigruten.com/en-us',
      'ponant': 'https://us.ponant.com/cruises',
    },

    // Programs whose deep-link id is published on Travelpayouts' own offer pages and
    // verified to redirect with marker=779952 (not used in the panel yet; see docs/ads).
    verifiedTravelpayoutsPrograms: {
      aviasales: { p: '4114', example: 'https://www.aviasales.com/?params=PARNYC1' },
      qeeq: { p: '4845', example: 'https://www.qeeq.com' },
      klook: { p: '4110', campaign_id: '137', example: 'https://www.klook.com/en-US/destination/c2-hong-kong/1-things-to-do/' },
    },
    disclosure: 'As an affiliate we may earn from qualifying bookings.',
  };

  function fillTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) =>
      key in vars ? vars[key] : `{${key}}`
    );
  }

  function buildDeeplink(network, destinationQuery) {
    const query = String(destinationQuery || '').trim();
    if (!query) throw new Error('destinationQuery is required');
    const encoded = encodeURIComponent(query);
    const map = {
      'hotels.com': affiliates.hotels,
      expedia: affiliates.expedia,
      booking: affiliates.booking,
    };
    const cfg = map[network];
    if (!cfg) throw new Error('Unknown network: ' + network);
    if (network === 'expedia') {
      return wrapExpedia(fillTemplate(cfg.searchTemplate, { destination: encoded }), arguments[2]).href;
    }
    let template = cfg.searchTemplate;
    // Never ship the placeholder: drop the affiliate param until a real id is pasted.
    if (!isLiveId(cfg.affiliateId)) {
      template = template.replace(/[?&][A-Za-z_]+=\{affiliateId\}/, '');
    }
    return fillTemplate(template, {
      destination: encoded,
      affiliateId: cfg.affiliateId,
    });
  }

  /** Wrap any expedia.com URL in the Partnerize (prf.hn) tracking redirect. */
  function wrapExpedia(url, pubref) {
    const E = affiliates.expedia;
    if (!url || !E || !isLiveId(E.camref)) return { href: url, affiliated: false };
    const ref = String(pubref || 'site').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60) || 'site';
    return {
      href: fillTemplate(E.deeplink, { camref: E.camref, pubref: ref, url: encodeURIComponent(url) }),
      affiliated: true,
    };
  }

  function isLiveId(id) {
    return !!id && String(id) !== 'YOUR_AFFILIATE_ID' && !/^YOUR_/.test(String(id));
  }

  function primaryHotelConfig() {
    const map = {
      'hotels.com': affiliates.hotels,
      expedia: affiliates.expedia,
      booking: affiliates.booking,
    };
    return map[affiliates.primaryNetwork] || null;
  }

  /** True when the hotel link carries a real affiliate id. */
  function hotelsAffiliated() {
    const cfg = primaryHotelConfig();
    return !!(cfg && isLiveId(cfg.affiliateId));
  }

  /** Wrap a brand URL in the documented Travelpayouts redirect when its program id is set. */
  function wrapTravelpayouts(url, tp) {
    const T = affiliates.travelpayouts;
    if (!url || !tp || !tp.p || !T || !T.marker || !T.trs) return { href: url, affiliated: false };
    let href =
      T.redirect +
      '?marker=' + encodeURIComponent(T.marker) +
      '&trs=' + encodeURIComponent(T.trs) +
      '&p=' + encodeURIComponent(tp.p) +
      '&u=' + encodeURIComponent(url);
    if (tp.campaign_id) href += '&campaign_id=' + encodeURIComponent(tp.campaign_id);
    return { href: href, affiliated: true };
  }

  function cruiseLineUrl(line) {
    const key = String(line || '').toLowerCase();
    if (!key) return '';
    const lines = affiliates.cruiseLines || {};
    const hit = Object.keys(lines).find(function (k) { return key.indexOf(k) !== -1; });
    return hit ? lines[hit] : '';
  }

  /**
   * Build the "Plan this trip" links for one card.
   * ctx = { place, hotelQuery, city, thingsQuery, country, iata, cruise: { line, ship, url } | null }
   * Returns [{ kind, href, brand, affiliated }] — kinds: hotel | cruise | flight | car | things.
   */
  function buildPlanLinks(ctx) {
    ctx = ctx || {};
    const P = affiliates.planTrip || {};
    const enc = encodeURIComponent;
    const out = [];
    const place = String(ctx.place || '').trim();
    // Cruise cards only get flights/cars/things when a real port city or airport is known.
    const city = String(ctx.city || '').trim() || (ctx.cruise ? '' : place);
    const iata = /^[A-Z]{3}$/.test(String(ctx.iata || '')) ? String(ctx.iata) : '';

    if (ctx.cruise) {
      const c = ctx.cruise;
      let href = /^https:\/\//.test(String(c.url || '')) ? String(c.url) : cruiseLineUrl(c.line);
      if (!href && P.cruise) {
        const q = [c.ship || place, c.line, 'cruise'].filter(Boolean).join(' ');
        href = fillTemplate(P.cruise.searchTemplate, { query: enc(q) });
      }
      if (href) out.push({ kind: 'cruise', href: href, brand: c.line || 'Cruise line', affiliated: false });
    } else {
      const q = String(ctx.hotelQuery || place).trim();
      if (q) {
        try {
          out.push({
            kind: 'hotel',
            href: buildDeeplink(affiliates.primaryNetwork, q, ctx.slug),
            brand: ({ 'hotels.com': 'Hotels.com', expedia: 'Expedia', booking: 'Booking.com' })[affiliates.primaryNetwork] || affiliates.primaryNetwork,
            affiliated: hotelsAffiliated(),
          });
        } catch (e) {}
      }
    }

    const E = affiliates.expedia;
    if (E && E.flightTemplate && (iata || city)) {
      const ew = wrapExpedia(fillTemplate(E.flightTemplate, { to: enc(iata || city) }), ctx.slug);
      out.push({ kind: 'flight', href: ew.href, brand: 'Expedia', affiliated: ew.affiliated });
    }
    if (P.flights && (iata || city)) {
      const fq = 'Flights to ' + (iata || city);
      const w = wrapTravelpayouts(fillTemplate(P.flights.template, { query: enc(fq) }), P.flights.tp);
      out.push({ kind: 'flight', href: w.href, brand: P.flights.brand, affiliated: w.affiliated });
    }
    if (P.cars && (iata || city)) {
      const raw = iata
        ? fillTemplate(P.cars.templateIata, { iata: iata })
        : fillTemplate(P.cars.templateCity, { city: enc(city) });
      const w = wrapTravelpayouts(raw, P.cars.tp);
      out.push({ kind: 'car', href: w.href, brand: P.cars.brand, affiliated: w.affiliated });
    }
    const things = String(ctx.thingsQuery || '').trim() || city;
    if (P.things && things) {
      const w = wrapTravelpayouts(fillTemplate(P.things.template, { query: enc(things) }), P.things.tp);
      out.push({ kind: 'things', href: w.href, brand: P.things.brand, affiliated: w.affiliated });
    }
    return out;
  }

  function buildPrimaryDeeplink(destinationQuery) {
    return buildDeeplink(affiliates.primaryNetwork, destinationQuery);
  }

  function ctaLabel(name) {
    return fillTemplate(affiliates.ctaLabelTemplate, {
      name: name || 'this place',
    });
  }

  function hasLiveAffiliateIds() {
    const p = 'YOUR_AFFILIATE_ID';
    return (
      affiliates.hotels.affiliateId !== p ||
      affiliates.expedia.affiliateId !== p ||
      affiliates.booking.affiliateId !== p
    );
  }


  function getKlookSidebarUrl() {
    const k = affiliates.klook;
    return k && k.sidebarUrl ? String(k.sidebarUrl) : '';
  }

  function getKlookWidgetSrc() {
    const k = affiliates.klook;
    if (k && k.widgetSrc) return String(k.widgetSrc);
    return 'https://klook.tpx.gr/cVdJs2X5';
  }

  global.SpotAndTravelAffiliates = {
    affiliates,
    fillTemplate,
    buildDeeplink,
    buildPrimaryDeeplink,
    ctaLabel,
    hasLiveAffiliateIds,
    getKlookSidebarUrl,
    getKlookWidgetSrc,
    buildPlanLinks,
    wrapExpedia,
    wrapTravelpayouts,
    hotelsAffiliated,
    isLiveId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
