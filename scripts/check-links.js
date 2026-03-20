#!/usr/bin/env node
/**
 * check-links.js — Internal link checker for generated pages
 *
 * Parses all <a href> in website/, verifies internal link targets exist.
 * Flags: broken links, orphaned pages (no inbound links).
 *
 * Usage:
 *   node scripts/check-links.js              # full check
 *   node scripts/check-links.js --json       # JSON output for automation
 *   node scripts/check-links.js --sample 100 # check random sample
 *
 * Exit codes: 0 = clean, 1 = broken links found
 */

const fs = require('fs');
const path = require('path');

const WEBSITE_DIR = path.join(__dirname, '..', 'website');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const sampleIdx = args.indexOf('--sample');
const sampleSize = sampleIdx !== -1 ? parseInt(args[sampleIdx + 1]) || 100 : 0;

// Collect all HTML files
function getHtmlFiles(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...getHtmlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return files;
}

// Build set of existing paths (normalized)
function buildFileIndex(files) {
  const index = new Set();
  for (const file of files) {
    // Add both the file path and the directory path (for index.html resolution)
    const rel = '/' + path.relative(WEBSITE_DIR, file).replace(/\\/g, '/');
    index.add(rel);
    // /prices/ny/index.html → also matches /prices/ny/ and /prices/ny
    if (rel.endsWith('/index.html')) {
      index.add(rel.replace('/index.html', '/'));
      index.add(rel.replace('/index.html', ''));
    }
  }
  return index;
}

// Extract internal links from HTML
function extractLinks(content) {
  const links = [];
  const regex = /href="(\/[^"#?]*)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)]; // dedupe per file
}

// Main
const allFiles = getHtmlFiles(WEBSITE_DIR);
const fileIndex = buildFileIndex(allFiles);
const inboundCount = new Map(); // path → count of inbound links

let filesToCheck = allFiles;
if (sampleSize > 0 && filesToCheck.length > sampleSize) {
  for (let i = filesToCheck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filesToCheck[i], filesToCheck[j]] = [filesToCheck[j], filesToCheck[i]];
  }
  filesToCheck = filesToCheck.slice(0, sampleSize);
}

const brokenLinks = [];
let totalLinks = 0;

for (const file of filesToCheck) {
  const content = fs.readFileSync(file, 'utf-8');
  const links = extractLinks(content);
  const relFile = path.relative(WEBSITE_DIR, file);

  for (const link of links) {
    totalLinks++;
    const normalizedLink = link.endsWith('/') ? link : link + '/';

    // Track inbound links
    inboundCount.set(link, (inboundCount.get(link) || 0) + 1);
    inboundCount.set(normalizedLink, (inboundCount.get(normalizedLink) || 0) + 1);

    // Skip non-HTML paths (API, images, static assets) and Express-only routes
    if (link.startsWith('/api/') || link.startsWith('/images/') ||
        link.match(/\.(css|js|png|jpg|svg|xml|ico|json|webp|woff2?)$/) ||
        link.startsWith('/tools/') || link === '/claim' || link.startsWith('/claim/')) {
      continue;
    }

    // Check if target exists (try multiple resolution patterns)
    const exists = fileIndex.has(link) ||
                   fileIndex.has(link + '/') ||
                   fileIndex.has(link + '/index.html') ||
                   fileIndex.has(link + '.html');

    if (!exists) {
      brokenLinks.push({ source: relFile, target: link });
    }
  }
}

// Find orphaned pages (no inbound internal links, excluding index/special pages)
const orphaned = [];
if (sampleSize === 0) { // Only check orphans on full run
  for (const file of allFiles) {
    const rel = '/' + path.relative(WEBSITE_DIR, file).replace(/\\/g, '/');
    const relNoIndex = rel.replace('/index.html', '/');
    const relBare = rel.replace('/index.html', '');

    // Skip special pages
    if (rel === '/index.html' || rel === '/404.html' || rel.startsWith('/admin/')) continue;

    const count = (inboundCount.get(rel) || 0) +
                  (inboundCount.get(relNoIndex) || 0) +
                  (inboundCount.get(relBare) || 0);

    if (count === 0) {
      orphaned.push(rel);
    }
  }
}

if (jsonMode) {
  console.log(JSON.stringify({
    totalFiles: allFiles.length,
    totalChecked: filesToCheck.length,
    totalLinks,
    brokenCount: brokenLinks.length,
    orphanedCount: orphaned.length,
    broken: brokenLinks.slice(0, 20),
    orphaned: orphaned.slice(0, 20)
  }));
} else {
  console.log(`\n=== Link Check ===`);
  console.log(`Files: ${allFiles.length} total, ${filesToCheck.length} checked`);
  console.log(`Links: ${totalLinks} internal links scanned`);
  console.log(`Broken: ${brokenLinks.length}`);

  if (brokenLinks.length > 0) {
    console.log(`\nBroken links:`);
    const grouped = {};
    for (const bl of brokenLinks) {
      if (!grouped[bl.target]) grouped[bl.target] = [];
      grouped[bl.target].push(bl.source);
    }
    const sorted = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
    for (const [target, sources] of sorted.slice(0, 20)) {
      console.log(`  ${target} — referenced by ${sources.length} page(s)`);
      for (const s of sources.slice(0, 3)) {
        console.log(`    └ ${s}`);
      }
      if (sources.length > 3) console.log(`    └ ... and ${sources.length - 3} more`);
    }
    if (sorted.length > 20) console.log(`  ... and ${sorted.length - 20} more broken targets`);
  }

  if (orphaned.length > 0) {
    console.log(`\nOrphaned pages (no inbound links): ${orphaned.length}`);
    for (const o of orphaned.slice(0, 15)) {
      console.log(`  ${o}`);
    }
    if (orphaned.length > 15) console.log(`  ... and ${orphaned.length - 15} more`);
  }

  if (brokenLinks.length === 0 && orphaned.length === 0) {
    console.log(`\n✅ All links valid, no orphaned pages`);
  }
}

process.exit(brokenLinks.length > 0 ? 1 : 0);
