/**
 * Migration 152: Add CN Brown Energy (Lancaster) — NEK VT + Coos NH
 *
 * Third CN Brown branch on cnbrownenergy.com (sister to cn-brown-augusta at
 * 362 Riverside Dr, Augusta ME and cn-brown-energy at Berlin NH on cnbrown.com).
 * Lancaster office at 202 Main Street, Suite C, Lancaster NH — serves 10 NH
 * ZIPs (Coos County + northern Grafton) and 4 VT ZIPs (Caledonia/Essex counties
 * in the Northeast Kingdom).
 *
 * COD/will-call confirmed on cnbrownenergy.com/residential (same site as
 * Augusta — "Will-Call Delivery" + "WILL CALL customers"). Prices scrapable
 * via the existing lookup pattern: `?location-zip-code=03584` returns
 * "Lancaster Energy Office" with $5.419 in static HTML.
 *
 * First multi-branch supplier shipped via the heatingoil-jx8r architecture:
 * scrape-config.json `branches` map keyed by supplier slug, priceScraper
 * `getConfigForSupplier` merges branch fields over shared top-level.
 *
 * Unblocks the two real VT coverage gaps surfaced during the 2026-04-24
 * audit: 05653 Eden Mills (via city/county matching to Caledonia) and
 * 05871 West Burke (direct ZIP match). Ship together with the scrape-config
 * branch entry to avoid orphan-branch warnings.
 *
 * Phone verified on https://cnbrownenergy.com/locations/?location-zip-code=03584:
 *   "Lancaster Energy Office / 202 Main Street, Suite C, Lancaster, NH 03584
 *    / Telephone: 603-788-2012 / Email: ho3061Group@cnbrown.com"
 *
 * Spec: docs/superpowers/specs/2026-04-24-multi-branch-scrape-config-design.md
 * Bead: heatingoil-jx8r
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '152-add-cn-brown-lancaster',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'CN Brown Energy (Lancaster)',
      slug: 'cn-brown-lancaster',
      phone: '(603) 788-2012',
      email: 'ho3061Group@cnbrown.com',
      website: 'https://cnbrownenergy.com',
      addressLine1: '202 Main Street, Suite C',
      city: 'Lancaster',
      state: 'NH',
      serviceCities: JSON.stringify([
        'Lancaster', 'Whitefield', 'Jefferson', 'Dalton', 'Groveton',
        'Littleton', 'Bethlehem', 'Twin Mountain', 'Gorham', 'Berlin',
        'St. Johnsbury', 'Lyndonville', 'West Burke', 'Barton',
      ]),
      serviceCounties: JSON.stringify(['Coos', 'Grafton', 'Caledonia', 'Essex']),
      serviceAreaRadius: 40,
      lat: 44.4878,
      lng: -71.5707,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 152] ✅ Added CN Brown Energy (Lancaster) — Coos NH + Caledonia/Essex VT');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'cn-brown-lancaster'`);
    console.log('[Migration 152] Rolled back CN Brown Energy (Lancaster)');
  },
};
