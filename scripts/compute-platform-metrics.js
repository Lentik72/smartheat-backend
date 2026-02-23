#!/usr/bin/env node
/**
 * Compute Platform Metrics
 * Manual trigger + backfill for daily_platform_metrics snapshot table.
 *
 * Usage:
 *   node scripts/compute-platform-metrics.js                    # yesterday ET
 *   node scripts/compute-platform-metrics.js 2026-02-22         # specific date
 *   node scripts/compute-platform-metrics.js --backfill 14      # last 14 days
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const PlatformMetricsService = require('../src/services/PlatformMetricsService');

const args = process.argv.slice(2);
const backfillIdx = args.indexOf('--backfill');
const backfillDays = backfillIdx >= 0 ? parseInt(args[backfillIdx + 1]) || 7 : 0;
const specificDate = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Platform Metrics Computer');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    console.log('');

    const service = new PlatformMetricsService(sequelize, console);

    if (backfillDays > 0) {
      console.log(`🔄 BACKFILL MODE — computing ${backfillDays} days sequentially`);
      console.log('');

      let success = 0;
      let failed = 0;

      for (let i = backfillDays; i >= 1; i--) {
        const d = new Date();
        // Compute in ET
        const etStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const etDate = new Date(etStr + 'T00:00:00');
        etDate.setDate(etDate.getDate() - i);
        const dayStr = etDate.toISOString().split('T')[0];

        try {
          const result = await service.computeDaily(dayStr);
          if (result.success) {
            success++;
            console.log(`  ✅ ${dayStr} (${result.durationMs}ms)`);
          } else {
            failed++;
            console.log(`  ⚠️  ${dayStr} skipped: ${result.reason}`);
          }
        } catch (err) {
          failed++;
          console.error(`  ❌ ${dayStr} failed: ${err.message}`);
        }
      }

      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  ✅ Backfill complete: ${success} succeeded, ${failed} failed`);
      console.log('═══════════════════════════════════════════════════════════');

    } else {
      // Single day
      const result = await service.computeDaily(specificDate || undefined);

      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      if (result.success) {
        console.log(`  ✅ Complete: ${result.day} computed (${result.durationMs}ms)`);
      } else {
        console.log(`  ⚠️  Skipped: ${result.reason}`);
      }
      console.log('═══════════════════════════════════════════════════════════');
    }

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

main();
