#!/usr/bin/env node
/**
 * Test harness for `primaryFuelOptional` config flag.
 *
 * When set on a scrape-config entry, primary heating-oil regex no-match must
 * NOT increment failure counters as long as at least one fuels.* secondary
 * regex succeeded. Buxton Oil (NH) is the first user — they publish only a
 * propane Cash Price; heating oil and kerosene cards say "Call our office".
 *
 * Mock server returns Buxton-shaped HTML at /buxton (3 fuel cards, only
 * propane has a price).
 *
 * Tests:
 *   1. extractFuelPrices: strict ">Propane</h3>...$X" regex matches the propane card
 *   2. extractFuelPrices: strict ">Heating Oil</h3>...$X" + ">Kerosene</h3>...$X" regexes
 *      correctly miss when "Call our office for pricing" is present
 *   3. scrapeSupplierPriceOnce against Buxton-shaped config: returns success:false
 *      (primary regex no-match) but fuelPrices contains exactly one propane entry
 *   4. shouldSkipFailureCounter pure helper:
 *      - flag=true + fuelPrices=[{...}] → true (skip recordFailure, call recordSuccess)
 *      - flag=true + fuelPrices=[] → false (still record failure)
 *      - flag=true + fuelPrices=undefined → false
 *      - flag=undefined + fuelPrices=[{...}] → false (default behavior preserved)
 *
 * Exit 0 on all pass, 1 on any fail.
 */

const http = require('http');
const assert = require('assert');
const { scrapeSupplierPriceOnce, extractFuelPrices } = require('../src/services/priceScraper');

let server;
let baseUrl;

// Buxton-shaped HTML: three fuel cards, only Propane has a price.
// Markup mirrors real buxtonoil.com structure (verified in-session 2026-05-07).
const BUXTON_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Buxton Oil</title></head>
<body>
<nav>Heating Oil • Kerosene • Propane</nav>
<div class="row">
  <div class="col">
    <div class="c-card pricing">
      <h3 class="h4 c-card_heading">Propane</h3>
      <div class="my-2"><p>Cash price of the day:<br>from <span class="c-card_price">&nbsp;$3.349&nbsp;</span> per gallon*</p></div>
    </div>
  </div>
  <div class="col">
    <div class="c-card pricing">
      <h3 class="h4 c-card_heading">Heating Oil</h3>
      <div class="my-1"><p>Call our office for pricing info and to place an order.</p></div>
      <a href="tel:603-679-5600">603-679-5600</a>
    </div>
  </div>
  <div class="col">
    <div class="c-card pricing">
      <h3 class="h4 c-card_heading">Kerosene</h3>
      <div class="my-1"><p>Call our office for pricing info and to place an order.</p></div>
    </div>
  </div>
