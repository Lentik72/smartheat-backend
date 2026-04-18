/**
 * Migration 145: Add 'propane' to fuel_type ENUMs.
 *
 * supplier_prices.fuel_type is ENUM('heating_oil', 'kerosene') — needs 'propane'.
 * community_deliveries.fuel_type is also ENUM — add 'propane' there too.
 * county_current_stats and zip_current_stats use VARCHAR — no change needed.
 */
module.exports = {
  name: '145-add-propane-fuel-type',

  async up(sequelize) {
    await sequelize.query(`
      ALTER TYPE enum_supplier_prices_fuel_type ADD VALUE IF NOT EXISTS 'propane'
    `);

    await sequelize.query(`
      ALTER TYPE enum_community_deliveries_fuel_type ADD VALUE IF NOT EXISTS 'propane'
    `);

    console.log('[Migration 145] Added propane to fuel_type ENUMs');
  },

  async down() {
    console.log('[Migration 145] Down: no-op (cannot remove ENUM values in Postgres)');
  },
};
