#!/usr/bin/env node
/**
 * Build Script - CSS/JS Minification + CSS Auto-Versioning
 * Uses esbuild for fast minification
 * Auto-replaces ?v=N with content-hash on style.min.css references
 *
 * Usage: npm run build
 */

const esbuild = require('esbuild');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WEBSITE_DIR = path.join(__dirname, '../website');

async function build() {
  console.log('🔨 Building minified assets...\n');

  const results = {
    css: { files: 0, originalSize: 0, minifiedSize: 0 },
    js: { files: 0, originalSize: 0, minifiedSize: 0 }
  };

  // Minify main CSS
  const cssFile = path.join(WEBSITE_DIR, 'style.css');
  if (fs.existsSync(cssFile)) {
    const original = fs.readFileSync(cssFile, 'utf-8');
    const result = await esbuild.transform(original, {
      loader: 'css',
      minify: true
    });

    const minPath = path.join(WEBSITE_DIR, 'style.min.css');
    fs.writeFileSync(minPath, result.code);

    results.css.files++;
    results.css.originalSize += original.length;
    results.css.minifiedSize += result.code.length;

    console.log(`  ✅ style.css → style.min.css (${formatSize(original.length)} → ${formatSize(result.code.length)})`);
  }

  // Minify JS files
  const jsDir = path.join(WEBSITE_DIR, 'js');
  const jsFiles = fs.readdirSync(jsDir).filter(f =>
    f.endsWith('.js') && !f.endsWith('.min.js')
  );

  for (const file of jsFiles) {
    const filePath = path.join(jsDir, file);
    const original = fs.readFileSync(filePath, 'utf-8');

    try {
      const result = await esbuild.transform(original, {
        loader: 'js',
        minify: true,
        target: 'es2018'
      });

      const minName = file.replace('.js', '.min.js');
      const minPath = path.join(jsDir, minName);
      fs.writeFileSync(minPath, result.code);

      results.js.files++;
      results.js.originalSize += original.length;
      results.js.minifiedSize += result.code.length;

      console.log(`  ✅ ${file} → ${minName} (${formatSize(original.length)} → ${formatSize(result.code.length)})`);
    } catch (err) {
      console.log(`  ⚠️  ${file} - skipped (${err.message})`);
    }
  }

  // Auto-version CSS: replace ?v=N with content hash of style.min.css
  const minCssPath = path.join(WEBSITE_DIR, 'style.min.css');
  const htmlFiles = findSourceHtmlFiles();

  if (fs.existsSync(minCssPath)) {
    const cssContent = fs.readFileSync(minCssPath);
    const hash = crypto.createHash('md5').update(cssContent).digest('hex').slice(0, 8);
    const versionPattern = /style\.min\.css\?v=[^\s"']*/g;
    const replacement = `style.min.css?v=${hash}`;

    let updatedCount = 0;

    for (const htmlFile of htmlFiles) {
      const content = fs.readFileSync(htmlFile, 'utf-8');
      if (versionPattern.test(content)) {
        versionPattern.lastIndex = 0; // reset regex state
        const updated = content.replace(versionPattern, replacement);
        if (updated !== content) {
          fs.writeFileSync(htmlFile, updated);
          updatedCount++;
        }
      }
    }

    console.log(`\n  🔄 CSS version: ?v=${hash} (updated ${updatedCount} HTML files)`);
  }

  // Auto-version JS: replace ?v=N with content hash for each JS file
  let jsUpdatedTotal = 0;
  for (const file of jsFiles) {
    const srcPath = path.join(jsDir, file);
    const srcContent = fs.readFileSync(srcPath);
    const hash = crypto.createHash('md5').update(srcContent).digest('hex').slice(0, 8);
    // Match e.g. prices.js?v=12 or price-alerts.js?v=1 in HTML src attributes
    const pattern = new RegExp(file.replace('.', '\\.') + '\\?v=[^\\s"\']*', 'g');
    const replacement = `${file}?v=${hash}`;

    for (const htmlFile of htmlFiles) {
      const content = fs.readFileSync(htmlFile, 'utf-8');
      if (pattern.test(content)) {
        pattern.lastIndex = 0;
        const updated = content.replace(pattern, replacement);
        if (updated !== content) {
          fs.writeFileSync(htmlFile, updated);
          jsUpdatedTotal++;
        }
      }
    }
  }

  if (jsUpdatedTotal > 0) {
    console.log(`  🔄 JS versions: updated ${jsUpdatedTotal} HTML file references`);
  }

  // Summary
  const totalOriginal = results.css.originalSize + results.js.originalSize;
  const totalMinified = results.css.minifiedSize + results.js.minifiedSize;
  const savings = ((1 - totalMinified / totalOriginal) * 100).toFixed(1);

  console.log('\n═══════════════════════════════════════');
  console.log('  BUILD COMPLETE');
  console.log('═══════════════════════════════════════');
  console.log(`  CSS: ${results.css.files} file(s)`);
  console.log(`  JS:  ${results.js.files} file(s)`);
  console.log(`  Total: ${formatSize(totalOriginal)} → ${formatSize(totalMinified)} (${savings}% smaller)`);
}

/**
 * Generator-output directories under website/. These are produced by
 * cron-driven generators using the generate-then-swap _tmp pattern;
 * build.js must not walk into them or readFileSync races the atomic
 * rename and crashes ENOENT. Mirrors the website/-relative directory
 * entries in .gitignore + the pre-commit hook's REGEN_PATHS — keep these
 * three in sync if a new generator directory is added.
 *
 * Note: prices.html (the file at website/ root) is intentionally NOT
 * excluded. It's hand-edited but also rewritten in-place by
 * generate-seo-pages.js#updatePricesHtml, which only touches data
 * sections (leaderboard table, schema, top deals) — it does not refresh
 * <script src="...?v=...">. If build.js skipped it, JS cache-bust hashes
 * in prices.html would stay stale and prod browsers would keep getting
 * old JS. There's no _tmp race for the root file.
 */
const GENERATED_PATHS_RE = /^website\/(prices|supplier|heating-cost|average-heating-bill|price-trend)\/|^website\/sitemap\.xml$/;

/**
 * Enumerate source HTML files under website/ — recursive walk that excludes
 * generator output. Pure filesystem (no git binary or .git/ dependency)
 * so it works identically in local dev, Railway/Nixpacks build, and CI.
 */
function findSourceHtmlFiles() {
  const repoRoot = path.dirname(WEBSITE_DIR);
  const results = [];
  walk(WEBSITE_DIR);
  return results;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(repoRoot, fullPath);
      if (entry.isDirectory()) {
        if (GENERATED_PATHS_RE.test(rel + '/')) continue;
        walk(fullPath);
      } else if (entry.name.endsWith('.html') && !GENERATED_PATHS_RE.test(rel)) {
        results.push(fullPath);
      }
    }
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
