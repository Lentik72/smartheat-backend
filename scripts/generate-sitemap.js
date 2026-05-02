#!/usr/bin/env node
/**
 * Sitemap Generator
 * Scans website/ directory for all HTML pages and produces sitemap.xml.
 *
 * Replaces the fragment-based approach — one script, auto-discovers everything.
 * Run after all page generators have completed.
 *
 * Usage:
 *   node scripts/generate-sitemap.js
 *   node scripts/generate-sitemap.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const WEBSITE_DIR = path.join(__dirname, '../website');
const SITEMAP_PATH = path.join(WEBSITE_DIR, 'sitemap.xml');
const BASE_URL = 'https://www.gethomeheat.com';
const dryRun = process.argv.includes('--dry-run');

// Priority rules by path pattern (first match wins)
const PRIORITY_RULES = [
  { pattern: /^\/$/,                          priority: 1.0, changefreq: 'weekly' },
  { pattern: /^\/prices$/,                    priority: 0.9, changefreq: 'daily' },
  { pattern: /^\/prices\/kerosene\/$/,        priority: 0.8, changefreq: 'daily' },
  { pattern: /^\/prices\/[a-z]{2}\/$/,        priority: 0.8, changefreq: 'daily' },   // state hubs
  { pattern: /^\/prices\/kerosene\/[a-z]{2}\/$/, priority: 0.7, changefreq: 'daily' },
  { pattern: /^\/prices\/county\//,           priority: 0.7, changefreq: 'daily' },   // county elite
  { pattern: /^\/prices\/kerosene\/county\//, priority: 0.65, changefreq: 'daily' },
  { pattern: /^\/prices\/propane\/$/,          priority: 0.8, changefreq: 'daily' },
  { pattern: /^\/prices\/propane\/[a-z]{2}\/$/, priority: 0.7, changefreq: 'daily' },
  { pattern: /^\/prices\//,                   priority: 0.7, changefreq: 'daily' },   // other price pages
  { pattern: /^\/supplier\//,                 priority: 0.5, changefreq: 'weekly' },
  { pattern: /^\/heating-cost\//,             priority: 0.6, changefreq: 'weekly' },
  { pattern: /^\/average-heating-bill\//,     priority: 0.6, changefreq: 'weekly' },
  { pattern: /^\/price-trend\//,              priority: 0.6, changefreq: 'daily' },
  { pattern: /^\/learn\//,                    priority: 0.6, changefreq: 'monthly' },
  { pattern: /^\/tools\//,                    priority: 0.6, changefreq: 'monthly' },
  { pattern: /^\/for-suppliers/,              priority: 0.7, changefreq: 'weekly' },
  { pattern: /^\/claim\//,                    priority: 0.4, changefreq: 'weekly' },
];

const DEFAULT_PRIORITY = 0.5;
const DEFAULT_CHANGEFREQ = 'weekly';

// Files/dirs to skip
const SKIP_FILES = new Set(['404.html', 'offline.html', 'update-price.html', 'supplier-dashboard.html', 'price-review.html']);
const SKIP_DIRS = new Set(['admin']);
const SKIP_PREFIXES = ['_', '.', 'google'];

function getPriority(urlPath) {
  for (const rule of PRIORITY_RULES) {
    if (rule.pattern.test(urlPath)) {
      return { priority: rule.priority, changefreq: rule.changefreq };
    }
  }
  return { priority: DEFAULT_PRIORITY, changefreq: DEFAULT_CHANGEFREQ };
}

function fileToUrl(filePath) {
  // Convert file path relative to website/ into URL path
  let rel = path.relative(WEBSITE_DIR, filePath).replace(/\\/g, '/');

  // Skip files starting with underscore or dot
  const basename = path.basename(rel);
  if (SKIP_PREFIXES.some(p => basename.startsWith(p))) return null;
  if (SKIP_FILES.has(basename)) return null;

  // Skip redirect files (contain meta http-equiv="refresh") and noindex'd
  // pages (contain meta name="robots" with noindex). Reading 2KB is enough
  // to capture both — they live in <head>. Both checks must remain inside
  // the try block: a transient fs error must return null (skip this file)
  // not crash the whole sitemap regen.
  try {
    const content = fs.readFileSync(filePath, 'utf-8').substring(0, 2048);
    if (content.includes('http-equiv="refresh"')) return null;
    if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(content)) return null;
  } catch (e) {
    return null;
  }

  // Convert to URL path
  // index.html → directory URL with trailing slash
  if (rel.endsWith('/index.html')) {
    return '/' + rel.replace('/index.html', '/');
  }
  if (rel === 'index.html') {
    return '/';
  }
  // Remove .html extension
  return '/' + rel.replace(/\.html$/, '');
}

function scanDirectory(dir) {
  const urls = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden/underscore dirs
      if (SKIP_PREFIXES.some(p => entry.name.startsWith(p))) continue;
      // Skip asset and internal directories
      if (['js', 'css', 'images', 'icons', 'fonts'].includes(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      urls.push(...scanDirectory(fullPath));
    } else if (entry.name.endsWith('.html')) {
      const urlPath = fileToUrl(fullPath);
      if (urlPath) {
        urls.push(urlPath);
      }
    }
  }

  return urls;
}

function generateSitemap(urls) {
  const today = new Date().toISOString().split('T')[0];

  const entries = urls
    .sort() // Alphabetical for deterministic output
    .map(urlPath => {
      const { priority, changefreq } = getPriority(urlPath);
      return `  <url>
    <loc>${BASE_URL}${urlPath}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

/**
 * Regenerate sitemap.xml by scanning all HTML pages in website/.
 * Can be called as a module or run directly as a CLI script.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Logger with .info()/.error() methods (defaults to console)
 * @param {boolean} [options.dryRun] - If true, skip writing the file
 * @returns {{ success: boolean, urlCount: number, sections: object }}
 */
function regenerateSitemap({ logger: log, dryRun: dry } = {}) {
  const _log = log || { info: console.log, error: console.error };
  const _dry = dry != null ? dry : dryRun;

  _log.info('Scanning website/ for HTML pages...');
  const urls = scanDirectory(WEBSITE_DIR);
  _log.info(`Found ${urls.length} pages`);

  // Count by section
  const sections = {};
  for (const url of urls) {
    const section = url.split('/')[1] || 'root';
    sections[section] = (sections[section] || 0) + 1;
  }
  for (const [section, count] of Object.entries(sections).sort((a, b) => b[1] - a[1])) {
    _log.info(`  ${section}: ${count}`);
  }

  const sitemap = generateSitemap(urls);

  if (_dry) {
    _log.info(`[DRY RUN] Would write ${sitemap.length} bytes to sitemap.xml`);
  } else {
    fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf-8');
    _log.info(`✅ Written sitemap.xml (${urls.length} URLs, ${sitemap.length} bytes)`);
  }

  return { success: true, urlCount: urls.length, sections };
}

module.exports = { regenerateSitemap };

// CLI execution
if (require.main === module) {
  regenerateSitemap();
}
