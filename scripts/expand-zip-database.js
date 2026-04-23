#!/usr/bin/env node
/**
 * Expand zip-database.json by resolving ZIPs referenced in scrape-config.json
 * that aren't currently in our database.
 *
 * Strategy:
 *  - Identify unresolved ZIPs from supplier coverage.
 *  - Filter to those that have a Census ZCTA (real residential ZIPs).
 *  - For each, fetch city/state/lat/lng from Zippopotamus + county from Census.
 *  - Add-only merge: never overwrite existing entries.
 *
 * Output:
 *  - Default writes preview to src/data/zip-database.expanded.json + summary.
 *  - --write swaps it into src/data/zip-database.json.
 *  - --limit N processes only first N (debug).
 *
 * Usage:
 *   node scripts/expand-zip-database.js                    # preview only
 *   node scripts/expand-zip-database.js --write            # apply
 *   node scripts/expand-zip-database.js --limit 10         # quick test
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const ZIP_DB_FILE = path.join(DATA_DIR, 'zip-database.json');
const PREVIEW_FILE = path.join(DATA_DIR, 'zip-database.expanded.json');
const SCRAPE_CONFIG = path.join(DATA_DIR, 'scrape-config.json');
const ZCTA_FILE = path.join('/tmp', 'zcta_county.txt');
const ZCTA_URL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt';

const WRITE = process.argv.includes('--write');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX > -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;

// --state XX mode: enumerate all Census ZCTAs for a state instead of pulling
// unresolved ZIPs from scrape-config. Requires 2-letter state code.
const STATE_IDX = process.argv.indexOf('--state');
const STATE = STATE_IDX > -1 ? (process.argv[STATE_IDX + 1] || '').toUpperCase() : null;

// NIST state FIPS codes (first 2 chars of GEOID_COUNTY_20 in the Census ZCTA file).
// No existing FIPS lookup in the repo — hardcoded inline.
const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09',
  DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17',
  IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24',
  MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
  OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
  TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
  WI: '55', WY: '56'
};

if (STATE && !STATE_FIPS[STATE]) {
  console.error(`ERROR: --state ${STATE} is not a recognized 2-letter US state code.`);
  console.error(`Valid codes: ${Object.keys(STATE_FIPS).sort().join(', ')}`);
  process.exit(1);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 404) { resolve(null); return; }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

async function loadZctaToCounty() {
  if (!fs.existsSync(ZCTA_FILE)) {
    console.log(`Downloading Census ZCTA file → ${ZCTA_FILE}...`);
    await downloadFile(ZCTA_URL, ZCTA_FILE);
  }
  const lines = fs.readFileSync(ZCTA_FILE, 'utf8').split('\n');
  // Multi-county ZCTAs: keep the row with largest AREALAND_PART
  const map = {};
  for (const line of lines.slice(1)) {
    const parts = line.split('|');
    if (!parts[1] || !parts[1].match(/^[0-9]{5}$/)) continue;
    const zip = parts[1];
    const countyName = (parts[10] || '').replace(/ County$/, '').trim();
    const areaPart = parseInt(parts[16] || '0', 10);
    if (!map[zip] || areaPart > map[zip].areaPart) {
      map[zip] = { county: countyName, areaPart };
    }
  }
  return map;
}

async function fetchZippopotam(zip) {
  const url = `https://api.zippopotam.us/us/${zip}`;
  const body = await fetchUrl(url);
  if (!body) return null;
  try {
    const json = JSON.parse(body);
    if (!json.places || !json.places.length) return null;
    const p = json.places[0];
    const lat = parseFloat(p.latitude);
    const lng = parseFloat(p.longitude);
    // Guard against malformed coords — prevents silent null injection
    // that would violate the non-null lat/lng invariant
    if (isNaN(lat) || isNaN(lng)) return null;
    return {
      city: p['place name'],
      state: p['state abbreviation'],
      lat,
      lng
    };
  } catch { return null; }
}

function unresolvedZips(zipDb, scrapeConfig) {
  const known = new Set(Object.keys(zipDb));
  const unresolved = new Set();
  const cfg = scrapeConfig.suppliers || scrapeConfig;
  const arr = Array.isArray(cfg) ? cfg : Object.values(cfg);
  for (const e of arr) {
    if (e && e.postalCodesServed) {
      for (const z of e.postalCodesServed) if (!known.has(z)) unresolved.add(z);
    }
  }
  return [...unresolved].sort();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log(`Loading current data...`);
  const zipDb = JSON.parse(fs.readFileSync(ZIP_DB_FILE, 'utf8'));
  const scrapeConfig = JSON.parse(fs.readFileSync(SCRAPE_CONFIG, 'utf8'));
  const zctaMap = await loadZctaToCounty();

  const allUnresolved = unresolvedZips(zipDb, scrapeConfig);
  const fixable = allUnresolved.filter(z => zctaMap[z]);
  const skipped = allUnresolved.filter(z => !zctaMap[z]);

  console.log(`\nUnresolved total: ${allUnresolved.length}`);
  console.log(`  fixable (has ZCTA, will fetch): ${fixable.length}`);
  console.log(`  skipped (no ZCTA, PO-box/stale): ${skipped.length}`);

  const targets = fixable.slice(0, LIMIT);
  console.log(`\nFetching Zippopotamus for ${targets.length} ZIPs (~${Math.ceil(targets.length * 0.15)}s)...\n`);

  const additions = {};
  const failures = [];
  for (let i = 0; i < targets.length; i++) {
    const zip = targets[i];
    const data = await fetchZippopotam(zip);
    if (!data) {
      failures.push(zip);
      console.log(`  [${i + 1}/${targets.length}] ${zip} — Zippopotamus 404`);
      continue;
    }
    const county = zctaMap[zip].county;
    additions[zip] = { city: data.city, county, state: data.state, lat: data.lat, lng: data.lng };
    console.log(`  [${i + 1}/${targets.length}] ${zip} → ${data.city}, ${county}, ${data.state}`);
    await sleep(120); // polite rate limit
  }

  console.log(`\n=== Summary ===`);
  console.log(`Resolved: ${Object.keys(additions).length}`);
  console.log(`Failures: ${failures.length}${failures.length ? ' → ' + failures.join(', ') : ''}`);
  console.log(`Skipped (no ZCTA): ${skipped.length}`);

  // Spot-check sample
  const sampleZips = Object.keys(additions).slice(0, 5);
  if (sampleZips.length) {
    console.log(`\nSample additions (first 5):`);
    for (const z of sampleZips) console.log(`  ${z}: ${JSON.stringify(additions[z])}`);
  }

  // Add-only merge
  let overwriteCount = 0;
  for (const z of Object.keys(additions)) {
    if (zipDb[z]) overwriteCount++;
  }
  if (overwriteCount > 0) {
    console.error(`\nERROR: ${overwriteCount} additions would overwrite existing entries — aborting (add-only invariant violated).`);
    process.exit(1);
  }

  const merged = { ...zipDb, ...additions };
  // Sort keys for deterministic diff
  const sorted = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];

  if (WRITE) {
    fs.writeFileSync(ZIP_DB_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    console.log(`\n✅ Wrote ${ZIP_DB_FILE} — ${Object.keys(zipDb).length} → ${Object.keys(sorted).length} entries.`);
    if (fs.existsSync(PREVIEW_FILE)) fs.unlinkSync(PREVIEW_FILE);
  } else {
    fs.writeFileSync(PREVIEW_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    console.log(`\n📋 Preview written: ${PREVIEW_FILE} (${Object.keys(zipDb).length} → ${Object.keys(sorted).length} entries)`);
    console.log(`   Inspect, then re-run with --write to apply.`);
  }
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
