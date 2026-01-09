/**
 * Migration: Add supplier tracking to community_deliveries
 * Version: V2.2.0 - Supplier Analytics
 *
 * Tracks which suppliers users order from (anonymized).
 * Enables: popular supplier analysis, price vs supplier correlation, directory effectiveness.
 *
 * Run with: DATABASE_URL="..." node src/migrations/004-add-supplier-tracking.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Starting V2.2.0 migration: Add supplier tracking to community_deliveries...');

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

    // Step 1: Check existing columns
    console.log('\n📝 Step 1: Checking existing columns...');

    const [columns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'community_deliveries'
    `);

    const existingColumns = columns.map(c => c.column_name);
    console.log('Current columns:', existingColumns.join(', '));

    // Step 2: Add supplier_name column (nullable - user may not select one)
    if (!existingColumns.includes('supplier_name')) {
      console.log('\n📝 Step 2a: Adding supplier_name column...');
      await sequelize.query(`
        ALTER TABLE community_deliveries
        ADD COLUMN supplier_name VARCHAR(255) NULL
      `);
      console.log('✅ supplier_name column added');
    } else {
      console.log('✅ supplier_name already exists');
    }

    // Step 3: Add supplier_id column (for directory suppliers - links to suppliers table)
    if (!existingColumns.includes('supplier_id')) {
      console.log('\n📝 Step 2b: Adding supplier_id column...');
      await sequelize.query(`
        ALTER TABLE community_deliveries
        ADD COLUMN supplier_id UUID NULL
      `);
      console.log('✅ supplier_id column added');
    } else {
      console.log('✅ supplier_id already exists');
    }

    // Step 4: Add is_directory_supplier flag
    if (!existingColumns.includes('is_directory_supplier')) {
      console.log('\n📝 Step 2c: Adding is_directory_supplier column...');
      await sequelize.query(`
        ALTER TABLE community_deliveries
        ADD COLUMN is_directory_supplier BOOLEAN DEFAULT false
      `);
      console.log('✅ is_directory_supplier column added');
    } else {
      console.log('✅ is_directory_supplier already exists');
    }

    // Step 5: Create index for supplier analytics
    console.log('\n📝 Step 3: Creating indexes...');

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_community_deliveries_supplier
        ON community_deliveries(supplier_name)
        WHERE supplier_name IS NOT NULL
      `);
      console.log('✅ Supplier name index created');
    } catch (e) {
      console.log('Index may already exist:', e.message);
    }

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_community_deliveries_directory
        ON community_deliveries(is_directory_supplier)
        WHERE is_directory_supplier = true
      `);
      console.log('✅ Directory supplier index created');
    } catch (e) {
      console.log('Index may already exist:', e.message);
    }

    // Verify the migration
    console.log('\n📊 Verifying migration...');

    const [updatedColumns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'community_deliveries'
      ORDER BY ordinal_position
    `);

    console.log('\nUpdated columns:');
    updatedColumns.forEach(c => {
      console.log(`  ${c.column_name} (${c.data_type}) - ${c.is_nullable === 'YES' ? 'nullable' : 'required'}`);
    });

    // Show current delivery count
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(supplier_name) as with_supplier
      FROM community_deliveries
    `);

    console.log('\nDelivery stats:');
    console.log(`  Total: ${stats[0].total}`);
    console.log(`  With supplier: ${stats[0].with_supplier}`);

    await sequelize.close();
    console.log('\n🎉 V2.2.0 migration completed successfully!');
    console.log('\nNew analytics enabled:');
    console.log('  - Track which suppliers users order from');
    console.log('  - Identify directory vs non-directory orders');
    console.log('  - Analyze price vs supplier correlation');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
