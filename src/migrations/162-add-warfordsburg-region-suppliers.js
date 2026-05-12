/**
 * Migration 162: Warfordsburg PA (17267) coverage-gap fill — 3 suppliers
 *
 * Triggered by zero coverage for ZIP 17267 (Warfordsburg, Fulton County PA).
 * Research surfaced three qualified suppliers spanning the southern PA / western
 * MD border; postal codes managed by scrape-config.json (post-100 rule).
 *
 * 1. C.M. Fuels Inc. (cmfuels.com, Spring Run PA)
 *    HQ: 15535 Path Valley Rd, Spring Run PA 17262 / (717) 349-2379
 *    Service: Western Franklin, Southern Juniata, Fulton, Huntingdon counties PA
 *    COD qualification: homepage states "Deliveries can be made automatically or
 *    as an on-call basis, whichever the customer prefers"; order page shows
 *    public per-gallon prices and "Cash discount does not apply when paying by
 *    credit/debit card" (i.e. published price IS the cash price); 150-gal min
 *    order via online form, no account creation required.
 *    Scrapable via static HTML on /order-fuel.php; regex anchored to fuel-icon
 *    class to separate heating oil from kerosene/off-road-diesel.
 *    Fuels: heating oil + kerosene (both scraped).
 *    Note: BBB rating D+ with 1 unanswered complaint (file opened 2025-03-16).
 *    Under rule 7B's "D + 3+ complaints" rejection threshold — proceed with
 *    documentation but not a blocker. Founded 2005, owns truck fleet, 4 county
 *    coverage matches their own about-page footprint.
 *
 * 2. McCleary Oil Company Inc. (mcclearyoil.com, Chambersburg PA)
 *    HQ: 1266 N Franklin St, Chambersburg PA 17201 / (717) 264-6181
 *    Service: Franklin County PA — 79 years in business
 *    COD qualification: /product-delivery page describes call-in delivery as
 *    "A customer notifies our office when a delivery is needed. The order is
 *    placed to allow two to three days for the delivery to take place" —
 *    functionally equivalent to CM Fuels' "on-call basis" model.
 *    No public pricing — allowPriceDisplay=false, scrape-config disabled.
 *    Fuels: #2 heating oil, K-1 kerosene, propane. 150-gal min HO/K-1.
 *    24-hour retail pumps at 484 W Commerce St, Chambersburg.
 *
 * 3. Roach Energy (roachenergy.com, Martinsburg WV)
 *    HQ: 301 E Stephen St, Martinsburg WV 25401 / (304) 596-0147
 *    Hours: Mon-Fri 9:00 AM - 4:30 PM, since 1952
 *    Service: Berkeley/Morgan/Jefferson WV (NOT in market — excluded here) +
 *    Washington County MD (in market — included).
 *    COD qualification: /heating-oil/heating-oil-delivery/ states "if you
 *    prefer 'will-call' delivery, we can make a same-day delivery in the city
 *    of Martinsburg if you call us before 3 p.m." Will-call is offered as an
 *    alternative to automatic delivery for the full service area; the
 *    Martinsburg "same-day" detail is a subset, not a will-call restriction.
 *    No public pricing — allowPriceDisplay=false, scrape-config disabled.
 *    Fuels: heating oil + kerosene + propane. 24/7 emergency delivery.
 *    State stored as WV (HQ) though we only configure MD coverage; this is
 *    consistent with the system's "HQ state" convention (coverage is
 *    independent and lives in scrape-config postalCodesServed).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '162-add-warfordsburg-region-suppliers',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'C.M. Fuels',
      slug: 'cm-fuels',
      phone: '(717) 349-2379',
      email: null,
      website: 'https://www.cmfuels.com',
      addressLine1: '15535 Path Valley Rd',
      city: 'Spring Run',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Spring Run', 'Chambersburg', 'Mercersburg', 'Fort Loudon',
        'Saint Thomas', 'Doylesburg', 'Willow Hill', 'Williamson',
        'McConnellsburg', 'Warfordsburg', 'Needmore', 'Hustontown',
        'Mifflintown', 'Port Royal', 'Thompsontown',
        'Huntingdon', 'Saltillo', 'Three Springs', 'Shirleysburg',
        'Rockhill Furnace', 'Orbisonia', 'Shade Gap',
      ]),
      serviceCounties: JSON.stringify(['Franklin', 'Juniata', 'Fulton', 'Huntingdon']),
      serviceAreaRadius: 45,
      lat: 40.1734,
      lng: -77.7092,
      hoursWeekday: '7:30 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 162] ✅ Added C.M. Fuels (Spring Run PA)');

    await upsertSupplier(sequelize, {
      name: 'McCleary Oil Company',
      slug: 'mccleary-oil-company',
      phone: '(717) 264-6181',
      email: 'info@mcclearyoil.com',
      website: 'https://mcclearyoil.com',
      addressLine1: '1266 N Franklin St',
      city: 'Chambersburg',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Chambersburg', 'Waynesboro', 'Greencastle', 'Mercersburg',
        'Mont Alto', 'Fayetteville', 'Saint Thomas', 'Scotland',
        'Marion', 'Orrstown',
      ]),
      serviceCounties: JSON.stringify(['Franklin']),
      serviceAreaRadius: 30,
      lat: 39.9081,
      lng: -77.6664,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 162] ✅ Added McCleary Oil Company (Chambersburg PA)');

    await upsertSupplier(sequelize, {
      name: 'Roach Energy',
      slug: 'roach-energy',
      phone: '(304) 596-0147',
      email: null,
      website: 'https://www.roachenergy.com',
      addressLine1: '301 E Stephen St',
      city: 'Martinsburg',
      state: 'WV',
      serviceCities: JSON.stringify([
        'Hagerstown', 'Hancock', 'Williamsport', 'Funkstown',
        'Smithsburg', 'Sharpsburg', 'Boonsboro', 'Clear Spring',
        'Keedysville', 'Maugansville', 'Big Pool',
      ]),
      serviceCounties: JSON.stringify(['Washington']),
      serviceAreaRadius: 35,
      lat: 39.4562,
      lng: -77.9636,
      hoursWeekday: '9:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 162] ✅ Added Roach Energy (Martinsburg WV — Washington Co MD coverage)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN ('cm-fuels', 'mccleary-oil-company', 'roach-energy')
    `);
    console.log('[Migration 162] Rolled back Warfordsburg region suppliers');
  },
};
