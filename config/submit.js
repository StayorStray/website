/**
 * Stay or Stray — Submit a Place notify / form endpoint (browser)
 *
 * formEndpoint: leave empty (or a placeholder) until a real intake URL exists.
 * Empty/placeholder → client downloads the photo + JSON and opens mailto for text fields
 * (user must attach the downloaded photo). Real URL → FormData POST with the image.
 */
(function (global) {
  'use strict';
  global.SOS_SUBMIT = {
    formEndpoint: '',
    notifyEmail: 'xrhgrokbot@outlook.com'
  };
})(typeof window !== 'undefined' ? window : globalThis);
