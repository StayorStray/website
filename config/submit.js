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
  var SUBMIT_PAGE = 'https://spotandtravel.com/pages/submit-a-place.html';
  global.SOS_SUBMIT = {
    formEndpoint: 'https://usebasin.com/f/22787259725b',
    notifyEmail: 'xrhgrokbot@outlook.com',

    checkoutMode: 'test',

    // Keys: <sku>, <sku>_pin (7-day pin, +$39.99) or <sku>_pin30 (30-day pin, +$99.00). Stripe account acct_1UGihKECBucDnUAX.
    paymentLinks: {
      test: {
        founding_standard: 'https://buy.stripe.com/test_8x28wP6GPbeJ5dm6iq0Jq00', // plink_1UOWZkECBucDnUAX3Z0vqUNS
        founding_standard_pin: 'https://buy.stripe.com/test_eVqeVd7KTaaF6hq7mu0Jq01', // plink_1UOWZlECBucDnUAXayz02kKO
        standard: 'https://buy.stripe.com/test_eVq4gzghpciN0X6dKS0Jq02', // plink_1UOWZlECBucDnUAXI36xTLd5
        standard_pin: 'https://buy.stripe.com/test_dRm4gz1mvaaFdJSfT00Jq03', // plink_1UOWZlECBucDnUAXdyOJ0wVJ
        hidden_gems: 'https://buy.stripe.com/test_cNiaEXghpaaF6hqdKS0Jq04', // plink_1UOWZmECBucDnUAX3Pl6QvdR
        hidden_gems_pin: 'https://buy.stripe.com/test_8x27sL9T15Up49iayG0Jq05', // plink_1UOWZmECBucDnUAXx7JNRgwn
        founding_standard_pin30: 'https://buy.stripe.com/test_9B6dR90ir96BbBKcGO0Jq06', // plink_1UOmdFECBucDnUAXcwDih6XR
        standard_pin30: 'https://buy.stripe.com/test_eVq7sL8OX82xeNW0Y60Jq07', // plink_1UOmdGECBucDnUAXNWqizu3S
        hidden_gems_pin30: 'https://buy.stripe.com/test_dRmdR91mv4Ql35e22a0Jq08', // plink_1UOmdHECBucDnUAXxIP5lXiu
        // AUTO-RENEW PREVIEW (branch auto-renew-preview only): same holds + setup_future_usage=off_session,
        // customer_creation=always, metadata renew=yes. Key: <sku>[_pin|_pin30]_renew.
        founding_standard_renew: 'https://buy.stripe.com/test_6oUfZh6GPciN35e6iq0Jq09', // plink_1UOmkiECBucDnUAXEGy94PfI
        founding_standard_pin_renew: 'https://buy.stripe.com/test_3cI00j8OX3Mh8py36e0Jq0a', // plink_1UOmkiECBucDnUAX3AjmvzJV
        founding_standard_pin30_renew: 'https://buy.stripe.com/test_aFa8wP2qz6YteNWbCK0Jq0b', // plink_1UOmkjECBucDnUAXCPcz0oEO
        standard_renew: 'https://buy.stripe.com/test_8x2fZhe9h2Id7lu5em0Jq0c', // plink_1UOmkjECBucDnUAXpFjhnmYU
        standard_pin_renew: 'https://buy.stripe.com/test_6oU7sLe9heqVfS09uC0Jq0d', // plink_1UOmkkECBucDnUAX4Crw5ha1
        standard_pin30_renew: 'https://buy.stripe.com/test_fZu5kD7KT1E9fS00Y60Jq0e', // plink_1UOmklECBucDnUAXheleo8NH
        hidden_gems_renew: 'https://buy.stripe.com/test_aFaaEX9T1fuZ35e0Y60Jq0f', // plink_1UOmklECBucDnUAX0OhQOV5T
        hidden_gems_pin_renew: 'https://buy.stripe.com/test_00w7sLfdl96B5dmeOW0Jq0g', // plink_1UOmkmECBucDnUAXe2FZbXkM
        hidden_gems_pin30_renew: 'https://buy.stripe.com/test_eVq28rc192IdcFOdKS0Jq0h' // plink_1UOmknECBucDnUAX0lehNUId
      },
      live: {
        // Fill in after creating the 6 LIVE manual-capture links (docs/checkout/GO-LIVE.md).
        founding_standard: '',
        founding_standard_pin: '',
        standard: '',
        standard_pin: '',
        hidden_gems: '',
        hidden_gems_pin: '',
        founding_standard_pin30: '',
        standard_pin30: '',
        hidden_gems_pin30: ''
      }
    },

    // Renewal terms shown next to the opt-in checkbox (preview). Recurring TEST prices used by the
    // billing Worker when a held payment is captured (workers/billing-preview).
    renewal: {
      enabled: { test: true, live: false },
      prices: {
        test: {
          standard_yearly: 'price_1UOmkIECBucDnUAX2anGInHt', // $49.99/yr (Founding + Standard renewals)
          hidden_gems_yearly: 'price_1UOmkUECBucDnUAXciJo91kd', // $99.99/yr
          pin_30d_monthly: 'price_1UOmkUECBucDnUAXy8frB35B' // $99/mo
        },
        live: {}
      }
    },

    // Reference only (the Payment Links already contain these prices).
    prices: {
      test: {
        founding_standard: 'price_1UOWZiECBucDnUAX920F4abE', // $39.99
        standard: 'price_1UOWZiECBucDnUAXLlEu22tw', // $49.99
        hidden_gems: 'price_1UOWZjECBucDnUAXTtFhIcPs', // $99.99
        pin_7d: 'price_1UOWZkECBucDnUAXY20YC3jr', // $39.99
        pin_30d: 'price_1UOmdFECBucDnUAXhAZ010V4' // $99.00
      },
      live: {
        // Existing LIVE-mode prices (BoOnE prices.csv 2026-09-24) — not usable in test mode.
        founding_standard: 'price_1UJOIDECBucDnUAXUCTMtj7G',
        standard: 'price_1UJOFmECBucDnUAXvW2O5PCT',
        hidden_gems: 'price_1UJOKQECBucDnUAXtteM7IZC',
        pin_7d: 'price_1UJOO3ECBucDnUAX6yhR6T3c',
        pin_30d: '' // create a LIVE $99.00 "Pin 30 days" price at go-live
      }
    },

    // Payment Links redirect here after a completed checkout (set on each link in Stripe).
    successUrl: SUBMIT_PAGE + '?checkout=success',
    cancelUrl: SUBMIT_PAGE + '?checkout=cancel'
  };
})(typeof window !== 'undefined' ? window : globalThis);
