/**
 * Spot and Travel — swipe deck
 * Travel/Skip buttons, arrow keys, touch swipe, ~300ms fly-off,
 * prefetch next 3 images, undo, session counts, end-of-deck.
 */
(function () {
  'use strict';

  const FLY_MS = 300;
  const SWIPE_THRESHOLD = 80;
  const PREFETCH = 3;
  const STORAGE_STAY_LIST = 'sos_stay_list';
  const STORAGE_STRAY_LIST = 'sos_stray_list';
  const LEGACY_STAY = 'sos_stay_count';
  const LEGACY_STRAY = 'sos_stray_count';

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const TAB_SLUGS = [
    { slug: 'hidden-gems', featured: true },
    { slug: 'cities' },
    { slug: 'pubs' },
    { slug: 'countries' },
    { slug: 'arenas' },
    { slug: 'beaches' },
    { slug: 'parks' },
    { slug: 'landmarks' },
    { slug: 'islands' },
    { slug: 'luxury' },
  ];

  // Anonymous trends (js/trends.js). No-op while disabled; never throws into the UI.
  function trackTrend(action, deck, card, extra) {
    try {
      const T = window.SpotAndTravelTrends;
      if (!T || !T.isEnabled || !T.isEnabled()) return;
      if (card && !(deck && deck.cards.some(function (c) { return c && c.id === card.id; }))) return;
      T.track(action, Object.assign({ card: card || null, tab: deck ? deck.tab : null }, extra || {}));
    } catch (e) {}
  }

  function I18n() {
    return window.SpotAndTravelI18n || null;
  }

  function t(key, vars) {
    const i = I18n();
    return i && i.t ? i.t(key, vars) : key;
  }

  function tabLabel(slug) {
    const i = I18n();
    if (i && i.tabLabel) return i.tabLabel(slug);
    return slug;
  }

  function getTabs() {
    return TAB_SLUGS.map(function (t) {
      return {
        slug: t.slug,
        featured: !!t.featured,
        label: tabLabel(t.slug),
      };
    });
  }

  function assetPath(rel) {
    const base = document.body.dataset.assetRoot || './';
    return base + rel.replace(/^\//, '');
  }

  function dataPath(tab) {
    return assetPath('data/' + tab + '.json');
  }

  function readList(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      /* quota / private mode */
    }
  }

  function getStayList() {
    return readList(STORAGE_STAY_LIST);
  }

  function getStrayList() {
    return readList(STORAGE_STRAY_LIST);
  }

  function getCounts() {
    return { stay: getStayList().length, stray: getStrayList().length };
  }

  function migrateLegacyCounts() {
    try {
      if (localStorage.getItem(LEGACY_STAY) != null) localStorage.removeItem(LEGACY_STAY);
      if (localStorage.getItem(LEGACY_STRAY) != null) localStorage.removeItem(LEGACY_STRAY);
    } catch (e) {
      /* ignore */
    }
  }

  function placeEntry(card) {
    const img = (card && card.image) || {};
    let thumb = '';
    if (img.local_path) thumb = assetPath(img.local_path);
    else if (img.url) thumb = img.url;
    return {
      id: card.id,
      name: card.name || '',
      short_line: card.short_line || card.country || '',
      tab: card.tab || '',
      thumb: thumb,
      at: new Date().toISOString(),
    };
  }

  function withoutId(list, id) {
    return list.filter(function (item) {
      return item && item.id !== id;
    });
  }

  function recordDecision(kind, card) {
    let stay = getStayList();
    let stray = getStrayList();
    const entry = placeEntry(card);
    stay = withoutId(stay, entry.id);
    stray = withoutId(stray, entry.id);
    if (kind === 'stay') stay.unshift(entry);
    else stray.unshift(entry);
    writeList(STORAGE_STAY_LIST, stay);
    writeList(STORAGE_STRAY_LIST, stray);
  }

  function undoDecision(kind, cardId) {
    if (kind === 'stay') writeList(STORAGE_STAY_LIST, withoutId(getStayList(), cardId));
    else writeList(STORAGE_STRAY_LIST, withoutId(getStrayList(), cardId));
  }

  function moveListItem(kind, id, dir) {
    const key = kind === 'stay' ? STORAGE_STAY_LIST : STORAGE_STRAY_LIST;
    const list = (kind === 'stay' ? getStayList() : getStrayList()).slice();
    const idx = list.findIndex(function (item) {
      return item && item.id === id;
    });
    if (idx < 0) return;
    let newIdx = idx;
    if (dir === 'up') newIdx = idx - 1;
    else if (dir === 'down') newIdx = idx + 1;
    else if (dir === 'top') newIdx = 0;
    else if (dir === 'bottom') newIdx = list.length - 1;
    else return;
    if (newIdx < 0 || newIdx >= list.length || newIdx === idx) return;
    const item = list.splice(idx, 1)[0];
    list.splice(newIdx, 0, item);
    const body = document.getElementById('list-panel-body');
    const scroll = body ? body.scrollTop : 0;
    writeList(key, list);
    openListPanel(kind);
    const body2 = document.getElementById('list-panel-body');
    if (body2) body2.scrollTop = scroll;
  }

  function updateStatsUI() {
    const el = document.getElementById('session-stats');
    if (!el) return;
    const c = getCounts();
    el.innerHTML =
      '<button type="button" class="stat-btn stat-stay" data-list="stay" aria-haspopup="dialog">' +
      escapeHtml(t('stay')) +
      ' <strong>' +
      c.stay +
      '</strong></button>' +
      '<span class="stat-sep" aria-hidden="true"> · </span>' +
      '<button type="button" class="stat-btn stat-stray" data-list="stray" aria-haspopup="dialog">' +
      escapeHtml(t('stray')) +
      ' <strong>' +
      c.stray +
      '</strong></button>';
    el.querySelectorAll('.stat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openListPanel(btn.getAttribute('data-list'));
      });
    });
  }

  function ensureListPanel() {
    let root = document.getElementById('list-panel');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'list-panel';
    root.className = 'list-panel';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="list-panel-backdrop" data-close="1"></div>' +
      '<div class="list-panel-sheet" role="document">' +
      '<header class="list-panel-header">' +
      '<h2 class="list-panel-title" id="list-panel-title"></h2>' +
      '<button type="button" class="list-panel-close" id="list-panel-close"></button>' +
      '</header>' +
      '<p class="list-panel-note" id="list-panel-note" hidden></p>' +
      '<div class="list-panel-body" id="list-panel-body"></div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('[data-close]').addEventListener('click', closeListPanel);
    document.getElementById('list-panel-close').addEventListener('click', closeListPanel);
    document.getElementById('list-panel-body').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-move]');
      if (!btn || btn.disabled) return;
      const li = btn.closest('.place-list-item');
      if (!li) return;
      const id = li.getAttribute('data-id');
      const dir = btn.getAttribute('data-move');
      const kind = root.getAttribute('data-list-kind');
      if (!id || !dir || !kind) return;
      e.preventDefault();
      moveListItem(kind, id, dir);
    });
    if (!document.documentElement._sosListEsc) {
      document.documentElement._sosListEsc = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          const p = document.getElementById('list-panel');
          if (p && !p.hidden) {
            e.preventDefault();
            closeListPanel();
          }
        }
      });
    }
    return root;
  }

  function closeListPanel() {
    const root = document.getElementById('list-panel');
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove('list-panel-open');
  }

  function openListPanel(kind) {
    const root = ensureListPanel();
    const title = document.getElementById('list-panel-title');
    const body = document.getElementById('list-panel-body');
    const note = document.getElementById('list-panel-note');
    const closeBtn = document.getElementById('list-panel-close');
    const list = kind === 'stay' ? getStayList() : getStrayList();

    root.setAttribute('data-list-kind', kind);
    title.textContent = kind === 'stay' ? t('stay_list_title') : t('stray_list_title');
    root.setAttribute('aria-labelledby', 'list-panel-title');
    closeBtn.textContent = t('close_list');
    closeBtn.setAttribute('aria-label', t('close_list'));

    if (note) {
      const reorderNote = t('stay_reorder_note');
      const dailyNote = t('daily_note');
      if (kind === 'stay' && list.length > 1 && reorderNote && reorderNote !== 'stay_reorder_note') {
        note.hidden = false;
        note.textContent = reorderNote;
      } else if (dailyNote && dailyNote !== 'daily_note') {
        note.hidden = false;
        note.textContent = dailyNote;
      } else {
        note.hidden = true;
      }
    }

    if (!list.length) {
      body.innerHTML =
        '<p class="list-empty">' +
        escapeHtml(kind === 'stay' ? t('list_empty_stay') : t('list_empty_stray')) +
        '</p>';
    } else {
      const labelUp = escapeHtml(t('move_up'));
      const labelDown = escapeHtml(t('move_down'));
      const labelTop = escapeHtml(t('move_top'));
      const labelBottom = escapeHtml(t('move_bottom'));
      const last = list.length - 1;
      body.innerHTML =
        '<ul class="place-list">' +
        list
          .map(function (item, index) {
            const thumb = item.thumb
              ? '<img class="place-list-thumb" src="' +
                escapeHtml(item.thumb) +
                '" alt="" loading="lazy" width="56" height="56" />'
              : '<span class="place-list-thumb placeholder" aria-hidden="true"></span>';
            const atTop = index === 0;
            const atBottom = index === last;
            const reorder =
              '<div class="place-list-reorder" role="group">' +
              '<button type="button" class="place-list-move" data-move="top" aria-label="' +
              labelTop +
              '"' +
              (atTop ? ' disabled' : '') +
              '>⤒</button>' +
              '<button type="button" class="place-list-move" data-move="up" aria-label="' +
              labelUp +
              '"' +
              (atTop ? ' disabled' : '') +
              '>▲</button>' +
              '<button type="button" class="place-list-move" data-move="down" aria-label="' +
              labelDown +
              '"' +
              (atBottom ? ' disabled' : '') +
              '>▼</button>' +
              '<button type="button" class="place-list-move" data-move="bottom" aria-label="' +
              labelBottom +
              '"' +
              (atBottom ? ' disabled' : '') +
              '>⤓</button>' +
              '</div>';
            return (
              '<li class="place-list-item" data-id="' +
              escapeHtml(item.id) +
              '">' +
              thumb +
              '<div class="place-list-text">' +
              '<p class="place-list-name">' +
              escapeHtml(item.name) +
              '</p>' +
              '<p class="place-list-line">' +
              escapeHtml(item.short_line || '') +
              '</p>' +
              '</div>' +
              reorder +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }

    root.hidden = false;
    document.body.classList.add('list-panel-open');
    closeBtn.focus();
  }


  function renderTabNav(activeSlug) {
    const nav = document.getElementById('tab-nav');
    if (!nav) return;
    const root = document.body.dataset.assetRoot || './';
    const pagePrefix = root === './' ? 'pages/' : '';
    const items = getTabs().map(function (t) {
      const href = pagePrefix + t.slug + '.html';
      const cur = t.slug === activeSlug ? ' aria-current="page"' : '';
      const feat = t.featured ? 'featured' : '';
      return (
        '<li><a class="' +
        feat +
        '"' +
        cur +
        ' href="' +
        href +
        '">' +
        t.label +
        '</a></li>'
      );
    });
    if (window.SpotAndTravelRanking && window.SpotAndTravelRanking.enabled()) {
      const hotCur = activeSlug === 'hottest' ? ' aria-current="page"' : '';
      items.unshift('<li><a class="tab-nav-hot"' + hotCur + ' href="' + pagePrefix +
        'hottest.html">\uD83D\uDD25 Hottest</a></li>');
    }
    const wheelHref = pagePrefix + 'location-randomizer.html';
    const wheelCur =
      activeSlug === 'location-randomizer' ? ' aria-current="page"' : '';
    items.push(
      '<li><a class="tab-nav-wheel"' +
        wheelCur +
        ' href="' +
        wheelHref +
        '">' + escapeHtml(tabLabel('location-randomizer')) + '</a></li>'
    );
    const submitHref = pagePrefix + 'submit-a-place.html';
    const submitCur =
      activeSlug === 'submit-a-place' ? ' aria-current="page"' : '';
    items.push(
      '<li><a class="tab-nav-submit"' +
        submitCur +
        ' href="' +
        submitHref +
        '">' + escapeHtml(tabLabel('submit-a-place')) + '</a></li>'
    );
    nav.innerHTML = items.join('');
  }


  function imageSrc(card) {
    const img = card.image || {};
    if (img.local_path) return assetPath(img.local_path);
    return img.url || '';
  }

  function adHref(card) {
    const Aff = window.SpotAndTravelAffiliates;
    const q =
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

  function adLabel(card) {
    const name = card.name || t('this_place');
    return t('ad_cta', { name: name });
  }

  // ---------- "Plan this trip" panel (location-focused partner links) ----------
  // Optional per-card fields (all may be missing; documented in docs/ads/CARD-FIELDS.md):
  //   ad.destination_query, ad.city, ad.iata, ad.cruise_line, ad.ship, ad.cruise_url,
  //   card.kind === 'cruise' | card.tab === 'cruises'.
  const PLAN_KINDS = ['hotel', 'cruise', 'flight', 'car', 'things'];
  const PLAN_ICONS = { hotel: '🏨', cruise: '🚢', flight: '✈️', car: '🚗', things: '🎟️' };
  const PLAN_FALLBACK = {
    plan_title: 'Plan your trip to {name}',
    plan_hotel: 'Hotels near {name}',
    plan_cruise: 'Book a cruise on {name}',
    plan_flight: 'Flights to {city}',
    plan_car: 'Car rental in {city}',
    plan_things: 'Things to do in {city}',
    plan_note: 'Opens the partner’s search for this place in a new tab. Some are affiliate links: we may earn a commission at no extra cost to you.',
    plan_after_travel: 'Loved {name}? Plan it now',
    plan_close: 'Close',
  };

  function pt(key, vars) {
    const v = t(key, vars);
    if (v && v !== key) return v;
    return String(PLAN_FALLBACK[key] || key).replace(/\{(\w+)\}/g, function (_, k) {
      return vars && k in vars ? String(vars[k]) : '{' + k + '}';
    });
  }

  let airportsState = null; // null | 'loading' | Array
  const airportWaiters = [];

  function loadAirports() {
    if (Array.isArray(airportsState)) return Promise.resolve(airportsState);
    if (airportsState === 'loading') {
      return new Promise(function (r) { airportWaiters.push(r); });
    }
    airportsState = 'loading';
    return fetch(assetPath('assets/airports.json'))
      .then(function (r) { return r.ok ? r.json() : { airports: [] }; })
      .catch(function () { return { airports: [] }; })
      .then(function (j) {
        airportsState = Array.isArray(j && j.airports) ? j.airports : [];
        airportWaiters.splice(0).forEach(function (r) { r(airportsState); });
        return airportsState;
      });
  }

  function distKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR;
    const dLng = (lng2 - lng1) * toR;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /** Nearest scheduled-service airport; prefers a large hub when it is not much farther. */
  function nearestAirport(lat, lng) {
    if (!Array.isArray(airportsState) || !airportsState.length) return null;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return null;
    let best = null;
    let bestLarge = null;
    for (let i = 0; i < airportsState.length; i++) {
      const a = airportsState[i];
      const d = distKm(lat, lng, a[1], a[2]);
      if (!best || d < best.d) best = { a: a, d: d };
      if (a[4] && (!bestLarge || d < bestLarge.d)) bestLarge = { a: a, d: d };
    }
    if (!best || best.d > 400) return null;
    const pick = bestLarge && bestLarge.d <= Math.max(best.d * 1.6, best.d + 40) ? bestLarge : best;
    return { iata: pick.a[0], city: pick.a[3], km: Math.round(pick.d), large: !!pick.a[4] };
  }

  function cruiseInfo(card) {
    const ad = card.ad || {};
    const kind = String(card.kind || card.type || '').toLowerCase();
    const isCruise =
      card.tab === 'cruises' || kind === 'cruise' || kind === 'cruise_ship' ||
      !!(ad.cruise_line || ad.ship || card.cruise_line || card.ship);
    if (!isCruise) return null;
    return {
      line: String(ad.cruise_line || card.cruise_line || '').trim(),
      ship: String(ad.ship || card.ship || card.name || '').trim(),
      url: String(ad.cruise_url || '').trim(),
    };
  }

  /** Everything the link builder needs, from the raw (English) card data. */
  function planContext(card) {
    const ad = card.ad || {};
    const cruise = cruiseInfo(card);
    const airport = nearestAirport(Number(card.lat), Number(card.lng));
    const explicitIata = String(ad.iata || card.iata || '').toUpperCase();
    const explicitCity = String(ad.city || card.city || '').trim();
    let city = explicitCity;
    if (!city && airport && airport.km <= 200) city = airport.city;
    if (!city && !cruise) city = card.name || '';
    // Things to do: a big nearby hub city searches best; otherwise the place itself.
    let things = explicitCity;
    if (!things && airport && airport.large && airport.km <= 60) things = airport.city;
    if (!things && !cruise) things = card.name || '';
    return {
      thingsQuery: things,
      place: card.name || '',
      hotelQuery:
        ad.destination_query ||
        card.destination_query ||
        [card.name, card.country].filter(Boolean).join(', '),
      city: city,
      country: card.country || '',
      iata: /^[A-Z]{3}$/.test(explicitIata) ? explicitIata : airport ? airport.iata : '',
      cruise: cruise,
    };
  }

  function planLinks(card) {
    const Aff = window.SpotAndTravelAffiliates;
    if (!Aff || typeof Aff.buildPlanLinks !== 'function') {
      const href = adHref(card);
      return href && href !== '#'
        ? [{ kind: 'hotel', href: href, brand: 'Hotels.com', affiliated: false }]
        : [];
    }
    try {
      return Aff.buildPlanLinks(planContext(card)) || [];
    } catch (e) {
      return [];
    }
  }

  function planLinkLabel(link, card, ctx, displayName) {
    const cityLabel = link.kind === 'flight' && ctx.iata
      ? (ctx.city || displayName) + ' (' + ctx.iata + ')'
      : ctx.city || displayName;
    if (link.kind === 'hotel') return pt('plan_hotel', { name: displayName });
    if (link.kind === 'cruise') return pt('plan_cruise', { name: (ctx.cruise && ctx.cruise.ship) || displayName });
    if (link.kind === 'flight') return pt('plan_flight', { city: cityLabel });
    if (link.kind === 'car') return pt('plan_car', { city: cityLabel });
    return pt('plan_things', { city: ctx.thingsQuery || ctx.city || displayName });
  }

  function planLinksMarkup(rawCard, displayName, variant) {
    const ctx = planContext(rawCard);
    const links = planLinks(rawCard).sort(function (a, b) {
      return PLAN_KINDS.indexOf(a.kind) - PLAN_KINDS.indexOf(b.kind);
    });
    if (!links.length) return '';
    return (
      '<ul class="plan-links plan-links--' + variant + '">' +
      links
        .map(function (l) {
          return (
            '<li><a class="plan-link plan-link--' + l.kind + '"' +
            (l.kind === 'hotel' && variant === 'panel' ? ' id="ad-cta"' : '') +
            ' href="' + escapeHtml(l.href) + '" target="_blank" rel="sponsored noopener"' +
            ' data-link-type="' + l.kind + '" data-card-id="' + escapeHtml(rawCard.id || '') + '"' +
            ' data-affiliated="' + (l.affiliated ? 'true' : 'false') + '">' +
            '<span class="plan-ico" aria-hidden="true">' + PLAN_ICONS[l.kind] + '</span>' +
            '<span class="plan-text"><span class="plan-label">' +
            escapeHtml(planLinkLabel(l, rawCard, ctx, displayName)) +
            '</span><span class="plan-brand">' + escapeHtml(l.brand || '') + '</span></span>' +
            '<span class="plan-arrow" aria-hidden="true">↗</span></a></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  let planSheetTimer = 0;
  function hidePlanSheet() {
    window.clearTimeout(planSheetTimer);
    const sheet = document.getElementById('plan-sheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.hidden = true;
  }

  function planPanelMarkup(rawCard, displayName) {
    const links = planLinksMarkup(rawCard, displayName, 'panel');
    if (!links) return '';
    return (
      '<aside class="ad-slot plan-trip" id="plan-trip" data-card-id="' + escapeHtml(rawCard.id || '') +
      '" aria-label="' + escapeHtml(pt('plan_title', { name: displayName })) + '">' +
      '<p class="ad-kicker plan-kicker">' + escapeHtml(pt('plan_title', { name: displayName })) + '</p>' +
      links +
      '<p class="ad-note plan-note">' + escapeHtml(pt('plan_note')) + '</p>' +
      '</aside>'
    );
  }


  function klookSidebarUrl() {
    const Aff = window.SpotAndTravelAffiliates;
    if (Aff && typeof Aff.getKlookSidebarUrl === 'function') {
      return Aff.getKlookSidebarUrl() || '';
    }
    const k = Aff && Aff.affiliates && Aff.affiliates.klook;
    return k && k.sidebarUrl ? String(k.sidebarUrl) : '';
  }

  const KLOOK_WIDGET_FALLBACK = 'https://klook.tpx.gr/cVdJs2X5';

  function klookWidgetSrc() {
    const Aff = window.SpotAndTravelAffiliates;
    if (Aff && typeof Aff.getKlookWidgetSrc === 'function') {
      return Aff.getKlookWidgetSrc() || KLOOK_WIDGET_FALLBACK;
    }
    const k = Aff && Aff.affiliates && Aff.affiliates.klook;
    if (k && k.widgetSrc) return String(k.widgetSrc);
    return KLOOK_WIDGET_FALLBACK;
  }

  // ---- Klook rail: per-card affiliated link + city widget (docs/ads/KLOOK.md).
  let klookCitiesState = null; // null | Promise | Object
  function loadKlookCities() {
    if (klookCitiesState && !(klookCitiesState instanceof Promise)) {
      return Promise.resolve(klookCitiesState);
    }
    if (!klookCitiesState) {
      klookCitiesState = fetch(assetPath('assets/klook-cities.json'))
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; })
        .then(function (j) { klookCitiesState = j || {}; return klookCitiesState; });
    }
    return klookCitiesState;
  }

  function klookCity(card, cities) {
    if (!card || !cities) return null;
    const ad = card.ad || {};
    if (ad.klook_city_id) return { id: String(ad.klook_city_id), slug: ad.klook_city_slug || '' };
    const ctx = planContext(card);
    const names = [ad.city, card.city, card.name, ctx.thingsQuery].filter(Boolean);
    for (let i = 0; i < names.length; i++) {
      const hit = cities[String(names[i]).trim().toLowerCase()];
      if (hit) return { id: String(hit[0]), slug: hit[1], name: names[i] };
    }
    return null;
  }

  // Affiliated (tp.media, marker 779952) Klook URL: city page when known, else search.
  function klookCardUrl(card, cities) {
    const Aff = window.SpotAndTravelAffiliates;
    const generic = klookSidebarUrl() || KLOOK_WIDGET_FALLBACK;
    if (!card || !Aff || typeof Aff.wrapTravelpayouts !== 'function') return generic;
    const k = (Aff.affiliates && Aff.affiliates.klook) || {};
    const city = klookCity(card, cities);
    let target = '';
    if (city && city.slug) {
      target = 'https://www.klook.com/en-US/destination/c' + city.id + '-' + city.slug + '/1-things-to-do/';
    } else {
      const q = card.name || planContext(card).thingsQuery || '';
      if (q) target = 'https://www.klook.com/en-US/search/result/?query=' + encodeURIComponent(q);
    }
    if (!target) return generic;
    const w = Aff.wrapTravelpayouts(target, k.tp);
    return w.affiliated ? w.href : generic;
  }

  function klookRailMarkup(variant, card) {
    const url = klookCardUrl(card, klookCitiesState instanceof Promise ? null : klookCitiesState);
    if (!url) return '';
    const cls = 'klook-rail klook-rail--' + (variant || 'desktop') + ' klook-rail--linkonly';
    const kicker = t('klook_find_klook') || t('klook_nearby') || 'Find experiences on Klook';
    const findExp = t('klook_find') || 'Find experiences →';
    return (
      '<aside class="' + cls + '" aria-label="' + escapeHtml(kicker) + '">' +
      '<p class="klook-kicker">' + escapeHtml(kicker) + '</p>' +
      '<a class="klook-cta klook-fallback" href="' + escapeHtml(url) +
      '" target="_blank" rel="sponsored noopener nofollow" data-link-type="klook">' +
      escapeHtml(findExp) + '</a>' +
      '<div class="klook-widget-mount" data-klook-mount hidden></div>' +
      '</aside>'
    );
  }


  /** First two sentences for small-screen collapse; rest behind "More". */
  function splitWhyGo(text) {
    const raw = String(text || '').trim();
    if (!raw) return { preview: '', rest: '' };
    const parts = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
    if (parts.length <= 2) return { preview: raw, rest: '' };
    return {
      preview: parts.slice(0, 2).join('').trim(),
      rest: parts.slice(2).join('').trim(),
    };
  }

  function Deck(options) {
    this.tab = options.tab;
    this.cards = [];
    this.index = 0;
    this.busy = false;
    this.last = null;
    this.root = document.getElementById('deck-root');
    this.live = document.getElementById('deck-live');
    this._swipeAbort = null;
  }

  Deck.prototype.load = async function () {
    const Daily = window.SpotAndTravelDaily;
    const Rank = window.SpotAndTravelRanking;
    if (this.tab === 'hottest' && Rank) {
      const slugs = TAB_SLUGS.map(function (t) { return t.slug; });
      const hot = await Rank.hottest(slugs, function (tab) {
        return fetch(dataPath(tab), { cache: 'no-store' }).then(function (r) { return r.json(); });
      });
      this.cards = hot.map(function (c) {
        return Object.assign({}, c, {
          short_line: '\uD83D\uDD25 Hot in ' + tabLabel(c.hot_tab) + ' \u00B7 ' + (c.short_line || ''),
        });
      });
      this.dailyMeta = null;
    } else if (Daily && Daily.selectDailyDeck) {
      const picked = await Daily.selectDailyDeck(this.tab);
      this.cards = picked.cards || [];
      this.dailyMeta = picked;
    } else {
      const res = await fetch(dataPath(this.tab), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load ' + this.tab + ' data');
      const data = await res.json();
      this.cards = Array.isArray(data) ? data : [];
      this.dailyMeta = null;
    }
    if (Rank && this.tab !== 'hottest') {
      try { this.cards = await Rank.rankDeck(this.tab, this.cards); } catch (e) {}
    }
    this.index = 0;
    this.last = null;
    this._endTracked = false;
    this.renderDailyNote();
    this.render();
    this.prefetch();
  };

  Deck.prototype.renderDailyNote = function () {
    let el = document.getElementById('daily-deck-note');
    if (!this.dailyMeta || !this.dailyMeta.dateKey) {
      if (el) el.hidden = true;
      return;
    }
    const noteText = t('daily_deck_label', {
      date: this.dailyMeta.dateKey,
      set: this.dailyMeta.setId || '',
    });
    if (!noteText || noteText === 'daily_deck_label') {
      if (el) el.hidden = true;
      return;
    }
    if (!el) {
      el = document.createElement('p');
      el.id = 'daily-deck-note';
      el.className = 'daily-deck-note';
      const label = document.querySelector('.deck-section-label');
      if (label && label.parentNode) {
        label.parentNode.insertBefore(el, label.nextSibling);
      } else if (this.root && this.root.parentNode) {
        this.root.parentNode.insertBefore(el, this.root);
      }
    }
    el.hidden = false;
    el.textContent = noteText;
  };

  Deck.prototype.prefetch = function () {
    // Next 3 images ahead of current (i+1 … i+3)
    for (let i = this.index + 1; i <= this.index + PREFETCH && i < this.cards.length; i++) {
      const src = imageSrc(this.cards[i]);
      if (!src) continue;
      const im = new Image();
      im.src = src;
    }
  };

  Deck.prototype.current = function () {
    return this.cards[this.index] || null;
  };

  Deck.prototype.cardMarkup = function (card, opts) {
    opts = opts || {};
    const i18n = I18n();
    const rawCard = card;
    if (i18n && i18n.localizeCard) card = i18n.localizeCard(card);
    const src = imageSrc(card);
    const facts = card.facts || {};
    const attribution = (card.image && card.image.attribution) || '';
    const sourcePage = (card.image && card.image.source_page) || '';
    const creditHtml = sourcePage
      ? '<a href="' +
        escapeHtml(sourcePage) +
        '" rel="noopener noreferrer" target="_blank">' +
        escapeHtml(attribution) +
        '</a>'
      : escapeHtml(attribution);
    const why = splitWhyGo(facts.why_go);
    const whyHtml = why.rest
      ? '<p class="why-go collapse-sm" data-full="' +
        escapeHtml(facts.why_go || '') +
        '"><span class="why-preview">' +
        escapeHtml(why.preview) +
        '</span><span class="why-rest"> ' +
        escapeHtml(why.rest) +
        '</span> <button type="button" class="why-more" aria-expanded="false">' +
        escapeHtml(t('more')) +
        '</button></p>'
      : '<p class="why-go">' + escapeHtml(facts.why_go || '') + '</p>';

    const progress =
      opts.showProgress !== false
        ? '<span class="progress" aria-hidden="true">' +
          (this.index + 1) +
          ' / ' +
          this.cards.length +
          '</span>'
        : '';

    const actions =
      opts.interactive !== false
        ? '<div class="actions">' +
          '<button type="button" class="btn btn-stray" id="btn-stray" aria-label="' +
          escapeHtml(t('stray')) +
          '">' +
          escapeHtml(t('stray_btn')) +
          '</button>' +
          '<button type="button" class="btn btn-stay" id="btn-stay" aria-label="' +
          escapeHtml(t('stay')) +
          '">' +
          escapeHtml(t('stay_btn')) +
          '</button>' +
          '<button type="button" class="btn btn-undo" id="btn-undo" hidden>' +
          escapeHtml(t('undo')) +
          '</button>' +
          '</div>'
        : '';

    const details =
      opts.interactive !== false
        ? '<div class="facts">' +
          '<p class="one-liner">' +
          escapeHtml(facts.one_liner || '') +
          '</p>' +
          whyHtml +
          '<dl class="meta-grid">' +
          '<div><dt>' +
          escapeHtml(t('best_time')) +
          '</dt><dd>' +
          escapeHtml(facts.best_time || t('em_dash')) +
          '</dd></div>' +
          '<div><dt>' +
          escapeHtml(t('how_to_get_there')) +
          '</dt><dd>' +
          escapeHtml(facts.how_to_get_there || t('em_dash')) +
          '</dd></div>' +
          '<div><dt>' +
          escapeHtml(t('good_to_know')) +
          '</dt><dd>' +
          escapeHtml(facts.good_to_know || t('em_dash')) +
          '</dd></div>' +
          '</dl>' +
          '<p class="photo-credit">' +
          escapeHtml(t('photo_credit')) +
          ' ' +
          creditHtml +
          '</p>' +
          '</div>' +
          planPanelMarkup(rawCard, card.name || t('this_place')) +
          klookRailMarkup('mobile', rawCard)
        : '';

    const cls = opts.className || 'card';
    const idAttr = opts.id ? ' id="' + opts.id + '"' : '';

    return (
      '<article class="' +
      cls +
      '"' +
      idAttr +
      '>' +
      '<div class="photo-stage"' +
      (opts.interactive !== false ? ' id="photo-stage"' : '') +
      '>' +
      progress +
      '<img src="' +
      escapeHtml(src) +
      '" alt="' +
      escapeHtml(card.name) +
      '" draggable="false" />' +
      '<div class="photo-overlay">' +
      '<h2 class="place-name">' +
      escapeHtml(card.name) +
      '</h2>' +
      '<p class="place-line">' +
      escapeHtml(card.short_line || card.country || '') +
      '</p>' +
      '</div></div>' +
      actions +
      details +
      '</article>'
    );
  };

  Deck.prototype.renderEnd = function () {
    if (!this._endTracked && this.cards.length) {
      this._endTracked = true;
      trackTrend('deck_end', this, null, { source: 'system' });
    }
    this.root.innerHTML =
      '<div class="end-deck" role="status">' +
      '<h2>' +
      escapeHtml(t('end_deck_title')) +
      '</h2>' +
      '<p class="session-inline" id="end-stats"></p>' +
      '<nav class="end-tabs" aria-label="' +
      escapeHtml(t('try_another_category')) +
      '">' +
      getTabs()
        .filter(function (tab) {
          return tab.slug !== this.tab;
        }, this)
        .slice(0, 4)
        .map(function (tab) {
          const root = document.body.dataset.assetRoot || './';
          const pagePrefix = root === './' ? 'pages/' : '';
          return (
            '<a href="' + pagePrefix + tab.slug + '.html">' + escapeHtml(tab.label) + '</a>'
          );
        })
        .join('') +
      '</nav>' +
      '</div>';
    const endStats = document.getElementById('end-stats');
    if (endStats) {
      const c = getCounts();
      endStats.innerHTML =
        escapeHtml(t('end_deck_saved_prefix')) +
        ' ' +
        '<button type="button" class="stat-btn stat-stay" data-list="stay">' +
        escapeHtml(t('stay')) +
        ' <strong>' +
        c.stay +
        '</strong></button>' +
        '<span class="stat-sep" aria-hidden="true"> · </span>' +
        '<button type="button" class="stat-btn stat-stray" data-list="stray">' +
        escapeHtml(t('stray')) +
        ' <strong>' +
        c.stray +
        '</strong></button>';
      endStats.querySelectorAll('.stat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openListPanel(btn.getAttribute('data-list'));
        });
      });
    }
    if (this.live) this.live.textContent = t('end_of_deck_live');
  };

  Deck.prototype.render = function () {
    if (!this.root) return;
    if (this._swipeAbort) {
      this._swipeAbort.abort();
      this._swipeAbort = null;
    }

    const card = this.current();
    if (!card) {
      this.renderEnd();
      return;
    }

    const next = this.cards[this.index + 1] || null;
    let html = '<div class="deck-stack">';
    if (next) {
      html += this.cardMarkup(next, {
        className: 'card card-next',
        id: 'next-card',
        interactive: false,
        showProgress: false,
      });
    }
    html += this.cardMarkup(card, {
      className: 'card card-active',
      id: 'active-card',
      interactive: true,
    });
    html += '</div>';
    // Desktop Klook rail: page-right gutter (fixed), not inside the card flex row.
    html += klookRailMarkup('desktop', this.current());
    this.root.innerHTML = html;

    document.getElementById('btn-stay').addEventListener('click', () => this.decide('stay', 'button'));
    document.getElementById('btn-stray').addEventListener('click', () => this.decide('stray', 'button'));
    const undoBtn = document.getElementById('btn-undo');
    if (this.last) {
      undoBtn.hidden = false;
      undoBtn.addEventListener('click', () => this.undo('button'));
    }
    this.bindPlanClicks();
    this.showAfterTravel();
    if (!Array.isArray(airportsState)) {
      const shownId = card.id;
      loadAirports().then(() => {
        const cur = this.current();
        const panel = document.getElementById('plan-trip');
        if (!cur || cur.id !== shownId || !panel) return;
        const i18n = I18n();
        const disp = (i18n && i18n.localizeCard ? i18n.localizeCard(cur) : cur).name || t('this_place');
        const html = planPanelMarkup(cur, disp);
        if (html) panel.outerHTML = html;
      });
    }

    const moreBtn = this.root.querySelector('.why-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        const p = moreBtn.closest('.why-go');
        const expanded = p.classList.toggle('is-expanded');
        moreBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        moreBtn.textContent = expanded ? t('less') : t('more');
      });
    }

    this.bindSwipe(document.getElementById('photo-stage'));

    this.root.querySelectorAll('.klook-rail').forEach(function (el) {
      ['click', 'pointerdown', 'touchstart'].forEach(function (evt) {
        el.addEventListener(
          evt,
          function (e) {
            e.stopPropagation();
          },
          { passive: true }
        );
      });
    });

    this.mountKlookWidget();
    const selfRail = this;
    // Re-measure after layout / photo intrinsic size settles.
    requestAnimationFrame(function () {
      selfRail.syncKlookRailGeometry();
      requestAnimationFrame(function () {
        selfRail.syncKlookRailGeometry();
      });
    });
    const photoImg = document.querySelector('#photo-stage img');
    if (photoImg) {
      if (photoImg.complete) {
        this.syncKlookRailGeometry();
      } else {
        photoImg.addEventListener(
          'load',
          function () {
            selfRail.syncKlookRailGeometry();
          },
          { once: true }
        );
      }
    }

    const stayBtn = document.getElementById('btn-stay');
    if (stayBtn) stayBtn.focus({ preventScroll: true });

    if (this.live) {
      this.live.textContent = t('card_live', {
        n: this.index + 1,
        total: this.cards.length,
        name: card.name,
      });
    }
  };


  Deck.prototype.syncKlookRailGeometry = function () {
    if (!this.root) return;
    const rail = this.root.querySelector('.klook-rail--desktop');
    if (!rail) return;
    const useDesktop =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1200px)').matches;
    if (!useDesktop || rail.classList.contains('klook-rail--linkonly')) {
      if (useDesktop) {
        const tab = document.querySelector('.deck-section-label') || document.querySelector('.tab-nav');
        rail.style.top = tab ? Math.max(0, Math.round(tab.getBoundingClientRect().top)) + 'px' : '';
      } else rail.style.top = '';
      rail.style.height = '';
      rail.style.minHeight = '';
      return;
    }

    // Align with TODAY'S DECK / section label (deck chrome above the card),
    // falling back to the tab row when those are missing.
    const daily = document.getElementById('daily-deck-note');
    const topEl =
      (daily && !daily.hidden ? daily : null) ||
      document.querySelector('.deck-section-label') ||
      document.querySelector('.tab-nav');
    const stayBtn = document.getElementById('btn-stay');
    const strayBtn = document.getElementById('btn-stray');
    const photo =
      document.getElementById('photo-stage') ||
      (this.root.querySelector('.card-active .photo-stage'));

    if (!topEl || (!stayBtn && !strayBtn)) return;

    const topRect = topEl.getBoundingClientRect();
    let bottom = 0;
    if (stayBtn) bottom = Math.max(bottom, stayBtn.getBoundingClientRect().bottom);
    if (strayBtn) bottom = Math.max(bottom, strayBtn.getBoundingClientRect().bottom);

    const top = Math.max(0, Math.round(topRect.top));
    let height = Math.round(bottom - top);
    if (photo) {
      const photoH = Math.round(photo.getBoundingClientRect().height);
      // Panel at least as tall as the card image band.
      height = Math.max(height, photoH);
    }
    height = Math.max(height, 280);

    rail.style.top = top + 'px';
    rail.style.height = height + 'px';
    rail.style.minHeight = height + 'px';
  };

  const KLOOK_WIDGET_TIMEOUT_MS = 8000;

  function klookLinkOnly(rail, mount) {
    if (mount) { mount.innerHTML = ''; mount.hidden = true; }
    if (rail) {
      rail.classList.add('klook-rail--linkonly');
      rail.style.height = '';
      rail.style.minHeight = '';
    }
  }

  Deck.prototype.mountKlookWidget = function () {
    if (!this.root) return;
    const self = this;
    const gen = (this._klookGen = (this._klookGen || 0) + 1);
    const card = this.current();
    this.root.querySelectorAll('.klook-rail').forEach(function (rail) {
      klookLinkOnly(rail, rail.querySelector('[data-klook-mount]'));
    });
    this.syncKlookRailGeometry();
    const useDesktop =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1200px)').matches;
    this._klookWasDesktop = useDesktop;
    this.bindKlookResize();
    const tpl = klookWidgetSrc();
    if (!card || !tpl || !/city_id=/.test(tpl)) return;

    loadKlookCities().then(function (cities) {
      if (gen !== self._klookGen || !self.root) return;
      // Upgrade the CTA to the city page now that the lookup is loaded.
      const href = klookCardUrl(card, cities);
      self.root.querySelectorAll('.klook-rail .klook-fallback').forEach(function (a) {
        if (href) a.setAttribute('href', href);
      });
      const city = klookCity(card, cities);
      // No Klook city for this card: link only (never show another city's tours).
      if (!city) return;
      const rail = self.root.querySelector(useDesktop ? '.klook-rail--desktop' : '.klook-rail--mobile');
      const mount = rail && rail.querySelector('[data-klook-mount]');
      if (!mount) return;
      const script = document.createElement('script');
      script.async = true;
      script.charset = 'utf-8';
      script.src = tpl.replace(/([?&]city_id=)[^&]*/, '$1' + encodeURIComponent(city.id));
      script.setAttribute('data-klook-widget', '1');
      let settled = false;
      const giveUp = function () {
        if (settled || gen !== self._klookGen) return;
        settled = true;
        watch.disconnect();
        klookLinkOnly(rail, mount);
        self.syncKlookRailGeometry();
      };
      script.onerror = giveUp; // blocked by an ad/content blocker, offline, etc.
      // The mount stays collapsed (0 height) until Klook inserts its iframe, so an
      // empty box never shows. Klook renders lazily when the slot scrolls into view.
      mount.hidden = false;
      const timer = setTimeout(function () {
        if (!mount.querySelector('iframe, ins')) giveUp();
      }, KLOOK_WIDGET_TIMEOUT_MS);
      const watch = new MutationObserver(function () {
        if (settled || gen !== self._klookGen || !mount.querySelector('iframe')) return;
        settled = true;
        clearTimeout(timer);
        watch.disconnect();
        rail.classList.remove('klook-rail--linkonly');
        rail.querySelector('.klook-fallback').classList.add('klook-fallback--secondary');
        self.syncKlookRailGeometry();
      });
      watch.observe(mount, { childList: true, subtree: true });
      // The script must live inside its container: tpemb.com inserts the widget
      // next to its own <script> tag (it finds itself via promo_id in src).
      mount.appendChild(script);
    });
  };

  Deck.prototype.bindKlookResize = function () {
    if (!this._klookResizeBound) {
      this._klookResizeBound = true;
      const self = this;
      let timer = null;
      window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (!(self.root && self.root.querySelector('.klook-rail'))) return;
          const nowDesktop =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(min-width: 1200px)').matches;
          if (nowDesktop !== self._klookWasDesktop) {
            self.mountKlookWidget();
          } else {
            self.syncKlookRailGeometry();
          }
        }, 200);
      });
    }
  };

  Deck.prototype.bindSwipe = function (stage) {
    if (!stage) return;
    if (this._swipeAbort) this._swipeAbort.abort();
    this._swipeAbort = new AbortController();
    const signal = this._swipeAbort.signal;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    const card = document.getElementById('active-card');

    const onStart = (x, y) => {
      if (this.busy) return;
      tracking = true;
      startX = x;
      startY = y;
      if (card) card.classList.add('dragging');
    };
    const onMove = (x, y, e) => {
      if (!tracking || !card) return;
      const dx = x - startX;
      const dy = y - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        if (e && e.cancelable) e.preventDefault();
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 28 + 'deg)';
        card.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 320));
      }
    };
    const onEnd = (x, y) => {
      if (!tracking) return;
      tracking = false;
      if (card) card.classList.remove('dragging');
      const dx = x - startX;
      const dy = y - startY;
      if (card) {
        card.style.transform = '';
        card.style.opacity = '';
      }
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
      this.decide(dx > 0 ? 'stay' : 'stray', 'swipe');
    };

    stage.addEventListener(
      'touchstart',
      (e) => {
        const t = e.changedTouches[0];
        onStart(t.clientX, t.clientY);
      },
      { passive: true, signal: signal }
    );
    stage.addEventListener(
      'touchmove',
      (e) => {
        const t = e.changedTouches[0];
        onMove(t.clientX, t.clientY, e);
      },
      { passive: false, signal: signal }
    );
    stage.addEventListener(
      'touchend',
      (e) => {
        const t = e.changedTouches[0];
        onEnd(t.clientX, t.clientY);
      },
      { passive: true, signal: signal }
    );

    let mouseDown = false;
    stage.addEventListener(
      'mousedown',
      (e) => {
        mouseDown = true;
        onStart(e.clientX, e.clientY);
      },
      { signal: signal }
    );
    window.addEventListener(
      'mousemove',
      (e) => {
        if (!mouseDown) return;
        onMove(e.clientX, e.clientY, e);
      },
      { signal: signal }
    );
    window.addEventListener(
      'mouseup',
      (e) => {
        if (!mouseDown) return;
        mouseDown = false;
        onEnd(e.clientX, e.clientY);
      },
      { signal: signal }
    );
  };

  /** One delegated listener: every partner link (panel or post-Travel sheet) logs ad_click + link_type. */
  Deck.prototype.bindPlanClicks = function () {
    if (this._planBound) return;
    this._planBound = true;
    const deck = this;
    document.addEventListener('click', function (e) {
      const a = e.target && e.target.closest ? e.target.closest('a.plan-link, a.klook-fallback') : null;
      if (!a) return;
      const id = a.getAttribute('data-card-id');
      const card = id
        ? deck.cards.find(function (c) { return c && c.id === id; })
        : deck.current();
      if (!card) return;
      trackTrend('ad_click', deck, card, {
        source: 'ad',
        link_type: a.getAttribute('data-link-type') || 'hotel',
      });
    }, true);
    // Keep taps inside the panels from ever reaching swipe handlers.
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (evt) {
      document.addEventListener(
        evt,
        function (e) {
          if (e.target && e.target.closest && e.target.closest('.plan-trip, .plan-sheet')) e.stopPropagation();
        },
        true
      );
    });
  };

  /** After a Travel swipe: a small, dismissible sheet with links for the place just saved. */
  Deck.prototype.showAfterTravel = function () {
    const card = this._afterTravel;
    this._afterTravel = null;
    if (!card) { hidePlanSheet(); return; }
    const i18n = I18n();
    const disp = (i18n && i18n.localizeCard ? i18n.localizeCard(card) : card).name || t('this_place');
    const build = function () {
      const links = planLinksMarkup(card, disp, 'sheet');
      if (!links) return;
      let sheet = document.getElementById('plan-sheet');
      if (!sheet) {
        sheet = document.createElement('aside');
        sheet.id = 'plan-sheet';
        sheet.className = 'plan-sheet';
        sheet.setAttribute('role', 'complementary');
        document.body.appendChild(sheet);
      }
      sheet.setAttribute('aria-label', pt('plan_after_travel', { name: disp }));
      sheet.setAttribute('data-card-id', card.id || '');
      sheet.innerHTML =
        '<div class="plan-sheet-head"><p class="plan-sheet-title">' +
        escapeHtml(pt('plan_after_travel', { name: disp })) +
        '</p><button type="button" class="plan-sheet-close" aria-label="' +
        escapeHtml(pt('plan_close')) + '">×</button></div>' +
        links +
        '<p class="plan-note">' + escapeHtml(pt('plan_note')) + '</p>';
      sheet.querySelector('.plan-sheet-close').addEventListener('click', hidePlanSheet);
      sheet.hidden = false;
      window.requestAnimationFrame(function () { sheet.classList.add('is-open'); });
      window.clearTimeout(planSheetTimer);
      planSheetTimer = window.setTimeout(hidePlanSheet, 12000);
    };
    if (Array.isArray(airportsState)) build();
    else loadAirports().then(build);
  };

  Deck.prototype.decide = function (decision, source) {
    if (this.busy) return;
    const card = this.current();
    if (!card) return;
    this.busy = true;
    const el = document.getElementById('active-card');
    if (el) el.classList.add(decision === 'stay' ? 'fly-stay' : 'fly-stray');

    recordDecision(decision, card);
    updateStatsUI();
    trackTrend(decision, this, card, { source: source || 'button' });

    this.last = { card: card, decision: decision, index: this.index };
    this._afterTravel = decision === 'stay' ? card : null;

    window.setTimeout(() => {
      this.index += 1;
      this.busy = false;
      this.render();
      this.prefetch();
    }, FLY_MS);
  };

  Deck.prototype.undo = function (source) {
    if (this.busy || !this.last) return;
    undoDecision(this.last.decision, this.last.card.id);
    this._afterTravel = null;
    hidePlanSheet();
    trackTrend('undo', this, this.last.card, { source: source || 'button', undo_of: this.last.decision });
    updateStatsUI();
    this.index = this.last.index;
    this.last = null;
    this.render();
    this.prefetch();
  };

  async function waitForI18n() {
    if (I18n() && I18n().ready && I18n().ready()) return;
    await new Promise(function (resolve) {
      var tries = 0;
      var id = setInterval(function () {
        tries += 1;
        if ((I18n() && I18n().ready && I18n().ready()) || tries > 80) {
          clearInterval(id);
          resolve();
        }
      }, 25);
    });
  }

  async function boot() {
    await waitForI18n();
    migrateLegacyCounts();
    const tab = document.body.dataset.tab || 'hidden-gems';
    const showHome = document.body.dataset.showHome === 'true';
    const isNonDeckPage =
      tab === 'location-randomizer' || tab === 'submit-a-place';
    renderTabNav(tab);
    updateStatsUI();
    ensureListPanel();
    if (I18n() && I18n().applyChrome) I18n().applyChrome && I18n().applyChrome();

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) homeBtn.hidden = !showHome;

    const disclosure = document.getElementById('affiliate-disclosure');
    if (disclosure) disclosure.textContent = t('disclosure');

    if (isNonDeckPage) {
      if (I18n() && I18n().onChange) {
        I18n().onChange(function () {
          renderTabNav(tab);
          updateStatsUI();
          if (I18n().applyChrome) I18n().applyChrome && I18n().applyChrome();
        });
      }
      return;
    }

    const deck = new Deck({ tab: tab });
    window.__sosDeck = deck;

    if (I18n() && I18n().onChange) {
      I18n().onChange(function () {
        renderTabNav(tab);
        updateStatsUI();
        if (I18n().applyChrome) I18n().applyChrome && I18n().applyChrome();
        if (deck) {
          if (deck.renderDailyNote) deck.renderDailyNote();
          if (deck.root) deck.render();
        }
      });
    }

    try {
      await deck.load();
      if (!deck.cards.length) {
        deck.root.innerHTML =
          '<div class="end-deck" role="status"><h2>' +
          escapeHtml(t('empty_deck')) +
          '</h2></div>';
      }
    } catch (err) {
      const root = document.getElementById('deck-root');
      if (root) {
        root.innerHTML =
          '<div class="end-deck"><h2>' +
          escapeHtml(t('could_not_load')) +
          '</h2><p>' +
          escapeHtml(err.message) +
          '</p><p>' +
          escapeHtml(t('serve_http')) +
          '</p></div>';
      }
      return;
    }

    window.addEventListener('keydown', (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      // Don't steal keys while language menu is open / focused
      if (e.target && e.target.closest && e.target.closest('.lang-switcher')) return;
      const panel = document.getElementById('list-panel');
      if (panel && !panel.hidden) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        deck.decide('stay', 'keyboard');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        deck.decide('stray', 'keyboard');
      } else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        deck.undo('keyboard');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
