/**
 * Migration 131: Add Woodruff Energy — Bridgeton, NJ
 *
 * Coverage building for ZIP 08210 (Cape May Court House, NJ / Cape May County).
 *
 *   - Woodruff Energy — Bridgeton, NJ (est. 1931)
 *     Will-call confirmed on own website.
 *     9-county coverage: Cumberland, Salem, Gloucester, Atlantic,
 *     Cape May, Camden, Kent DE, New Castle DE, Delaware (state).
 *     No scrapable prices (Wix site, JS-rendered).
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '131-add-woodruff-energy-bridgeton',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Woodruff Energy',
      slug: 'woodruff-energy',
      phone: '(856) 352-5287',
      email: null,
      website: 'https://www.woodruffenergy.com',
      addressLine1: '73 Water St',
      city: 'Bridgeton',
      state: 'NJ',
      serviceCities: JSON.stringify([
        // Cumberland County
        'Bridgeton', 'Vineland', 'Millville', 'Commercial Township',
        'Upper Deerfield', 'Fairfield', 'Greenwich', 'Hopewell',
        // Salem County
        'Salem', 'Pennsville', 'Woodstown', 'Pilesgrove', 'Alloway',
        // Cape May County
        'Cape May Court House', 'Wildwood', 'Cape May', 'Ocean City',
        'Sea Isle City', 'Avalon', 'Stone Harbor', 'Rio Grande',
        // Gloucester County
        'Glassboro', 'Clayton', 'Pitman', 'Woodbury',
        // Atlantic County
        'Egg Harbor', 'Mays Landing', 'Hammonton',
        // Camden County
        'Winslow', 'Waterford Works'
      ]),
      serviceCounties: JSON.stringify([
        'Cumberland', 'Salem', 'Gloucester', 'Atlantic', 'Cape May', 'Camden'
      ]),
      serviceAreaRadius: 40,
      lat: 39.4273,
      lng: -75.2340,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 131] Upserted Woodruff Energy (Bridgeton, NJ)');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE slug = 'woodruff-energy'
    `);
    console.log('[Migration 131] Rollback: Deactivated Woodruff Energy');
  }
};