</div>
</body></html>`;

function startMockServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      if (req.url === '/buxton' || req.url === '/buxton/') {
        return res.end(BUXTON_HTML);
      }
      res.statusCode = 404;
      res.end('not found');
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => server ? server.close(resolve) : resolve());
}

const HEATING_OIL_REGEX = '>Heating Oil</h3>[\\s\\S]{0,400}?\\$([0-9]+\\.[0-9]{2,3})';
const PROPANE_REGEX = '>Propane</h3>[\\s\\S]{0,400}?\\$([0-9]+\\.[0-9]{2,3})';
const KEROSENE_REGEX = '>Kerosene</h3>[\\s\\S]{0,400}?\\$([0-9]+\\.[0-9]{2,3})';

const fakeSupplier = (slug) => ({
  id: `00000000-0000-0000-0000-${slug.padEnd(12, '0').slice(0, 12)}`,
  name: `Test ${slug}`,
  website: `${baseUrl}/${slug}`,
  slug,
});

const cfgBuxton = () => ({
  enabled: true,
  primaryFuelOptional: true,
  pattern: 'direct',
  priceRegex: HEATING_OIL_REGEX,
  fuels: {
    propane: { enabled: true, priceRegex: PROPANE_REGEX },
    kerosene: { enabled: true, priceRegex: KEROSENE_REGEX },
  },
});

async function run() {
  await startMockServer();
  let failures = 0;

  async function run1(label, fn) {
    try {
      await fn();
      console.log(`  PASS  ${label}`);
    } catch (e) {
      failures += 1;
      console.log(`  FAIL  ${label}`);
      console.log(`        ${e.message}`);
    }
  }

  console.log('\nTEST: primaryFuelOptional flag\n');

  // 1. extractFuelPrices: strict propane regex matches the propane card
  await run1('extractFuelPrices: strict propane regex matches $3.349', () => {
    const result = extractFuelPrices(BUXTON_HTML, cfgBuxton());
    const propane = result.find((f) => f.fuelType === 'propane');
    assert.ok(propane, 'propane must be present in fuelPrices');
    assert.strictEqual(propane.price, 3.349);
  });

  // 2. extractFuelPrices: strict kerosene regex correctly misses (Call for pricing)
  await run1('extractFuelPrices: strict kerosene regex misses when "Call our office"', () => {
    const result = extractFuelPrices(BUXTON_HTML, cfgBuxton());
    const kerosene = result.find((f) => f.fuelType === 'kerosene');
    assert.strictEqual(kerosene, undefined, 'kerosene must be absent (no $ price on card)');
  });

  // 3. scrapeSupplierPriceOnce: primary fails (Heating Oil card has no $),
  //    propane succeeds independently. This is the Buxton production case.
  await run1('scrapeSupplierPriceOnce: primary fails, propane succeeds via fuelPrices', async () => {
    const r = await scrapeSupplierPriceOnce(fakeSupplier('buxton'), cfgBuxton());
    assert.strictEqual(r.success, false, 'primary heating-oil scrape must fail (no price on card)');
    assert.ok(Array.isArray(r.fuelPrices), 'fuelPrices must be an array');
    assert.strictEqual(r.fuelPrices.length, 1, 'exactly one secondary fuel price expected (propane)');
    assert.strictEqual(r.fuelPrices[0].fuelType, 'propane');
    assert.strictEqual(r.fuelPrices[0].price, 3.349);
  });

  // 4. shouldSkipFailureCounter pure helper — gate logic for the failure branch
  await run1('shouldSkipFailureCounter: flag=true + fuelPrices.length>0 → true', () => {
    const { shouldSkipFailureCounter } = require('../src/services/scrapeBackoff');
    assert.strictEqual(
      shouldSkipFailureCounter({ primaryFuelOptional: true }, { fuelPrices: [{ fuelType: 'propane', price: 3.349 }] }),
      true
    );
  });

  await run1('shouldSkipFailureCounter: flag=true + fuelPrices=[] → false', () => {
    const { shouldSkipFailureCounter } = require('../src/services/scrapeBackoff');
    assert.strictEqual(
      shouldSkipFailureCounter({ primaryFuelOptional: true }, { fuelPrices: [] }),
      false
    );
  });

  await run1('shouldSkipFailureCounter: flag=true + fuelPrices=undefined → false', () => {
    const { shouldSkipFailureCounter } = require('../src/services/scrapeBackoff');
    assert.strictEqual(
      shouldSkipFailureCounter({ primaryFuelOptional: true }, {}),
      false
    );
  });

  await run1('shouldSkipFailureCounter: flag=undefined + secondary succeeded → false (default behavior)', () => {
    const { shouldSkipFailureCounter } = require('../src/services/scrapeBackoff');
    assert.strictEqual(
      shouldSkipFailureCounter({}, { fuelPrices: [{ fuelType: 'propane', price: 3.349 }] }),
      false
    );
  });

  await run1('shouldSkipFailureCounter: null inputs → false', () => {
    const { shouldSkipFailureCounter } = require('../src/services/scrapeBackoff');
    assert.strictEqual(shouldSkipFailureCounter(null, null), false);
    assert.strictEqual(shouldSkipFailureCounter(null, { fuelPrices: [{}] }), false);
    assert.strictEqual(shouldSkipFailureCounter({ primaryFuelOptional: true }, null), false);
  });

  await stopMockServer();
  if (failures > 0) {
    console.log(`\n${failures} FAILURE(S)\n`);
    process.exit(1);
  }
  console.log('\nAll tests pass.\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
