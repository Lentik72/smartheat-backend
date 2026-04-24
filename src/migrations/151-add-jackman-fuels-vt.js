/**
 * Migration 151: Add Jackman Fuels Inc (Vergennes, VT — Addison + Chittenden counties)
 *
 * Surfaced during the 2026-04-24 Add-Supplier sweep for 05491 Vergennes.
 * Family-owned since 1945. Serves Addison County (Addison, Bridport, Bristol,
 * Ferrisburgh, Middlebury, Monkton, New Haven, Panton, Vergennes, Weybridge)
 * and Chittenden County (Charlotte, Hinesburg, Shelburne).
 *
 * Will-call confirmed verbatim on own site:
 *   "Will Call Delivery — If you prefer to monitor your own usage and call us
 *    when you need it, then will call delivery gives you that control."
 *   — https://jackmanfuels.com/home-heating-oil-propane-delivery/delivery-plans/
 *
 * Not scrapable: no public price page. Account-oriented site with
 * "Apply Online" / "Bill Pay" / "Go Paperless". allowPriceDisplay=false,
 * scrape-config disabled with reason.
 *
 * Fuels: heating oil, propane, kerosene, off-road diesel.
 * Phone: 802-877-2661. 24/7 on-call service.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '151-add-jackman-fuels-vt',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Jackman Fuels Inc',
      slug: 'jackman-fuels',
      phone: '(802) 877-2661',
      email: null,
      website: 'https://jackmanfuels.com',
      addressLine1: '1 Main St',
      city: 'Vergennes',
      state: 'VT',
      serviceCities: JSON.stringify([
        'Vergennes', 'Addison', 'Bridport', 'Bristol', 'Ferrisburgh',
        'Middlebury', 'Monkton', 'New Haven', 'Panton', 'Weybridge',
        'Charlotte', 'Hinesburg', 'Shelburne',
      ]),
      serviceCounties: JSON.stringify(['Addison', 'Chittenden']),
      serviceAreaRadius: 25,
      lat: 44.1673,
      lng: -73.2537,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 151] ✅ Added Jackman Fuels Inc (Vergennes VT — Addison+Chittenden)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'jackman-fuels'`);
    console.log('[Migration 151] Rolled back Jackman Fuels Inc');
  },
};
