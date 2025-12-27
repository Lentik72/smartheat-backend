/**
 * Migration: Add fuelType column to CommunityDeliveries table
 * Version: V20.1
 *
 * This migration adds the fuelType column for propane/oil isolation.
 * Existing records will default to 'heating_oil'.
 *
 * Run with: node src/migrations/001-add-fuel-type.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Starting V20.1 migration: Add fuelType column...');

  // Connect to database
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'community_deliveries'
      AND column_name = 'fuel_type'
    `);

    if (results.length > 0) {
      console.log('✅ Column fuel_type already exists - skipping migration');
      await sequelize.close();
      return;
    }

    console.log('📝 Adding fuel_type column...');

    // Create the ENUM type if it doesn't exist
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_community_deliveries_fuel_type AS ENUM ('heating_oil', 'propane');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add the column with default value
    await sequelize.query(`
      ALTER TABLE community_deliveries
      ADD COLUMN fuel_type enum_community_deliveries_fuel_type
      NOT NULL DEFAULT 'heating_oil'
    `);

    console.log('✅ Column fuel_type added successfully');

    // Add index for fuel type filtering
    console.log('📝 Adding fuel_type index...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS community_deliveries_fuel_type
      ON community_deliveries (fuel_type)
    `);

    // Add composite index for fuel-filtered queries
    console.log('📝 Adding composite fuel benchmark index...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS community_deliveries_fuel_benchmark_idx
      ON community_deliveries (zip_prefix, fuel_type, delivery_month, validation_status)
    `);

    console.log('✅ Indexes created successfully');

    // Verify migration
    const [verifyResults] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'community_deliveries'
      AND column_name = 'fuel_type'
    `);

    if (verifyResults.length > 0) {
      console.log('✅ Migration verified:', verifyResults[0]);
    }

    // Count existing records
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN fuel_type = 'heating_oil' THEN 1 END) as heating_oil,
             COUNT(CASE WHEN fuel_type = 'propane' THEN 1 END) as propane
      FROM community_deliveries
    `);
    console.log('📊 Record counts after migration:', countResult[0]);

    await sequelize.close();
    console.log('🎉 V20.1 migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
