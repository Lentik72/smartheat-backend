// src/migrations/173-create-price-rejections.js
// Unified log of auto-blocked prices (drop + state-median rejections) from BOTH
// scrape paths. The 6 AM ops email reads the last 24h from here. heatingoil-lpk9.
async function up(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS price_rejections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_id uuid,
      supplier_name text,
      fuel_type text,
      new_price numeric,
      previous_price numeric,
      market_median numeric,
      drop_percent numeric,
      below_median_percent numeric,
      state text,
      reason text,
      source text,
      rejected_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_price_rejections_rejected_at ON price_rejections (rejected_at)
  `);
}
async function down(sequelize) {
  await sequelize.query(`DROP TABLE IF EXISTS price_rejections`);
}
module.exports = { up, down };
