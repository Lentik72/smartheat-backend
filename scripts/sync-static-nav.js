#!/usr/bin/env node
/**
 * sync-static-nav.js — Build-time nav sync
 *
 * Reads canonical nav from getNavHTML() in county-data.js
 * Finds <!-- NAV_START --> / <!-- NAV_END --> markers in static HTML files
 * Replaces content between markers with correct nav for each file
 *
 * Usage:
 *   node scripts/sync-static-nav.js
 *   node scripts/sync-static-nav.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { getNavHTML, init } = require('./lib/county-data');

const WEBSITE_DIR = path.join(__dirname, '../website');
init(WEBSITE_DIR);

const dryRun = process.argv.includes('--dry-run');

// Map: relative path from website/ → { depth, activeLink }
// depth = number of directory levels from website root
const FILE_NAV_CONFIG = {
  'prices.html':        { depth: 0, activeLink: '/prices' },
  'for-suppliers.html': { depth: 0, activeLink: '/for-suppliers' },
  'support.html':       { depth: 0, activeLink: null },
  'privacy.html':       { depth: 0, activeLink: null },
  'terms.html':         { depth: 0, activeLink: null },
  'how-prices-work.html': { depth: 0, activeLink: null },
  '404.html':           { depth: 0, activeLink: null },
  'learn/index.html':   { depth: 1, activeLink: '/learn/' },
  // Learn articles are 1 level deep
  'learn/heating-oil-vs-heat-pump.html': { depth: 1, activeLink: '/learn/' },
  'learn/average-heating-bill.html':     { depth: 1, activeLink: '/learn/' },
  'learn/heating-oil-vs-natural-gas.html': { depth: 1, activeLink: '/learn/' },
  'learn/heating-oil-vs-propane.html':   { depth: 1, activeLink: '/learn/' },
  'tools/heating-cost-calculator.html':  { depth: 1, activeLink: null },
  'tools/blend-calculator.html':        { depth: 1, activeLink: null },
  'learn/kerosene-vs-heating-oil.html': { depth: 1, activeLink: '/learn/' },
};

const NAV_START = '<!-- NAV_START -->';
const NAV_END = '<!-- NAV_END -->';

let synced = 0;
let skipped = 0;
let warnings = 0;

for (const [relPath, config] of Object.entries(FILE_NAV_CONFIG)) {
  const fullPath = path.join(WEBSITE_DIR, relPath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${relPath} (skipping)`);
    warnings++;
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');

  const startIdx = content.indexOf(NAV_START);
  const endIdx = content.indexOf(NAV_END);

  if (startIdx === -1 || endIdx === -1) {
    console.log(`⚠️  No nav markers in ${relPath} (skipping)`);
    warnings++;
    continue;
  }

  const navHTML = getNavHTML(config.depth, config.activeLink);
  const before = content.slice(0, startIdx + NAV_START.length);
  const after = content.slice(endIdx);
  const newContent = before + '\n' + navHTML + '\n' + after;

  if (newContent === content) {
    skipped++;
    continue;
  }

  if (!dryRun) {
    fs.writeFileSync(fullPath, newContent, 'utf-8');
  }
  synced++;
  console.log(`✅ ${dryRun ? '[DRY RUN] ' : ''}Synced nav in ${relPath}`);
}

console.log(`\nNav sync complete: ${synced} synced, ${skipped} unchanged, ${warnings} warnings`);
