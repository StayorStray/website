/**
 * Stay or Stray — Location Randomizer (prize wheel)
 * Storage: stayorstray.wheel.v1 only (never sos_stay_list / sos_stray_list).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'stayorstray.wheel.v1';
  var TAB_SLUGS = [
    'hidden-gems',
    'cities',
    'pubs',
    'countries',
    'arenas',
    'beaches',
    'parks',
    'landmarks',
    'islands',
    'luxury',
  ];
  var DISPLAY_SEGMENTS = 18;
  var SPIN_MS_MIN = 2500;
  var SPIN_MS_MAX = 4000;
  var MIN_REVOLUTIONS = 3;

  /** Region codes (ISO 3166-1 alpha-2) → country name matching card.country */
  var REGION_TO_COUNTRY = {
    US: 'United States',
    GB: 'United Kingdom',
    UK: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
    NZ: 'New Zealand',
    IE: 'Ireland',
    FR: 'France',
    DE: 'Germany',
    ES: 'Spain',
    IT: 'Italy',
    PT: 'Portugal',
    NL: 'Netherlands',
    BE: 'Belgium',
    CH: 'Switzerland',
    AT: 'Austria',
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    FI: 'Finland',
    PL: 'Poland',
    CZ: 'Czechia',
    JP: 'Japan',
    KR: 'South Korea',
    CN: 'China',
    IN: 'India',
    BR: 'Brazil',
    MX: 'Mexico',
    AR: 'Argentina',
    CL: 'Chile',
    CO: 'Colombia',
    PE: 'Peru',
    ZA: 'South Africa',
    EG: 'Egypt',
    TR: 'Turkey',
    GR: 'Greece',
    IL: 'Israel',
    AE: 'United Arab Emirates',
    SA: 'Saudi Arabia',
    SG: 'Singapore',
    MY: 'Malaysia',
    TH: 'Thailand',
    VN: 'Vietnam',
    ID: 'Indonesia',
    PH: 'Philippines',
    RU: 'Russia',
    UA: 'Ukraine',
    RO: 'Romania',
    HU: 'Hungary',
    HR: 'Croatia',
    IS: 'Iceland',
    MT: 'Malta',
    CY: 'Cyprus',
    LU: 'Luxembourg',
    HK: 'Hong Kong',
    TW: 'Taiwan',
    NG: 'Nigeria',
    KE: 'Kenya',
    MA: 'Morocco',
    BS: 'Bahamas',
    BM: 'Bermuda',
    BA: 'Bosnia and Herzegovina',
    BG: 'Bulgaria',
    KH: 'Cambodia',
    KY: 'Cayman Islands',
    CU: 'Cuba',
    EC: 'Ecuador',
    EE: 'Estonia',
    FO: 'Faroe Islands',
    PF: 'French Polynesia',
    GE: 'Georgia',
    JO: 'Jordan',
    LA: 'Laos',
    LV: 'Latvia',
    LT: 'Lithuania',
    MG: 'Madagascar',
    MV: 'Maldives',
    ME: 'Montenegro',
    MK: 'North Macedonia',
    SC: 'Seychelles',
    SK: 'Slovakia',
    SI: 'Slovenia',
    LK: 'Sri Lanka',
    TZ: 'Tanzania',
    TN: 'Tunisia',
  };

  var state = {
    homeCountry: 'United States',
    geoFilter: 'all',
    category: 'all',
    removedIds: [],
    countries: [],
    cardsByTab: {},
    allCards: [],
    eligible: [],
    spinning: false,
    lastPick: null,
    rotation: 0,
  };

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function assetPath(rel) {
    var base = document.body.dataset.assetRoot || './';
    return base + String(rel || '').replace(/^\//, '');
  }

  function dataPath(name) {
    return assetPath('data/' + name);
  }

  function inferCountryFromLocale() {
    var locales = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        locales = Array.prototype.slice.call(navigator.languages);
      } else if (navigator.language) {
        locales = [navigator.language];
      }
    } catch (e) {
      locales = [];
    }
    for (var i = 0; i < locales.length; i++) {
      var loc = String(locales[i] || '');
      var parts = loc.replace(/_/g, '-').split('-');
      var region = parts.length >= 2 ? parts[parts.length - 1].toUpperCase() : '';
      if (region && REGION_TO_COUNTRY[region]) return REGION_TO_COUNTRY[region];
    }
    return null;
  }

  function defaultState() {
    return {
      homeCountry: inferCountryFromLocale() || 'United States',
      geoFilter: 'all',
      category: 'all',
      removedIds: [],
    };
  }

  function loadStorage() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      if (typeof parsed.homeCountry === 'string' && parsed.homeCountry) {
        base.homeCountry = parsed.homeCountry;
      }
      if (
        parsed.geoFilter === 'all' ||
        parsed.geoFilter === 'domestic' ||
        parsed.geoFilter === 'international'
      ) {
        base.geoFilter = parsed.geoFilter;
      }
      if (typeof parsed.category === 'string' && parsed.category) {
        base.category = parsed.category;
      }
      if (Array.isArray(parsed.removedIds)) {
        base.removedIds = parsed.removedIds.filter(function (id) {
          return typeof id === 'string' && id;
        });
      }
      return base;
    } catch (e) {
      return base;
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          homeCountry: state.homeCountry,
          geoFilter: state.geoFilter,
          category: state.category,
          removedIds: state.removedIds.slice(),
        })
      );
    } catch (e) {
      /* quota / private mode */
    }
  }

  function isApproved(card) {
    if (!card || typeof card !== 'object') return false;
    if (!card.id || !card.name) return false;
    // Live data/{tab}.json is the shipped catalog (Auditor-approved).
    // Include cards missing qa metadata; exclude only hard rejects.
    var qa = card.qa || {};
    if (qa.auditor_status === 'rejected') return false;
    if (qa.auditor_status && qa.auditor_status !== 'approved') return false;
    return !!(card.image && (card.image.local_path || card.image.url));
  }

  function imageSrc(card) {
    var img = (card && card.image) || {};
    if (img.local_path) return assetPath(img.local_path);
    if (img.url) return img.url;
    return '';
  }

  function adHref(card) {
    var Aff = window.StayOrStrayAffiliates;
    var q =
      (card.ad && card.ad.destination_query) ||
      [card.name, card.country].filter(Boolean).join(', ');
    if (Aff && Aff.buildPrimaryDeeplink) {
      try {
        return Aff.buildPrimaryDeeplink(q);
      } catch (e) {
        /* fall through */
      }
    }
    if (card.ad && card.ad.hotels_deeplink) return card.ad.hotels_deeplink;
    return '#';
  }

  function truncateLabel(name, max) {
    max = max || 14;
    var s = String(name || '').trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  async function fetchJson(url) {
    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function loadCountries() {
    var data = await fetchJson(dataPath('country-list.json'));
    var list = [];
    if (Array.isArray(data)) {
      data.forEach(function (item) {
        if (typeof item === 'string' && item.trim()) {
          list.push({ name: item.trim(), code: '' });
        } else if (item && typeof item.name === 'string' && item.name.trim()) {
          list.push({
            name: item.name.trim(),
            code: typeof item.code === 'string' ? item.code : '',
          });
        }
      });
    }
    list.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    state.countries = list;
  }

  async function loadAllCards() {
    var byTab = {};
    var all = [];
    await Promise.all(
      TAB_SLUGS.map(async function (slug) {
        var data = await fetchJson(dataPath(slug + '.json'));
        if (!Array.isArray(data) || !data.length) {
          byTab[slug] = [];
          return;
        }
        var cards = data.filter(isApproved);
        byTab[slug] = cards;
        cards.forEach(function (c) {
          all.push(c);
        });
      })
    );
    state.cardsByTab = byTab;
    state.allCards = all;
  }

  function tabsWithCards() {
    return TAB_SLUGS.filter(function (slug) {
      return (state.cardsByTab[slug] || []).length > 0;
    });
  }

  function tabLabel(slug) {
    var i = window.StayOrStrayI18n;
    if (i && i.tabLabel) return i.tabLabel(slug);
    return slug
      .split('-')
      .map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }

  function computeEligible() {
    var pool;
    if (state.category === 'all') {
      pool = state.allCards.slice();
    } else {
      pool = (state.cardsByTab[state.category] || []).slice();
    }
    var home = state.homeCountry;
    if (state.geoFilter === 'domestic') {
      pool = pool.filter(function (c) {
        return c.country === home;
      });
    } else if (state.geoFilter === 'international') {
      pool = pool.filter(function (c) {
        return c.country !== home;
      });
    }
    var removed = {};
    state.removedIds.forEach(function (id) {
      removed[id] = true;
    });
    pool = pool.filter(function (c) {
      return !removed[c.id];
    });
    state.eligible = pool;
    return pool;
  }

  function displaySegments(pool) {
    if (!pool.length) return [];
    var n = Math.min(DISPLAY_SEGMENTS, pool.length);
    if (pool.length <= n) return pool.slice();
    var step = pool.length / n;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(pool[Math.floor(i * step) % pool.length]);
    }
    return out;
  }

  function paintWheelWithSegs(segs) {
    var canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var cssSize = Math.min(canvas.clientWidth || 320, 420);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var size = cssSize;
    var cx = size / 2;
    var cy = size / 2;
    var r = size / 2 - 4;
    segs = segs || [];
    var n = Math.max(segs.length, 1);

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((state.rotation % 360) * Math.PI) / 180);

    var colors = ['#1a1f2a', '#243044', '#2a3348', '#1e2636'];
    var accent = '#e8c47c';

    if (!segs.length) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1f2a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#a8b0c0';
      ctx.font = '600 14px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No places', 0, 0);
      ctx.restore();
      return;
    }

    var slice = (Math.PI * 2) / n;
    for (var i = 0; i < n; i++) {
      var startA = i * slice - Math.PI / 2;
      var endA = startA + slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, startA, endA);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.rotate(startA + slice / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = i % 2 === 0 ? '#f4f1ea' : accent;
      ctx.font = '600 11px system-ui,sans-serif';
      ctx.fillText(truncateLabel(segs[i].name, 16), r - 12, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#0f1218';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function paintWheel() {
    paintWheelWithSegs(displaySegments(state.eligible));
  }

  function updatePoolStatus() {
    var el = document.getElementById('wheel-pool-status');
    var btn = document.getElementById('wheel-spin-btn');
    var empty = document.getElementById('wheel-empty-msg');
    var n = state.eligible.length;
    if (el) {
      el.textContent =
        n === 1 ? '1 place in your wheel' : n + ' places in your wheel';
    }
    if (btn) btn.disabled = n === 0 || state.spinning;
    if (empty) {
      if (n === 0) {
        empty.hidden = false;
        empty.textContent =
          'No places match your filters (or all were removed). Try All / another category, or use Reset my wheel.';
      } else {
        empty.hidden = true;
      }
    }
  }

  function refreshFiltersAndWheel() {
    computeEligible();
    paintWheel();
    updatePoolStatus();
  }

  function populateControls() {
    var countrySel = document.getElementById('wheel-home-country');
    var catSel = document.getElementById('wheel-category');
    var geoInputs = document.querySelectorAll('input[name="wheel-geo"]');

    if (countrySel) {
      countrySel.innerHTML = state.countries
        .map(function (c) {
          return (
            '<option value="' +
            escapeHtml(c.name) +
            '">' +
            escapeHtml(c.name) +
            '</option>'
          );
        })
        .join('');
      var names = state.countries.map(function (c) {
        return c.name;
      });
      if (names.indexOf(state.homeCountry) === -1 && state.homeCountry) {
        var opt = document.createElement('option');
        opt.value = state.homeCountry;
        opt.textContent = state.homeCountry;
        countrySel.appendChild(opt);
      }
      countrySel.value = state.homeCountry;
    }

    if (catSel) {
      var opts =
        '<option value="all">All categories</option>' +
        tabsWithCards()
          .map(function (slug) {
            return (
              '<option value="' +
              escapeHtml(slug) +
              '">' +
              escapeHtml(tabLabel(slug)) +
              '</option>'
            );
          })
          .join('');
      catSel.innerHTML = opts;
      var validCats = ['all'].concat(tabsWithCards());
      if (validCats.indexOf(state.category) === -1) state.category = 'all';
      catSel.value = state.category;
    }

    geoInputs.forEach(function (input) {
      input.checked = input.value === state.geoFilter;
    });
  }

  function bindControls() {
    var countrySel = document.getElementById('wheel-home-country');
    var catSel = document.getElementById('wheel-category');
    var geoInputs = document.querySelectorAll('input[name="wheel-geo"]');
    var spinBtn = document.getElementById('wheel-spin-btn');
    var resetBtn = document.getElementById('wheel-reset-btn');
    var modal = document.getElementById('wheel-modal');

    if (countrySel) {
      countrySel.addEventListener('change', function () {
        state.homeCountry = countrySel.value;
        saveStorage();
        refreshFiltersAndWheel();
      });
    }
    if (catSel) {
      catSel.addEventListener('change', function () {
        state.category = catSel.value;
        saveStorage();
        refreshFiltersAndWheel();
      });
    }
    geoInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        if (!input.checked) return;
        state.geoFilter = input.value;
        saveStorage();
        refreshFiltersAndWheel();
      });
    });
    if (spinBtn) {
      spinBtn.addEventListener('click', function () {
        spin();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.removedIds = [];
        saveStorage();
        refreshFiltersAndWheel();
      });
    }
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
      var closeBtn = document.getElementById('wheel-modal-close');
      var againBtn = document.getElementById('wheel-modal-again');
      var removeBtn = document.getElementById('wheel-modal-remove');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (againBtn) {
        againBtn.addEventListener('click', function () {
          closeModal();
          spin();
        });
      }
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          if (state.lastPick && state.lastPick.id) {
            if (state.removedIds.indexOf(state.lastPick.id) === -1) {
              state.removedIds.push(state.lastPick.id);
              saveStorage();
            }
          }
          closeModal();
          refreshFiltersAndWheel();
        });
      }
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    window.addEventListener('resize', function () {
      paintWheel();
    });
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function spin() {
    if (state.spinning) return;
    computeEligible();
    if (!state.eligible.length) {
      updatePoolStatus();
      return;
    }
    state.spinning = true;
    updatePoolStatus();

    var pool = state.eligible;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    state.lastPick = pick;

    var segs = displaySegments(pool);
    var n = segs.length;
    var visualIndex = 0;
    var matchIdx = -1;
    for (var j = 0; j < n; j++) {
      if (segs[j].id === pick.id) {
        matchIdx = j;
        break;
      }
    }
    if (matchIdx >= 0) {
      visualIndex = matchIdx;
    } else {
      visualIndex = Math.floor(Math.random() * n);
      segs[visualIndex] = pick;
    }

    var sliceDeg = 360 / n;
    var targetCenter = visualIndex * sliceDeg + sliceDeg / 2;
    var extraTurns = MIN_REVOLUTIONS + Math.floor(Math.random() * 2);
    var duration =
      SPIN_MS_MIN + Math.floor(Math.random() * (SPIN_MS_MAX - SPIN_MS_MIN + 1));

    var startRot = state.rotation;
    var desired = extraTurns * 360 + (360 - (targetCenter % 360));
    var endRot = startRot + desired - (startRot % 360);

    var startTime = null;
    function frame(ts) {
      if (!startTime) startTime = ts;
      var t = Math.min(1, (ts - startTime) / duration);
      var e = easeOutCubic(t);
      state.rotation = startRot + (endRot - startRot) * e;
      paintWheelWithSegs(segs);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        state.rotation = endRot;
        paintWheelWithSegs(segs);
        state.spinning = false;
        updatePoolStatus();
        showModal(pick);
      }
    }
    requestAnimationFrame(frame);
  }

  function showModal(card) {
    var modal = document.getElementById('wheel-modal');
    if (!modal || !card) return;
    var img = document.getElementById('wheel-modal-img');
    var name = document.getElementById('wheel-modal-name');
    var line = document.getElementById('wheel-modal-line');
    var facts = document.getElementById('wheel-modal-facts');
    var credit = document.getElementById('wheel-modal-credit');
    var hotel = document.getElementById('wheel-modal-hotel');

    var src = imageSrc(card);
    if (img) {
      if (src) {
        img.hidden = false;
        img.src = src;
        img.alt = card.name || '';
      } else {
        img.hidden = true;
        img.removeAttribute('src');
      }
    }
    if (name) name.textContent = card.name || '';
    if (line) line.textContent = card.short_line || card.country || '';

    var f = card.facts || {};
    var bits = [];
    if (f.one_liner) bits.push(f.one_liner);
    if (f.why_go) bits.push(f.why_go);
    if (facts) facts.textContent = bits.join(' ');

    var attribution = (card.image && card.image.attribution) || '';
    var sourcePage = (card.image && card.image.source_page) || '';
    if (credit) {
      if (sourcePage && attribution) {
        credit.innerHTML =
          '<a href="' +
          escapeHtml(sourcePage) +
          '" rel="noopener noreferrer" target="_blank">' +
          escapeHtml(attribution) +
          '</a>';
      } else {
        credit.textContent = attribution;
      }
    }
    if (hotel) {
      hotel.href = adHref(card);
      hotel.textContent = 'Find a stay near ' + (card.name || 'this place');
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    var closeBtn = document.getElementById('wheel-modal-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    var modal = document.getElementById('wheel-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  async function boot() {
    if (document.body.dataset.tab !== 'location-randomizer') return;

    var stored = loadStorage();
    state.homeCountry = stored.homeCountry;
    state.geoFilter = stored.geoFilter;
    state.category = stored.category;
    state.removedIds = stored.removedIds;

    await loadCountries();
    var names = state.countries.map(function (c) {
      return c.name;
    });
    if (names.length && names.indexOf(state.homeCountry) === -1) {
      var inferred = inferCountryFromLocale();
      if (inferred && names.indexOf(inferred) !== -1) {
        state.homeCountry = inferred;
      } else if (names.indexOf('United States') !== -1) {
        state.homeCountry = 'United States';
      } else {
        state.homeCountry = names[0];
      }
    }
    saveStorage();

    await loadAllCards();
    populateControls();
    bindControls();
    refreshFiltersAndWheel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
