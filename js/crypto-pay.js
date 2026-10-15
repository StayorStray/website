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
  // i18n: use the site's dictionary (data/i18n/<lang>.json "ui"); fall back to the English text below.
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && k in v ? String(v[k]) : m; }); }
  function T(key, fb, vars) {
    var i = global.SpotAndTravelI18n, val = (i && i.t) ? i.t(key, vars) : null;
    return (val && val !== key) ? val : fill(fb, vars);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function selected() { var e = document.querySelector('input[name="pay_method"]:checked'); return !!e && e.value === 'crypto'; }
  function currency() { return cur; }
  // Card-specific wording ↔ crypto wording (card text is saved and restored exactly).
  var EN_TXT = {
    hold: 'Crypto is charged up front, not held. If your listing isn’t approved, we refund it in full to the wallet you paid from.',
    ack: 'I understand payment does not equal live: crypto is charged up front and refunded in full if my listing isn’t approved after our accuracy check.',
    disc: 'Paid does not equal live. We check every listing for accuracy before it appears. Crypto payments (via Xaman, on the XRP Ledger) are charged up front for the total above. If your listing is rejected, we refund it in full. We send your submission (with photo) to our inbox first, then show your Xaman payment request.'
  };
  function cryptoTxt(k) { return T('xc_' + k, EN_TXT[k]); }
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
      var html = T('xc_total', 'Total to pay in crypto (charged up front): <strong>{amount}</strong>', { amount: esc(amt) });
      if (e.total.innerHTML !== html) { if (!e.total.dataset.xc) saved.total = e.total.innerHTML; e.total.innerHTML = html; e.total.dataset.xc = '1'; }
    }
    [['hold', 'hold'], ['ack', 'ack'], ['disc', 'disc']].forEach(function (k) {
      var el = e[k[0]], txt = cryptoTxt(k[1]); if (el && el.textContent !== txt) { if (!el.dataset.xc) saved[k[0]] = el.textContent; el.textContent = txt; el.dataset.xc = '1'; }
    });
    patching = false;
  }
  function restore() {
    var e = els();
    ['hold', 'ack', 'disc'].forEach(function (k) {
      if (!e[k] || !e[k].dataset.xc) return;
      delete e[k].dataset.xc;
      var key = e[k].getAttribute('data-i18n'), i = global.SpotAndTravelI18n;
      if (key && i && i.t && i.t(key) !== key) e[k].textContent = i.t(key); else if (saved[k] != null) e[k].textContent = saved[k];
    });
    if (e.total && e.total.dataset.xc) { delete e.total.dataset.xc; if (saved.total != null) e.total.innerHTML = saved.total; }
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
    var btn = $('submit-place-btn'), i = global.SpotAndTravelI18n; if (btn && !btn.dataset.cardLabel) btn.dataset.cardLabel = btn.textContent;
    var cardLabel = (i && i.t && i.t('submit_pay') !== 'submit_pay') ? i.t('submit_pay') : (btn && btn.dataset.cardLabel);
    if (btn) btn.textContent = on ? T('xc_btn', 'Continue to Pay with Xaman') : cardLabel;
  }
  function issuerBox(c) {
    if (!ISSUERS[c]) return '';
    return '<div class="xc-issuer"><p class="xc-issuer-label">' + esc(T('xc_issuer_label', 'Official {c} issuer', { c: c })) + '</p>' +
      '<code class="xc-addr" id="xc-issuer-addr">' + ISSUERS[c] + '</code>' +
      '<button type="button" class="xc-copy" id="xc-copy">' + esc(T('xc_copy', 'Copy issuer')) + '</button>' +
      '<p class="xc-issuer-note">' + esc(T('xc_issuer_note', 'Make sure your wallet’s {c} trustline uses this exact issuer. Look-alike tokens from other issuers will be rejected.', { c: c })) + '</p></div>';
  }
  function start(payload, statusFn) {
    var out = $('xc-out'); if (!out) return;
    clearInterval(poll); clearInterval(tick);
    out.hidden = false;
    out.innerHTML = '<div class="xc-quote"><p class="xc-line">' + esc(T('xc_getting', 'Getting your {c} quote…', { c: cur })) + '</p></div>';
    fetch(API + '/v1/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      sku: payload.sku, pin: payload.pin, currency: cur, submission_ref: payload.submission_ref,
      email: payload.submitter_email, place_name: payload.place_name }) })
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (!q.ok) { out.innerHTML = '<div class="xc-quote xc-err"><p class="xc-line">' + esc(q.refused ? q.message : T('xc_err_quote', 'We couldn’t get a crypto quote right now.')) + '</p><p class="xc-line">' + esc(T('xc_saved_retry', 'Your submission {ref} is saved. Try again in a few minutes, or switch to card.', { ref: payload.submission_ref })) + '</p></div>'; return; }
        if (q.amount && typeof q.amount === 'object' && ISSUERS[q.currency] && q.amount.issuer !== ISSUERS[q.currency]) { out.innerHTML = '<div class="xc-quote xc-err"><p class="xc-line">' + esc(T('xc_safety', 'Quote failed a safety check. Please pay by card.')) + '</p></div>'; return; }
        out.innerHTML = '<div class="xc-quote">' +
          '<p class="xc-kicker">' + esc(T('xc_send_exactly', 'Send exactly')) + '</p><p class="xc-amt">' + esc(q.amount_display) + '</p>' +
          '<p class="xc-line">' + esc(T('xc_for', 'for ${usd}', { usd: q.charge_usd })) + (q.discount_pct ? ' ' + esc(T('xc_discount', '(10% off ${list})', { list: q.list_usd })) : '') + '</p>' +
          issuerBox(q.currency) +
          '<img class="xc-qr" alt="' + esc(T('xc_qr_alt', 'Xaman QR code')) + '" width="220" height="220" src="' + esc(q.xaman.qr_png) + '" />' +
          '<a class="btn btn-stay xc-open" href="' + esc(q.xaman.deeplink) + '">' + esc(T('xc_open', 'Open in Xaman')) + '</a>' +
          '<p class="xc-line">' + esc(T('xc_locked', 'Quote locked for')) + ' <strong id="xc-left">10:00</strong></p>' +
          '<p class="xc-line" id="xc-st" role="status">' + esc(T('xc_waiting', 'Waiting for payment…')) + '</p>' +
          '<p class="xc-note">' + esc(T('xc_note', NOTE)) + '</p>' +
          '<p class="xc-meta">' + esc(T('xc_submission', 'Submission')) + ' ' + esc(payload.submission_ref) + '<br>' + esc(T('xc_payref', 'Payment ref')) + ' ' + esc(q.ref) + ' · ' + esc(T('xc_desttag', 'Destination tag')) + ' ' + esc(q.destination_tag) + '<br>' + esc(T('xc_to', 'To')) + ' <span class="xc-addr-inline">' + esc(q.destination) + '</span></p></div>';
        var cp = $('xc-copy'); if (cp) cp.addEventListener('click', function () {
          var t = $('xc-issuer-addr').textContent;
          (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { cp.textContent = T('xc_copied', 'Copied'); }, function () {
            var r = document.createRange(); r.selectNodeContents($('xc-issuer-addr')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); });
        });
        out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (statusFn) statusFn(T('xc_status_sent', 'Submission {ref} sent. Scan or open the Xaman request below to pay.', { ref: payload.submission_ref }));
        tick = setInterval(function () { var s = Math.max(0, Math.round((q.expires_at - Date.now()) / 1000)), el = $('xc-left'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (!s) clearInterval(tick); }, 1000);
        poll = setInterval(function () {
          fetch(API + '/v1/status?ref=' + encodeURIComponent(q.ref)).then(function (r) { return r.json(); }).then(function (s) {
            var el = $('xc-st'); if (!el) return;
            var m = { paid: T('xc_paid', 'Payment verified on the XRP Ledger. Thank you! We’ll email you after review.'), rejected_payment: T('xc_rejected', 'Payment couldn’t be accepted:') + ' ' + (s.note || ''), expired: T('xc_expired', 'Quote expired. Press the button again for a new quote.'), declined: T('xc_declined', 'Cancelled in Xaman.'), pending_validation: T('xc_pending', 'Payment sent, confirming on the ledger…') }[s.status];
            if (m) el.textContent = m;
            if (['paid', 'rejected_payment', 'expired', 'declined'].indexOf(s.status) >= 0) clearInterval(poll);
          }).catch(function () {});
        }, 4000);
      })
      .catch(function () { out.innerHTML = '<div class="xc-quote xc-err"><p class="xc-line">' + esc(T('xc_unreachable', 'Couldn’t reach the crypto checkout. Your submission is saved. Try again or pay by card.')) + '</p></div>'; });
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
    // Re-apply crypto wording / button label after a language switch.
    var i = global.SpotAndTravelI18n;
    if (i && i.onChange) i.onChange(function () { setTimeout(sync, 0); });
  }
  global.SATCrypto = { selected: selected, currency: currency, start: start, note: NOTE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
