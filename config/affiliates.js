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

  global.StayOrStrayAffiliates = {
    affiliates,
    fillTemplate,
    buildDeeplink,
    buildPrimaryDeeplink,
    ctaLabel,
    hasLiveAffiliateIds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
