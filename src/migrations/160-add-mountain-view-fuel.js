/**
 * Migration 160: Mountain View Fuel (Bethel PA)
 *
 * Mountain View Fuel is the heating-oil / kerosene / diesel / gasoline brand
 * of Countryside Propane LLC (372 E. Rehrersburg Rd, Bethel PA 19507). Single
 * branch family operation serving Berks, Lebanon, Lancaster, and Dauphin
 * counties from one office. Owns trucks.
 *
 * COD: "On-Call and Automatic Heating Oil Delivery" — explicit will-call
 * model offered alongside auto-delivery on /fuel-delivery; customers choose
 * which option. "24/7/365 emergency services" for run-outs.
 *   https://www.mountainviewfuel.com/fuel-delivery
 *
 * Fuels offered: heating oil, K-1 kerosene, propane, on-road diesel,
 * off-road diesel, gasoline. fuel_types stores the three that have their own
 * directory pages: heating_oil + kerosene + propane.
 *
 * Phone: 717-933-9505 (fuel) / 717-933-9500 (propane main). Email:
 * sales@mountainviewfuel.com. Operating entity confirmed via footer on
 * every page: "© 2024 by Countryside Propane LLC".
 *
 * Pricing not published anywhere on site ("Call for competitive pricing
 * 717-933-9505"). allowPriceDisplay=false; scrape-config entry disabled
 * with pattern:"none".
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '160-add-mountain-view-fuel',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Mountain View Fuel',
      slug: 'mountain-view-fuel',
      phone: '(717) 933-9505',
      email: 'sales@mountainviewfuel.com',
      website: 'https://www.mountainviewfuel.com',
      addressLine1: '372 E. Rehrersburg Road',
      city: 'Bethel',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Bethel', 'Myerstown', 'Lebanon', 'Hershey', 'Mohnton',
        'Fredericksburg', 'Ephrata', 'Shillington', 'Lititz', 'Reading',
        'Bernville', 'Hamburg', 'Leesport', 'Kutztown', 'Womelsdorf',
      ]),
      serviceCounties: JSON.stringify([
        'Berks', 'Lebanon', 'Lancaster', 'Dauphin',
      ]),
      serviceAreaRadius: 30,
      lat: 40.4689,
      lng: -76.2138,
      hoursWeekday: '7:30 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 160] ✅ Added Mountain View Fuel (Bethel PA)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug = 'mountain-view-fuel'
    `);
    console.log('[Migration 160] Rolled back Mountain View Fuel');
  },
};
