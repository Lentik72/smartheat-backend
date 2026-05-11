/**
 * Migration 158: Add RJ Waterhouse Fuel Oil (Lake Luzerne NY — Capital Region)
 *
 * Surfaced during Kennedy NY 14747 coverage-gap research as a side finding —
 * RJ Waterhouse joined the Mirabito Energy Products family on Sept 3, 2025,
 * keeping its retained sub-brand under mirabito.com/residential/rjwaterhouse/.
 *
 * First-party COD evidence (verified via raw curl, not subagent narration):
 *   "If you are currently a cash-on-delivery customer, there is no change."
 *   — https://www.mirabito.com/residential/rjwaterhouse/
 *
 * FMCSA: R J WATERHOUSE HEATING OIL INC, USDOT 1127515 — ACTIVE
 * (intrastate hazmat, 2 power units, 79 Lake Avenue Lake Luzerne NY 12846-0530).
 *
 * Service area: Warren / Saratoga / Washington counties (Adirondack south /
 * Glens Falls / Lake George region). 17 ZIPs within ~25 miles of HQ. Coverage
 * managed by scrape-config.json (key: mirabito.com/rjwaterhouse, postal_codes_served
 * NOT written here per post-migration-100 rule).
 *
 * Not scrapable: Mirabito sub-brand pages publish no live cash price; live
 * pricing lives behind the authenticated Online Portal. allowPriceDisplay=false,
 * scrape-config pattern: "none".
 *
 * Mirrors precedent: mirabito.com/blanketoil scrape-config key + multi-branch
 * chain rule scoping (one Mirabito sub-brand = one DB record).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '158-add-rj-waterhouse-fuel-oil',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'RJ Waterhouse Fuel Oil',
      slug: 'rj-waterhouse-fuel-oil',
      phone: '(518) 696-2321',
      email: null,
      website: 'https://www.mirabito.com/residential/rjwaterhouse/',
      addressLine1: '79 Lake Avenue',
      city: 'Lake Luzerne',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Lake Luzerne', 'Glens Falls', 'Queensbury', 'Lake George',
        'Warrensburg', 'South Glens Falls', 'Corinth', 'Hadley',
        'Saratoga Springs', 'Fort Edward', 'Hudson Falls', 'Gansevoort',
      ]),
      serviceCounties: JSON.stringify(['Warren', 'Saratoga', 'Washington']),
      serviceAreaRadius: 25,
      lat: 43.3137,
      lng: -73.8345,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 158] ✅ Added RJ Waterhouse Fuel Oil (Lake Luzerne NY — Mirabito sub-brand)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug = 'rj-waterhouse-fuel-oil'
    `);
    console.log('[Migration 158] Rolled back RJ Waterhouse Fuel Oil');
  },
};
