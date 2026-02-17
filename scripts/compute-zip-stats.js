#!/usr/bin/env node
/**
 * Compute ZIP Stats
 * V2.32.0: Manual trigger for ZIP price stats computation
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/compute-zip-stats.js
 *   DATABASE_URL="..." node scripts/compute-zip-stats.js --backfill
 *
 * The --backfill flag will recompute all historical weeks (slower but comprehensive)
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const ZipStatsComputer = require('../src/services/ZipStatsComputer');

const args = process.argv.slice(2);
const backfill = args.includes('--backfill');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ZIP Stats Computer - V2.32.0');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (backfill) {
    console.log('🔄 BACKFILL MODE - Recomputing all historical weeks');
    console.log('');
  }

  // Connect to database
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

    const computer = new ZipStatsComputer(sequelize, console);
    const result = await computer.compute();

    console.log('');
    if (result.success) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  ✅ Complete: ${result.updated}/${result.total} ZIPs updated`);
      console.log(`  ⏱️  Duration: ${result.durationMs}ms`);
      console.log('═══════════════════════════════════════════════════════════');
    } else {
      console.log('❌ Failed:', result.error);
    }

    await sequelize.close();
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

main();
