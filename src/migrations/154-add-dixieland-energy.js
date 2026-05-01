/**
 * Migration 154: Dixie Land Energy (Rising Sun MD)
 *
 * Single-branch family supplier since 2002 covering Cecil + Harford counties MD,
 * New Castle County DE, and Chester/Lancaster/York counties PA from one office at
 * 281 East Main St, Rising Sun MD 21911. Owns trucks, also runs an HVAC arm
 * (Dixie Land Heating & Air Conditioning) — fuel delivery is the primary business.
 *
 * COD: "Will Call Delivery — This option gives you the greatest level of control
 * of when your fuel will be delivered. You can manage your fuel needs by calling
 * to schedule you delivery yourself." (https://www.dixielandenergy.com/fuel)
 * Confirmed applies to heating oil: "If you run out of heating oil, your burner
 * will need to be primed and started."
 *
 * Phone: 1-888-517-3680. Email: csr@dixielandenergy.com.
 * Site is Duda + MyFuelPortal — pricing is gated behind customer login at
 * dixielandenergy.myfuelportal.com. No public /pricing, /rates, /prices, /price,
 * /oil-price, /todays-price page (all 404). allowPriceDisplay=false.
 *
 * Fuels offered: heating oil, propane, diesel (also gasoline + bioheat + motor oil
 * — those don't map to our fuel_types enum, so omitted). No K-1 kerosene.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written here
 * per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '154-add-dixieland-energy',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Dixie Land Energy',
      slug: 'dixie-land-energy',
      phone: '(888) 517-3680',
      email: 'csr@dixielandenergy.com',
      website: 'https://www.dixielandenergy.com',
      addressLine1: '281 East Main St., Ste B',
      city: 'Rising Sun',
      state: 'MD',
      serviceCities: JSON.stringify([
        'Rising Sun', 'Colora', 'Elkton', 'North East', 'Carpenters Point',
        'Port Deposit', 'Perryville', 'Chesapeake City', 'Havre de Grace',
        'Aberdeen', 'Belcamp', 'Darlington', 'Street', 'Bel Air',
        'Jarrettsville', 'Churchville', 'Pylesville', 'Whiteford', 'Edgewood',
        'Joppa', 'Middle River', 'Earleville', 'Galena',
        'Middletown', 'Newark', 'New Castle', 'Bear', 'Glasgow',
        'Oxford', 'Nottingham', 'Toughkenamon', 'West Grove',
        'Lincoln University', 'Quarryville', 'Kennett Square', 'Delta',
      ]),
      serviceCounties: JSON.stringify([
        'Cecil', 'Harford', 'Kent', 'Baltimore',
        'New Castle',
        'Chester', 'Lancaster', 'York',
      ]),
      serviceAreaRadius: 35,
      lat: 39.6995,
      lng: -76.0530,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 154] ✅ Added Dixie Land Energy (Rising Sun MD)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug = 'dixie-land-energy'
    `);
    console.log('[Migration 154] Rolled back Dixie Land Energy');
  },
};
