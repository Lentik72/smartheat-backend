#!/usr/bin/env node
/**
 * Build Script - CSS/JS Minification
 * Uses esbuild for fast minification
 *
 * Usage: npm run build
 */

const esbuild = require('esbuild');
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
  console.log('');
  console.log('  To use minified files in production:');
  console.log('  - style.css → style.min.css');
  console.log('  - *.js → *.min.js');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
