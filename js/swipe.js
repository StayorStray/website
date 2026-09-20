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
  const STORAGE_STAY = 'sos_stay_count';
  const STORAGE_STRAY = 'sos_stray_count';

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

  function getCounts() {
    return {
      stay: parseInt(localStorage.getItem(STORAGE_STAY) || '0', 10) || 0,
      stray: parseInt(localStorage.getItem(STORAGE_STRAY) || '0', 10) || 0,
    };
  }

  function setCount(kind, n) {
    localStorage.setItem(kind === 'stay' ? STORAGE_STAY : STORAGE_STRAY, String(n));
  }

  function updateStatsUI() {
    const el = document.getElementById('session-stats');
    if (!el) return;
    const c = getCounts();
    el.innerHTML = t('session_stats', {
      stay: '<strong>' + c.stay + '</strong>',
      stray: '<strong>' + c.stray + '</strong>',
    });
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

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    const res = await fetch(dataPath(this.tab), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + this.tab + ' data');
    const data = await res.json();
    this.cards = Array.isArray(data) ? data : [];
    this.index = 0;
    this.last = null;
    this.render();
    this.prefetch();
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
        '</span> <button type="button" class="why-more" aria-expanded="false">More</button></p>'
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
          '<button type="button" class="btn btn-stray" id="btn-stray" aria-label="Stray">← Stray</button>' +
          '<button type="button" class="btn btn-stay" id="btn-stay" aria-label="Stay">Stay →</button>' +
          '<button type="button" class="btn btn-undo" id="btn-undo" hidden>Undo last</button>' +
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
          '<div><dt>Best time</dt><dd>' +
          escapeHtml(facts.best_time || '—') +
          '</dd></div>' +
          '<div><dt>How to get there</dt><dd>' +
          escapeHtml(facts.how_to_get_there || '—') +
          '</dd></div>' +
          '<div><dt>Good to know</dt><dd>' +
          escapeHtml(facts.good_to_know || '—') +
          '</dd></div>' +
          '</dl>' +
          '<p class="photo-credit">Photo credit: ' +
          creditHtml +
          '</p>' +
          '</div>' +
          '<aside class="ad-slot" aria-label="Booking offer">' +
          '<p class="ad-kicker">Stay nearby</p>' +
          '<a class="ad-cta" id="ad-cta" href="' +
          escapeHtml(adHref(card)) +
          '" target="_blank" rel="noopener sponsored noreferrer">' +
          escapeHtml(adLabel(card)) +
          ' →</a>' +
          '<p class="ad-note">Opens partner search for ' +
          escapeHtml((card.ad && card.ad.destination_query) || card.name) +
          '. Affiliate ID placeholder until configured.</p>' +
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
      endStats.textContent = t('end_deck_session', { stay: c.stay, stray: c.stray });
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

    const counts = getCounts();
    if (decision === 'stay') {
      counts.stay += 1;
      setCount('stay', counts.stay);
    } else {
      counts.stray += 1;
      setCount('stray', counts.stray);
    }
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
    const counts = getCounts();
    if (this.last.decision === 'stay') {
      counts.stay = Math.max(0, counts.stay - 1);
      setCount('stay', counts.stay);
    } else {
      counts.stray = Math.max(0, counts.stray - 1);
      setCount('stray', counts.stray);
    }
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
    const tab = document.body.dataset.tab || 'hidden-gems';
    const showHome = document.body.dataset.showHome === 'true';
    renderTabNav(tab);
    updateStatsUI();
    if (I18n() && I18n().applyChrome) I18n().applyChrome();

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
        if (I18n().applyChrome) I18n().applyChrome();
        if (deck && deck.root) deck.render();
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
