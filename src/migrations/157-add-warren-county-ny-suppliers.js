/**
 * Migration 157: Add Warren County NY suppliers
 *
 * Surfaced during 12815 (Brant Lake — Warren County NY) coverage-gap research.
 * No supplier in scrape-config.json covered any Warren County NY ZIP before
 * this migration; Buhrmaster's southern Capital Region footprint stopped at
 * Saratoga County (12866).
 *
 * Two suppliers added:
 *
 * 1. Long Energy — Schenectady HQ (2880 Curry Rd, 12303). Five offices,
 *    family-owned since 1945. Will-call confirmed verbatim on
 *    /fuel-oil-delivery-warren-county-ny ("Will Call delivery — Call us when
 *    you need a fill and we'll get to your Warren County home promptly") and
 *    /fuel-oil-delivery-upstate-new-york ("Will-call delivery — Call us when
 *    you're ready and we'll dispatch to your location promptly"). Stated
 *    coverage: 11 NY counties (Albany, Schenectady, Saratoga, Rensselaer,
 *    Columbia, Greene, Schoharie, Fulton, Montgomery, Warren, Washington) per
 *    dedicated /fuel-oil-delivery-{county}-county-ny pages. No published
 *    price page anywhere on site (sitemap walk confirmed). Coverage overlaps
 *    with Buhrmaster across Albany/Schenectady/Saratoga — additive per
 *    multi-supplier-per-ZIP design (more suppliers = stronger price index).
 *    Phone: (518) 465-6647.
 *
 * 2. Mountain Petroleum — Schroon Lake (40 Industrial Dr, 12870). Single
 *    location, family-owned since 1997. Legal entity KTD Enterprises Inc.
 *    (verified via D&B + BuzzFile — same address, same phone). Will-call
 *    confirmed verbatim on /fuel-delivery ("will-call delivery — In this
 *    case, the customer keeps track of their fuel oil use and calls the
 *    office when a delivery is needed. A 48-hour notice is required with a
 *    minimum delivery of 100 gallons"). Stated coverage: NY counties Essex,
 *    Warren, Washington, Hamilton (own site mentions counties only; no town
 *    enumeration — FuelWonk corroborates). VT counties Addison/Rutland
 *    excluded — VT not in product scope. No published price.
 *    Phone: (518) 532-7968.
 *
 * Both `allowPriceDisplay=false` (no scrapable price); scrape-config disabled
 * with reason. Directory-only entries.
 *
 * Sidebar findings (not actioned):
 *   - G.A. Bove Fuels (bovefuels.com) explicitly lists Brant Lake on its
 *     /about/service-area/ page, but no will-call/COD language anywhere on
 *     own site. Added to `_future_contract_oil` for quarterly re-check.
 *   - Family Danz (familydanz.com) has explicit will-call language but its
 *     stated NY service area excludes Warren County (Capital Region only:
 *     Albany/Greene/Rensselaer/Saratoga/Schenectady). The Lake George SEO
 *     landing page is not load-bearing. Not added.
 *   - Hometown Oil Corp (Warrensburg NY, 518-623-3613), Buckman's Family
 *     Fuel (Chestertown, 518-494-4999), CV Fuel Services (Fort Ann,
 *     518-639-5255), Corinth Oil Delivery (518-654-2421) all lack own
 *     websites. Per operator decision, skipped — not added to _ignore_list,
 *     so they may resurface in future Warren-area research.
 *   - KTD Enterprises is the legal entity for Mountain Petroleum — same
 *     row, no separate add.
 *   - hometown-oil.com is a different company (Portsmouth NH, serves NH+ME),
 *     not the Warrensburg NY Hometown Oil Corp.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '157-add-warren-county-ny-suppliers',

  async up(sequelize) {
    // 1) Long Energy — Schenectady HQ, 11-county Capital Region + Warren coverage
    await upsertSupplier(sequelize, {
      name: 'Long Energy',
      slug: 'long-energy',
      phone: '(518) 465-6647',
      email: null,
      website: 'https://www.longenergy.com',
      addressLine1: '2880 Curry Rd',
      city: 'Schenectady',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Schenectady', 'Albany', 'Troy', 'Saratoga Springs', 'Glens Falls',
        'Queensbury', 'Lake George', 'Warrensburg', 'Chestertown', 'Hague',
        'Bolton Landing', 'Adirondack', 'Hudson', 'Catskill', 'Gloversville',
        'Amsterdam', 'Cobleskill', 'Greenwich', 'Hudson Falls', 'Whitehall',
      ]),
      serviceCounties: JSON.stringify([
        'Albany', 'Schenectady', 'Saratoga', 'Rensselaer', 'Columbia',
        'Greene', 'Schoharie', 'Fulton', 'Montgomery', 'Warren', 'Washington',
      ]),
      serviceAreaRadius: 60,
      lat: 42.782276,
      lng: -73.944818,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    // 2) Mountain Petroleum — Schroon Lake, Adirondack region (Essex/Warren/Washington/Hamilton)
    await upsertSupplier(sequelize, {
      name: 'Mountain Petroleum',
      slug: 'mountain-petroleum',
      phone: '(518) 532-7968',
      email: 'office@mountainpetroleum.com',
      website: 'https://www.mountainpetroleum.com',
      addressLine1: '40 Industrial Dr',
      city: 'Schroon Lake',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Schroon Lake', 'Severance', 'Paradox', 'Adirondack', 'Brant Lake',
        'Pottersville', 'Chestertown', 'North Creek', 'Warrensburg', 'Hague',
        'Ticonderoga',
      ]),
      serviceCounties: JSON.stringify(['Essex', 'Warren', 'Washington', 'Hamilton']),
      serviceAreaRadius: 35,
      lat: 43.841273,
      lng: -73.759213,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 157] ✅ Added Long Energy (Schenectady), Mountain Petroleum (Schroon Lake) — Warren County NY coverage');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('long-energy', 'mountain-petroleum')
    `);
    console.log('[Migration 157] Rolled back Warren County NY suppliers');
  },
};
