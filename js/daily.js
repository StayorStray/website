/**
 * Stay or Stray — daily deck rotation + weekly image remix
 *
 * BoOnE rules (America/Chicago):
 *  - Each tab serves ONE set of up to 100 cards per calendar day.
 *  - Sets rotate daily (different 100 next day when inventory allows).
 *  - Weekly remix: re-partition / re-pair images across archive sets so
 *    no week's daily 100s are identical to a previous week's.
 *  - Until a tab has 100+ approved cards, use available inventory only
 *    (never invent places or photos).
 *
 * Reads data/decks/manifest.json + data/decks/{tab}/set-00N.json
 */
(function (global) {
  'use strict';

  var TZ = 'America/Chicago';
  var MANIFEST_PATH = 'data/decks/manifest.json';
  var TARGET_SIZE = 100;

  function assetPath(rel) {
    var base = (document.body && document.body.dataset.assetRoot) || './';
    return base + String(rel || '').replace(/^\//, '');
  }

  /** YYYY-MM-DD in America/Chicago */
  function chicagoDateKey(date) {
    date = date || new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  /** ISO week key e.g. 2026-W38 from America/Chicago calendar day */
  function chicagoWeekKey(date) {
    date = date || new Date();
    var dateKey = chicagoDateKey(date);
    var parts = dateKey.split('-');
    var d = new Date(
      Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12)
    );
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    var weekStr = (week < 10 ? '0' : '') + week;
    return d.getUTCFullYear() + '-W' + weekStr;
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    var a = arr.slice();
    var rand = mulberry32(seed >>> 0);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + url + ' (' + res.status + ')');
    return res.json();
  }

  async function loadManifest() {
    try {
      return await fetchJson(assetPath(MANIFEST_PATH));
    } catch (e) {
      return null;
    }
  }

  async function loadLiveCatalog(tab) {
    try {
      var data = await fetchJson(assetPath('data/' + tab + '.json'));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Load archived sets for a tab. Prefer embedded cards; else resolve card_ids.
   * Never invents places/photos.
   */
  async function loadArchiveInventory(tab, tabCfg, liveCatalog) {
    var setsMeta = (tabCfg && Array.isArray(tabCfg.sets) && tabCfg.sets) || [];
    var archiveDir = (
      (tabCfg && tabCfg.archive_dir) ||
      'data/decks/' + tab + '/'
    ).replace(/\/?$/, '/');

    var sets = [];
    var byId = {};
    var liveById = {};
    (liveCatalog || []).forEach(function (c) {
      if (c && c.id) liveById[c.id] = c;
    });

    for (var i = 0; i < setsMeta.length; i++) {
      var meta = setsMeta[i];
      var cards = [];
      try {
        var setData = await fetchJson(assetPath(archiveDir + meta.file));
        if (setData && Array.isArray(setData.cards) && setData.cards.length) {
          cards = setData.cards.slice();
        } else {
          var ids = (setData && setData.card_ids) || meta.card_ids || [];
          ids.forEach(function (id) {
            if (liveById[id]) cards.push(liveById[id]);
          });
        }
        sets.push({
          id: (setData && setData.id) || meta.id || meta.file,
          cards: cards,
        });
        cards.forEach(function (c) {
          if (!c || !c.id) return;
          if (!byId[c.id]) {
            byId[c.id] = Object.assign({}, c);
            byId[c.id]._imageVariants = c.image ? [c.image] : [];
          } else if (c.image) {
            var variants = byId[c.id]._imageVariants || [];
            var dup = variants.some(function (v) {
              return (
                v &&
                c.image &&
                ((v.local_path && v.local_path === c.image.local_path) ||
                  (v.url && v.url === c.image.url))
              );
            });
            if (!dup) variants.push(c.image);
            byId[c.id]._imageVariants = variants;
          }
        });
      } catch (err) {
        console.warn('[daily] failed to load set', meta.file, err);
      }
    }

    var allCards = Object.keys(byId).map(function (id) {
      return byId[id];
    });
    return { sets: sets, allCards: allCards };
  }

  /**
   * Weekly remix: master order by ISO week; when a place has multiple image
   * variants across archive sets, pick this week's variant (place stays correct).
   */
  function weeklyRemix(allCards, weekKey, tab) {
    var orderSeed = hashString(weekKey + '|' + tab + '|weekly-order');
    var ordered = seededShuffle(allCards, orderSeed);

    return ordered.map(function (card) {
      var variants = (card._imageVariants && card._imageVariants.length
        ? card._imageVariants.slice()
        : []
      ).filter(Boolean);
      if (!variants.length && card.image) variants = [card.image];

      var out = Object.assign({}, card);
      delete out._imageVariants;

      if (variants.length > 1) {
        var pick =
          hashString(weekKey + '|' + tab + '|img|' + card.id) % variants.length;
        out.image = variants[pick];
      } else if (variants.length === 1) {
        out.image = variants[0];
      }
      return out;
    });
  }

  function pickDailySet(remixedCards, archiveSets, dateKey, weekKey, tab) {
    if (!remixedCards.length) {
      return { cards: [], setId: null, mode: 'empty' };
    }

    var usableSets = (archiveSets || []).filter(function (s) {
      return s.cards && s.cards.length;
    });

    // Multiple archive sets: rotate which set is "today," overlay remixed images
    if (usableSets.length > 1) {
      var setIdx = hashString(dateKey + '|' + tab + '|set') % usableSets.length;
      var chosen = usableSets[setIdx];
      var remixedById = {};
      remixedCards.forEach(function (c) {
        remixedById[c.id] = c;
      });
      var fromSet = [];
      chosen.cards.forEach(function (c) {
        if (c && c.id && remixedById[c.id]) fromSet.push(remixedById[c.id]);
        else if (c && c.id) {
          var copy = Object.assign({}, c);
          delete copy._imageVariants;
          fromSet.push(copy);
        }
      });
      var dayOrder = seededShuffle(
        fromSet,
        hashString(dateKey + '|' + tab + '|order|' + chosen.id)
      );
      return {
        cards: dayOrder.slice(0, Math.min(TARGET_SIZE, dayOrder.length)),
        setId: chosen.id,
        mode: 'archive-rotate',
      };
    }

    // Inventory <= 100 (current HG): serve all available; daily + weekly seeds change order
    if (remixedCards.length <= TARGET_SIZE) {
      var shuffled = seededShuffle(
        remixedCards,
        hashString(dateKey + '|' + weekKey + '|' + tab + '|day')
      );
      return {
        cards: shuffled,
        setId: usableSets[0] ? usableSets[0].id : 'live-pool',
        mode: 'full-inventory',
      };
    }

    // Inventory > 100: sliding window of 100 through week-remixed order
    var offset =
      hashString(dateKey + '|' + tab + '|window') % remixedCards.length;
    var windowCards = [];
    for (var i = 0; i < TARGET_SIZE; i++) {
      windowCards.push(remixedCards[(offset + i) % remixedCards.length]);
    }
    return {
      cards: windowCards,
      setId: 'window-' + dateKey,
      mode: 'daily-window',
    };
  }

  /**
   * Select today's deck for a tab.
   * @returns {{cards, dateKey, weekKey, setId, timezone, poolSize, targetSize, mode}}
   */
  async function selectDailyDeck(tab, options) {
    options = options || {};
    var dateKey = options.dateKey || chicagoDateKey();
    var weekKey = options.weekKey;
    if (!weekKey) {
      var p = dateKey.split('-');
      weekKey = chicagoWeekKey(
        new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12))
      );
    }

    var manifest = await loadManifest();
    var timezone =
      (manifest &&
        manifest.rotation &&
        (manifest.rotation.timezone || manifest.rotation.timeZone)) ||
      TZ;
    var tabCfg = manifest && manifest.tabs && manifest.tabs[tab];
    var liveCatalog = await loadLiveCatalog(tab);
    var inventory = await loadArchiveInventory(tab, tabCfg, liveCatalog);

    var allCards = inventory.allCards;
    var archiveSets = inventory.sets;
    // The live catalog is authoritative while the inventory is under 100.
    // Otherwise archive rotation can serve only one partial set (for example
    // 20 cards) instead of all currently approved cards.
    if (liveCatalog.length && liveCatalog.length <= TARGET_SIZE) {
      allCards = liveCatalog.slice();
      archiveSets = [];
    } else if (liveCatalog.length > allCards.length) {
      allCards = liveCatalog.slice();
      archiveSets = [];
    } else if (!allCards.length) {
      allCards = liveCatalog.slice();
    }

    var remixed = weeklyRemix(allCards, weekKey, tab);
    var picked = pickDailySet(
      remixed,
      archiveSets,
      dateKey,
      weekKey,
      tab
    );

    return {
      cards: picked.cards,
      dateKey: dateKey,
      weekKey: weekKey,
      setId: picked.setId,
      timezone: timezone,
      poolSize: allCards.length,
      targetSize: TARGET_SIZE,
      mode: picked.mode,
    };
  }

  global.StayOrStrayDaily = {
    TZ: TZ,
    TARGET_SIZE: TARGET_SIZE,
    chicagoDateKey: chicagoDateKey,
    chicagoWeekKey: chicagoWeekKey,
    hashString: hashString,
    seededShuffle: seededShuffle,
    selectDailyDeck: selectDailyDeck,
    loadManifest: loadManifest,
  };
})(typeof window !== 'undefined' ? window : globalThis);
