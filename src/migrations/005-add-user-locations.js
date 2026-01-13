/**
 * Migration: Add user_locations table for Coverage Intelligence System
 * Version: V2.3.0 - Coverage Intelligence
 *
 * Tracks unique ZIP codes that users query for supplier lookups.
 * Enables: automated coverage gap detection, expansion pattern analysis, daily reports.
 *
 * Run with: DATABASE_URL="..." node src/migrations/005-add-user-locations.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Starting V2.3.0 migration: Add user_locations table...');

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

    // Step 1: Check if table exists
    console.log('\n📝 Step 1: Checking for existing table...');

    const [tables] = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_locations'
    `);

    if (tables.length > 0) {
      console.log('✅ user_locations table already exists');
    } else {
      // Step 2: Create user_locations table
      console.log('\n📝 Step 2: Creating user_locations table...');

      await sequelize.query(`
        CREATE TABLE user_locations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          zip_code VARCHAR(5) NOT NULL UNIQUE,
          city VARCHAR(100),
          county VARCHAR(100),
          state VARCHAR(2),

          -- Tracking
          first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          request_count INTEGER DEFAULT 1,

          -- Coverage snapshot (updated by daily job)
          supplier_count INTEGER,
          coverage_quality VARCHAR(20),
          last_coverage_check TIMESTAMP WITH TIME ZONE,

          -- Metadata
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      console.log('✅ user_locations table created');

      // Step 3: Create indexes
      console.log('\n📝 Step 3: Creating indexes...');

      await sequelize.query(`
        CREATE INDEX idx_user_locations_first_seen ON user_locations(first_seen_at)
      `);
      console.log('✅ first_seen_at index created');

      await sequelize.query(`
        CREATE INDEX idx_user_locations_state ON user_locations(state)
      `);
      console.log('✅ state index created');

      await sequelize.query(`
        CREATE INDEX idx_user_locations_coverage_quality ON user_locations(coverage_quality)
      `);
      console.log('✅ coverage_quality index created');

      await sequelize.query(`
        CREATE INDEX idx_user_locations_request_count ON user_locations(request_count DESC)
      `);
      console.log('✅ request_count index created');
    }

    // Step 4: Verify the migration
    console.log('\n📊 Verifying migration...');

    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_locations'
      ORDER BY ordinal_position
    `);

    console.log('\nTable columns:');
    columns.forEach(c => {
      console.log(`  ${c.column_name} (${c.data_type}) - ${c.is_nullable === 'YES' ? 'nullable' : 'required'}`);
    });

    // Show current stats
    const [stats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM user_locations
    `);
    console.log(`\nCurrent records: ${stats[0].total}`);

    await sequelize.close();
    console.log('\n🎉 V2.3.0 migration completed successfully!');
    console.log('\nCoverage Intelligence enabled:');
    console.log('  - Track user ZIP codes from supplier lookups');
    console.log('  - Monitor coverage quality per location');
    console.log('  - Detect expansion patterns');
    console.log('  - Generate automated daily reports');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
