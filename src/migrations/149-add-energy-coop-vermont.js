/**
 * Migration 149: Add Energy Co-op of Vermont (Colchester, VT)
 *
 * Surfaced during VT/OH state-landing-page coverage sweep. Adds depth to
 * Vermont coverage — 7th in-state supplier (behind Corse Fuels, Fox Fuel,
 * Packard Fuels, Central Vermont Oil, Gecha Fuels, Sam's U-Save Fuels).
 *
 * COD confirmed verbatim on own site:
 *   "customers that choose to be on Will Call or On Hold are responsible
 *    for contacting the Co-op to schedule any deliveries"
 *   + explicit "See Today's Member Cash Price" link
 *   — https://www.ecvt.net/service/heating-oil/
 *
 * `Will Call` and `Today's Member Cash Price` are accepted COD language per
 * skill rules. Non-members can purchase (membership is optional — members
 * get a $0.13/gal discount but non-membership is not a blocker).
 *
 * Not scrapable: /todays-cash-price 404s, and the heating oil page does not
 * display $X.XX in static HTML. allowPriceDisplay=false, scrape-config
 * disabled with reason.
 *
 * Caveats (noted but non-blocking):
 *  - 7-10 business day lead time required for will-call deliveries
 *  - $100 restart fee + $250 special delivery fee for emergency/off-cycle
 *    deliveries. Less friendly than typical COD but still qualifies under
 *    the will-call model.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule). Covers Chittenden County (full) +
 * adjacent parts of Grand Isle, Franklin, Lamoille, Washington counties —
 * all 5 counties explicitly listed on the Co-op's service-area section.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '149-add-energy-coop-vermont',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Energy Co-op of Vermont',
      slug: 'energy-coop-vermont',
      phone: '(802) 860-4090',
      email: null,
      website: 'https://www.ecvt.net',
      addressLine1: '73 Prim Rd, Ste. 1',
      city: 'Colchester',
      state: 'VT',
      serviceCities: JSON.stringify([
        'Barre', 'Burlington', 'Cambridge', 'Charlotte', 'Colchester',
        'East Montpelier', 'Essex Center', 'Essex Junction', 'Fairfax',
        'Fletcher', 'Georgia', 'Grand Isle', 'Hinesburg', 'Huntington',
        'Huntington Center', 'Jeffersonville', 'Jericho', 'Jericho Center',
        'Middlesex', 'Milton', 'Montpelier', 'North Hero', 'Richmond',
        'Shelburne', 'South Burlington', 'South Hero', 'St. Albans',
        'St. Albans Bay', 'St. George', 'Swanton', 'Underhill',
        'Underhill Center', 'Waterbury', 'Waterbury Center', 'Westford',
        'Williston', 'Winooski',
      ]),
      serviceCounties: JSON.stringify([
        'Chittenden', 'Grand Isle', 'Franklin', 'Lamoille', 'Washington',
      ]),
      serviceAreaRadius: 30,
      lat: 44.549647,
      lng: -73.191309,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 149] ✅ Added Energy Co-op of Vermont (Colchester VT — Chittenden+4 counties)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'energy-coop-vermont'`);
    console.log('[Migration 149] Rolled back Energy Co-op of Vermont');
  },
};
