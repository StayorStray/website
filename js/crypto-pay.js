/**
 * Spot and Travel — "Pay with Xaman" (secondary, crypto). Card hold stays the default.
 * Runs only AFTER the submission is sent (same submission_ref as card orders). Worker: workers/crypto-pay.
 * Crypto is charged up front; rejected listings are refunded in full by hand (docs/checkout/CRYPTO-XAMAN.md).
 */
(function (global) {
  'use strict';
  var API = 'https://spotandtravel-crypto-pay.spotandtravel.workers.dev';
  var ISSUERS = { RLUSD: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', XRH: 'r9xu7pdBEx4DdiatMqAUFodgxaPkfFU1Zw' };
  var NOTE = "Crypto is charged up front. If your listing isn't approved, we refund it in full.";
  var cur = 'RLUSD', poll = null, tick = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function selected() { var e = document.querySelector('input[name="pay_method"]:checked'); return !!e && e.value === 'crypto'; }
  function currency() { return cur; }
  // Card-specific wording ↔ crypto wording (card text is saved and restored exactly).
  var CRYPTO_TXT = {
    hold: 'Crypto is charged up front, not held. If your listing isn’t approved, we refund it in full to the wallet you paid from.',
    ack: 'I understand payment does not equal live: crypto is charged up front and refunded in full if my listing isn’t approved by the Accuracy Auditor.',
    disc: 'Paid does not equal live. The Accuracy Auditor checks every listing before it appears. Crypto payments (via Xaman, on the XRP Ledger) are charged up front for the total above. If your listing is rejected, we refund it in full. We send your submission (with photo) to our inbox first, then show your Xaman payment request.'
  };
  var saved = {}, mo = null, patching = false;
  function els() {
    var ack = $('ack-paid-listing');
    return { total: $('submit-total'), hold: $('submit-hold-summary'), ack: ack && ack.parentNode && ack.parentNode.querySelector('span'), disc: document.querySelector('.submit-disclaimer') };
  }
  function patch() {
    if (patching || !selected()) return;
    patching = true;
    var e = els();
    if (e.total) {
      var st = e.total.querySelector('strong'), amt = st ? st.textContent : '';
      var html = 'Total to pay in crypto (charged up front): <strong>' + esc(amt) + '</strong>';
      if (e.total.innerHTML !== html) { saved.total = e.total.innerHTML; e.total.innerHTML = html; }
    }
    [['hold', 'hold'], ['ack', 'ack'], ['disc', 'disc']].forEach(function (k) {
      var el = e[k[0]]; if (el && el.textContent !== CRYPTO_TXT[k[1]]) { saved[k[0]] = el.textContent; el.textContent = CRYPTO_TXT[k[1]]; }
    });
    patching = false;
  }
  function restore() {
    var e = els();
    ['hold', 'ack', 'disc'].forEach(function (k) { if (e[k] && saved[k] != null && e[k].textContent === CRYPTO_TXT[k]) e[k].textContent = saved[k]; });
    if (e.total && saved.total != null && /crypto/.test(e.total.textContent)) e.total.innerHTML = saved.total;
    var sku = document.querySelector('input[name="sku"]:checked');
    if (sku) sku.dispatchEvent(new Event('change', { bubbles: true })); // let the page re-render its own card wording/total
  }
  function watch() {
    if (mo || !global.MutationObserver) return;
    mo = new MutationObserver(function () { if (selected()) patch(); });
    var e = els();
    ['total', 'hold', 'ack', 'disc'].forEach(function (k) { if (e[k]) mo.observe(e[k], { childList: true, characterData: true, subtree: true }); });
  }
  function sync() {
    var on = selected(), box = $('xc-options');
    if (on) patch(); else restore();
    if (box) box.hidden = !on;
    var btn = $('submit-place-btn'); if (btn && !btn.dataset.cardLabel) btn.dataset.cardLabel = btn.textContent;
    if (btn) btn.textContent = on ? 'Continue to Pay with Xaman' : btn.dataset.cardLabel;
  }
  function issuerBox(c) {
    if (!ISSUERS[c]) return '';
    return '<div class="xc-issuer"><p class="xc-issuer-label">Official ' + c + ' issuer</p>' +
      '<code class="xc-addr" id="xc-issuer-addr">' + ISSUERS[c] + '</code>' +
      '<button type="button" class="xc-copy" id="xc-copy">Copy issuer</button>' +
      '<p class="xc-issuer-note">Make sure your wallet’s ' + c + ' trustline uses this exact issuer. Look-alike tokens from other issuers will be rejected.</p></div>';
  }
  function start(payload, statusFn) {
    var out = $('xc-out'); if (!out) return;
    clearInterval(poll); clearInterval(tick);
    out.hidden = false;
    out.innerHTML = '<div class="xc-quote"><p class="xc-line">Getting your ' + esc(cur) + ' quote…</p></div>';
    fetch(API + '/v1/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      sku: payload.sku, pin: payload.pin, currency: cur, submission_ref: payload.submission_ref,
      email: payload.submitter_email, place_name: payload.place_name }) })
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (!q.ok) { out.innerHTML = '<div class="xc-quote xc-err"><p class="xc-line">' + esc(q.refused ? q.message : 'We couldn’t get a crypto quote right now.') + '</p><p class="xc-line">Your submission ' + esc(payload.submission_ref) + ' is saved. Try again in a few minutes, or switch to card.</p></div>'; return; }
        if (q.amount && typeof q.amount === 'object' && ISSUERS[q.currency] && q.amount.issuer !== ISSUERS[q.currency]) { out.innerHTML = '<div class="xc-quote xc-err"><p class="xc-line">Quote failed a safety check. Please pay by card.</p></div>'; return; }
        out.innerHTML = '<div class="xc-quote">' +
          '<p class="xc-kicker">Send exactly</p><p class="xc-amt">' + esc(q.amount_display) + '</p>' +
          '<p class="xc-line">for $' + esc(q.charge_usd) + (q.discount_pct ? ' (10% off $' + esc(q.list_usd) + ')' : '') + '</p>' +
          issuerBox(q.currency) +
          '<img class="xc-qr" alt="Xaman QR code" width="220" height="220" src="' + esc(q.xaman.qr_png) + '" />' +
          '<a class="btn btn-stay xc-open" href="' + esc(q.xaman.deeplink) + '">Open in Xaman</a>' +
          '<p class="xc-line">Quote locked for <strong id="xc-left">10:00</strong></p>' +
          '<p class="xc-line" id="xc-st" role="status">Waiting for payment…</p>' +
          '<p class="xc-note">' + NOTE + '</p>' +
          '<p class="xc-meta">Submission ' + esc(payload.submission_ref) + '<br>Payment ref ' + esc(q.ref) + ' · Destination tag ' + esc(q.destination_tag) + '<br>To <span class="xc-addr-inline">' + esc(q.destination) + '</span></p></div>';
        var cp = $('xc-copy'); if (cp) cp.addEventListener('click', function () {
          var t = $('xc-issuer-addr').textContent;
          (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { cp.textContent = 'Copied'; }, function () {
            var r = document.createRange(); r.selectNodeContents($('xc-issuer-addr')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        });
        out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (statusFn) statusFn('Submission ' + payload.submission_ref + ' sent. Scan or open the Xaman request below to pay.');
        tick = setInterval(function () { var s = Math.max(0, Math.round((q.expires_at - Date.now()) / 1000)), el = $('xc-left'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (!s) clearInterval(tick); }, 1000);
        poll = setInterval(function () {
          fetch(API + '/v1/status?ref=' + encodeURIComponent(q.ref)).then(function (r) { return r.json(); }).then(function (s) {
            var el = $('xc-st'); if (!el) return;
            var m = { paid: 'Payment verified on the XRP Ledger. Thank you! We’ll email you after review.', rejected_payment: 'Payment couldn’t be accepted: ' + (s.note || ''), expired: 'Quote expired. Press the button again for a new quote.', declined: 'Cancelled in Xaman.', pending_validation: 'Payment sent, confirming on the ledger…' }[s.status];
            if (m) el.textContent = m;
            if (['paid', 'rejected_payment', 'expired', 'declined'].indexOf(s.status) >= 0) clearInterval(poll);
          }).catch(function () {});
        }, 4000);
      })
      .catch(function () { out.innerHTML = '<div class="xc-quote xc-err"><p class="xc-line">Couldn’t reach the crypto checkout. Your submission is saved. Try again or pay by card.</p></div>'; });
  }
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="pay_method"]'), function (r) { r.addEventListener('change', sync); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-xc-cur]'), function (b) {
      b.addEventListener('click', function () {
        cur = b.getAttribute('data-xc-cur');
        Array.prototype.forEach.call(document.querySelectorAll('[data-xc-cur]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    watch();
    sync();
  }
  global.SATCrypto = { selected: selected, currency: currency, start: start, note: NOTE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
