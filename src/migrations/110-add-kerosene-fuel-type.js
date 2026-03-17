/**
 * Migration 110: Add 'kerosene' to fuel_type ENUMs + SMS table
 *
 * Extends 2 ENUM types to accept 'kerosene':
 *   - enum_supplier_prices_fuel_type (migration 002)
 *   - enum_community_deliveries_fuel_type (migration 001)
 *
 * Note: zip_price_stats.fuel_type and county_price_stats.fuel_type are VARCHAR(20)
 * and already accept any string — no ALTER needed.
 *
 * Also adds fuel_type column to sms_price_updates table.
 */

module.exports = {
  name: '110-add-kerosene-fuel-type',

  async up(sequelize) {
    // Step 1: Add 'kerosene' to enum_supplier_prices_fuel_type
    console.log('  Adding kerosene to supplier_prices fuel_type ENUM...');
    try {
      await sequelize.query(`ALTER TYPE enum_supplier_prices_fuel_type ADD VALUE IF NOT EXISTS 'kerosene';`);
      console.log('  ✅ Added kerosene to enum_supplier_prices_fuel_type');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('  ℹ️  kerosene already exists in enum_supplier_prices_fuel_type');
      } else {
        throw err;
      }
    }

    // Step 2: Add 'kerosene' to enum_community_deliveries_fuel_type
    console.log('  Adding kerosene to community_deliveries fuel_type ENUM...');
    try {
      await sequelize.query(`ALTER TYPE enum_community_deliveries_fuel_type ADD VALUE IF NOT EXISTS 'kerosene';`);
      console.log('  ✅ Added kerosene to enum_community_deliveries_fuel_type');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('  ℹ️  kerosene already exists in enum_community_deliveries_fuel_type');
      } else {
        throw err;
      }
    }

    // Step 3: Add fuel_type column to sms_price_updates
    console.log('  Adding fuel_type to sms_price_updates...');
    const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sms_price_updates' AND column_name = 'fuel_type'
    `);

    if (cols.length === 0) {
      await sequelize.query(`
        ALTER TABLE sms_price_updates
        ADD COLUMN fuel_type VARCHAR(20) DEFAULT 'heating_oil';
      `);
      console.log('  ✅ Added fuel_type column to sms_price_updates');
    } else {
      console.log('  ℹ️  fuel_type column already exists in sms_price_updates');
    }
  }
};
