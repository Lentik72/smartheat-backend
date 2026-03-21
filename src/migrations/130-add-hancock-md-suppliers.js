/**
 * Migration 130: Add Hancock, MD area suppliers — Washington County
 *
 * Coverage gap fix for ZIP 21750 (Hancock, MD / Washington County).
 *
 * DIRECTORY-ONLY (2):
 *   1. Steffey and Findlay, Inc. — Hagerstown, MD (est. 1937)
 *      COD confirmed: "Payment on delivery" + "You may call us each time
 *      you want a fuel oil delivery" — steffeyfindlay.com/fuel-oil/
 *      Washington County / Tri-State area. No scrapable prices.
 *
 *   2. Brothers Discount Heating Oil (Hardell Corp) — Hagerstown, MD
 *      COD confirmed: "Brothers has a cash or credit card payment in advance
 *      policy for all fuel deliveries. You can order and pay here on the
 *      website, call us or stop by our office to purchase fuel oil."
 *      — brothersheatingoil.com
 *      Washington County MD. No scrapable prices.
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '130-add-hancock-md-suppliers',

  async up(sequelize) {
    // ============================================
    // STEFFEY AND FINDLAY, INC. — Hagerstown, MD
    // Oldest fuel oil distributor in Washington County (est. 1937).
    // Will-call + payment on delivery confirmed.
    // Also sells coal and masonry/building materials.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Steffey and Findlay, Inc.',
      slug: 'steffey-and-findlay',
      phone: '(301) 733-1600',
      email: null,
      website: 'https://steffeyfindlay.com',
      addressLine1: '177 South Burhans Boulevard',
      city: 'Hagerstown',
      state: 'MD',
      serviceCities: JSON.stringify([
        'Hagerstown', 'Hancock', 'Williamsport', 'Boonsboro',
        'Smithsburg', 'Clear Spring', 'Funkstown', 'Maugansville',
        'Keedysville', 'Sharpsburg', 'Rohrersville', 'Cascade',
        'Cavetown', 'Fairplay', 'Brownsville'
      ]),
      serviceCounties: JSON.stringify(['Washington']),
      serviceAreaRadius: 30,
      lat: 39.6358,
      lng: -77.7264,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: '7:30 AM - 11:00 AM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 130] Upserted Steffey and Findlay (Hagerstown, MD)');

    // ============================================
    // BROTHERS DISCOUNT HEATING OIL (Hardell Corp) — Hagerstown, MD
    // Cash/credit payment in advance for all deliveries.
    // Online ordering available. 125 gal minimum.
    // Sister company of Hardell Services (same address).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Brothers Discount Heating Oil',
      slug: 'brothers-discount-heating-oil',
      phone: '(301) 739-2424',
      email: 'support@hardellservices.com',
      website: 'https://www.brothersheatingoil.com',
      addressLine1: '44 Garlinger Avenue',
      city: 'Hagerstown',
      state: 'MD',
      serviceCities: JSON.stringify([
        'Hagerstown', 'Hancock', 'Williamsport', 'Boonsboro',
        'Smithsburg', 'Clear Spring', 'Funkstown', 'Maugansville',
        'Keedysville', 'Sharpsburg', 'Rohrersville', 'Cascade',
        'Cavetown', 'Fairplay', 'Brownsville'
      ]),
      serviceCounties: JSON.stringify(['Washington']),
      serviceAreaRadius: 30,
      lat: 39.6434,
      lng: -77.7150,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 125,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 130] Upserted Brothers Discount Heating Oil (Hagerstown, MD)');

    console.log('[Migration 130] ✅ 2 Washington County MD suppliers complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE slug IN ('steffey-and-findlay', 'brothers-discount-heating-oil')
    `);
    console.log('[Migration 130] Rollback: Deactivated 2 Washington County MD suppliers');
  }
};
