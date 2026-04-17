#!/usr/bin/env node
/**
 * Test harness for json_api multi-fuel extraction (V2.15.0).
 *
 * Runs a local HTTP mock server that replies with Supabase-style JSON,
 * then calls scrapeSupplierPriceOnce (exported in V2.15.0 for testability)
 * with three fixture configs:
 *
 *   1. BACKCOMPAT — existing json_api shape (text-blob + regex):
 *      Response body is a text string containing two prices (heating + kerosene).
 *      Must extract heating oil as primary, kerosene via extractFuelPrices regex.
 *
 *   2. NEW-SHAPE — Fegley-style, heating oil only:
 *      Response is a JSON array, jsonPath indexes into it.
 *      Must extract heating oil primary, no kerosene (no fuels.* configured).
 *
 *   3. NEW-SHAPE-MULTIFUEL — Fegley-style, heating + kerosene:
 *      Primary fuel (oil) via apiUrl + jsonPath.
 *      Secondary fuel (kerosene) via fuels.kerosene.apiUrl + fuels.kerosene.jsonPath — a separate HTTP call.
 *      Must extract both.
 *
 * Exit code 0 on all pass, 1 on any fail.
 */

const http = require('http');
const assert = require('assert');
const { scrapeSupplierPriceOnce } = require('../src/services/priceScraper');

// ---- Mock server: different paths return different shapes ----
let server;
let baseUrl;

function startMockServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/phd-banner')) {
        // Text blob simulating existing PHD marquee banner
        res.end(JSON.stringify({
          data_object: [{ content: '#2 $3.499 Kero $4.199 Off-Road $4.299' }]
        }));
      } else if (req.url.startsWith('/fegley-oil')) {
        res.end(JSON.stringify([{ price_per_gallon: 4.299, min_gallons: 150 }]));
      } else if (req.url.startsWith('/fegley-kerosene')) {
        res.end(JSON.stringify([{ price_per_gallon: 4.999, min_gallons: 150 }]));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found' }));
      }
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

// ---- Fixtures ----
const fakeSupplier = (name) => ({ id: `test-${name}`, name, website: `http://127.0.0.1/${name}` });

const cfgBackcompat = () => ({
  enabled: true,
  pattern: 'json_api',
  apiUrl: `${baseUrl}/phd-banner`,
  apiMethod: 'GET',
  jsonPath: 'data_object.0.content',
  priceRegex: '#2 \\$([0-9]+\\.[0-9]{2,3})',
  fuels: {
    kerosene: { enabled: true, priceRegex: 'Kero \\$([0-9]+\\.[0-9]{2,3})' }
  }
});

const cfgFegleyOilOnly = () => ({
  enabled: true,
  pattern: 'json_api',
  apiUrl: `${baseUrl}/fegley-oil`,
  apiMethod: 'GET',
  apiHeaders: { apikey: 'test-anon', Authorization: 'Bearer test-anon' },
  jsonPath: '0.price_per_gallon'
});

const cfgFegleyMultifuel = () => ({
  enabled: true,
  pattern: 'json_api',
  apiUrl: `${baseUrl}/fegley-oil`,
  apiMethod: 'GET',
  apiHeaders: { apikey: 'test-anon', Authorization: 'Bearer test-anon' },
  jsonPath: '0.price_per_gallon',
  fuels: {
    kerosene: {
      enabled: true,
      apiUrl: `${baseUrl}/fegley-kerosene`,
      jsonPath: '0.price_per_gallon'
    }
  }
});

// ---- Run ----
async function run() {
  await startMockServer();
  let failures = 0;

  async function run1(label, supplier, cfg, expect) {
    try {
      const r = await scrapeSupplierPriceOnce(supplier, cfg);
      expect(r);
      console.log(`  PASS  ${label}`);
    } catch (e) {
      failures += 1;
      console.log(`  FAIL  ${label}`);
      console.log(`        ${e.message}`);
    }
  }

  console.log('\nTEST: json_api multi-fuel extraction\n');

  await run1('backcompat: text-blob regex still extracts both fuels',
    fakeSupplier('backcompat'), cfgBackcompat(), (r) => {
      assert.strictEqual(r.success, true, 'primary should succeed');
      assert.strictEqual(r.pricePerGallon, 3.499);
      assert.ok(Array.isArray(r.fuelPrices));
      const kero = r.fuelPrices.find(f => f.fuelType === 'kerosene');
      assert.ok(kero, 'kerosene should be in fuelPrices');
      assert.strictEqual(kero.price, 4.199);
    });

  await run1('new-shape: json array + jsonPath, oil only',
    fakeSupplier('fegley-oil'), cfgFegleyOilOnly(), (r) => {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.pricePerGallon, 4.299);
      assert.deepStrictEqual(r.fuelPrices, []);
    });

  await run1('new-shape: multi-fuel via fuels.*.apiUrl + jsonPath',
    fakeSupplier('fegley-multi'), cfgFegleyMultifuel(), (r) => {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.pricePerGallon, 4.299);
      const kero = r.fuelPrices.find(f => f.fuelType === 'kerosene');
      assert.ok(kero, 'kerosene must be present');
      assert.strictEqual(kero.price, 4.999);
    });

  await stopMockServer();
  if (failures > 0) {
    console.log(`\n${failures} FAILURE(S)\n`);
    process.exit(1);
  }
  runStaticGuard();
  console.log('\nAll tests pass.\n');
}

// Static guard: ensure no legacy json_api config accidentally sets fuels.*.apiUrl
// without also keeping priceRegex for backward compat. New configs must define both
// apiUrl AND jsonPath — the scraper requires it. A config with only one is a bug.
// TODO (bead heatingoil-zhpo): when SupplierPrice.fuelType ENUM is extended beyond
// heating_oil+kerosene, tighten this guard to also reject fuelType values not in
// SupplierPrice.rawAttributes.fuelType.values — today, an unknown fuelType would
// pass the guard and fail silently at the DB write.
function runStaticGuard() {
  const cfg = require('../src/data/scrape-config.json');
  const bad = [];
  for (const [domain, entry] of Object.entries(cfg)) {
    if (!entry || typeof entry !== 'object' || entry.pattern !== 'json_api') continue;
    if (!entry.fuels) continue;
    for (const [fuelType, f] of Object.entries(entry.fuels)) {
      const hasUrl = !!f.apiUrl;
      const hasPath = !!f.jsonPath;
      if (hasUrl !== hasPath) {
        bad.push(`${domain} fuels.${fuelType}: apiUrl=${hasUrl} jsonPath=${hasPath} (both or neither)`);
      }
    }
  }
  if (bad.length) {
    console.log('\nSTATIC GUARD FAIL:\n  ' + bad.join('\n  ') + '\n');
    process.exit(1);
  }
  console.log('  PASS  static guard: no partial fuels.*.apiUrl configs');
}

run().catch((e) => { console.error(e); process.exit(1); });
