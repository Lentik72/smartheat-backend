/**
 * Migration 150: Add Hudson Fuel Oil (New Richmond, OH — Cincinnati metro)
 *
 * Surfaced during the 2026-04-23 VT/OH state-page sweep. Blocked at the time
 * because Cincinnati ZIPs were missing from zip-database.json. Unblocked by
 * heatingoil-xou7 (commit 5cb009c0a, which closed all 88 OH counties).
 *
 * COD confirmed verbatim on own site:
 *   "No Contracts to sign"
 *   — https://www.hudsonfueloil.com/residential-heating-oil-products
 *
 * Also the 3rd in-state OH supplier — crosses MIN_SUPPLIERS_FOR_PAGE=3
 * threshold in scripts/generate-seo-pages.js:39 and unblocks /prices/oh/
 * state landing page generation (previously 404 because only Smart Oil +
 * RJ Wright were active in-state).
 *
 * Not scrapable: residential page is static HTML but carries no $X.XX
 * prices (all delivered via "call us" model). allowPriceDisplay=false,
 * scrape-config disabled with reason.
 *
 * Coverage: 70 Hamilton + Clermont County ZIPs (Cincinnati proper + eastern
 * suburbs). Hudson also serves Northern Kentucky but KY is out of our active
 * state footprint — not included here.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '150-add-hudson-fuel-oil-oh',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Hudson Fuel Oil',
      slug: 'hudson-fuel-oil',
      phone: '(513) 734-2212',
      email: 'sales@hudsonfueloil.com',
      website: 'https://www.hudsonfueloil.com',
      addressLine1: '2598 St. Rt. 222',
      city: 'New Richmond',
      state: 'OH',
      serviceCities: JSON.stringify([
        'Cincinnati', 'New Richmond', 'Amelia', 'Batavia', 'Bethel',
        'Milford', 'Loveland', 'Mason', 'Addyston', 'Cleves', 'Harrison',
        'Miamitown', 'Mount Orab',
      ]),
      serviceCounties: JSON.stringify(['Hamilton', 'Clermont']),
      serviceAreaRadius: 25,
      lat: 38.9537,
      lng: -84.2379,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 150] ✅ Added Hudson Fuel Oil (New Richmond OH — Cincinnati metro, Hamilton+Clermont)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'hudson-fuel-oil'`);
    console.log('[Migration 150] Rolled back Hudson Fuel Oil');
  },
};
