/**
 * Migration 129: Add JK & Sons Fuel Oil — Margaretville, NY
 *
 * Coverage building for ZIP 12455 (Margaretville / Kelly Corners, Delaware County).
 *
 *   - JK & Sons Fuel Oil — Margaretville, NY
 *     On-demand confirmed: "We provide automatic delivery, on-demand/as needed
 *     delivery and emergency/24 hours a day year-round service."
 *     — jkandsonsfuel.com/services/heating-oil-delivery/
 *     Multi-county coverage: Delaware + parts of Ulster, Greene, Schoharie, Otsego, Chenango.
 *     No scrapable prices (not published on site).
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '129-add-jk-sons-fuel-margaretville',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'JK & Sons Fuel Oil',
      slug: 'jk-and-sons-fuel-oil',
      phone: '(845) 586-4755',
      email: 'kowatch.jk@gmail.com',
      website: 'https://www.jkandsonsfuel.com',
      addressLine1: '66 County Highway 36',
      city: 'Margaretville',
      state: 'NY',
      serviceCities: JSON.stringify([
        // Delaware County
        'Margaretville', 'Arkville', 'Fleischmanns', 'Halcottsville',
        'New Kingston', 'Roxbury', 'Denver', 'Andes', 'Bovina Center',
        'Delhi', 'Stamford', 'Hobart', 'Downsville',
        // Greene County
        'Prattsville', 'Windham', 'Jewett', 'Lexington', 'Hunter',
        // Schoharie County
        'Gilboa', 'Conesville',
        // Ulster County
        'Shandaken', 'Pine Hill', 'Big Indian', 'Phoenicia',
        // Otsego County
        'Meridale', 'Davenport',
        // Chenango County
        'Walton'
      ]),
      serviceCounties: JSON.stringify([
        'Delaware', 'Ulster', 'Greene', 'Schoharie', 'Otsego', 'Chenango'
      ]),
      serviceAreaRadius: 25,
      lat: 42.1468,
      lng: -74.6499,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 129] Upserted JK & Sons Fuel Oil (Margaretville, NY)');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE slug = 'jk-and-sons-fuel-oil'
    `);
    console.log('[Migration 129] Rollback: Deactivated JK & Sons Fuel Oil');
  }
};
