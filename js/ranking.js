/* Spot and Travel — like-based deck ordering + "Hottest Locations" (PREVIEW, off by default).
 * Turned on only with ?ranking=preview (remembered in sessionStorage) until BoOnE approves.
 * Score (plain words): a place's like rate, pulled toward the site average until it has enough
 * votes (Bayesian average, PRIOR_VOTES "pretend" votes at the site-wide rate), so 2-for-2 doesn't
 * beat 80-for-100. New / barely-seen places get a fading freshness boost. Near-ties get a small
 * daily shuffle. Paid pins (data/pins.json) always go first. Any failure -> original order.
 * Stats: public aggregated /v1/scores (one vote per visitor session per place, 90 days),
 * falling back to data/ranking-snapshot.json. No personal data either way.
 */
(function (global) {
  'use strict';
  var CFG = {
    PRIOR_VOTES: 10,          // pretend votes at the site-average like rate
    FRESH_VOTES: 8,           // places with fewer real votes than this get a boost
    FRESH_BOOST: 0.12,        // max boost (12 points of like rate), fades to 0 at FRESH_VOTES
    FRESH_DAYS: 14,           // also boost cards added in the last 14 days
    JITTER: 0.03,             // +/- 3 points daily shuffle so near-ties trade places
    MIN_TAB_VOTES: 30,        // below this many votes in a section, keep the current order
    HOT_PER_TAB: 3,           // Hottest Locations: top N per section
    HOT_MIN_VOTES: 10,        // ...and only with at least this many real votes
    HOT_DAYS: 30              // featured for 30 days from qualifying
  };
  var ENDPOINT = 'https://spotandtravel-trends.spotandtravel.workers.dev/v1/scores';
  var statsP = null, pinsP = null;

  function root() { return (document.body && document.body.dataset.assetRoot) || './'; }
  function enabled() {
    try {
      var q = new URLSearchParams(location.search).get('ranking');
      if (q === 'preview') sessionStorage.setItem('sat_ranking', '1');
      if (q === 'off') sessionStorage.removeItem('sat_ranking');
      return sessionStorage.getItem('sat_ranking') === '1';
    } catch (e) { return false; }
  }
  function getJSON(u) {
    return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }
  function loadStats() {
    if (!statsP) {
      statsP = getJSON(ENDPOINT)
        .catch(function () { return getJSON(root() + 'data/ranking-snapshot.json'); })
        .catch(function () { return null; });
    }
    return statsP;
  }
  function loadPins() {
    if (!pinsP) pinsP = getJSON(root() + 'data/pins.json').catch(function () { return { pins: [] }; });
    return pinsP;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function today() { return new Date().toISOString().slice(0, 10); }

  function siteRate(stats) {
    var t = 0, n = 0;
    Object.keys(stats.places || {}).forEach(function (k) { var p = stats.places[k]; t += p.travel; n += p.travel + p.skip; });
    return n ? t / n : 0.6;
  }
  function baseScore(p, avg) {
    var t = p ? p.travel : 0, n = p ? p.travel + p.skip : 0;
    return (t + CFG.PRIOR_VOTES * avg) / (n + CFG.PRIOR_VOTES);
  }
  function score(card, stats, avg, day) {
    var p = stats.places[card.id];
    var n = p ? p.travel + p.skip : 0;
    var s = baseScore(p, avg);
    var fresh = Math.max(0, 1 - n / CFG.FRESH_VOTES);
    var added = card.added || card.approved_at || card.live_at;
    if (added && (Date.now() - Date.parse(added)) < CFG.FRESH_DAYS * 86400000) fresh = Math.max(fresh, 0.5);
    s += CFG.FRESH_BOOST * fresh;
    s += (hash(card.id + day) - 0.5) * 2 * CFG.JITTER;
    return s;
  }
  function activePins(pins, tab) {
    var now = Date.now();
    return (pins.pins || []).filter(function (p) { return p.tab === tab && Date.parse(p.until) > now; })
      .map(function (p) { return p.card_id; });
  }

  function rankDeck(tab, cards) {
    if (!enabled() || !Array.isArray(cards) || cards.length < 2) return Promise.resolve(cards);
    return Promise.all([loadStats(), loadPins()]).then(function (r) {
      var stats = r[0], pins = r[1];
      var pinned = activePins(pins, tab);
      var order = cards.slice();
      if (stats && stats.places) {
        var tabVotes = 0;
        cards.forEach(function (c) { var p = stats.places[c.id]; if (p) tabVotes += p.travel + p.skip; });
        if (tabVotes >= CFG.MIN_TAB_VOTES) {
          var avg = siteRate(stats), day = today();
          var sc = {};
          cards.forEach(function (c) { sc[c.id] = score(c, stats, avg, day); });
          order.sort(function (a, b) { return sc[b.id] - sc[a.id]; });
        }
      }
      var front = pinned.map(function (id) { return order.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
      return front.concat(order.filter(function (c) { return front.indexOf(c) < 0; }));
    }).catch(function () { return cards; });
  }

  // Hottest: worker returns stats.hottest = [{card_id, tab, since}] (persisted so the 30 days
  // run from when it first qualified). Without it, compute from current stats with since=today.
  function hottest(tabs, loadTab) {
    return loadStats().then(function (stats) {
      if (!stats || !stats.places) return [];
      var avg = siteRate(stats);
      var list = stats.hottest;
      if (!Array.isArray(list)) {
        list = [];
        tabs.forEach(function (tab) {
          Object.keys(stats.places).map(function (id) { return Object.assign({ card_id: id }, stats.places[id]); })
            .filter(function (p) { return p.tab === tab && p.travel + p.skip >= CFG.HOT_MIN_VOTES; })
            .sort(function (a, b) { return baseScore(b, avg) - baseScore(a, avg); })
            .slice(0, CFG.HOT_PER_TAB)
            .forEach(function (p) { list.push({ card_id: p.card_id, tab: tab, since: stats.generated || today() }); });
        });
      }
      var now = Date.now();
      list = list.filter(function (h) { return now - Date.parse(h.since) < CFG.HOT_DAYS * 86400000; });
      return Promise.all(tabs.map(function (t) { return loadTab(t).catch(function () { return []; }); })).then(function (decks) {
        var byId = {};
        decks.forEach(function (d) { (d || []).forEach(function (c) { byId[c.id] = c; }); });
        return list.map(function (h) {
          var c = byId[h.card_id]; if (!c) return null;
          var out = Object.assign({}, c);
          out.hot_tab = h.tab; out.hot_since = h.since;
          out.hot_score = Math.round(1000 * baseScore(stats.places[h.card_id], avg)) / 10;
          return out;
        }).filter(Boolean).sort(function (a, b) { return b.hot_score - a.hot_score; });
      });
    });
  }

  global.SpotAndTravelRanking = { enabled: enabled, rankDeck: rankDeck, hottest: hottest, config: CFG };
})(window);
