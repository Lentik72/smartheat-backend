/**
 * Migration 132: Add Patriot Discount Oil — Whitehouse, NJ
 *
 * COD confirmed by operator (phone verification).
 * Public daily price on homepage ("Today's Oil Price").
 * 150-gallon minimum. Heating oil only.
 *
 * Coverage: Hunterdon County (all except Lambertville/E.Amwell/W.Amwell),
 * parts of Warren, Somerset, and Morris counties.
 * Scrapable: yes (static HTML, sup tag normalized by priceScraper).
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '132-add-patriot-discount-oil-nj',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Patriot Discount Oil',
      slug: 'patriot-discount-oil',
      phone: '(908) 534-0100',
      email: 'info@patriotdiscountoil.com',
      website: 'https://patriotdiscountoil.com',
      addressLine1: 'P.O. Box 117',
      city: 'Whitehouse',
      state: 'NJ',
      serviceCities: JSON.stringify([
        // Hunterdon County (all except Lambertville, East Amwell, West Amwell)
        'Annandale', 'Asbury', 'Baptistown', 'Bloomsbury', 'Califon',
        'Clinton', 'Flemington', 'Frenchtown', 'Glen Gardner', 'Hampton',
        'High Bridge', 'Lebanon', 'Little York', 'Milford', 'Neshanic Station',
        'Oldwick', 'Pittstown', 'Pottersville', 'Quakertown', 'Readington',
        'Rosemont', 'Sergeantsville', 'Stanton', 'Stockton',
        'Three Bridges', 'Whitehouse', 'Whitehouse Station',
        // Warren County
        'Belvidere', 'Broadway', 'Lopatcong', 'Mansfield', 'Oxford',
        'Phillipsburg', 'Pohatcong', 'Port Murray', 'Stewartsville', 'Washington',
        // Somerset County
        'Basking Ridge', 'Bedminster', 'Bernardsville', 'Bridgewater',
        'Branchburg', 'Far Hills', 'Gladstone', 'Hillsborough', 'Manville',
        'Millstone', 'Peapack', 'Raritan', 'Somerville',
        // Morris County
        'Chester', 'Flanders', 'Long Valley', 'Mendham'
      ]),
      serviceCounties: JSON.stringify([
        'Hunterdon', 'Warren', 'Somerset', 'Morris'
      ]),
      serviceAreaRadius: 30,
      lat: 40.6164,
      lng: -74.7571,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 132] Upserted Patriot Discount Oil (Whitehouse, NJ)');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE slug = 'patriot-discount-oil'
    `);
    console.log('[Migration 132] Rollback: Deactivated Patriot Discount Oil');
  }
};
