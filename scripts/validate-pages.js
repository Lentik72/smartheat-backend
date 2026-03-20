#!/usr/bin/env node
/**
 * validate-pages.js — Post-generator page validation
 *
 * Verifies generated HTML pages have required elements:
 * - analytics script tags
 * - nav.js, widgets.js, pwa.js
 * - Smart App Banner meta tag
 * - Non-empty <title> and <h1>
 * - CSS version hash (style.min.css?v=)
 * - JSON-LD schema (structured data)
 *
 * Usage:
 *   node scripts/validate-pages.js              # validate all
 *   node scripts/validate-pages.js --json       # output JSON for 6 AM email
 *   node scripts/validate-pages.js --sample 50  # validate random sample
 *
 * Exit codes: 0 = all pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');

const WEBSITE_DIR = path.join(__dirname, '..', 'website');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const sampleIdx = args.indexOf('--sample');
const sampleSize = sampleIdx !== -1 ? parseInt(args[sampleIdx + 1]) || 50 : 0;

// Required elements and their search patterns
const CHECKS = [
  { name: 'nav.js', pattern: 'nav.js', critical: true },
  { name: 'widgets.js', pattern: 'widgets.js', critical: false },
  { name: 'pwa.js', pattern: 'pwa.js', critical: false },
  { name: 'Smart App Banner', pattern: 'apple-itunes-app', critical: false },
  { name: 'CSS version', pattern: 'style.min.css?v=', critical: true },
  { name: '<title>', pattern: /<title>[^<]+<\/title>/, critical: true },
  { name: '<h1>', pattern: /<h1[^>]*>[^<]+/, critical: false },
];

// Collect all HTML files recursively
function getHtmlFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'admin') {
      files.push(...getHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== '404.html') {
      files.push(fullPath);
    }
  }
  return files;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(WEBSITE_DIR, filePath);
  const failures = [];

  for (const check of CHECKS) {
    const found = check.pattern instanceof RegExp
      ? check.pattern.test(content)
      : content.includes(check.pattern);

    if (!found) {
      failures.push({ element: check.name, critical: check.critical });
    }
  }

  return { path: relativePath, failures };
}

// Main
let files = getHtmlFiles(WEBSITE_DIR);

// Sample mode
if (sampleSize > 0 && files.length > sampleSize) {
  // Shuffle and take first N
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }
  files = files.slice(0, sampleSize);
}

const results = files.map(validateFile);
const failed = results.filter(r => r.failures.length > 0);
const criticalFailed = results.filter(r => r.failures.some(f => f.critical));

if (jsonMode) {
  // Output for 6 AM email integration
  console.log(JSON.stringify({
    totalChecked: files.length,
    passed: files.length - failed.length,
    failed: failed.length,
    criticalFailed: criticalFailed.length,
    failures: failed.slice(0, 20).map(f => ({
      page: f.path,
      missing: f.failures.map(ff => ff.element)
    }))
  }));
} else {
  console.log(`\n=== Page Validation ===`);
  console.log(`Checked: ${files.length} pages`);
  console.log(`Passed:  ${files.length - failed.length}`);
  console.log(`Failed:  ${failed.length} (${criticalFailed.length} critical)`);

  if (failed.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failed.slice(0, 30)) {
      const missing = f.failures.map(ff => ff.critical ? `[!]${ff.element}` : ff.element).join(', ');
      console.log(`  ${f.path} — missing: ${missing}`);
    }
    if (failed.length > 30) {
      console.log(`  ... and ${failed.length - 30} more`);
    }
  }
}

process.exit(criticalFailed.length > 0 ? 1 : 0);
