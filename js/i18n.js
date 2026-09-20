/**
 * Stay or Stray — i18n (en, es, fr, de, ru, ja, nl)
 * Top-right language control; persists in localStorage (sos_lang).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'sos_lang';
  var SUPPORTED = ['en', 'es', 'fr', 'de', 'ru', 'ja', 'nl'];
  var LANG_NATIVE = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ru: 'Русский',
    ja: '日本語',
    nl: 'Nederlands',
  };

  var state = {
    lang: 'en',
    dict: null,
    ready: false,
    listeners: [],
  };

  function assetPath(rel) {
    var base =
      document.body && document.body.dataset.assetRoot
        ? document.body.dataset.assetRoot
        : './';
    return base + String(rel || '').replace(/^\//, '');
  }

  function getStoredLang() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && SUPPORTED.indexOf(v) !== -1) return v;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  function setStoredLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* ignore */ }
  }

  function fill(template, vars) {
    if (template == null) return '';
    vars = vars || {};
    return String(template).replace(/\{(\w+)\}/g, function (_, key) {
      return key in vars ? String(vars[key]) : '{' + key + '}';
    });
  }

  function t(key, vars) {
    var dict = state.dict || {};
    var ui = dict.ui || {};
    var val = ui[key];
    if (val == null && dict[key] != null) val = dict[key];
    if (val == null) val = key;
    return fill(val, vars);
  }

  function tabLabel(slug) {
    var tabs = (state.dict && state.dict.tabs) || {};
    return tabs[slug] || slug;
  }

  function getCardLocale(cardId) {
    var cards = (state.dict && state.dict.cards) || {};
    return cards[cardId] || null;
  }

  function localizeCard(card) {
    if (!card) return card;
    var loc = getCardLocale(card.id);
    if (!loc) return card;
    var out = Object.assign({}, card);
    if (loc.short_line) out.short_line = loc.short_line;
    if (loc.country) out.country = loc.country;
    var facts = Object.assign({}, card.facts || {});
    var lf = loc.facts || {};
    ['one_liner', 'why_go', 'best_time', 'how_to_get_there', 'good_to_know'].forEach(function (k) {
      if (lf[k]) facts[k] = lf[k];
    });
    out.facts = facts;
    return out;
  }

  function notify() {
    state.listeners.slice().forEach(function (fn) {
      try {
        fn(state.lang);
      } catch (e) { /* ignore */ }
    });
  }

  function onChange(fn) {
    if (typeof fn === 'function') state.listeners.push(fn);
    return function off() {
      state.listeners = state.listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function applyDocumentLang() {
    document.documentElement.lang = state.lang || 'en';
  }

  function applyChrome() {
    var tagline = document.querySelector('.tagline');
    if (tagline) tagline.textContent = t('tagline');

    var homeBtn = document.getElementById('home-btn');
    if (homeBtn) homeBtn.textContent = t('home');

    var intro = document.querySelector('.intro-blurb');
    if (intro) {
      intro.innerHTML = t('intro_blurb', { featured: tabLabel('hidden-gems') });
    }

    var deckLabel = document.querySelector('.deck-section-label');
    if (deckLabel) {
      var tab = (document.body && document.body.dataset.tab) || 'hidden-gems';
      var showHome = document.body && document.body.dataset.showHome === 'true';
      var label = tabLabel(tab);
      deckLabel.textContent = showHome ? label : t('deck_featured', { tab: label });
    }

    var mainNav = document.querySelector('main nav');
    if (mainNav) mainNav.setAttribute('aria-label', t('nav_categories'));

    var footNav = document.querySelector('.site-footer nav');
    if (footNav) {
      footNav.setAttribute('aria-label', t('nav_footer'));
      var links = footNav.querySelectorAll('a');
      if (links[0]) links[0].textContent = t('about');
      if (links[1]) links[1].textContent = t('photo_credits');
      if (links[2]) links[2].textContent = t('home');
    }

    var coffeeLink = document.getElementById('buy-me-coffee');
    if (coffeeLink) {
      coffeeLink.textContent = t('buy_me_coffee');
      coffeeLink.setAttribute('aria-label', t('buy_me_coffee'));
    }

    var disclosure = document.getElementById('affiliate-disclosure');
    if (disclosure) disclosure.textContent = t('disclosure');

    var about = document.getElementById('about');
    if (about) about.innerHTML = t('about_blurb');

    var legalDisclaimer = document.getElementById('legal-disclaimer');
    if (legalDisclaimer) legalDisclaimer.textContent = t('legal_disclaimer');

    var credits = document.getElementById('credits');
    if (credits) credits.innerHTML = t('credits_blurb');

    var loading = document.querySelector('#deck-root > .end-deck');
    if (
      loading &&
      /Loading|Cargando|Chargement|Laden|Загруз|読み込み|Deck laden/i.test(loading.textContent || '')
    ) {
      loading.textContent = t('loading');
    }

    var brand = t('brand');
    var tab = (document.body && document.body.dataset.tab) || '';
    var showHome = document.body && document.body.dataset.showHome === 'true';
    if (showHome && tab) {
      document.title = tabLabel(tab) + ' — ' + brand;
    } else {
      document.title = brand + ' — ' + t('tagline');
    }

    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('meta_description'));

    var switcherBtn = document.getElementById('lang-switcher-btn');
    if (switcherBtn) {
      switcherBtn.setAttribute('aria-label', t('lang_aria'));
      switcherBtn.setAttribute('title', t('lang_aria'));
    }
  }

  function closeMenu() {
    var menu = document.getElementById('lang-menu');
    var btn = document.getElementById('lang-switcher-btn');
    if (menu) {
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
    }
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    var menu = document.getElementById('lang-menu');
    var btn = document.getElementById('lang-switcher-btn');
    if (menu) {
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      var active =
        menu.querySelector('[aria-checked="true"]') ||
        menu.querySelector('[role="menuitemradio"]');
      if (active) active.focus();
    }
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function toggleMenu() {
    var menu = document.getElementById('lang-menu');
    if (!menu || menu.hidden) openMenu();
    else closeMenu();
  }

  function syncSwitcherState() {
    var btn = document.getElementById('lang-switcher-btn');
    if (btn) {
      var codeEl = btn.querySelector('.lang-code');
      if (codeEl) codeEl.textContent = state.lang.toUpperCase();
      btn.setAttribute('aria-label', t('lang_aria'));
      btn.setAttribute('title', t('lang_aria'));
      btn.setAttribute('aria-expanded', 'false');
    }
    var menu = document.getElementById('lang-menu');
    if (menu) {
      menu.setAttribute('aria-label', t('lang_menu_aria'));
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
      Array.prototype.forEach.call(
        menu.querySelectorAll('[role="menuitemradio"]'),
        function (item) {
          var code = item.dataset.lang;
          var active = code === state.lang;
          item.className = 'lang-option' + (active ? ' is-active' : '');
          item.setAttribute('aria-checked', active ? 'true' : 'false');
        }
      );
    }
  }

  function renderSwitcher() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    /* Update in place when already mounted — keeps top-right slot stable (no jump). */
    if (document.getElementById('lang-switcher')) {
      syncSwitcherState();
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'lang-switcher';
    wrap.id = 'lang-switcher';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'lang-switcher-btn';
    btn.className = 'lang-switcher-btn';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'lang-menu');
    btn.setAttribute('aria-label', t('lang_aria'));
    btn.setAttribute('title', t('lang_aria'));
    btn.innerHTML =
      '<span class="lang-code" aria-hidden="true">' +
      state.lang.toUpperCase() +
      '</span><span class="lang-caret" aria-hidden="true">▾</span>';

    var menu = document.createElement('ul');
    menu.id = 'lang-menu';
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('lang_menu_aria'));
    menu.hidden = true;
    menu.setAttribute('aria-hidden', 'true');

    SUPPORTED.forEach(function (code) {
      var li = document.createElement('li');
      li.setAttribute('role', 'none');
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'lang-option' + (code === state.lang ? ' is-active' : '');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', code === state.lang ? 'true' : 'false');
      item.dataset.lang = code;
      item.textContent = LANG_NATIVE[code];
      item.addEventListener('click', function () {
        closeMenu();
        if (code !== state.lang) setLanguage(code);
      });
      li.appendChild(item);
      menu.appendChild(li);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });

    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      } else if (e.key === 'Escape') {
        closeMenu();
      }
    });

    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(
        menu.querySelectorAll('[role="menuitemradio"]')
      );
      var idx = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        btn.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(idx + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (e.key === 'Tab') {
        closeMenu();
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    header.appendChild(wrap);

    if (!document.documentElement._sosLangDocBound) {
      document.documentElement._sosLangDocBound = true;
      document.addEventListener('click', function (e) {
        var sw = document.getElementById('lang-switcher');
        if (sw && !sw.contains(e.target)) closeMenu();
      });
    }
  }

  async function loadDict(lang) {
    var url = assetPath('data/i18n/' + lang + '.json');
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load locale ' + lang);
    return res.json();
  }

  async function setLanguage(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
    var dict;
    try {
      dict = await loadDict(lang);
    } catch (err) {
      if (lang !== 'en') {
        lang = 'en';
        dict = await loadDict('en');
      } else {
        throw err;
      }
    }
    state.lang = lang;
    state.dict = dict;
    state.ready = true;
    setStoredLang(lang);
    applyDocumentLang();
    renderSwitcher();
    applyChrome();
    notify();
  }

  async function init() {
    await setLanguage(getStoredLang());
  }

  global.StayOrStrayI18n = {
    SUPPORTED: SUPPORTED,
    LANG_NATIVE: LANG_NATIVE,
    t: t,
    tabLabel: tabLabel,
    localizeCard: localizeCard,
    getCardLocale: getCardLocale,
    getLang: function () {
      return state.lang;
    },
    setLanguage: setLanguage,
    onChange: onChange,
    applyChrome: applyChrome,
    init: init,
    fill: fill,
    ready: function () {
      return state.ready;
    },
  };

  function bootI18n() {
    init().catch(function (err) {
      console.error('[i18n]', err);
      state.dict = { ui: {}, tabs: {}, cards: {} };
      state.ready = true;
      renderSwitcher();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootI18n);
  } else {
    bootI18n();
  }
})(typeof window !== 'undefined' ? window : globalThis);
