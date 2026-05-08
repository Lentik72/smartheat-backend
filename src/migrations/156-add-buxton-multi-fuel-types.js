/**
 * Migration 156: Add propane + kerosene to Buxton Oil's fuel_types
 *
 * Buxton Oil (Raymond NH) delivers heating oil, propane, and kerosene COD —
 * but their existing supplier row had `fuel_types = ['oil']` only, so they
 * didn't appear in the propane or kerosene directories. Site redesign in
 * early 2026 left only their propane price published; heating oil and
 * kerosene cards say "Call our office for pricing".
 *
 * This migration expands fuel_types to the canonical three-fuel set so they
 * surface in `/api/v1/suppliers?fuel=propane` and `?fuel=kerosene`. Paired
 * with a `primaryFuelOptional:true` config update in scrape-config.json
 * (same commit) that lets the scraper succeed on propane while heating-oil
 * and kerosene regexes silently no-match.
 *
 * Stale wrong-fuel display on /supplier/buxton-oil is handled separately by a
 * 14-day filter added to generate-supplier-pages.js (same commit) — that's a
 * class fix that auto-handles future similar cases without per-row migrations.
 *
 * Coverage managed by scrape-config.json (no postal_codes_served writes here
 * per post-migration-100 rule).
 *
 * Idempotent: deterministic WHERE + constant SET. Safe to re-run.
 */

module.exports = {
  name: '156-add-buxton-multi-fuel-types',

  async up(sequelize) {
    const [result] = await sequelize.query(`
      UPDATE suppliers
      SET fuel_types = '["heating_oil","propane","kerosene"]'::jsonb,
          updated_at = NOW()
      WHERE slug = 'buxton-oil'
      RETURNING id, name, fuel_types;
    `);

    if (result.length === 0) {
      console.warn('  [156] No supplier with slug=buxton-oil — migration is a no-op');
    } else {
      console.log(`  [156] Updated ${result[0].name} fuel_types → ${JSON.stringify(result[0].fuel_types)}`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers
      SET fuel_types = '["oil"]'::jsonb,
          updated_at = NOW()
      WHERE slug = 'buxton-oil';
    `);
  }
};
