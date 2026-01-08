/**
 * Migration: Add aggregator_signal to source_type ENUM
 * Version: V2.1.0 - Market Intelligence Engine
 *
 * This migration adds 'aggregator_signal' to the source_type ENUM in supplier_prices.
 * Aggregator prices are used for market signals only, never displayed to users.
 *
 * Run with: DATABASE_URL="..." node src/migrations/003-add-aggregator-signal.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Starting V2.1.0 migration: Add aggregator_signal source type...');

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Step 1: Check if aggregator_signal already exists in ENUM
    console.log('\n📝 Step 1: Checking existing ENUM values...');

    const [enumValues] = await sequelize.query(`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'enum_supplier_prices_source_type'
      )
    `);

    const existingValues = enumValues.map(e => e.enumlabel);
    console.log('Current ENUM values:', existingValues);

    if (existingValues.includes('aggregator_signal')) {
      console.log('✅ aggregator_signal already exists in ENUM');
    } else {
      console.log('📝 Adding aggregator_signal to ENUM...');

      await sequelize.query(`
        ALTER TYPE enum_supplier_prices_source_type ADD VALUE 'aggregator_signal'
      `);

      console.log('✅ aggregator_signal added to ENUM');
    }

    // Verify the migration
    console.log('\n📊 Verifying migration...');

    const [updatedValues] = await sequelize.query(`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'enum_supplier_prices_source_type'
      )
      ORDER BY enumsortorder
    `);

    console.log('Updated ENUM values:', updatedValues.map(e => e.enumlabel));

    // Show current price counts by source type
    const [priceCounts] = await sequelize.query(`
      SELECT source_type, COUNT(*) as count
      FROM supplier_prices
      GROUP BY source_type
      ORDER BY count DESC
    `);

    console.log('\nPrices by source type:');
    priceCounts.forEach(p => {
      console.log(`  ${p.source_type}: ${p.count}`);
    });

    await sequelize.close();
    console.log('\n🎉 V2.1.0 migration completed successfully!');
    console.log('\n⚠️  Note: Aggregator prices should be filtered from user-facing queries.');
    console.log('   Use: WHERE source_type != \'aggregator_signal\'');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
