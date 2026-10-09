/**
 * Spot and Travel — Submit a Place config (browser). No secret keys here, ever.
 *
 * Flow: Pay → FormData POST (with photo + submission_ref) to Basin → redirect to the
 * matching Stripe Payment Link with ?client_reference_id=<ref>&prefilled_email=<email>.
 * Payment Links use payment_intent_data.capture_method=manual: the card is only
 * AUTHORIZED (held) at checkout. BoOnE captures it after approving the listing, or
 * cancels the hold if rejected (no charge). Uncaptured holds expire after ~7 days.
 * See docs/checkout/APPROVE-OR-REJECT.md and docs/checkout/GO-LIVE.md.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │ checkoutMode: 'test' → Stripe TEST links (card 4242…, no money) │
 * │               'live' → real charges (fill paymentLinks.live!)   │
 * └──────────────────────────────────────────────────────────────┘
 * If the selected mode has no link for a SKU, the page records the submission and
 * tells the buyer we'll email a payment link (it never charges without a link).
 *
 * Basin intake (BoOnE trial — files allowed). Former Formspree endpoint is retired.
 */
(function (global) {
  'use strict';
  var SUBMIT_PAGE = 'https://stayorstray.github.io/website/pages/submit-a-place.html';
  global.SOS_SUBMIT = {
    formEndpoint: 'https://usebasin.com/f/22787259725b',
    notifyEmail: 'xrhgrokbot@outlook.com',

    checkoutMode: 'test',

    // Keys: <sku> or <sku>_pin (7-day pin add-on included). Stripe account acct_1UGihKECBucDnUAX.
    paymentLinks: {
      test: {
        founding_standard: 'https://buy.stripe.com/test_8x28wP6GPbeJ5dm6iq0Jq00', // plink_1UOWZkECBucDnUAX3Z0vqUNS
        founding_standard_pin: 'https://buy.stripe.com/test_eVqeVd7KTaaF6hq7mu0Jq01', // plink_1UOWZlECBucDnUAXayz02kKO
        standard: 'https://buy.stripe.com/test_eVq4gzghpciN0X6dKS0Jq02', // plink_1UOWZlECBucDnUAXI36xTLd5
        standard_pin: 'https://buy.stripe.com/test_dRm4gz1mvaaFdJSfT00Jq03', // plink_1UOWZlECBucDnUAXdyOJ0wVJ
        hidden_gems: 'https://buy.stripe.com/test_cNiaEXghpaaF6hqdKS0Jq04', // plink_1UOWZmECBucDnUAX3Pl6QvdR
        hidden_gems_pin: 'https://buy.stripe.com/test_8x27sL9T15Up49iayG0Jq05' // plink_1UOWZmECBucDnUAXx7JNRgwn
      },
      live: {
        // Fill in after creating the 6 LIVE manual-capture links (docs/checkout/GO-LIVE.md).
        founding_standard: '',
        founding_standard_pin: '',
        standard: '',
        standard_pin: '',
        hidden_gems: '',
        hidden_gems_pin: ''
      }
    },

    // Reference only (the Payment Links already contain these prices).
    prices: {
      test: {
        founding_standard: 'price_1UOWZiECBucDnUAX920F4abE', // $39.99
        standard: 'price_1UOWZiECBucDnUAXLlEu22tw', // $49.99
        hidden_gems: 'price_1UOWZjECBucDnUAXTtFhIcPs', // $99.99
        pin_7d: 'price_1UOWZkECBucDnUAXY20YC3jr' // $39.99
      },
      live: {
        // Existing LIVE-mode prices (BoOnE prices.csv 2026-09-24) — not usable in test mode.
        founding_standard: 'price_1UJOIDECBucDnUAXUCTMtj7G',
        standard: 'price_1UJOFmECBucDnUAXvW2O5PCT',
        hidden_gems: 'price_1UJOKQECBucDnUAXtteM7IZC',
        pin_7d: 'price_1UJOO3ECBucDnUAX6yhR6T3c'
      }
    },

    // Payment Links redirect here after a completed checkout (set on each link in Stripe).
    successUrl: SUBMIT_PAGE + '?checkout=success',
    cancelUrl: SUBMIT_PAGE + '?checkout=cancel'
  };
})(typeof window !== 'undefined' ? window : globalThis);
