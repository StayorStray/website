/**
 * Spot and Travel — prize-wheel audio v2 (used by pages/location-randomizer.html).
 *
 * - Peg crossings are computed from the spin's easing curve (not from animation frames) and
 *   scheduled on the AudioContext clock with a small lookahead, so ticks land exactly on the pegs.
 * - Minimum spacing (~30 ms) at high speed turns the start of the spin into a smooth fast rattle
 *   that naturally slows; pitch and level follow the wheel speed slightly.
 * - Each tick is a "clack": a filtered noise burst plus a short pitched body, with real envelopes
 *   (no clicks/pops), through a master gain + gentle compressor for consistent volume.
 * - The landing chime starts a short, natural beat after the final tick.
 */
(function (global) {
  'use strict';

  var MIN_SPACING = 0.03; // seconds between scheduled clacks at full speed
  var LAND_GAP = 0.11; // shortest beat between the final clack and the chime
  var LAND_MAX = 0.24; // ...and the longest (chime lands as the wheel settles)
  var noiseCache = new WeakMap();

  function noiseBuffer(ctx) {
    var b = noiseCache.get(ctx);
    if (b) return b;
    var len = Math.floor(ctx.sampleRate * 0.06);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    var seed = 12345;
    for (var i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic: every clack sounds alike
      d[i] = (seed / 0x3fffffff - 1) * (1 - i / len);
    }
    noiseCache.set(ctx, b);
    return b;
  }

  /** Master chain: gain -> soft compressor -> destination. */
  function createBus(ctx, destination) {
    var master = ctx.createGain();
    master.gain.value = 0.7;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    master.connect(comp);
    comp.connect(destination || ctx.destination);
    return master;
  }

  /** One peg "clack" at time `when`. speed 0..1 shapes pitch/level slightly. */
  function clack(ctx, bus, when, speed) {
    speed = Math.max(0, Math.min(1, speed || 0));
    var level = 0.34 + 0.12 * speed; // nearly constant, a touch brighter when fast
    // noise transient
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 + 1400 * speed;
    bp.Q.value = 1.4;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0, when);
    ng.gain.linearRampToValueAtTime(level, when + 0.0012);
    ng.gain.exponentialRampToValueAtTime(0.0008, when + 0.028);
    ng.gain.linearRampToValueAtTime(0, when + 0.032);
    src.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(bus);
    src.start(when);
    src.stop(when + 0.04);
    // small wooden/plastic body
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    var f0 = 520 + 260 * speed;
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, when + 0.03);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0, when);
    og.gain.linearRampToValueAtTime(level * 0.45, when + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0008, when + 0.04);
    og.gain.linearRampToValueAtTime(0, when + 0.045);
    osc.connect(og); og.connect(bus);
    osc.start(when);
    osc.stop(when + 0.05);
  }

  function bell(ctx, bus, freq, when, dur, vol) {
    [[1, 1], [2.01, 0.28], [3.02, 0.1]].forEach(function (p) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * p[0], when);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol * p[1], when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, when + dur / p[0]);
      g.gain.linearRampToValueAtTime(0, when + dur / p[0] + 0.02);
      o.connect(g); g.connect(bus);
      o.start(when);
      o.stop(when + dur / p[0] + 0.05);
    });
  }

  /** Landing chime: a quick rising major arpeggio with a bell timbre. */
  function chime(ctx, bus, when) {
    bell(ctx, bus, 783.99, when, 0.9, 0.16);
    bell(ctx, bus, 987.77, when + 0.085, 0.9, 0.14);
    bell(ctx, bus, 1174.66, when + 0.17, 1.2, 0.15);
  }

  /**
   * Peg crossing times (seconds from spin start) for rotation(t) = start + delta * ease(t/dur),
   * with ease = easeOutCubic. A peg passes the pointer whenever rotation crosses k * slice.
   * Returns [{ t, speed }] thinned to MIN_SPACING; the final crossing is always kept.
   */
  function crossings(startRot, endRot, segments, durationS, minSpacing) {
    var slice = 360 / Math.max(2, segments);
    var delta = endRot - startRot;
    if (!(delta > 0) || !(durationS > 0)) return [];
    var maxSpeed = 3 * delta / durationS; // deg/s at t=0
    var kStart = Math.floor(startRot / slice) + 1;
    var kEnd = Math.floor((endRot - 1e-9) / slice);
    var raw = [];
    for (var k = kStart; k <= kEnd; k++) {
      var e = (k * slice - startRot) / delta;
      var u = 1 - Math.cbrt(1 - e);
      var spd = (3 * delta / durationS) * Math.pow(1 - u, 2);
      raw.push({ t: u * durationS, speed: spd / maxSpeed });
    }
    var gap = minSpacing == null ? MIN_SPACING : minSpacing;
    var out = [];
    var last = -1;
    for (var i = 0; i < raw.length; i++) {
      var isFinal = i === raw.length - 1;
      if (last < 0 || raw[i].t - last >= gap) {
        out.push(raw[i]);
        last = raw[i].t;
      } else if (isFinal) {
        out[out.length - 1] = raw[i];
        last = raw[i].t;
      }
    }
    return out;
  }

  /**
   * Live scheduler: lookahead loop on the audio clock. Returns { stop(), landAt, lastTickAt }.
   * audioStart = ctx time that corresponds to spin t=0.
   */
  function scheduleSpin(ctx, bus, ticks, audioStart, durationS, opts) {
    opts = opts || {};
    var i = 0;
    var stopped = false;
    var lastTickAt = ticks.length ? audioStart + ticks[ticks.length - 1].t : audioStart + durationS;
    var landAt = Math.max(lastTickAt + LAND_GAP, Math.min(audioStart + durationS, lastTickAt + LAND_MAX));
    var chimed = false;
    var LOOKAHEAD = 0.12;
    function pump() {
      if (stopped) return;
      var horizon = ctx.currentTime + LOOKAHEAD;
      while (i < ticks.length && audioStart + ticks[i].t <= horizon) {
        var at = audioStart + ticks[i].t;
        if (at >= ctx.currentTime - 0.005) clack(ctx, bus, Math.max(at, ctx.currentTime), ticks[i].speed);
        i++;
      }
      if (!chimed && i >= ticks.length && landAt <= horizon && opts.chime !== false) {
        chimed = true;
        chime(ctx, bus, Math.max(landAt, ctx.currentTime));
      }
      if (i < ticks.length || !chimed) timer = setTimeout(pump, 25);
    }
    var timer = null;
    pump();
    return {
      landAt: landAt,
      lastTickAt: lastTickAt,
      stop: function () {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }

  /** Offline render for previews/tests: schedule everything up front. */
  function renderSpin(ctx, bus, ticks, audioStart, durationS) {
    ticks.forEach(function (tk) { clack(ctx, bus, audioStart + tk.t, tk.speed); });
    var lastTickAt = ticks.length ? audioStart + ticks[ticks.length - 1].t : audioStart + durationS;
    var landAt = Math.max(lastTickAt + LAND_GAP, Math.min(audioStart + durationS, lastTickAt + LAND_MAX));
    chime(ctx, bus, landAt);
    return { landAt: landAt, lastTickAt: lastTickAt };
  }

  global.WheelAudioV2 = {
    MIN_SPACING: MIN_SPACING,
    LAND_GAP: LAND_GAP,
    createBus: createBus,
    clack: clack,
    chime: chime,
    crossings: crossings,
    scheduleSpin: scheduleSpin,
    renderSpin: renderSpin,
  };
})(typeof window !== 'undefined' ? window : globalThis);
