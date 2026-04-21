#!/usr/bin/env node
/**
 * Refresh Energy Rates from EIA API v2
 *
 * Pulls latest residential electricity and natural gas prices by state
 * from the official EIA API and writes to src/data/ JSON files.
 *
 * Usage:
 *   node scripts/refresh-energy-rates.js                  # uses EIA_API_KEY env var
 *   EIA_API_KEY=xxx node scripts/refresh-energy-rates.js  # explicit key
 *   node scripts/refresh-energy-rates.js --dry-run        # preview without writing
 *
 * EIA API key: free at https://www.eia.gov/opendata/register.php
 * Falls back to DEMO_KEY (rate-limited to 30 req/hr).
 *
 * Scheduled monthly via cron in server.js (18th at 3:30 AM ET — after EIA's
 * mid-month publish window). Staleness warnings in energy-rates.js fire if
 * either: release date >90 days old, or data period hasn't advanced in 150 days.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const ELECTRIC_FILE = path.join(DATA_DIR, 'electricity-rates.json');
const GAS_FILE = path.join(DATA_DIR, 'gas-rates.json');

const API_KEY = process.env.EIA_API_KEY || 'DEMO_KEY';
const DRY_RUN = process.argv.includes('--dry-run');

// 2-letter state/territory codes we care about (50 states + DC)
const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]);

/**
 * HTTPS GET that returns parsed JSON.
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch latest residential electricity prices from EIA API v2.
 * Endpoint: /v2/electricity/retail-sales/data/
 * Returns cents/kWh by state for the most recent month.
 */
async function fetchElectricityRates() {
  const params = new URLSearchParams({
    api_key: API_KEY,
    frequency: 'monthly',
    'data[0]': 'price',
    'facets[sectorid][]': 'RES',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '65', // 51 states + ~11 regions + US total; grab extra to ensure all states
  });

  const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?${params}`;
  console.log('[electric] Fetching from EIA API...');
  const json = await fetchJSON(url);

  if (!json.response || !json.response.data || json.response.data.length === 0) {
    throw new Error('No electricity data returned from EIA API');
  }

  // Find the most recent period
  const latestPeriod = json.response.data[0].period;
  console.log(`[electric] Latest period: ${latestPeriod}`);

  // Filter to state-level entries for the latest period only
  const rates = {};
  let usTotal = null;

  for (const row of json.response.data) {
    if (row.period !== latestPeriod) continue;
    const id = row.stateid;
    const price = parseFloat(row.price);

    if (id === 'US') {
      usTotal = price / 100; // cents → dollars
    } else if (STATE_CODES.has(id) && !isNaN(price)) {
      rates[id] = Math.round((price / 100) * 10000) / 10000; // cents → $/kWh, 4 decimal places
    }
  }

  const stateCount = Object.keys(rates).length;
  console.log(`[electric] Found ${stateCount}/51 states for ${latestPeriod}`);

  if (stateCount < 45) {
    throw new Error(`Only ${stateCount} states found — expected at least 45. API may have changed.`);
  }

  return {
    source: 'EIA API v2 - Electricity Retail Sales (Residential)',
    sourceUrl: 'https://api.eia.gov/v2/electricity/retail-sales/data/',
    lastUpdated: `${latestPeriod}-01`,
    releaseDate: new Date().toISOString().slice(0, 10),
    unit: '$/kWh',
    sector: 'Residential',
    period: formatPeriod(latestPeriod),
    nationalAverage: usTotal ? Math.round(usTotal * 10000) / 10000 : null,
    rates,
  };
}

/**
 * Fetch latest residential natural gas prices from EIA API v2.
 * Endpoint: /v2/natural-gas/pri/sum/data/
 * Returns $/MCF by state, converted to $/therm (÷ 10.37).
 */
async function fetchGasRates() {
  const params = new URLSearchParams({
    api_key: API_KEY,
    frequency: 'monthly',
    'data[0]': 'value',
    'facets[process][]': 'PRS', // Residential
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '60',
  });

  const url = `https://api.eia.gov/v2/natural-gas/pri/sum/data/?${params}`;
  console.log('[gas] Fetching from EIA API...');
  const json = await fetchJSON(url);

  if (!json.response || !json.response.data || json.response.data.length === 0) {
    throw new Error('No gas data returned from EIA API');
  }

  // Find the most recent period
  const latestPeriod = json.response.data[0].period;
  console.log(`[gas] Latest period: ${latestPeriod}`);

  // duoarea format: "SNY" = state NY, "SCA" = state CA, "NUS" = national US
  const MCF_TO_THERMS = 10.37;
  const rates = {};
  let usTotal = null;

  for (const row of json.response.data) {
    if (row.period !== latestPeriod) continue;
    const area = row.duoarea;
    const value = parseFloat(row.value);

    if (isNaN(value)) continue;

    if (area === 'NUS') {
      usTotal = Math.round((value / MCF_TO_THERMS) * 10000) / 10000;
    } else if (area && area.startsWith('S') && area.length === 3) {
      const stateCode = area.substring(1);
      if (STATE_CODES.has(stateCode)) {
        rates[stateCode] = Math.round((value / MCF_TO_THERMS) * 10000) / 10000;
      }
    }
  }

  const stateCount = Object.keys(rates).length;
  console.log(`[gas] Found ${stateCount} states for ${latestPeriod}`);

  if (stateCount < 40) {
    throw new Error(`Only ${stateCount} states found — expected at least 40. API may have changed.`);
  }

  return {
    source: 'EIA API v2 - Natural Gas Prices (Residential)',
    sourceUrl: 'https://api.eia.gov/v2/natural-gas/pri/sum/data/',
    lastUpdated: `${latestPeriod}-01`,
    releaseDate: new Date().toISOString().slice(0, 10),
    unit: '$/therm',
    sector: 'Residential',
    period: formatPeriod(latestPeriod),
    conversionNote: 'Converted from $/MCF using 1 MCF = 10.37 therms',
    nationalAverage: usTotal,
    rates,
  };
}

