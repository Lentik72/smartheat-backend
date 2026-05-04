#!/usr/bin/env node
/**
 * Test harness for post_form (Droplet) multi-fuel extraction (heatingoil-qt3c).
 *
 * Droplet sites return the same HTML structure for every product — wcp_id=2 returns
 * oil prices, wcp_id=1 returns propane, wcp_id=3 returns kerosene, all with the
 * identical `tier_price_option` markup. So the existing extractFuelPrices() path
 * (which runs the secondary regex against the primary HTML) cannot work — it would
 * match the oil prices and label them propane.
 *
 * The fix: secondary fuels in post_form pattern declare their own `formBody`
 * override, and the scraper does a second POST per fuel.
 *
 * Test fixtures (mock POST endpoints):
 *
 *   /phillips
 *     wcp_id=2 → oil tier prices ($4.59 @ 150 gal)
 *     wcp_id=1 → propane tier prices ($2.49 @ 120 gal)
 *
 *   /morse
 *     wcp_id=2 → oil ($3.999 @ 150 gal)
 *     wcp_id=3 → kerosene ($5.499 @ 150 gal)
 *
 *   /phillips-propane-500   wcp_id=1 returns HTTP 500 (oil still works)
 *   /phillips-propane-sorry wcp_id=1 returns 200 with no tier prices ("Sorry")
 *
 * Exit code 0 on all pass, 1 on any fail.
 */

const http = require('http');
const assert = require('assert');
const { scrapeSupplierPriceOnce, extractFuelPrices } = require('../src/services/priceScraper');

let server;
let baseUrl;

// All four oil tiers are within the propane range [$1.50, $5.00]. This is
// intentional — it ensures the same-HTML-bleed guard test exercises the actual
// failure path. If the first match were e.g. $5.59 (out of propane range), the
// existing FUEL_PRICE_RANGES filter would mask the bug and the guard test
// would pass for the wrong reason. Real Phillips data ($5.59 @ 50 gal) would
// hide the bug; the test fixture must not.
const OIL_HTML = `<html><body>
  <div class="tier_price_option" data-gal="100">4.59</div>
  <div class="tier_price_option" data-gal="150">4.59</div>
  <div class="tier_price_option" data-gal="300">4.54</div>
</body></html>`;

const PROPANE_HTML = `<html><body>
  <div class="tier_price_option" data-gal="48">4.34</div>
  <div class="tier_price_option" data-gal="60">3.19</div>
  <div class="tier_price_option" data-gal="120">2.49</div>
  <div class="tier_price_option" data-gal="300">2.19</div>
  <div class="tier_price_option" data-gal="500">1.99</div>
</body></html>`;

const MORSE_OIL_HTML = `<html><body>
  <div class="tier_price_option" data-gal="100">4.299</div>
  <div class="tier_price_option" data-gal="150">3.999</div>
</body></html>`;

const MORSE_KERO_HTML = `<html><body>
  <div class="tier_price_option" data-gal="100">5.799</div>
  <div class="tier_price_option" data-gal="150">5.499</div>
</body></html>`;

const SORRY_HTML = `<html><body><p>Sorry, that fuel is not available in your area.</p></body></html>`;

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

