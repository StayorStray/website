/**
 * Stay or Stray — Submit a Place notify / checkout config (browser)
 *
 * formEndpoint: Formspree intake URL. FormData POSTs include the submission photo.
 *
 * stripePk: TEST publishable key only. Never put Stripe secret keys in this repo.
 * prices: Stripe TEST Price IDs (BoOnE 2026-09-24 prices.csv).
 *
 * Checkout: Stripe removed client-only redirectToCheckout (2025-09-30). Opening
 * Checkout now needs a server-created Session (with a secret key on a backend) or Payment Links /
 * Buy Buttons. Pay stays on the download+mailto / formEndpoint fallback until a
 * session endpoint exists. successUrl / cancelUrl are this same Submit page.
 */
(function (global) {
  'use strict';
  var SUBMIT_PAGE = 'https://stayorstray.github.io/website/pages/submit-a-place.html';
  global.SOS_SUBMIT = {
    formEndpoint: 'https://formspree.io/f/xkjgzpky',
    notifyEmail: 'xrhgrokbot@outlook.com',
    stripePk:
      'pk_test_51UGihKECBucDnUAXqcNPul5dkTzcepB6ORnogeRFzb7cUt0XbU3TNLkEWam2vB6DCMueus6jvxVbsaTQqCoz9QW800i1XoTJW6',
    prices: {
      founding_standard: 'price_1UJOIDECBucDnUAXUCTMtj7G',
      standard: 'price_1UJOFmECBucDnUAXvW2O5PCT',
      hidden_gems: 'price_1UJOKQECBucDnUAXtteM7IZC',
      pin_7d: 'price_1UJOO3ECBucDnUAX6yhR6T3c'
    },
    successUrl: SUBMIT_PAGE + '?checkout=success',
    cancelUrl: SUBMIT_PAGE + '?checkout=cancel'
  };
})(typeof window !== 'undefined' ? window : globalThis);
