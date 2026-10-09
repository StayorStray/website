/**
 * Spot and Travel — anonymous trends client (schema v1, docs/trends/EVENT-SCHEMA.md).
 *
 * OFF by default. While enabled === false (or endpoint is empty) every call is a no-op:
 * no network requests, no storage writes.
 *
 * Sends only: random event/session ids, time, action (stay = Travel, stray = Skip, undo,
 * spin, spin_remove, ad_click, deck_end), source, card id/tab/name/country, page path,
 * and for ad_click the partner link type (hotel/flight/car/things/cruise/klook).
 * Never sends names, emails, location, the wheel home country, removedIds, or the
 * saved lists, and never reads or writes sos_stay_list / sos_stray_list / stayorstray.wheel.v1.
 * Any failure is swallowed so swiping is never blocked.
 */
(function (global) {
  'use strict';

  // ---- Activation: paste the deployed Worker URL, then set enabled: true (see docs/trends/WORKER-SETUP.md)
  var SOS_TRENDS = { enabled: true, endpoint: 'https://spotandtravel-trends.spotandtravel.workers.dev' };

  // Local testing only: a page served from localhost may pre-set window.SOS_TRENDS_LOCAL.
  try {
    var host = global.location && global.location.hostname;
    if ((host === 'localhost' || host === '127.0.0.1') && global.SOS_TRENDS_LOCAL) {
      SOS_TRENDS = {
        enabled: !!global.SOS_TRENDS_LOCAL.enabled,
        endpoint: String(global.SOS_TRENDS_LOCAL.endpoint || ''),
      };
    }
  } catch (e) {}
  global.SOS_TRENDS = SOS_TRENDS;

  var ACTIONS = { stay: 1, stray: 1, undo: 1, spin: 1, spin_remove: 1, ad_click: 1, deck_end: 1 };
  var SOURCES = { swipe: 1, keyboard: 1, button: 1, wheel: 1, ad: 1, system: 1 };
  // ad_click only: which "Plan this trip" link was opened (docs/ads/TRACKING.md).
  var LINK_TYPES = { hotel: 1, flight: 1, car: 1, things: 1, cruise: 1, klook: 1 };
  var SESSION_KEY = 'sat_trends_session';
  var FLUSH_MS = 3000;
  var MAX_QUEUE = 50;
  var queue = [];
  var timer = null;
  var sessionId = null;
  var listening = false;

  function active() {
    return !!(SOS_TRENDS.enabled && /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(SOS_TRENDS.endpoint || ''));
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    var b = new Uint8Array(16);
    global.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function getSession() {
    if (sessionId) return sessionId;
    try { sessionId = global.sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!sessionId) {
      sessionId = uuid();
      try { global.sessionStorage.setItem(SESSION_KEY, sessionId); } catch (e) {}
    }
    return sessionId;
  }

  function url() {
    return SOS_TRENDS.endpoint.replace(/\/+$/, '') + '/v1/events';
  }

  function flush(useBeacon) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length || !active()) { queue = []; return; }
    var batch = queue.splice(0, MAX_QUEUE);
    // text/plain keeps this a "simple" request (no CORS preflight, works with sendBeacon).
    var body = JSON.stringify({ v: 1, events: batch });
    try {
      if (useBeacon && global.navigator && global.navigator.sendBeacon) {
        if (global.navigator.sendBeacon(url(), new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
      }
      if (global.fetch) {
        global.fetch(url(), {
          method: 'POST', body: body, keepalive: true, mode: 'cors', credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        }).catch(function () {});
      }
    } catch (e) {}
    if (queue.length) schedule();
  }

  function schedule() {
    if (!timer) timer = setTimeout(function () { flush(false); }, FLUSH_MS);
  }

  function listen() {
    if (listening) return;
    listening = true;
    try {
      global.addEventListener('pagehide', function () { flush(true); });
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'hidden') flush(true);
      });
    } catch (e) {}
  }

  /**
   * track('stay', { card: {id, tab, name, country}, tab: 'islands', source: 'swipe', undo_of: 'stay' })
   */
  function track(action, opts) {
    if (!active()) return false;
    try {
      if (!ACTIONS[action]) return false;
      opts = opts || {};
      var card = opts.card || null;
      var now = new Date();
      var ev = {
        event_id: uuid(),
        session_id: getSession(),
        ts: now.toISOString(),
        hour: now.getUTCHours(),
        action: action,
        source: SOURCES[opts.source] ? opts.source : 'system',
        card_id: card && card.id ? String(card.id) : null,
        tab: (card && card.tab) || opts.tab || null,
        place: card && card.name ? String(card.name).slice(0, 120) : null,
        card_country: card && card.country ? String(card.country).slice(0, 60) : null,
        path: (global.location && global.location.pathname) || '/',
      };
      if (action === 'undo') ev.undo_of = opts.undo_of === 'stray' ? 'stray' : 'stay';
      if (action === 'ad_click') ev.link_type = LINK_TYPES[opts.link_type] ? opts.link_type : 'hotel';
      queue.push(ev);
      listen();
      if (queue.length >= MAX_QUEUE) flush(false);
      else schedule();
      return true;
    } catch (e) {
      return false;
    }
  }

  global.SpotAndTravelTrends = {
    track: track,
    flush: function () { flush(false); },
    isEnabled: active,
  };
})(window);
