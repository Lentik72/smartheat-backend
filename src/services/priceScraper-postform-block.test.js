// src/services/priceScraper-postform-block.test.js
//
// Regression test for the post_form (Droplet) block-text guard.
//
// Bug: the /captcha|blocked|rate.limit/i guard fired BEFORE price extraction,
// so a valid price response that merely contains a reCAPTCHA <script> (the word
// "captcha") was wrongly rejected as a block. Real example: marstellaroilconcrete.com,
// tolinosfuel.com, cashoilco.com — all return the price AND a reCAPTCHA script.
//
// Fix: extract the price first; only classify as a block when NO price was found.
//
// Run: node src/services/priceScraper-postform-block.test.js

const { scrapeSupplierPriceOnce } = require('./priceScraper');

let passed = 0, failed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const no = (l, d) => { failed++; console.error(`  ✗ ${l} — ${d}`); };

const CONFIG = {
  enabled: true, pattern: 'post_form', pricePath: '/get-price/',
  formBody: { wcp_id: '2', zip_code: '01234' },
  priceRegex: 'tier_price_option"[^>]*data-gal="[0-9]+"[^>]*>([0-9]+\\.[0-9]{2,3})',
  hostGroup: 'droplet',
};
const SUP = { id: 't', name: 'test', website: 'https://example.com' };
const mockFetch = (html) => { global.fetch = async () => ({ ok: true, status: 200, text: async () => html }); };

(async () => {
  // 1. Price present + reCAPTCHA script -> SUCCESS (the false-positive fix)
  mockFetch('<span class="tier_price_option" data-gal="150">4.59</span>\n<script src="https://www.google.com/recaptcha/api.js"></script>');
  let r = await scrapeSupplierPriceOnce(SUP, CONFIG);
  if (r.success === true && Math.abs(r.pricePerGallon - 4.59) < 0.001) ok('price + reCAPTCHA script -> success ($4.59)');
  else no('price + reCAPTCHA script -> success', JSON.stringify({ success: r.success, price: r.pricePerGallon, error: r.error }));

  // 2. Block text, NO price -> block classification preserved (for the circuit breaker)
  mockFetch('<html>Access denied. Please complete the captcha to continue.</html>');
  r = await scrapeSupplierPriceOnce(SUP, CONFIG);
  if (r.success === false && r.dropletFailureType === 'block') ok('block text + no price -> dropletFailureType=block');
  else no('block text + no price -> block', JSON.stringify({ success: r.success, ft: r.dropletFailureType, error: r.error }));

  // 3. No price, no block text -> parse failure (unchanged)
  mockFetch('<html><body>Welcome. No pricing on this page.</body></html>');
  r = await scrapeSupplierPriceOnce(SUP, CONFIG);
  if (r.success === false && r.dropletFailureType === 'parse') ok('no price, no block text -> dropletFailureType=parse');
  else no('no price, no block text -> parse', JSON.stringify({ success: r.success, ft: r.dropletFailureType, error: r.error }));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
