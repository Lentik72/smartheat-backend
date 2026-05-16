/**
 * Migration 171: Add suppliers.primary_fuel_optional column (heatingoil-kjnt)
 *
 * (Originally drafted as mig 170; bumped to 171 after a parallel session
 * shipped 170-backfill-service-cities-bulk while this branch was in flight.)
 *
 * The Cluster A health-freshness fix needs a SQL-addressable boolean for
 * "this supplier's primary fuel (heating_oil) is intentionally dark — judge
 * staleness on any successfully-scraped fuel." Until now this lived only as
 * `primaryFuelOptional: true` in scrape-config.json (currently set only on
 * `buxtonoil.com`) and was consumed by the scraper's failure-counter gate
 * (priceScraper.js shouldSkipFailureCounter). No dashboard/staleness query
 * could see it without dragging JSON-config matching through every SELECT,
 * so a real column is cleaner.
 *
 * Source-of-truth contract: ScrapeConfigSync writes this column from
 * scrape-config.json's `primaryFuelOptional` field on each boot (single-
 * branch entries only — multi-branch chains follow the existing
 * _syncSupplierCoverage contract where supplier-row attributes come from
 * per-branch migrations, not from scrape-config). This migration backfills
 * Buxton so the column is correct before ScrapeConfigSync runs for the
 * first time post-deploy; subsequent boots maintain it.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE ... WHERE slug + condition.
 * Rollback NOT inverse — see down(). Bead heatingoil-kjnt.
 */

async function up(sequelize) {
  await sequelize.query(`
    ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS primary_fuel_optional BOOLEAN NOT NULL DEFAULT false
  `);

  // Backfill the only current user. Idempotent: only writes if currently false
  // for that slug. If the row is missing or already true, this is a no-op.
  await sequelize.query(`
    UPDATE suppliers
    SET primary_fuel_optional = true
    WHERE slug = 'buxton-oil'
      AND primary_fuel_optional = false
  `);
}

async function down(sequelize) {
  // Drop is destructive for any data written by ScrapeConfigSync between
  // mig-up and rollback. Acceptable because the only source of truth is
  // scrape-config.json — the next deploy after rollback would re-derive
  // the flag from config. Documented in heatingoil-kjnt rollback notes.
  await sequelize.query(`
    ALTER TABLE suppliers
    DROP COLUMN IF EXISTS primary_fuel_optional
  `);
}

module.exports = { up, down };
