/**
 * Stay or Stray — Submit a Place notify / form endpoint (browser)
 *
 * formEndpoint: leave empty (or a placeholder) until a real intake URL exists.
 * Empty/placeholder → client downloads the photo + JSON and opens mailto for text fields
 * (user must attach the downloaded photo). Real URL → FormData POST with the image.
 *
 * stripePk: TEST publishable key only until BoOnE pastes Price IDs (checkout incomplete).
 * Do not invent price_… IDs here.
 */
(function (global) {
  'use strict';
  global.SOS_SUBMIT = {
    formEndpoint: '',
    notifyEmail: 'xrhgrokbot@outlook.com',
    stripePk: 'pk_test_51UGihKECBucDnUAX0e6Xh1axthNJeqBRHCWfYJICDmhEFcq3lVloEHSAXuZ08tupCNfWhVdzl1lgBSmygePveOaZ00TdEmGYqR'
  };
})(typeof window !== 'undefined' ? window : globalThis);
