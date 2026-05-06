/**
 * Migration 120: Add composite indexes for supplier dashboard queries
 *
 * The supplier dashboard endpoint runs time-windowed aggregations on
 * supplier_clicks (by supplier + date) and user_locations (by zip + date).
 * Without composite indexes, these queries scan full tables. With proper
 * indexes, they hit <100ms even under concurrent load.
 */
'use strict';

async function up(sequelize) {
  // supplier_clicks: used by demand, trend, click-share, and price-impact queries
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_clicks_supplier_created
    ON supplier_clicks(supplier_id, created_at)
  `);
  console.log('[Migration 120] Created idx_supplier_clicks_supplier_created');

  // user_locations: used by area-search counts scoped to supplier's postal_codes_served
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_user_locations_zip_created
    ON user_locations(zip_code, created_at)
  `);
  console.log('[Migration 120] Created idx_user_locations_zip_created');
}

module.exports = { up };
