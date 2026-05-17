/**
 * Migration 172: backfill suppliers.fuel_types — normalize 'oil' → 'heating_oil'
 *
 * Background (production probe 2026-05-17):
 *   417 rows tagged with 'oil' (139 active+priced)
 *   299 rows tagged with 'heating_oil'
 *   0 rows tagged with both
 *   5 rows had ["oil","kerosene"] / ["oil","propane",...] mixed legacy tags
 *
 * Companion to migration 163 (heatingoil-qeix) which flipped the column
 * DEFAULT — that stopped the bleeding but left the 417 legacy rows alone.
 * This is the retroactive normalization, deliberately split into its own
 * commit (different risk profile: data UPDATE vs schema metadata).
 *
 * Mechanism: element-wise jsonb_agg swap, preserves all other tags in
 * mixed arrays. ["oil","kerosene","diesel"] → ["heating_oil","kerosene","diesel"].
 *
 * Safety (verified 2026-05-05 in heatingoil-kz7j audit):
 *   - iOS app does NOT decode backend fuel_types — DirectorySupplier has
 *     no fuelTypes field; Codable silently drops unknown keys
 *   - suppliers route uses OR-fallback (heatingoil-6thh, cecff3a65)
 *   - generate-fuel-hub.js uses OR-fallback as of heatingoil-nqps (19b137e0e)
 *   - generate-supplier-pages.js maps both 'oil' and 'heating_oil' to
 *     display label "Heating Oil"
 *   - canonical readers always check 'heating_oil', so post-backfill rows
 *     remain visible everywhere they were visible before
 *
 * Dry-run verification (BEGIN/ROLLBACK against prod 2026-05-17):
 *   - UPDATE touched exactly 417 rows
 *   - 0 oil-tagged after, 716 heating_oil-tagged (= 299 + 417)
 *   - mixed-tag samples correctly preserved kerosene/propane/diesel
 *   - 5 oil+kerosene rows → 5 heating_oil+kerosene rows (verified by slug)
 *   - re-run = 0 rows (idempotent)
 *
 * Out of scope (separate decisions):
 *   - Non-canonical descriptive tags still in use: 'diesel' (140 rows),
 *     'bioheat' (5), 'gasoline' (5), 'coal' (1). These aren't in the
 *     supplier_prices.fuel_type ENUM — they're capability claims, not
 *     pricing eligibility. Whether to keep/gate/drop is a separate scope
 *     question.
 *
 * Bead: heatingoil-kz7j (depends-on qeix, both now resolved).
 */

async function up(sequelize) {
  const [result, meta] = await sequelize.query(`
    UPDATE suppliers
    SET fuel_types = (
      SELECT jsonb_agg(
        CASE WHEN elem = '"oil"'::jsonb THEN '"heating_oil"'::jsonb ELSE elem END
      )
      FROM jsonb_array_elements(fuel_types) elem
    )
    WHERE fuel_types @> '["oil"]'::jsonb
  `);

  const rowCount = meta?.rowCount ?? 0;
  console.log(`[Migration 172] ✅ Normalized fuel_types 'oil' → 'heating_oil' across ${rowCount} rows`);
}

async function down(sequelize) {
  // Reverse: 'heating_oil' → 'oil' across the same rows. This is lossy —
  // we cannot distinguish rows that were natively 'heating_oil' from rows
  // backfilled by up(). Reverting would re-tag ALL heating_oil rows as
  // 'oil', which is not a true inverse of up(). Provided for symmetry /
  // emergency rollback only.
  const [, meta] = await sequelize.query(`
    UPDATE suppliers
    SET fuel_types = (
      SELECT jsonb_agg(
        CASE WHEN elem = '"heating_oil"'::jsonb THEN '"oil"'::jsonb ELSE elem END
      )
      FROM jsonb_array_elements(fuel_types) elem
    )
    WHERE fuel_types @> '["heating_oil"]'::jsonb
  `);

  const rowCount = meta?.rowCount ?? 0;
  console.log(`[Migration 172] ⏪ Reverted ${rowCount} rows (lossy — re-tags all heating_oil as oil)`);
}

module.exports = { up, down };