function formatPeriod(yyyymm) {
  const [y, m] = yyyymm.split('-');
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function writeJSON(filePath, data) {
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, json, 'utf8');
  console.log(`  → Wrote ${filePath} (${Object.keys(data.rates).length} states)`);
}

async function refreshEnergyRates({ dryRun = DRY_RUN } = {}) {
  console.log(`\nRefreshing energy rates from EIA API v2`);
  console.log(`API key: ${API_KEY === 'DEMO_KEY' ? 'DEMO_KEY (rate-limited)' : '***' + API_KEY.slice(-4)}`);
  if (dryRun) console.log('DRY RUN — files will not be written\n');

  const [electric, gas] = await Promise.all([
    fetchElectricityRates(),
    fetchGasRates(),
  ]);

  console.log(`\nElectricity: ${electric.period}, ${Object.keys(electric.rates).length} states, US avg $${electric.nationalAverage}/kWh`);
  console.log(`Natural gas: ${gas.period}, ${Object.keys(gas.rates).length} states, US avg $${gas.nationalAverage}/therm`);

  if (!dryRun) {
    console.log('\nWriting files:');
    writeJSON(ELECTRIC_FILE, electric);
    writeJSON(GAS_FILE, gas);
    console.log('\nDone. Run fuel-config tests to verify: node src/data/fuel-config.test.js');
  } else {
    console.log('\nDry run complete. Use without --dry-run to write files.');
  }

  return {
    electric: { period: electric.period, states: Object.keys(electric.rates).length, nationalAverage: electric.nationalAverage },
    gas: { period: gas.period, states: Object.keys(gas.rates).length, nationalAverage: gas.nationalAverage }
  };
}

module.exports = { refreshEnergyRates };

if (require.main === module) {
  refreshEnergyRates().catch(err => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
}
