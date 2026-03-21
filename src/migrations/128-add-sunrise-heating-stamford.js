/**
 * Migration 128: Add Sunrise Heating Fuels Inc — Stamford, NY
 *
 * Coverage gap fix for ZIP 12167 (Stamford, NY / Delaware County).
 *
 *   - Sunrise Heating Fuels Inc — Stamford, NY (est. 1992)
 *     On-demand confirmed: "On Demand Fuel Oil Delivery — When your home
 *     heating oil tank is low, give us a call and we can schedule a home
 *     heating oil delivery for a refill."
 *     — sunriseheating.com/fuels/home-heating-oil-delivery/
 *     4-county coverage: Delaware, Schoharie, Greene, Otsego.
 *     Prices scrapable from homepage (static HTML): Oil $4.75, Kerosene $5.55.
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '128-add-sunrise-heating-stamford',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Sunrise Heating Fuels Inc',
      slug: 'sunrise-heating-fuels',
      phone: '(607) 652-7951',
      email: null,
      website: 'https://sunriseheating.com',
      addressLine1: '30303 State Highway 23',
      city: 'Stamford',
      state: 'NY',
      serviceCities: JSON.stringify([
        // Delaware County
        'Stamford', 'Delhi', 'Margaretville', 'Roxbury', 'Fleischmanns',
        'Andes', 'Bovina Center', 'Walton', 'Hamden', 'Franklin',
        'Sidney', 'Hobart', 'Davenport', 'Deposit', 'Downsville',
        // Schoharie County
        'Cobleskill', 'Richmondville', 'Schoharie', 'Middleburgh',
        'Sharon Springs', 'Jefferson', 'Summit', 'Gilboa',
        // Greene County
        'Windham', 'Hunter', 'Tannersville', 'Prattsville', 'Catskill',
        'Cairo', 'Durham', 'Greenville', 'Jewett', 'Lexington',
        // Otsego County
        'Oneonta', 'Worcester', 'Cooperstown', 'Cherry Valley',
        'Milford', 'Laurens', 'Otego', 'Schenevus'
      ]),
      serviceCounties: JSON.stringify([
        'Delaware', 'Schoharie', 'Greene', 'Otsego'
      ]),
      serviceAreaRadius: 40,
      lat: 42.4074,
      lng: -74.6148,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 128] Upserted Sunrise Heating Fuels Inc (Stamford, NY)');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE slug = 'sunrise-heating-fuels'
    `);
    console.log('[Migration 128] Rollback: Deactivated Sunrise Heating Fuels');
  }
};
