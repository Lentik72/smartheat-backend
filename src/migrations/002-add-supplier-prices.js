/**
 * Migration: Add supplier_prices table and allowPriceDisplay to suppliers
 * Version: V1.5.0
 *
 * This migration:
 * 1. Adds allowPriceDisplay column to suppliers table
 * 2. Creates supplier_prices table for scraped/manual prices
 *
 * Run with: DATABASE_URL="..." node src/migrations/002-add-supplier-prices.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Starting V1.5.0 migration: Add supplier prices...');

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

    // Step 1: Add allowPriceDisplay to suppliers table
    console.log('\n📝 Step 1: Adding allowPriceDisplay to suppliers...');

    const [colCheck] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'suppliers'
      AND column_name = 'allow_price_display'
    `);

    if (colCheck.length > 0) {
      console.log('✅ Column allow_price_display already exists');
    } else {
      await sequelize.query(`
        ALTER TABLE suppliers
        ADD COLUMN allow_price_display BOOLEAN NOT NULL DEFAULT true
      `);
      console.log('✅ Column allow_price_display added');
    }

    // Step 2: Create supplier_prices table
    console.log('\n📝 Step 2: Creating supplier_prices table...');

    const [tableCheck] = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'supplier_prices'
    `);

    if (tableCheck.length > 0) {
      console.log('✅ Table supplier_prices already exists');
    } else {
      // Create ENUM types
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE enum_supplier_prices_fuel_type AS ENUM ('heating_oil');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE enum_supplier_prices_source_type AS ENUM ('scraped', 'manual', 'user_reported');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Create table
      await sequelize.query(`
        CREATE TABLE supplier_prices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
          price_per_gallon DECIMAL(5, 3) NOT NULL CHECK (price_per_gallon >= 2.00 AND price_per_gallon <= 5.00),
          min_gallons INTEGER DEFAULT 150,
          fuel_type enum_supplier_prices_fuel_type DEFAULT 'heating_oil',
          source_type enum_supplier_prices_source_type NOT NULL DEFAULT 'scraped',
          source_url VARCHAR(500),
          scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          is_valid BOOLEAN DEFAULT true,
          notes VARCHAR(500),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      console.log('✅ Table supplier_prices created');

      // Create indexes
      console.log('📝 Creating indexes...');

      await sequelize.query(`
        CREATE INDEX supplier_prices_supplier_id ON supplier_prices(supplier_id);
        CREATE INDEX supplier_prices_scraped_at ON supplier_prices(scraped_at);
        CREATE INDEX supplier_prices_expires_at ON supplier_prices(expires_at);
        CREATE INDEX supplier_prices_is_valid ON supplier_prices(is_valid);
        CREATE INDEX supplier_prices_source_type ON supplier_prices(source_type);
      `);
      console.log('✅ Indexes created');
    }

    // Verify migration
    console.log('\n📊 Verifying migration...');

    const [supplierCols] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'suppliers'
      AND column_name = 'allow_price_display'
    `);
    console.log('Suppliers allow_price_display:', supplierCols[0] || 'NOT FOUND');

    const [pricesTable] = await sequelize.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'supplier_prices'
      ORDER BY ordinal_position
    `);
    console.log('supplier_prices columns:', pricesTable.length);
    pricesTable.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Count suppliers
    const [supplierCount] = await sequelize.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN allow_price_display = true THEN 1 END) as with_display
      FROM suppliers
      WHERE active = true
    `);
    console.log('Active suppliers:', supplierCount[0]);

    await sequelize.close();
    console.log('\n🎉 V1.5.0 migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
