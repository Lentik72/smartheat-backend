/**
 * Migration 159: Add Ron Bush Oil (LaFayette NY — Central NY / Syracuse metro)
 *
 * Surfaced during Kennedy NY 14747 coverage-gap research as a side finding —
 * Ron Bush Oil joined the Mirabito Energy Products family on Aug 20, 2025,
 * keeping its retained sub-brand under
 * mirabito.com/residential/ron-bush-oil-a-division-of-mirabito-energy-products/.
 *
 * First-party COD evidence (verified via raw curl, not subagent narration):
 *   "If you are currently a cash-on-delivery customer, there is no change."
 *   — https://www.mirabito.com/residential/ron-bush-oil-a-division-of-mirabito-energy-products/
 *
 * FMCSA: USDOT 1493009 — ACTIVE (intrastate hazmat, 11 power units, 5 drivers,
 * 6046 Cherry Valley Turnpike LaFayette NY 13084).
 *
 * Service area: 8 central NY counties — Onondaga / Cortland / Madison /
 * Cayuga / Tompkins / Chenango / Oswego / Oneida. 77 ZIPs within ~40 miles of
 * HQ, including Syracuse metro (13202–13290), Cayuga County (13021–13166),
 * and outlying rural ZIPs. Coverage managed by scrape-config.json (key:
 * mirabito.com/ronbushoil, postal_codes_served NOT written here per
 * post-migration-100 rule).
 *
 * ZIP overlap with NOCO Cato/Syracuse branches is expected and additive
 * (multi-supplier-per-ZIP design — more suppliers = stronger price index).
 *
 * Not scrapable: Mirabito sub-brand pages publish no live cash price; live
 * pricing lives behind the authenticated Online Portal. allowPriceDisplay=false,
 * scrape-config pattern: "none".
 *
 * Mirrors precedent: mirabito.com/blanketoil scrape-config key + multi-branch
 * chain rule scoping.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '159-add-ron-bush-oil',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Ron Bush Oil',
      slug: 'ron-bush-oil',
      phone: '(315) 677-9746',
      email: null,
      website: 'https://www.mirabito.com/residential/ron-bush-oil-a-division-of-mirabito-energy-products/',
      addressLine1: '6046 Cherry Valley Turnpike',
      city: 'LaFayette',
      state: 'NY',
      serviceCities: JSON.stringify([
        'LaFayette', 'Syracuse', 'East Syracuse', 'North Syracuse', 'Cortland',
        'Auburn', 'Skaneateles', 'Tully', 'Marcellus', 'Manlius', 'Cazenovia',
        'Camillus', 'Liverpool', 'Baldwinsville', 'Fulton', 'Oswego',
        'Hamilton', 'Sherburne', 'Norwich', 'Oneida', 'Canastota',
      ]),
      serviceCounties: JSON.stringify([
        'Onondaga', 'Cortland', 'Madison', 'Cayuga', 'Tompkins',
        'Chenango', 'Oswego', 'Oneida',
      ]),
      serviceAreaRadius: 40,
      lat: 42.8923,
      lng: -76.1043,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 159] ✅ Added Ron Bush Oil (LaFayette NY — Mirabito sub-brand, 8-county central NY footprint)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug = 'ron-bush-oil'
    `);
    console.log('[Migration 159] Rolled back Ron Bush Oil');
  },
};
