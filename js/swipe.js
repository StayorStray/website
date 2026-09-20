/**
 * Stay or Stray — swipe deck
 * Stay/Stray buttons, arrow keys, touch swipe, ~300ms fly-off,
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

  function I18n() {
    return window.StayOrStrayI18n || null;
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

    title.textContent = kind === 'stay' ? t('stay_list_title') : t('stray_list_title');
    root.setAttribute('aria-labelledby', 'list-panel-title');
    closeBtn.textContent = t('close_list');
    closeBtn.setAttribute('aria-label', t('close_list'));

    const dailyNote = t('daily_note');
    if (note) {
      if (dailyNote && dailyNote !== 'daily_note') {
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
      body.innerHTML =
        '<ul class="place-list">' +
        list
          .map(function (item) {
            const thumb = item.thumb
              ? '<img class="place-list-thumb" src="' +
                escapeHtml(item.thumb) +
                '" alt="" loading="lazy" width="56" height="56" />'
              : '<span class="place-list-thumb placeholder" aria-hidden="true"></span>';
            return (
              '<li class="place-list-item">' +
              thumb +
              '<div class="place-list-text">' +
              '<p class="place-list-name">' +
              escapeHtml(item.name) +
              '</p>' +
              '<p class="place-list-line">' +
              escapeHtml(item.short_line || '') +
              '</p>' +
              '</div></li>'
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
    nav.innerHTML = getTabs().map(function (t) {
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
    }).join('');
  }


  function imageSrc(card) {
    const img = card.image || {};
    if (img.local_path) return assetPath(img.local_path);
    return img.url || '';
  }

  function adHref(card) {
    const Aff = window.StayOrStrayAffiliates;
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
    const Daily = window.StayOrStrayDaily;
    if (Daily && Daily.selectDailyDeck) {
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
    this.index = 0;
    this.last = null;
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
          '<aside class="ad-slot" aria-label="' +
          escapeHtml(t('booking_offer')) +
          '">' +
          '<p class="ad-kicker">' +
          escapeHtml(t('ad_kicker')) +
          '</p>' +
          '<a class="ad-cta" id="ad-cta" href="' +
          escapeHtml(adHref(card)) +
          '" target="_blank" rel="noopener sponsored noreferrer">' +
          escapeHtml(adLabel(card)) +
          ' →</a>' +
          '<p class="ad-note">' +
          escapeHtml(
            t('ad_note', {
              destination: (card.ad && card.ad.destination_query) || card.name || '',
            })
          ) +
          '</p>' +
          '</aside>'
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
    this.root.innerHTML = html;

    document.getElementById('btn-stay').addEventListener('click', () => this.decide('stay'));
    document.getElementById('btn-stray').addEventListener('click', () => this.decide('stray'));
    const undoBtn = document.getElementById('btn-undo');
    if (this.last) {
      undoBtn.hidden = false;
      undoBtn.addEventListener('click', () => this.undo());
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
      this.decide(dx > 0 ? 'stay' : 'stray');
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

  Deck.prototype.decide = function (decision) {
    if (this.busy) return;
    const card = this.current();
    if (!card) return;
    this.busy = true;
    const el = document.getElementById('active-card');
    if (el) el.classList.add(decision === 'stay' ? 'fly-stay' : 'fly-stray');

    recordDecision(decision, card);
    updateStatsUI();

    this.last = { card: card, decision: decision, index: this.index };

    window.setTimeout(() => {
      this.index += 1;
      this.busy = false;
      this.render();
      this.prefetch();
    }, FLY_MS);
  };

  Deck.prototype.undo = function () {
    if (this.busy || !this.last) return;
    undoDecision(this.last.decision, this.last.card.id);
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
    renderTabNav(tab);
    updateStatsUI();
    ensureListPanel();
    if (I18n() && I18n().applyChrome) I18n().applyChrome && I18n().applyChrome();

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) homeBtn.hidden = !showHome;

    const disclosure = document.getElementById('affiliate-disclosure');
    if (disclosure) disclosure.textContent = t('disclosure');

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
        deck.decide('stay');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        deck.decide('stray');
      } else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        deck.undo();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