function startMockServer() {
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const wcp = params.get('wcp_id');

      res.setHeader('Content-Type', 'text/html');

      if (req.url === '/phillips') {
        if (wcp === '2') return res.end(OIL_HTML);
        if (wcp === '1') return res.end(PROPANE_HTML);
        res.statusCode = 400; return res.end('bad wcp_id');
      }
      if (req.url === '/morse') {
        if (wcp === '2') return res.end(MORSE_OIL_HTML);
        if (wcp === '3') return res.end(MORSE_KERO_HTML);
        res.statusCode = 400; return res.end('bad wcp_id');
      }
      if (req.url === '/phillips-propane-500') {
        if (wcp === '2') return res.end(OIL_HTML);
        if (wcp === '1') { res.statusCode = 500; return res.end('server error'); }
        res.statusCode = 400; return res.end('bad wcp_id');
      }
      if (req.url === '/phillips-propane-sorry') {
        if (wcp === '2') return res.end(OIL_HTML);
        if (wcp === '1') return res.end(SORRY_HTML);
        res.statusCode = 400; return res.end('bad wcp_id');
      }

      res.statusCode = 404;
      res.end('not found');
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function stopMockServer() {
  return new Promise((r) => server.close(r));
}

const fakeSupplier = (name) => ({ id: `test-${name}`, name, website: `http://127.0.0.1/${name}` });

const TIER_REGEX = 'tier_price_option" data-gal="\\d+">(\\d+\\.\\d+)';

const cfgPhillipsOilOnly = () => ({
  enabled: true,
  pattern: 'post_form',
  hostGroup: 'droplet',
  lookupUrl: `${baseUrl}/phillips`,
  formBody: { wcp_id: '2', zip_code: '06712' },
  priceRegex: TIER_REGEX,
});

const cfgPhillipsMultifuel = () => ({
  enabled: true,
  pattern: 'post_form',
  hostGroup: 'droplet',
  lookupUrl: `${baseUrl}/phillips`,
  formBody: { wcp_id: '2', zip_code: '06712' },
  priceRegex: TIER_REGEX,
  fuels: {
    propane: {
      enabled: true,
      formBody: { wcp_id: '1' },
      priceRegex: TIER_REGEX,
    },
  },
});

const cfgMorseMultifuel = () => ({
  enabled: true,
  pattern: 'post_form',
  hostGroup: 'droplet',
  lookupUrl: `${baseUrl}/morse`,
  formBody: { wcp_id: '2', zip_code: '12168' },
  priceRegex: TIER_REGEX,
  fuels: {
    kerosene: {
      enabled: true,
      formBody: { wcp_id: '3' },
      priceRegex: TIER_REGEX,
    },
  },
});

const cfgPhillipsPropane500 = () => ({
  ...cfgPhillipsMultifuel(),
  lookupUrl: `${baseUrl}/phillips-propane-500`,
});

const cfgPhillipsPropaneSorry = () => ({
  ...cfgPhillipsMultifuel(),
  lookupUrl: `${baseUrl}/phillips-propane-sorry`,
});

async function run() {
  await startMockServer();
  let failures = 0;

  async function run1(label, supplier, cfg, expect) {
    try {
      const r = await scrapeSupplierPriceOnce(supplier, cfg);
      await expect(r);
      console.log(`  PASS  ${label}`);
    } catch (e) {
      failures += 1;
      console.log(`  FAIL  ${label}`);
      console.log(`        ${e.message}`);
    }
  }

  console.log('\nTEST: post_form (Droplet) multi-fuel extraction\n');

  // Backward-compat baseline: oil-only post_form must keep working unchanged.
  await run1('backcompat: post_form oil-only — fuelPrices is empty array, primary unchanged',
    fakeSupplier('phillips-oil-only'), cfgPhillipsOilOnly(), (r) => {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.pricePerGallon, 4.54); // lowest tier (post_form sorts ascending)
      assert.strictEqual(r.fuelType, 'heating_oil');
      assert.deepStrictEqual(r.fuelPrices, []);
    });

  // Same-HTML-bleed regression guard: when fuels.propane has formBody, extractFuelPrices
  // must NOT run propane's regex against the oil HTML (it would match and produce a
  // bogus propane price equal to the oil price).
  await run1('extractFuelPrices skips fuels.<x> entries that declare formBody (same-HTML-bleed guard)',
    fakeSupplier('bleed-guard'), null, () => {
      const cfg = cfgPhillipsMultifuel();
      const result = extractFuelPrices(OIL_HTML, cfg);
      const propane = result.find((f) => f.fuelType === 'propane');
      assert.strictEqual(propane, undefined,
        'propane must not be extracted from oil HTML when fuels.propane.formBody is set');
    });

  // Happy path #1: Phillips oil + propane via two POSTs.
  await run1('phillips: oil (wcp_id=2) + propane (wcp_id=1) both extract from separate POSTs',
    fakeSupplier('phillips'), cfgPhillipsMultifuel(), (r) => {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.pricePerGallon, 4.54);
      assert.strictEqual(r.fuelType, 'heating_oil');
      assert.ok(Array.isArray(r.fuelPrices));
      const propane = r.fuelPrices.find((f) => f.fuelType === 'propane');
      assert.ok(propane, 'propane must be present in fuelPrices');
      assert.strictEqual(propane.price, 1.99); // lowest tier (sorted ascending)
    });

  // Happy path #2: Morse oil + kerosene — different fuel, same architecture.
  await run1('morse: oil (wcp_id=2) + kerosene (wcp_id=3) both extract from separate POSTs',
    fakeSupplier('morse'), cfgMorseMultifuel(), (r) => {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.pricePerGallon, 3.999);
      const kero = r.fuelPrices.find((f) => f.fuelType === 'kerosene');
      assert.ok(kero, 'kerosene must be present');
      assert.strictEqual(kero.price, 5.499);
    });

  // CRITICAL regression guard #1: secondary POST 500 must not flip primary success.
  await run1('secondary HTTP 500: primary oil still succeeds, no dropletFailureType, propane absent',
    fakeSupplier('phillips-500'), cfgPhillipsPropane500(), (r) => {
      assert.strictEqual(r.success, true, 'primary must remain successful');
      assert.strictEqual(r.pricePerGallon, 4.54);
      assert.strictEqual(r.dropletFailureType, undefined,
        'dropletFailureType must NOT be set — secondary failure does not feed circuit breaker');
      assert.strictEqual(r.retryable, undefined,
        'retryable must NOT be set on a successful primary scrape');
      const propane = (r.fuelPrices || []).find((f) => f.fuelType === 'propane');
      assert.strictEqual(propane, undefined, 'failed propane must be absent, not zero/null');
    });

  // CRITICAL regression guard #2: secondary parse miss ("Sorry" page) — same isolation.
  await run1('secondary parse miss: primary oil still succeeds, propane absent, no failure flags',
    fakeSupplier('phillips-sorry'), cfgPhillipsPropaneSorry(), (r) => {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.pricePerGallon, 4.54);
      assert.strictEqual(r.dropletFailureType, undefined);
      const propane = (r.fuelPrices || []).find((f) => f.fuelType === 'propane');
      assert.strictEqual(propane, undefined);
    });

  await stopMockServer();
  if (failures > 0) {
    console.log(`\n${failures} FAILURE(S)\n`);
    process.exit(1);
  }
  runStaticGuard();
  console.log('\nAll tests pass.\n');
}

// Static guard: any post_form supplier that declares fuels.<fuel>.formBody must also
// declare fuels.<fuel>.priceRegex. Without the regex, the secondary POST has nothing
// to extract from. A config with one but not the other is a bug.
function runStaticGuard() {
  const cfg = require('../src/data/scrape-config.json');
  const bad = [];
  for (const [domain, entry] of Object.entries(cfg)) {
    if (!entry || typeof entry !== 'object' || entry.pattern !== 'post_form') continue;
    if (!entry.fuels) continue;
    for (const [fuelType, f] of Object.entries(entry.fuels)) {
      const hasForm = !!f.formBody;
      const hasRegex = !!f.priceRegex;
      if (hasForm && !hasRegex) {
        bad.push(`${domain} fuels.${fuelType}: formBody set but priceRegex missing`);
      }
    }
  }
  if (bad.length) {
    console.log('\nSTATIC GUARD FAIL:\n  ' + bad.join('\n  ') + '\n');
    process.exit(1);
  }
  console.log('  PASS  static guard: post_form fuels.*.formBody implies priceRegex');
}

run().catch((e) => { console.error(e); process.exit(1); });
