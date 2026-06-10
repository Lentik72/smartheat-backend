/**
 * Migration 175: COD/will-call coverage-gap supplier batch — 5 new suppliers
 *
 * Triggered by price-alert demand-signal research (heatingoil-ntz2): 3 real users
 * set alerts on long-tail ZIP/fuel pages we could not serve (15001 W-PA propane,
 * 18610 PA-Poconos kerosene, 12815 NY-Adirondack propane). Research surfaced
 * qualified COD/will-call suppliers; this batch adds the 5 that are NOT already
 * in production (verified absent on origin/main 2026-06-09).
 *
 * Companion changes in this commit (scrape-config.json):
 * - 5 new directory entries (all enabled:false, pattern:"none") with full
 *   postalCodesServed coverage. allowPriceDisplay=false — none publishes a
 *   scrapable per-gallon price, so they are directory listings only.
 * - Coverage expansion of 3 EXISTING suppliers to the Blakeslee/Pocono cluster
 *   (rfohl.com + santarelliandsonsoil.com -> 18610/18210; highhouseenergy.com ->
 *   18325/18326/18330/18334/18342/18344/18349/18350/18372/18424/18466). Each
 *   grounded in the supplier's own service-area page. (No supplier rows change —
 *   ScrapeConfigSync union-merges postalCodesServed on deploy.)
 * - 19 unrelated scrape-config fuel-extraction bug fixes (14 dropped
 *   kerosene/propane prices + 4 oil mislabels + 1 reverse cross-fuel leak:
 *   dolanoilservice.com propane regex was capturing the heating-oil price
 *   $4.899 — phantom block removed) ride in the same commit; see
 *   heatingoil-nu0z. Not part of this migration (config-only).
 *
 * No zip-database additions needed — all 57 referenced ZIPs already exist.
 *
 * Notes:
 * - ProGas (myprogas.com) is PROPANE-ONLY (no heating oil). Added per operator
 *   direction — propane-only suppliers are an accepted/expanding category going
 *   forward; this deliberately overrides the supplier-research heating-oil hard
 *   rule. fuel_types=[propane,diesel]. ProGas serves 15001, so it directly fills
 *   the mmurph9412 propane demand signal.
 * - First Fuel & Propane fuel-oil COD coverage is Columbia County NY (Hudson),
 *   NOT Warren County — so it does NOT serve the 12815 propane demand ZIP; added
 *   as a qualified non-gap directory listing.
 *
 * 1. Woodlawn Oil Co. (woodlawnoil.com, Aliquippa PA 15001) / (724) 378-4497
 *    Will-call: "Will Call - If you choose to control your own delivery schedule,
 *    we are happy to accommodate your wishes." Fuels: heating_oil, kerosene,
 *    propane, diesel. Serves Beaver County + Allegheny edge. Serves 15001 (the
 *    mmurph9412 propane demand ZIP). No public price → allowPriceDisplay=false.
 * 2. K&K Oil Company (kandkoil.com, Lehighton PA 18235) / (800) 964-6451
 *    Will-call delivery option on own site. Fuels: heating_oil, kerosene, diesel,
 *    gasoline. Carbon County; covers Albrightsville 18210 adjacent to the 18610
 *    Blakeslee gap. No scrapable price yet → allowPriceDisplay=false.
 * 3. First Fuel & Propane (firstfuelandpropane.com, Hudson NY 12534) / (518) 828-8700
 *    COD: "Make a one time payment based on the current cash price ... ten cent
 *    per gallon discount off of the cash price the day of delivery." Heating-oil
 *    COD footprint = Columbia County NY. Fuels: heating_oil, propane.
 *    allowPriceDisplay=false.
 * 4. Hoyt's Fuel Service (hoytsfuelservice.com, Shickshinny PA 18655) / (570) 256-3407
 *    COD: "Will Call Delivery - Choose your own delivery times and amounts" +
 *    "Charge on Delivery - New accounts are COD for the first year if not approved
 *    for a credit or budget account." Fuels: heating_oil, kerosene, propane,
 *    diesel. Luzerne County (Shickshinny/Mocanaqua). allowPriceDisplay=false.
 * 5. ProGas Inc. (myprogas.com, Aliquippa/Zelienople PA) / (724) 452-7262
 *    PROPANE-ONLY (no heating oil). Will-call: "Will Call - Some customers prefer
 *    to let us know when they need a propane delivery. They order on a will call
 *    basis." Fuels: propane, diesel. Beaver/Butler County; serves 15001 (the
 *    mmurph9412 propane demand ZIP). allowPriceDisplay=false.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '175-add-cod-coverage-suppliers-batch',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Woodlawn Oil Co.',
      slug: 'woodlawn-oil',
      phone: '(724) 378-4497',
      email: null,
      website: 'https://www.woodlawnoil.com',
      addressLine1: '2260 Todd Road',
      city: 'Aliquippa',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Aliquippa', 'Ambridge', 'Baden', 'Beaver', 'Beaver Falls', 'Center Township',
        'Clinton', 'Coraopolis', 'Economy', 'Freedom', 'Georgetown', 'Hookstown',
        'Hopewell Township', 'Imperial', 'Industry', 'Midland', 'Monaca', 'Moon Township',
        'Neville Island', 'New Brighton', 'Rochester', 'South Heights',
      ]),
      serviceCounties: JSON.stringify(['Beaver', 'Allegheny']),
      serviceAreaRadius: 30,
      lat: 40.6103,
      lng: -80.2456,
      hoursWeekday: null,
      hoursSaturday: null,
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
    console.log('[Migration 175] ✅ Added Woodlawn Oil Co. (Aliquippa PA — will-call, directory)');

    await upsertSupplier(sequelize, {
      name: 'K&K Oil Company',
      slug: 'kk-oil',
      phone: '(800) 964-6451',
      email: null,
      website: 'https://www.kandkoil.com',
      addressLine1: null,
      city: 'Lehighton',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Albrightsville', 'Jim Thorpe', 'Kunkletown', 'Lehighton',
        'Palmerton', 'Slatington', 'Tamaqua', 'Walnutport',
      ]),
      serviceCounties: JSON.stringify(['Carbon']),
      serviceAreaRadius: 25,
      lat: 40.8334,
      lng: -75.7113,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'gasoline']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 175] ✅ Added K&K Oil Company (Lehighton/Carbon Co PA — will-call, directory)');

    await upsertSupplier(sequelize, {
      name: 'First Fuel & Propane',
      slug: 'first-fuel-propane',
      phone: '(518) 828-8700',
      email: null,
      website: 'https://firstfuelandpropane.com',
      addressLine1: null,
      city: 'Hudson',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Hudson', 'Kinderhook', 'Valatie', 'Chatham', 'Ghent', 'Claverack',
        'Hillsdale', 'Copake', 'Ancram', 'Germantown', 'Philmont', 'Stuyvesant',
        'Stockport', 'Greenport', 'Livingston', 'Craryville',
      ]),
      serviceCounties: JSON.stringify(['Columbia']),
      serviceAreaRadius: 30,
      lat: 42.2528,
      lng: -73.7907,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 175] ✅ Added First Fuel & Propane (Hudson/Columbia Co NY — COD, directory)');

    await upsertSupplier(sequelize, {
      name: "Hoyt's Fuel Service",
      slug: 'hoyts-fuel',
      phone: '(570) 256-3407',
      email: null,
      website: 'https://www.hoytsfuelservice.com',
      addressLine1: '965 Broadway Road',
      city: 'Shickshinny',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Shickshinny', 'Mocanaqua', 'Hunlock Creek', 'Huntington Mills',
        'Nanticoke', 'Nescopeck', 'Sweet Valley', 'Wapwallopen', 'White Haven',
      ]),
      serviceCounties: JSON.stringify(['Luzerne']),
      serviceAreaRadius: 25,
      lat: 41.1542,
      lng: -76.1521,
      hoursWeekday: null,
      hoursSaturday: null,
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
    console.log("[Migration 175] ✅ Added Hoyt's Fuel Service (Shickshinny/Luzerne Co PA — COD, directory)");

    await upsertSupplier(sequelize, {
      name: 'ProGas Inc.',
      slug: 'progas',
      phone: '(724) 452-7262',
      email: null,
      website: 'https://myprogas.com',
      addressLine1: null,
      city: 'Aliquippa',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Aliquippa', 'Ambridge', 'Baden', 'Beaver', 'Beaver Falls', 'Monaca',
        'Center Township', 'Hopewell Township', 'Rochester', 'Zelienople',
      ]),
      serviceCounties: JSON.stringify(['Beaver', 'Butler']),
      serviceAreaRadius: 35,
      lat: 40.6103,
      lng: -80.2456,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 175] ✅ Added ProGas Inc. (Aliquippa PA — propane-only, will-call, directory)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN ('woodlawn-oil', 'kk-oil', 'first-fuel-propane', 'hoyts-fuel', 'progas')
    `);
    console.log('[Migration 175] Rolled back COD coverage-gap supplier batch');
  },
};
