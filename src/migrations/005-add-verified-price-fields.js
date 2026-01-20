/**
 * Migration 005: Add verified price fields
 *
 * Adds columns to support manual phone verification of prices:
 * - verified_at: When the price was verified
 * - verification_method: How it was verified (phone, sms, email, scraped)
 * - verified_by: Who verified it
 * - exclusive_price: Is this a HomeHeat-exclusive deal?
 */

const { Sequelize } = require('sequelize');

async function migrate() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  try {
    console.log('Migration 005: Adding verified price fields...');

    // Add verified_at column
    await sequelize.query(`
      ALTER TABLE supplier_prices
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE
    `);
    console.log('  ✓ Added verified_at column');

    // Add verification_method column
    await sequelize.query(`
      ALTER TABLE supplier_prices
      ADD COLUMN IF NOT EXISTS verification_method VARCHAR(50)
    `);
    console.log('  ✓ Added verification_method column');

    // Add verified_by column
    await sequelize.query(`
      ALTER TABLE supplier_prices
      ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100)
    `);
    console.log('  ✓ Added verified_by column');

    // Add exclusive_price column
    await sequelize.query(`
      ALTER TABLE supplier_prices
      ADD COLUMN IF NOT EXISTS exclusive_price BOOLEAN DEFAULT false
    `);
    console.log('  ✓ Added exclusive_price column');

    // Add 'supplier_verified' to source_type enum if not exists
    await sequelize.query(`
      ALTER TYPE enum_supplier_prices_source_type ADD VALUE IF NOT EXISTS 'supplier_verified'
    `).catch(() => {
      console.log('  ℹ supplier_verified enum value already exists or cannot be added');
    });

    console.log('\n✅ Migration 005 complete!');
    console.log('\nNew columns added to supplier_prices:');
    console.log('  - verified_at: Timestamp when price was verified');
    console.log('  - verification_method: phone, sms, email, or scraped');
    console.log('  - verified_by: Who verified (e.g., "Leo")');
    console.log('  - exclusive_price: Boolean for HomeHeat-only deals');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  migrate().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrate };
