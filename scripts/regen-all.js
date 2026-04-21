#!/usr/bin/env node
/**
 * Run all startup generators locally. Mirrors the Promise.allSettled
 * blocks in server.js startup IIFE but runs sequentially for readable output.
 *
 * IMPORTANT: Instantiates its own Sequelize to avoid src/models/database.js's
 * sync({alter:true}) side-effect on import. Mirrors pattern from
 * scripts/generate-heating-cost-pages.js:861.
 *
 * Prod safeguard: refuses to run against Railway DB unless ALLOW_PROD=1
 * is set. This prevents a dev machine with a prod DATABASE_URL from
 * accidentally regenerating against live data.
 *
 * Usage:
 *   DATABASE_URL="postgres://local..." node scripts/regen-all.js
 *   DATABASE_URL="<railway>" ALLOW_PROD=1 node scripts/regen-all.js
 *
 * Exit codes:
 *   0 — all generators succeeded
 *   1 — one or more generators failed (details in stderr)
 *   2 — DATABASE_URL missing, prod guard tripped, or DB init failed
 */
const path = require('path');
const { Sequelize } = require('sequelize');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Point at a dev DB, or ALLOW_PROD=1 for Railway.');
  process.exit(2);
}

const isProd = process.env.DATABASE_URL.includes('railway');
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error('❌ DATABASE_URL looks like prod (contains "railway").');
  console.error('   Set ALLOW_PROD=1 to proceed. This will regenerate live pages.');
  process.exit(2);
}

const websiteDir = path.join(__dirname, '..', 'website');
const logger = {
  info: (...args) => console.log('[regen]', ...args),
  warn: (...args) => console.warn('[regen]', ...args),
  error: (...args) => console.error('[regen]', ...args),
  log: (...args) => console.log('[regen]', ...args),
};

async function main() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: isProd ? { require: true, rejectUnauthorized: false } : false,
    },
  });

  try {
    await sequelize.authenticate();
    logger.info(`✅ DB connected (${isProd ? 'PROD — ALLOW_PROD=1' : 'local'})`);
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
    process.exit(2);
  }

  // Generators with signatures that match server.js startup regen.
  // Note: heating-cost/avg-bill/price-trend accept only { sequelize, dryRun } —
  // they hardcode output dirs at module load. Passing extra { logger, outputDir }
  // is harmless (silently ignored) but we omit them for honesty.
  const generators = [
    ['SEO pages',          () => require('./generate-seo-pages').generateSEOPages({ sequelize, logger, outputDir: websiteDir, dryRun: false })],
    ['Supplier pages',     () => require('./generate-supplier-pages').generateSupplierPages({ sequelize, logger: { log: logger.info, error: logger.error }, websiteDir })],
    ['ZIP Elite pages',    () => require('./generate-zip-elite-pages').generateZipElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false })],
    ['County Elite pages', () => require('./generate-county-elite-pages').generateCountyElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false })],
    ['Heating Cost pages', () => require('./generate-heating-cost-pages').generateHeatingCostPages({ sequelize, dryRun: false })],
    ['Avg Bill pages',     () => require('./generate-avg-bill-pages').generateAvgBillPages({ sequelize, dryRun: false })],
    ['Price Trend pages',  () => require('./generate-price-trend-pages').generatePriceTrendPages({ sequelize, dryRun: false })],
  ];

  let allOk = true;
  for (const [name, fn] of generators) {
    const t0 = Date.now();
    try {
      const result = await fn();
      const ok = result && result.success !== false;
      if (ok) {
        logger.info(`✅ ${name} — ${Date.now() - t0}ms`);
      } else {
        allOk = false;
        logger.error(`❌ ${name} — ${(result && result.error) || 'unknown failure'}`);
      }
    } catch (err) {
      allOk = false;
      logger.error(`❌ ${name} threw:`, err.message);
    }
  }

  // Sitemap last (depends on fragments written by the page generators).
  try {
    require('./generate-sitemap').regenerateSitemap({ logger, dryRun: false });
    logger.info('✅ Sitemap');
  } catch (err) {
    allOk = false;
    logger.error('❌ Sitemap:', err.message);
  }

  await sequelize.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
