/**
 * Migration 163: stop propagating legacy 'oil' tag to new suppliers
 *
 * Background (production probe 2026-05-05):
 *   table = suppliers
 *   column = fuel_types  (jsonb, nullable)
 *   column_default = '["oil"]'::jsonb
 *
 * Every raw INSERT into `suppliers` that omits `fuel_types` picks up the
 * legacy `["oil"]` default. ScrapeConfigSync.js does exactly that (it
 * INSERTs id, name, phone, website, postal_codes_served, active, source —
 * no fuel_types column), so every newly-synced supplier inherits the
 * non-canonical tag.
 *
 * Canonical fuel keys used everywhere else (supplier_prices.fuel_type
 * ENUM, coverage_requests.fuel_types text[], iOS FuelType.rawValue):
 *   heating_oil, kerosene, propane
 *
 * The model-level mirror (src/models/Supplier.js:169 `defaultValue:
 * ['oil']`) is dead code because almost nothing uses Supplier.create()
 * directly — it's updated in the same commit for consistency.
 *
 * Scope:
 *   - column default flips from `["oil"]` to `["heating_oil"]`
 *   - existing 412 rows with `["oil"]` are NOT touched (kz7j backfill)
 *
 * Compatibility (verified 2026-05-05 in qeix bead):
 *   - iOS app: DirectorySupplier (Swift) has no `fuelTypes` field —
 *     Codable silently drops unknown keys
 *   - scripts/generate-supplier-pages.js maps both `'oil'` and
 *     `'heating_oil'` to "Heating Oil" — display unchanged
 *   - src/routes/suppliers.js has OR-fallback handling for tag
 *     divergence (heatingoil-6thh)
 *
 * Bead: heatingoil-qeix (blocks heatingoil-kz7j backfill).
 */

async function up(sequelize) {
  await sequelize.query(`
    ALTER TABLE suppliers
    ALTER COLUMN fuel_types SET DEFAULT '["heating_oil"]'::jsonb
  `);

  console.log('[Migration 163] ✅ Flipped suppliers.fuel_types DEFAULT from ["oil"] → ["heating_oil"]');
}

async function down(sequelize) {
  await sequelize.query(`
    ALTER TABLE suppliers
    ALTER COLUMN fuel_types SET DEFAULT '["oil"]'::jsonb
  `);

  console.log('[Migration 163] ⏪ Reverted suppliers.fuel_types DEFAULT to ["oil"]');
}

module.exports = { up, down };
