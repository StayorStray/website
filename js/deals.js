/* Spot and Travel — compact "Deals" strip (Travelpayouts promo offers).
 * Source: Worker /v1/deals when configured, else data/deals.json snapshot.
 * Shows only US-valid, unexpired offers that have an affiliate promo link. */
(function (g) {
  'use strict';
  var state = null;
  function base() { return /\/pages\//.test(location.pathname) ? '../' : './'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } // visitor's local date
  function usable(d, now) {
    return d && d.us_valid !== false && (!d.end || d.end >= now) && (!d.start || d.start <= now) &&
      (g.SPOT_DEALS_PREVIEW || /^https:\/\//.test(d.href || ''));
  }
  function load() {
    if (state) return state;
    var api = g.SPOT_DEALS_API; // e.g. https://spotandtravel-trends.../v1/deals
    var src = api || base() + 'data/deals.json';
    state = fetch(src).then(function (r) { return r.ok ? r.json() : { deals: [] }; })
      .catch(function () { return { deals: [] }; })
      .then(function (j) {
        var now = today();
        return (j.deals || []).filter(function (d) { return usable(d, now); });
      });
    return state;
  }
  function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function endLabel(end) {
    if (!end) return '';
    var d = new Date(end + 'T12:00:00');
    return 'ends ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function markup(deals) {
    if (!deals.length) return '';
    return '<div class="deals-strip" role="group" aria-label="Travel deals">' +
      '<p class="deals-kicker">🏷️ Travel deals</p><ul class="deals-list">' +
      deals.slice(0, 3).map(function (d) {
        return '<li><a class="deal" href="' + esc(d.href || '#') + '" target="_blank" rel="sponsored noopener nofollow" data-link-type="deal">' +
          '<span class="deal-top"><b>' + esc(d.discount) + '</b> · ' + esc(d.brand) +
          (d.flash ? ' <span class="deal-flash">Flash</span>' : '') + '</span>' +
          '<span class="deal-text">' + esc(d.text) + (d.code ? ' Code <b class="deal-code">' + esc(d.code) + '</b>.' : '') + ' <em>' + esc(endLabel(d.end)) + '</em></span></a></li>';
      }).join('') + '</ul></div>';
  }
  /** Append the strip into every empty [data-deals] mount inside root. */
  function mount(root) {
    var els = (root || document).querySelectorAll('[data-deals]:not([data-deals-done])');
    if (!els.length) return;
    load().then(function (deals) {
      var html = markup(deals);
      els.forEach(function (el) { el.setAttribute('data-deals-done', '1'); if (html) el.innerHTML = html; else el.remove(); });
    });
  }
  g.SpotDeals = { load: load, mount: mount, markup: markup };
})(window);
