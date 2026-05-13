/**
 * Migration 165: Rehabilitate orphan CN Brown Energy (Brewer) row.
 *
 * Background: migration 045 inserted CN Brown Energy (slug `cn-brown-energy`)
 * tied to legacy domain `cnbrown.com` covering 31 Penobscot/Piscataquis ZIPs.
 * Migrations 146 (Augusta) and 152 (Lancaster) then introduced the
 * `cnbrownenergy.com` multi-branch model where each branch is a separate
 * supplier row keyed by slug (`cn-brown-augusta`, `cn-brown-lancaster`). The
 * original `cn-brown-energy` row was left behind:
 *   - website still pointing at `cnbrown.com` (disabled in scrape-config)
 *   - postal_codes_served effectively unreachable (ScrapeConfigSync union-
 *     merges from config, but the only config entry referencing this slug
 *     was disabled)
 *   - /supplier/cn-brown-energy → 404
 *   - /api/v1/suppliers?zip=04401 (Bangor) → 0 CN Brown results
 *
 * Side effect: every boot, migration 045's idempotency check
 * (`name ILIKE '%cn brown%'`) matched one of the new branch rows and logged
 * "⚠️  CN Brown Energy already exists: ...". Cosmetic; expected.
 *
 * This migration:
 *   1. Repoints the orphan row at `cnbrownenergy.com` (the live multi-branch
 *      domain) and renames its slug to `cn-brown-brewer` so it aligns with
 *      the new branch entry added in scrape-config.json.
 *   2. Drops `propane` from fuel_types — CN Brown's Brewer Energy Office
 *      listing currently shows Oil, K1, Diesel, Offroad (no propane).
 *
 * Coverage shrink (31 stale ZIPs → 10 Brewer-routed ZIPs) is NOT performed
 * here — ScrapeConfigSync owns postal_codes_served from migration 100 onward
 * (backend/CLAUDE.md "Coverage Authority"). The shrink happens on the next
 * boot when ScrapeConfigSync sees `postalCodesOverride: true` on the new
 * cn-brown-brewer branch in scrape-config.json and full-replaces the row's
 * coverage with the 10 ZIPs that cnbrownenergy.com's live lookup routes to
 * Brewer (probed 2026-05-13). The other 21 stale ZIPs split across
 * Pittsfield (~11 at $5.099) and Mattawamkeag (~5 at $5.099) — those
 * branches are net-new and tracked in separate beads.
 *
 * Brewer-routed ZIPs (lookup ZIP 04473 → $4.799 Brewer):
 *   04402  Bangor (PO Box)
 *   04411  Bradford
 *   04412  Brewer (office home)
 *   04418  Bradley
 *   04428  Eddington
 *   04429  Holden
 *   04453  Lincoln Center
 *   04461  Milford
 *   04468  Old Town
 *   04473  Orono
 *
 * Office: 341 Wilson Street, Suite A, Brewer ME 04412
 * Phone:  (207) 989-4367 (ho3042Group@cnbrown.com)
 *
 * upsertSupplier is intentionally NOT used because its domain-LIKE matching
 * would collide with the Augusta + Lancaster rows that share
 * `cnbrownenergy.com`. Direct SQL keyed on slug = unambiguous.
 *
 * Idempotent: if `cn-brown-brewer` already exists (migration re-run) or the
 * orphan `cn-brown-energy` row has been deleted by hand, the UPDATE is a
 * no-op.
 */

module.exports = {
  name: '165-rehabilitate-cn-brown-brewer',

  async up(sequelize) {
    const [orphan] = await sequelize.query(
      `SELECT id FROM suppliers WHERE slug = 'cn-brown-energy' LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (!orphan) {
      console.log('[Migration 165] No cn-brown-energy row found — nothing to rehabilitate');
      return;
    }

    const [conflict] = await sequelize.query(
      `SELECT id FROM suppliers WHERE slug = 'cn-brown-brewer' LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (conflict) {
      console.log('[Migration 165] cn-brown-brewer already exists — skipping rehab');
      return;
    }

    const serviceCities = [
      'Bangor', 'Bradford', 'Brewer', 'Bradley', 'Eddington',
      'Holden', 'Lincoln Center', 'Milford', 'Old Town', 'Orono',
    ];

    await sequelize.query(
      `
      UPDATE suppliers SET
        slug = $1,
        name = $2,
        phone = $3,
        website = $4,
        address_line1 = $5,
        city = $6,
        state = $7,
        service_cities = $8,
        service_counties = $9,
        service_area_radius = $10,
        lat = $11,
        lng = $12,
        fuel_types = $13,
        active = TRUE,
        allow_price_display = TRUE,
        updated_at = NOW()
      WHERE slug = 'cn-brown-energy'
      `,
      {
        bind: [
          'cn-brown-brewer',
          'CN Brown Energy (Brewer)',
          '(207) 989-4367',
          'https://cnbrownenergy.com',
          '341 Wilson Street, Suite A',
          'Brewer',
          'ME',
          JSON.stringify(serviceCities),
          JSON.stringify(['Penobscot']),
          25,
          44.7912,
          -68.7420,
          JSON.stringify(['heating_oil', 'kerosene']),
        ],
      }
    );

    console.log('[Migration 165] ✅ Rehabilitated cn-brown-energy → cn-brown-brewer (Brewer ME, 10 ZIPs)');
  },

  async down(sequelize) {
    await sequelize.query(
      `
      UPDATE suppliers SET
        slug = 'cn-brown-energy',
        name = 'CN Brown Energy',
        website = 'https://www.cnbrown.com',
        allow_price_display = FALSE,
        updated_at = NOW()
      WHERE slug = 'cn-brown-brewer'
      `
    );
    console.log('[Migration 165] Rolled back: cn-brown-brewer → cn-brown-energy');
  },
};
