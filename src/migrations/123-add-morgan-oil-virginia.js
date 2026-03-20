/**
 * Migration 123: Add Morgan Oil Corporation — Marshall, VA
 *
 * Coverage gap fix for ZIP 20132 (Purcellville, VA / Loudoun County).
 *
 * DIRECTORY-ONLY (1):
 *   - Morgan Oil Corporation — Marshall, VA (est. 1947)
 *     Will-call confirmed: "There is also the option of calling to order
 *     more oil when you are out." — morganoilcorp.com/page.cfm/go/home-heating-oil
 *     5-county coverage: Fauquier, Culpeper, Rappahannock, Loudoun, Prince William.
 *     Also delivers kerosene, diesel, off-road diesel.
 *     No scrapable prices (not published on site).
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '123-add-morgan-oil-virginia',

  async up(sequelize) {
    // ============================================
    // MORGAN OIL CORPORATION — Marshall, VA
    // Founded 1947 (The Plains, VA). Family-owned petroleum distributor.
    // Will-call + two automatic delivery plans (degree day, Julian day).
    // Serves Fauquier, Culpeper, Rappahannock, Loudoun, Prince William counties.
    // HeatFleet confirms: Aldie, Middleburg (Loudoun), Manassas, Gainesville (PW).
    // Prices NOT scrapable (not on site).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Morgan Oil Corporation',
      slug: 'morgan-oil-corporation',
      phone: '(540) 364-1591',
      email: 'info@MorganOilCorp.com',
      website: 'http://www.morganoilcorp.com',
      addressLine1: '4195 Whiting Rd',
      city: 'Marshall',
      state: 'VA',
      serviceCities: JSON.stringify([
        // Fauquier County
        'Marshall', 'Warrenton', 'The Plains', 'Rectortown',
        'Delaplane', 'Upperville', 'Catlett', 'Broad Run',
        'Calverton', 'Casanova', 'Orlean', 'Remington',
        // Loudoun County
        'Purcellville', 'Leesburg', 'Ashburn', 'Sterling',
        'Aldie', 'Middleburg', 'Hamilton', 'Round Hill',
        'Bluemont', 'Lovettsville', 'Waterford', 'Paeonian Springs',
        // Prince William County
        'Manassas', 'Gainesville', 'Haymarket', 'Bristow',
        'Nokesville', 'Catharpin',
        // Culpeper County
        'Culpeper', 'Brandy Station', 'Lignum', 'Rixeyville',
        // Rappahannock County
        'Washington', 'Sperryville', 'Amissville', 'Flint Hill',
        'Woodville'
      ]),
      serviceCounties: JSON.stringify([
        'Fauquier', 'Culpeper', 'Rappahannock', 'Loudoun', 'Prince William'
      ]),
      serviceAreaRadius: 35,
      lat: 38.8649,
      lng: -77.8311,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 123] Upserted Morgan Oil Corporation (Marshall, VA)');

    console.log('[Migration 123] ✅ Morgan Oil Corporation complete (1 directory-only)');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%morganoilcorp.com%'
    `);
    console.log('[Migration 123] Rollback: Deactivated Morgan Oil Corporation');
  }
};
