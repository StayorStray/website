/**
 * Stay or Stray — affiliate / booking deeplink config (browser)
 *
 * Paste real IDs from Expedia Group Travel Creator / Hotels.com / Booking / Travelpayouts.
 * Keep YOUR_AFFILIATE_ID until then — never invent live keys.
 *
 * Switch primary network via affiliates.primaryNetwork.
 */
(function (global) {
  'use strict';

  const affiliates = {
    primaryNetwork: 'hotels.com',
    hotels: {
      affiliateId: 'YOUR_AFFILIATE_ID',
      searchTemplate:
        'https://www.hotels.com/Hotel-Search?destination={destination}&affid={affiliateId}',
    },
    expedia: {
      affiliateId: 'YOUR_AFFILIATE_ID',
      searchTemplate:
        'https://www.expedia.com/Hotel-Search?destination={destination}&affcid={affiliateId}',
    },
    booking: {
      affiliateId: 'YOUR_AFFILIATE_ID',
      searchTemplate:
        'https://www.booking.com/searchresults.html?ss={destination}&aid={affiliateId}',
    },
    klook: {
      sidebarUrl: 'https://klook.tpx.gr/cVdJs2X5',
      widgetSrc: 'https://tpemb.com/content?currency=USD&trs=576993&shmarker=779952&locale=en&city_id=2&category=4&amount=3&powered_by=true&campaign_id=137&promo_id=4497',
    },
    ctaLabelTemplate: 'Find a stay in {name}',
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
    return fillTemplate(cfg.searchTemplate, {
      destination: encoded,
      affiliateId: cfg.affiliateId,
    });
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

  global.StayOrStrayAffiliates = {
    affiliates,
    fillTemplate,
    buildDeeplink,
    buildPrimaryDeeplink,
    ctaLabel,
    hasLiveAffiliateIds,
    getKlookSidebarUrl,
    getKlookWidgetSrc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
