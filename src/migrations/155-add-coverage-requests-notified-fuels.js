/**
 * Migration 155: per-fuel notification tracking on coverage_requests
 *
 * Replaces the single-value `notified_fuel_type` semantics ("this request
 * was notified, done") with per-fuel state. A multi-fuel request can now
 * fire one notification per fuel as coverage gains arrive over time.
 *
 * Schema change:
 *   - ADD COLUMN notified_fuels text[] DEFAULT '{}' NOT NULL
 *   - Backfill: rows with notified_at IS NOT NULL AND notified_fuel_type IS NOT NULL
 *     get notified_fuels = ARRAY[notified_fuel_type]
 *   - Replace idx_cr_unnotified predicate from `notified_at IS NULL` to
 *     set-containment `NOT (notified_fuels @> fuel_types)` so a row whose
 *     fuel_types is later swapped (the upsert path replaces fuel_types but
 *     preserves notified_fuels) is still picked up when its new fuels are
 *     unnotified, even if cardinalities happen to match.
 *
 * Compatibility:
 *   - notified_fuel_type column is retained — PriceAlertService writes it
 *     as "first fuel notified" via COALESCE so admin reports keep working
 *   - notified_at remains a single timestamp, now meaning "last notified at"
 */

async function up(sequelize) {
  // 1. Add column (idempotent)
  await sequelize.query(`
    ALTER TABLE coverage_requests
    ADD COLUMN IF NOT EXISTS notified_fuels text[] NOT NULL DEFAULT '{}'
  `);

  // 2. Backfill from existing single-value column. Idempotent because we only
  //    write rows where notified_fuels is still empty AND we have a value to
  //    promote — so re-running the migration after future writes is safe.
  await sequelize.query(`
    UPDATE coverage_requests
    SET notified_fuels = ARRAY[notified_fuel_type]
    WHERE notified_at IS NOT NULL
      AND notified_fuel_type IS NOT NULL
      AND cardinality(notified_fuels) = 0
  `);

  // 3. Swap the partial index. The old idx_cr_unnotified gates on
  //    notified_at IS NULL, which is the wrong filter once requests can
  //    be partially notified.
  //
  //    The new predicate uses set containment (@>) instead of cardinality
  //    comparison. Cardinality would be wrong if a row's fuel_types is
  //    later swapped (the upsert path in routes/coverage-request.js
  //    replaces fuel_types but preserves notified_fuels). E.g. an
  //    oil-notified row updated to ['kerosene'] is cardinality 1 = 1 but
  //    has not been notified for kerosene. NOT (notified_fuels @> fuel_types)
  //    correctly identifies that as still-pending.
  await sequelize.query(`DROP INDEX IF EXISTS idx_cr_unnotified`);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_cr_unnotified
      ON coverage_requests(zip_code)
      WHERE active = true
        AND NOT (notified_fuels @> fuel_types)
  `);
}

module.exports = { up };
