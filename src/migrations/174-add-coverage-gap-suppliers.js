/**
 * Migration 174: Coverage-gap supplier batch — 7 new COD/will-call suppliers
 *
 * Triggered by the 2026-06-03 daily coverage email + verified against prod.
 * Eight in-footprint Tier-1 gap ZIPs were researched (14747 Kennedy NY, 13811
 * Newark Valley NY, 05871 West Burke VT, 15564 Wellersburg PA, 12815 Brant Lake
 * NY, 17267 Warfordsburg PA, 20841 Boyds MD, 99737 Delta Junction AK). This
 * batch adds the 7 NET-NEW suppliers that passed COD/will-call verification on
 * their own domain. Postal codes are managed by scrape-config.json (post-100
 * rule) — this migration only creates the supplier identity rows.
 *
 * Companion changes in this commit:
 * - scrape-config.json: 7 new disabled entries ("pattern: none", non-scrapable —
 *   all gate prices behind login/quote forms) carrying postalCodesServed:
 *     warmcomfort.com(12) blueoxondemand.com(156) wocenergy.com(67)
 *     parkerfuel.com(20) callfreds.com(75) burtonsvillefuel.com(114)
 *     deltaindustrial.com(1)
 *   PLUS 3 coverage EXPANSIONS of existing rows (union-merge, not this migration):
 *     noco.com 212->231 (+19 Chautauqua incl 14747)
 *     rinkeroilandpropane.com 136->164 (+28 Chautauqua incl 14747)
 *     sourdoughfuel.com 5->6 (+99737)
 * - zip-database.json: 1 new ZIP (99737 Delta Junction AK — was missing).
 *
 * Already in production (NOT re-added here — coverage expanded via scrape-config):
 * - NOCO Energy (noco-energy), Rinker Oil & Propane (rinker-oil-propane),
 *   Sourdough Fuel (sourdough-fuel), Tevis Energy (tevis-energy, migs 016/089).
 *
 * Researched but EXCLUDED (contract/automatic only, no will-call model):
 * - G.A. Bove (12815), AC&T (17267), Bedford Valley Petroleum (_future_contract_oil),
 *   Townsend G&O, Shawley's, Bourne's, Luther P. Miller (escalate/future).
 * Real COD-likely dealers with NO usable website (manual phone/SMS outreach, not added):
 * - Graft Oil + Somerset Fuels (15564), Buckman's Family Fuel (12815),
 *   Delta Fuel Industries (99737), Danielson Oil (14747 — site blocks crawlers).
 *
 * Suppliers added:
 * 1. Scott Smith & Son / WarmComfort (warmcomfort.com, Owego NY) — fills 13811
 *    COD: pricing page "Cash on Delivery (COD)- ... we offer cash pricing on
 *    heating fuel and winter blend fuel." (independently re-verified). Tioga Co.
 * 2. Blueox On Demand (blueoxondemand.com, Oxford NY) — fills 13811
 *    COD: FAQ "discount Cash On Delivery kerosene of heating oil"; own
 *    Delivery_Area page names "Newark Valley". 7-county Southern Tier. oil+kero.
 * 3. WOC Energy (wocenergy.com, Towanda/Mansfield PA) — fills 13811
 *    COD: FAQ "discount COD oil ... minimum order quantity for heating oil is
 *    100 gallons". Multi-branch PA co; only NY Southern Tier coverage configured.
 * 4. Parker Fuel Co. (parkerfuel.com, Ellicott City MD)
 *    Will-call: /fuel-deliveries/ "will call service ... customer is responsible
 *    for monitoring his own tank". Own-site footprint = Howard County (Montgomery
 *    is third-party-claimed only and omitted). Since 1942.
 * 5. Fred's Energy (callfreds.com, Lyndonville VT) — fills 05871
 *    Will-call: /heating-oil/oil-deliveries/ "As-Needed Delivery ... let us know
 *    when you would like an oil delivery." 5-county Northeast Kingdom. oil+kero.
 *    Multi-branch (Derby/Lyndonville/Morrisville).
 * 6. Burtonsville Fuel Co. (burtonsvillefuel.com, Burtonsville MD) — fills 20841
 *    COD: payment-options "cash, money orders, or credit card only at the time of
 *    service and/or delivery until ... credit is established". Serves Montgomery
 *    County county-wide. oil+kero. Since 1955.
 * 7. Delta Transport Services (deltaindustrial.com, Delta Junction AK) — fills 99737
 *    Will-call: warm-clean page "On-call oil delivery ... not eligible" (for the
 *    automatic program) — i.e. on-call is the alternative. #1 heating oil. Interior
 *    AK in-design footprint. Division of Delta Industrial Services.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '174-add-coverage-gap-suppliers',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Scott Smith & Son',
      slug: 'scott-smith-son',
      phone: '(607) 687-1803',
      email: null,
      website: 'https://warmcomfort.com',
      addressLine1: '8 Delphine Street',
      city: 'Owego',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Owego', 'Newark Valley', 'Apalachin', 'Candor', 'Berkshire',
        'Nichols', 'Tioga Center', 'Richford', 'Spencer', 'Barton',
      ]),
      serviceCounties: JSON.stringify(['Tioga']),
      serviceAreaRadius: 25,
      lat: 42.1009,
      lng: -76.2602,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 174] ✅ Scott Smith & Son (Owego NY — COD, fills 13811)');

    await upsertSupplier(sequelize, {
      name: 'Blueox On Demand',
      slug: 'blueox-on-demand',
      phone: '(607) 843-2583',
      email: null,
      website: 'https://www.blueoxondemand.com',
      addressLine1: '38 N Canal Street',
      city: 'Oxford',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Oxford', 'Norwich', 'Binghamton', 'Newark Valley', 'Owego',
        'Cortland', 'Sidney', 'Bainbridge', 'Greene', 'Oneonta',
      ]),
      serviceCounties: JSON.stringify(['Broome', 'Chenango', 'Cortland', 'Delaware', 'Madison', 'Otsego', 'Tioga']),
      serviceAreaRadius: 40,
      lat: 42.4423,
      lng: -75.5993,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 174] ✅ Blueox On Demand (Oxford NY — COD, fills 13811)');

    await upsertSupplier(sequelize, {
      name: 'WOC Energy',
      slug: 'woc-energy',
      phone: '(570) 265-6673',
      email: null,
      website: 'https://wocenergy.com',
      addressLine1: null,
      city: 'Towanda',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Elmira', 'Corning', 'Horseheads', 'Watkins Glen', 'Bath',
        'Owego', 'Waverly', 'Big Flats', 'Painted Post', 'Montour Falls',
      ]),
      serviceCounties: JSON.stringify(['Chemung', 'Schuyler', 'Steuben', 'Tioga']),
      serviceAreaRadius: 40,
      lat: 41.7670,
      lng: -76.4438,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 174] ✅ WOC Energy (Towanda PA — COD, fills 13811 via NY coverage)');

    await upsertSupplier(sequelize, {
      name: 'Parker Fuel Co.',
      slug: 'parker-fuel',
      phone: '(410) 465-3800',
      email: null,
      website: 'https://parkerfuel.com',
      addressLine1: '9319 Baltimore National Pike',
      city: 'Ellicott City',
      state: 'MD',
      serviceCities: JSON.stringify([
        'Ellicott City', 'Columbia', 'Clarksville', 'Elkridge', 'Marriottsville',
        'Woodstock', 'Cooksville', 'West Friendship', 'Glenwood', 'Dayton',
      ]),
      serviceCounties: JSON.stringify(['Howard']),
      serviceAreaRadius: 25,
      lat: 39.2673,
      lng: -76.7983,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 174] ✅ Parker Fuel Co. (Ellicott City MD — will-call, Howard Co)');

    await upsertSupplier(sequelize, {
      name: "Fred's Energy",
      slug: 'freds-energy',
      phone: '(802) 626-4588',
      email: null,
      website: 'https://callfreds.com',
      addressLine1: null,
      city: 'Lyndonville',
      state: 'VT',
      serviceCities: JSON.stringify([
        'Lyndonville', 'St Johnsbury', 'Derby', 'Newport', 'Morrisville',
        'Hardwick', 'Barton', 'Island Pond', 'Hyde Park', 'West Burke',
      ]),
      serviceCounties: JSON.stringify(['Orleans', 'Essex', 'Lamoille', 'Caledonia', 'Franklin']),
      serviceAreaRadius: 35,
      lat: 44.5328,
      lng: -72.0098,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log("[Migration 174] ✅ Fred's Energy (Lyndonville VT — will-call, fills 05871)");

    await upsertSupplier(sequelize, {
      name: 'Burtonsville Fuel Co.',
      slug: 'burtonsville-fuel',
      phone: '(301) 384-7575',
      email: null,
      website: 'https://burtonsvillefuel.com',
      addressLine1: '15408 Old Columbia Pike',
      city: 'Burtonsville',
      state: 'MD',
      serviceCities: JSON.stringify([
        'Burtonsville', 'Silver Spring', 'Rockville', 'Gaithersburg', 'Germantown',
        'Olney', 'Laurel', 'Columbia', 'Ellicott City', 'Boyds',
      ]),
      serviceCounties: JSON.stringify(['Montgomery', 'Howard', 'Carroll', "Prince George's"]),
      serviceAreaRadius: 30,
      lat: 39.1118,
      lng: -76.9330,
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
    console.log('[Migration 174] ✅ Burtonsville Fuel Co. (Burtonsville MD — COD, fills 20841)');

    await upsertSupplier(sequelize, {
      name: 'Delta Transport Services',
      slug: 'delta-transport-services',
      phone: '(907) 895-5053',
      email: null,
      website: 'https://www.deltaindustrial.com',
      addressLine1: '1229 Richardson Hwy',
      city: 'Delta Junction',
      state: 'AK',
      serviceCities: JSON.stringify(['Delta Junction', 'Big Delta', 'Fort Greely']),
      serviceCounties: JSON.stringify(['Southeast Fairbanks']),
      serviceAreaRadius: 30,
      lat: 64.0378,
      lng: -145.7325,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 174] ✅ Delta Transport Services (Delta Junction AK — on-call, fills 99737)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (
        'scott-smith-son', 'blueox-on-demand', 'woc-energy', 'parker-fuel',
        'freds-energy', 'burtonsville-fuel', 'delta-transport-services'
      )
    `);
    console.log('[Migration 174] Rolled back coverage-gap supplier batch');
  },
};
