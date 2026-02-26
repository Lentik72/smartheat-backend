/**
 * Migration 082: Add 22 Maine Suppliers + Enable Higgins Energy Scraping
 *
 * MaineOil.com cross-reference — Maine batch.
 * All suppliers verified COD/will-call from their own websites.
 *
 * SCRAPABLE (9 new + 1 update):
 *  1. O'Farrell Energy — Bowdoinham, ME (Will Call, senior discount, $3.349)
 *  2. AJ's Discount Oil — Portland, ME (Will-call, Droplet ordering, $3.29)
 *  3. Northeast Fuels — Steep Falls, ME (Will Call, emergency delivery, $3.499)
 *  4. Paul's Services — Portland, ME (Cash/money order required, $3.39)
 *  5. R&R Oil — Lyman, ME (Cash pricing, Jimdo site, $3.199)
 *  6. Country Fuel LLC — Topsham, ME (COD only explicit, $3.589)
 *  7. Hometown Fuel — Eastbrook, ME (Downeast/Hancock County, senior discount)
 *  8. Coastline Energy — Richmond, ME (Mid-Coast, /products page)
 *  9. Winterwood Fuel — Lyman, ME (Jimdo site, Droplet ordering)
 * 10. Higgins Energy — Cumberland Center, ME (UPDATE: enable price display)
 *     Already in DB from migration 046 with allowPriceDisplay=false.
 *     Price confirmed in static HTML: <h2>Today's Oil Price 3.599</h2>
 *
 * DIRECTORY-ONLY (13 new):
 * 11. G&G Cash Fuel — Litchfield, ME (site down, legit business)
 * 12. Bob's Cash Fuel — Madison, ME (Central ME, Somerset/Franklin)
 * 13. Rinaldi Energy — Saco, ME (senior/military discount)
 * 14. Top It Off Oil — Alfred, ME (DudaMobile, senior discount)
 * 15. Arrow Oil Co — Biddeford, ME (JS widget ordering)
 * 16. Conroy's Oil Service — Saco, ME (est. 1942, 3rd gen, senior discount)
 * 17. Vic & Sons Fuel Co — South Portland, ME (Droplet widget)
 * 18. Willow Creek Fuel — Saco, ME (weekend delivery, 24hr)
 * 19. Eagle Oil — Arundel, ME (broken SSL, small operation)
 * 20. SoPo Fuel Co — South Portland, ME (related to Vic & Sons, 2 ZIPs only)
 * 21. Alfred Oil Company — Alfred, ME (site down, BBB confirmed)
 * 22. Kaler Oil — North Bath, ME (est. 1956, family-run, propane too)
 * 23. C.B. Haskell Fuel — Windsor, ME (Wix site, 24hr emergency)
 *
 * EXCLUDED (not added):
 *  - Dysart's Fuel — requires application
 *  - Online Fuel Co — reseller
 *  - Wicked Warm — reseller
 *  - Bargain Fuel (pave-tek.com) — points to competitor site
 *  - Kelley's Oil — already in DB (migration 067, South Weymouth, MA)
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '082-add-me-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. O'FARRELL ENERGY — Bowdoinham, ME
    // Will Call confirmed. Senior discounts. Volume discounts 300+ gal.
    // Price in element id: todays-heating-oil-price-is-X.XXX
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "O'Farrell Energy",
      slug: 'ofarrell-energy',
      phone: '(207) 844-7800',
      email: 'ofarrellenergy@gmail.com',
      website: 'https://www.ofarrellenergy.com',
      addressLine1: '5 Brook Lane',
      city: 'Bowdoinham',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Sagadahoc County
        '04003', '04530', '04562', '04548', '04579',
        // Cumberland County
        '04008', '04011', '04066', '04079', '04086', '04106',
        // Androscoggin County
        '04222', '04236', '04240', '04250', '04252', '04280',
        // Kennebec County
        '04259', '04265', '04287', '04342', '04344', '04345',
        '04346', '04347', '04350', '04357', '04359',
        // Lincoln County
        '04535', '04553', '04556', '04571', '04578'
      ]),
      serviceCities: JSON.stringify([
        'Alna', 'Arrowsic', 'Bailey Island', 'Bath', 'Bowdoin',
        'Bowdoinham', 'Brunswick', 'Dresden', 'Durham', 'Edgecomb',
        'Farmingdale', 'Gardiner', 'Georgetown', 'Greene', 'Hallowell',
        'Harpswell', 'Lewiston', 'Lisbon', 'Lisbon Falls', 'Litchfield',
        'Monmouth', 'Newcastle', 'Orrs Island', 'Phippsburg', 'Randolph',
        'Richmond', 'Sabattus', 'South Gardiner', 'South Portland',
        'Topsham', 'Trevett', 'West Bath', 'Wiscasset', 'Woolwich'
      ]),
      serviceCounties: JSON.stringify([
        'Sagadahoc', 'Cumberland', 'Androscoggin', 'Kennebec', 'Lincoln'
      ]),
      serviceAreaRadius: 35,
      lat: 44.0621,
      lng: -69.9038,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log("[Migration 082] Upserted O'Farrell Energy (Bowdoinham, ME)");

    // ============================================
    // 2. AJ'S DISCOUNT OIL — Portland, ME
    // Will-call delivery confirmed. DudaMobile site (403 to bots, got-scraping handles).
    // Price: "Today's #2 Heating Oil Price $3.29/gal"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "AJ's Discount Oil",
      slug: 'ajs-discount-oil',
      phone: '(207) 791-2825',
      email: null,
      website: 'https://www.ajsdiscountoil.com',
      addressLine1: '306 Presumpscot St',
      city: 'Portland',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Cumberland County
        '04015', '04021', '04032', '04038', '04039',
        '04062', '04069', '04074', '04078', '04084',
        '04092', '04096', '04097', '04101', '04102',
        '04103', '04105', '04106', '04107', '04108', '04110',
        // York County
        '04064', '04070', '04072', '04093'
      ]),
      serviceCities: JSON.stringify([
        'Buxton', 'Cape Elizabeth', 'Casco', 'Cumberland Center',
        'Cumberland Foreside', 'Falmouth', 'Freeport', 'Gorham',
        'Gray', 'Long Island', 'North Yarmouth', 'Old Orchard Beach',
        'Peaks Island', 'Portland', 'Pownal', 'Saco', 'Scarborough',
        'South Freeport', 'South Portland', 'Standish', 'Westbrook',
        'Windham', 'Yarmouth'
      ]),
      serviceCounties: JSON.stringify(['Cumberland', 'York']),
      serviceAreaRadius: 25,
      lat: 43.6924,
      lng: -70.2595,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log("[Migration 082] Upserted AJ's Discount Oil (Portland, ME)");

    // ============================================
    // 3. NORTHEAST FUELS — Steep Falls, ME
    // Will Call + auto delivery. Emergency deliveries + restarts.
    // Price: <strong>$3.499</strong> (WordPress/Genesis)
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Northeast Fuels',
      slug: 'northeast-fuels',
      phone: '(207) 675-3002',
      email: 'karen@ne-fuels.com',
      website: 'https://ne-fuels.com',
      addressLine1: '395 Manchester Rd',
      city: 'Steep Falls',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Cumberland County
        '04084', '04085', '04038', '04062', '04029',
        // York County
        '04091', '04020', '04049', '04093', '04042', '04046'
      ]),
      serviceCities: JSON.stringify([
        'Baldwin', 'Buxton', 'Cornish', 'Gorham', 'Hiram',
        'Hollis', 'Limington', 'Sebago', 'Standish', 'Steep Falls',
        'Windham'
      ]),
      serviceCounties: JSON.stringify(['Cumberland', 'York']),
      serviceAreaRadius: 20,
      lat: 43.7615,
      lng: -70.6404,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Northeast Fuels (Steep Falls, ME)');

    // ============================================
    // 4. PAUL'S SERVICES — Portland, ME
    // Cash/money order required on first delivery. 24hr emergency oil.
    // Price on /order-now/: <div class="price">$3.39
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Paul's Services",
      slug: 'pauls-services',
      phone: '(207) 780-6710',
      email: 'oil@paulsservicesinc.com',
      website: 'https://paulsservicesinc.com',
      addressLine1: '1188 Brighton Ave',
      city: 'Portland',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Cumberland County (primary)
        '04015', '04021', '04032', '04038', '04039',
        '04062', '04069', '04071', '04074', '04077',
        '04078', '04084', '04085', '04092', '04096',
        '04097', '04101', '04102', '04103', '04105',
        '04106', '04107', '04108', '04110', '04260',
        // York County
        '04005', '04042', '04064', '04070', '04072',
        '04093'
      ]),
      serviceCities: JSON.stringify([
        'Biddeford', 'Buxton', 'Cape Elizabeth', 'Casco', 'Cumberland',
        'Falmouth', 'Freeport', 'Gorham', 'Gray', 'Hollis Center',
        'New Gloucester', 'North Yarmouth', 'Old Orchard Beach',
        'Peaks Island', 'Portland', 'Pownal', 'Raymond', 'Saco',
        'Scarborough', 'South Casco', 'South Freeport', 'South Portland',
        'Standish', 'Steep Falls', 'Westbrook', 'Windham', 'Yarmouth'
      ]),
      serviceCounties: JSON.stringify(['Cumberland', 'York']),
      serviceAreaRadius: 30,
      lat: 43.6763,
      lng: -70.3280,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log("[Migration 082] Upserted Paul's Services (Portland, ME)");

    // ============================================
    // 5. R&R OIL — Lyman, ME
    // Cash pricing. 24/7 emergency. 25+ years in business.
    // Price on homepage (Jimdo): "Home Heating Oil $3.199"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'R&R Oil',
      slug: 'r-and-r-oil',
      phone: '(207) 499-7100',
      email: 'office@rroil.me',
      website: 'https://www.rroil.me',
      addressLine1: '409 Goodwins Mills Rd',
      city: 'Lyman',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04002', '04005', '04043', '04046', '04064',
        '04072', '04073', '04083', '04087'
      ]),
      serviceCities: JSON.stringify([
        'Alfred', 'Arundel', 'Biddeford', 'Dayton', 'Kennebunk',
        'Kennebunkport', 'Lyman', 'Old Orchard Beach', 'Saco',
        'Sanford', 'Springvale', 'Waterboro'
      ]),
      serviceCounties: JSON.stringify(['York']),
      serviceAreaRadius: 20,
      lat: 43.4960,
      lng: -70.6860,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted R&R Oil (Lyman, ME)');

    // ============================================
    // 6. COUNTRY FUEL LLC — Topsham, ME
    // COD only explicit. 24/7 emergency via (207) 405-1781.
    // Price on homepage (GoDaddy SSR): Oil $3.589, K1 $4.489
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Country Fuel LLC',
      slug: 'country-fuel-llc',
      phone: '(207) 725-4651',
      email: null,
      website: 'https://countryfuelllc.com',
      addressLine1: '603 River Road',
      city: 'Topsham',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Sagadahoc County
        '04086', '04530', '04579', '04562', '04548',
        // Cumberland County
        '04011', '04032', '04079', '04222',
        // Androscoggin County
        '04210', '04240', '04250', '04252', '04280', '04236',
        // Kennebec County
        '04259', '04287', '04008', '04350', '04345', '04342', '04357',
        // Lincoln County
        '04537', '04538', '04543', '04544', '04553', '04555',
        '04556', '04539', '04554', '04558', '04564', '04568',
        '04573', '04578'
      ]),
      serviceCities: JSON.stringify([
        'Alna', 'Arrowsic', 'Auburn', 'Bath', 'Boothbay',
        'Boothbay Harbor', 'Bowdoin', 'Bowdoinham', 'Bristol',
        'Brunswick', 'Damariscotta', 'Dresden', 'Durham',
        'East Boothbay', 'Edgecomb', 'Freeport', 'Gardiner',
        'Georgetown', 'Greene', 'Harpswell', 'Lewiston', 'Lisbon',
        'Lisbon Falls', 'Litchfield', 'Monmouth', 'New Harbor',
        'Newcastle', 'Nobleboro', 'North Bath', 'Pemaquid',
        'Phippsburg', 'Richmond', 'Round Pond', 'Sabattus',
        'South Bristol', 'Topsham', 'Wales', 'Walpole',
        'West Bath', 'Wiscasset', 'Woolwich'
      ]),
      serviceCounties: JSON.stringify([
        'Sagadahoc', 'Cumberland', 'Androscoggin', 'Kennebec', 'Lincoln'
      ]),
      serviceAreaRadius: 40,
      lat: 43.9276,
      lng: -69.9759,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Country Fuel LLC (Topsham, ME)');

    // ============================================
    // 7. HOMETOWN FUEL — Eastbrook, ME (Downeast)
    // Senior + military discounts. $150 emergency fee.
    // Serves Hancock & Washington Counties.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Hometown Fuel',
      slug: 'hometown-fuel-me',
      phone: '(207) 565-2746',
      email: 'hometownfuelmaine@gmail.com',
      website: 'https://www.hometownfuelme.com',
      addressLine1: '721 Eastbrook Rd',
      city: 'Eastbrook',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Hancock County
        '04605', '04607', '04613', '04634', '04640',
        '04660', '04664', '04669', '04677', '04684', '04693',
        // Washington County
        '04658', '04680'
      ]),
      serviceCities: JSON.stringify([
        'Amherst', 'Aurora', 'Birch Harbor', 'Corea', 'Eastbrook',
        'Ellsworth', 'Franklin', 'Gouldsboro', 'Hancock', 'Lamoine',
        'Mariaville', 'Milbridge', 'Mount Desert', 'Osborn', 'Otis',
        'Prospect Harbor', 'Sorrento', 'Steuben', 'Sullivan', 'Surry',
        'Trenton', 'Waltham', 'Winter Harbor'
      ]),
      serviceCounties: JSON.stringify(['Hancock', 'Washington']),
      serviceAreaRadius: 35,
      lat: 44.6216,
      lng: -68.2253,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Hometown Fuel (Eastbrook, ME)');

    // ============================================
    // 8. COASTLINE ENERGY — Richmond, ME
    // Mid-Coast ME. Prices on /products page (Wix).
    // Physical address: 74 River Road, Richmond.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Coastline Energy',
      slug: 'coastline-energy',
      phone: '(207) 888-3233',
      email: 'info@coastlineenergyllc.com',
      website: 'https://www.coastlineenergyllc.com',
      addressLine1: '74 River Road',
      city: 'Richmond',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04011', '04086', '04530', '04079', '04579',
        '04287', '04008', '04032', '04096', '04357'
      ]),
      serviceCities: JSON.stringify([
        'Bath', 'Bowdoin', 'Bowdoinham', 'Brunswick', 'Freeport',
        'Harpswell', 'Richmond', 'Topsham', 'Woolwich', 'Yarmouth'
      ]),
      serviceCounties: JSON.stringify(['Cumberland', 'Sagadahoc']),
      serviceAreaRadius: 25,
      lat: 44.0953,
      lng: -69.7891,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Coastline Energy (Richmond, ME)');

    // ============================================
    // 9. WINTERWOOD FUEL — Lyman, ME
    // Jimdo site. Orders via Droplet Fuel platform.
    // Est. 2020, also does water delivery + farm products.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Winterwood Fuel',
      slug: 'winterwood-fuel',
      phone: '(207) 608-2045',
      email: 'winterwoodfuel@yahoo.com',
      website: 'https://www.winterwood-farm.com',
      addressLine1: '106 Winterwood Ln',
      city: 'Lyman',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // York County (core)
        '04002', '04005', '04042', '04043', '04046',
        '04048', '04056', '04064', '04072', '04073',
        '04074', '04076', '04083', '04087', '04090', '04093',
        // York County (border)
        '03906', '04027',
        // Cumberland County (extended)
        '04038', '04062', '04092', '04101', '04106', '04107'
      ]),
      serviceCities: JSON.stringify([
        'Alfred', 'Arundel', 'Biddeford', 'Buxton', 'Cape Elizabeth',
        'Dayton', 'Gorham', 'Hollis', 'Kennebunk', 'Kennebunkport',
        'Lebanon', 'Limerick', 'Lyman', 'Newfield', 'North Berwick',
        'Old Orchard Beach', 'Portland', 'Saco', 'Sanford',
        'Scarborough', 'Shapleigh', 'South Portland', 'Springvale',
        'Waterboro', 'Wells', 'Westbrook', 'Windham'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland']),
      serviceAreaRadius: 30,
      lat: 43.4960,
      lng: -70.6860,
      hoursWeekday: '7:30 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Winterwood Fuel (Lyman, ME)');

    // ============================================
    // 10. HIGGINS ENERGY — Cumberland Center, ME (UPDATE)
    // Already in DB from migration 046 with allowPriceDisplay=false.
    // Price confirmed in static HTML: <h2>Today's Oil Price 3.599</h2>
    // ============================================
    await sequelize.query(`
      UPDATE suppliers SET
        allow_price_display = true,
        notes = NULL,
        updated_at = NOW()
      WHERE slug = 'higgins-energy'
    `);
    console.log('[Migration 082] Updated Higgins Energy → allowPriceDisplay=true');

    // ============================================
    // 11. G&G CASH FUEL — Litchfield, ME
    // Website down but legit business (BBB A+, 40+ years).
    // 24/7 emergency heating oil deliveries. Owner: Larry Gowell.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'G&G Cash Fuel',
      slug: 'g-and-g-cash-fuel',
      phone: '(207) 268-3835',
      email: 'ggcashfuel@yahoo.com',
      website: 'https://ggcashfuel.com',
      addressLine1: '490 Richmond Road',
      city: 'Litchfield',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04210', '04236', '04240', '04250', '04252',
        '04259', '04287', '04008', '04330', '04344',
        '04345', '04346', '04347', '04350', '04351'
      ]),
      serviceCities: JSON.stringify([
        'Auburn', 'Augusta', 'Bowdoin', 'Bowdoinham', 'Chelsea',
        'Farmingdale', 'Gardiner', 'Greene', 'Hallowell', 'Lewiston',
        'Lisbon', 'Lisbon Falls', 'Litchfield', 'Manchester',
        'Monmouth', 'Pittston', 'Randolph'
      ]),
      serviceCounties: JSON.stringify(['Kennebec', 'Androscoggin', 'Sagadahoc']),
      serviceAreaRadius: 25,
      lat: 44.1352,
      lng: -69.9791,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted G&G Cash Fuel (Litchfield, ME)');

    // ============================================
    // 12. BOB'S CASH FUEL — Madison, ME
    // Central ME, Somerset/Franklin/Kennebec. Est. 1981.
    // IDEAL Energy Cooperative member. Saturday office hours.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Bob's Cash Fuel",
      slug: 'bobs-cash-fuel',
      phone: '(207) 696-3040',
      email: 'info@bobscashfuel.com',
      website: 'https://bobscashfuel.com',
      addressLine1: '424 Main Street',
      city: 'Madison',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Somerset County
        '04911', '04912', '04920', '04924', '04927',
        '04937', '04942', '04943', '04950', '04957',
        '04958', '04961', '04962', '04976', '04978', '04979',
        // Franklin County
        '04936', '04938', '04947', '04955', '04956',
        '04966', '04982', '04983', '04294',
        // Kennebec County
        '04901', '04917', '04963'
      ]),
      serviceCities: JSON.stringify([
        'Anson', 'Athens', 'Belgrade', 'Benton', 'Bingham',
        'Canaan', 'Clinton', 'Cornville', 'Eustis', 'Fairfield',
        'Farmington', 'Harmony', 'Hartland', 'Kingfield', 'Madison',
        'Mercer', 'New Portland', 'New Sharon', 'New Vineyard',
        'Norridgewock', 'North Anson', 'Oakland', 'Phillips',
        'Skowhegan', 'Smithfield', 'Solon', 'Starks', 'Stratton',
        'Strong', 'Waterville', 'Wilton', 'Winslow'
      ]),
      serviceCounties: JSON.stringify(['Somerset', 'Franklin', 'Kennebec']),
      serviceAreaRadius: 45,
      lat: 44.8000,
      lng: -69.8503,
      hoursWeekday: '7:30 AM - 5:00 PM',
      hoursSaturday: '8:30 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log("[Migration 082] Upserted Bob's Cash Fuel (Madison, ME)");

    // ============================================
    // 13. RINALDI ENERGY — Saco, ME
    // Senior/military/first responder discounts.
    // Emergency no-heat calls. $35 under-100-gal truck fee.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Rinaldi Energy',
      slug: 'rinaldi-energy',
      phone: '(207) 571-4231',
      email: 'notifications@rinaldienergy.com',
      website: 'https://rinaldienergy.com',
      addressLine1: '778 Portland Road',
      city: 'Saco',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // York County
        '04002', '04005', '04042', '04043', '04046',
        '04064', '04072', '04073', '04083', '04087',
        '04090', '04093',
        // Cumberland County
        '04038', '04074', '04092', '04101', '04105',
        '04106', '04107', '04062',
        // Androscoggin County
        '04210', '04240'
      ]),
      serviceCities: JSON.stringify([
        'Alfred', 'Arundel', 'Auburn', 'Biddeford', 'Buxton',
        'Cape Elizabeth', 'Dayton', 'Falmouth', 'Gorham', 'Hollis',
        'Kennebunk', 'Kennebunkport', 'Lewiston', 'Lyman',
        'Old Orchard Beach', 'Portland', 'Saco', 'Sanford',
        'Scarborough', 'South Portland', 'Springvale', 'Standish',
        'Waterboro', 'Wells', 'Westbrook', 'Windham'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland', 'Androscoggin']),
      serviceAreaRadius: 35,
      lat: 43.5283,
      lng: -70.4268,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Rinaldi Energy (Saco, ME)');

    // ============================================
    // 14. TOP IT OFF OIL — Alfred, ME
    // DudaMobile site (403). Senior + volume discounts.
    // 24/7 emergency delivery. Est. 1994.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Top It Off Oil',
      slug: 'top-it-off-oil',
      phone: '(207) 324-1133',
      email: null,
      website: 'https://topitoffoilme.com',
      addressLine1: '279 Biddeford Road',
      city: 'Alfred',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04001', '04002', '04005', '04014', '04027',
        '04030', '04042', '04043', '04046', '04048',
        '04054', '04056', '04064', '04072', '04073',
        '04076', '04083', '04087', '04090', '04093',
        '03901', '03906', '03907', '03908'
      ]),
      serviceCities: JSON.stringify([
        'Acton', 'Alfred', 'Berwick', 'Biddeford', 'Buxton',
        'Hollis Center', 'Kennebunk', 'Kennebunkport', 'Lebanon',
        'Limerick', 'Newfield', 'North Berwick', 'Ogunquit',
        'Old Orchard Beach', 'Saco', 'Sanford', 'Shapleigh',
        'South Berwick', 'Springvale', 'Waterboro', 'Wells'
      ]),
      serviceCounties: JSON.stringify(['York']),
      serviceAreaRadius: 25,
      lat: 43.4759,
      lng: -70.6946,
      hoursWeekday: '9:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Top It Off Oil (Alfred, ME)');

    // ============================================
    // 15. ARROW OIL CO — Biddeford, ME
    // 24/7 availability. JS widget ordering (not scrapable).
    // Sole proprietorship, est. 2007.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Arrow Oil Co',
      slug: 'arrow-oil-co',
      phone: '(207) 286-1957',
      email: 'arrowoil@hotmail.com',
      website: 'https://www.arrowoilmaine.com',
      addressLine1: '41 Meeting House Rd',
      city: 'Biddeford',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04001', '04002', '04005', '04014', '04030',
        '04042', '04043', '04046', '04048', '04049',
        '04054', '04064', '04072', '04073', '04074',
        '04076', '04083', '04085', '04087', '04090',
        '04093', '04101', '04106', '04092'
      ]),
      serviceCities: JSON.stringify([
        'Acton', 'Alfred', 'Arundel', 'Biddeford', 'Buxton',
        'Cape Elizabeth', 'Hollis Center', 'Kennebunk',
        'Kennebunkport', 'Limerick', 'Limington', 'Lyman',
        'Old Orchard Beach', 'Portland', 'Saco', 'Sanford',
        'Scarborough', 'Shapleigh', 'South Portland', 'Springvale',
        'Waterboro', 'Wells', 'Westbrook'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland']),
      serviceAreaRadius: 30,
      lat: 43.4700,
      lng: -70.4105,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Arrow Oil Co (Biddeford, ME)');

    // ============================================
    // 16. CONROY'S OIL SERVICE — Saco, ME
    // Est. 1942, 3rd generation (Jim Conroy). Senior $0.02/gal discount.
    // Military/first responder $0.05/gal. $195 emergency call-out.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Conroy's Oil Service",
      slug: 'conroys-oil-service',
      phone: '(207) 883-2572',
      email: 'conroysoil@hotmail.com',
      website: 'https://conroysoil.com',
      addressLine1: '897 Portland Rd',
      city: 'Saco',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // York County
        '04002', '04005', '04014', '04030', '04042',
        '04043', '04046', '04048', '04064', '04072',
        '04085', '04093',
        // Cumberland County
        '04038', '04074', '04092', '04101', '04106', '04108'
      ]),
      serviceCities: JSON.stringify([
        'Alfred', 'Arundel', 'Biddeford', 'Buxton', 'Cape Elizabeth',
        'Dayton', 'Gorham', 'Hollis Center', 'Kennebunk',
        'Kennebunkport', 'Lyman', 'Old Orchard Beach', 'Peaks Island',
        'Portland', 'Saco', 'Scarborough', 'South Portland',
        'Waterboro', 'Westbrook'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland']),
      serviceAreaRadius: 25,
      lat: 43.5426,
      lng: -70.4154,
      hoursWeekday: '7:30 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log("[Migration 082] Upserted Conroy's Oil Service (Saco, ME)");

    // ============================================
    // 17. VIC & SONS FUEL CO — South Portland, ME
    // 30+ years. Parent company of SoPo Fuel. Droplet widget.
    // Oil, K-1, diesel.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Vic & Sons Fuel Co',
      slug: 'vic-and-sons-fuel-co',
      phone: '(207) 209-0275',
      email: 'sales@vicandsonsfuelco.com',
      website: 'https://vicandsonsfuelco.com',
      addressLine1: '14 Ocean St',
      city: 'South Portland',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Cumberland County
        '04011', '04021', '04032', '04038', '04039',
        '04069', '04071', '04074', '04078', '04092',
        '04096', '04097', '04101', '04102', '04103',
        '04105', '04106', '04107', '04110', '04260',
        // York County
        '04005', '04030', '04046', '04064', '04072', '04085'
      ]),
      serviceCities: JSON.stringify([
        'Arundel', 'Biddeford', 'Brunswick', 'Buxton', 'Cape Elizabeth',
        'Casco', 'Cumberland', 'Falmouth', 'Freeport', 'Gorham',
        'Gray', 'Hollis Center', 'New Gloucester', 'North Yarmouth',
        'Old Orchard Beach', 'Portland', 'Pownal', 'Raymond', 'Saco',
        'Scarborough', 'South Portland', 'Standish', 'Topsham',
        'Westbrook', 'Windham', 'Yarmouth'
      ]),
      serviceCounties: JSON.stringify(['Cumberland', 'York']),
      serviceAreaRadius: 30,
      lat: 43.6418,
      lng: -70.2540,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Vic & Sons Fuel Co (South Portland, ME)');

    // ============================================
    // 18. WILLOW CREEK FUEL — Saco, ME
    // Weekend delivery. 24-hour delivery. .me domain.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Willow Creek Fuel',
      slug: 'willow-creek-fuel',
      phone: '(207) 391-6013',
      email: 'willowcreekfuel@gmail.com',
      website: 'https://willowcreekfuel.me',
      addressLine1: '155 Bradley St',
      city: 'Saco',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // York County
        '04005', '04014', '04030', '04042', '04043',
        '04046', '04048', '04064', '04072', '04085', '04093',
        // Cumberland County
        '04038', '04074', '04092', '04101', '04102',
        '04105', '04106'
      ]),
      serviceCities: JSON.stringify([
        'Arundel', 'Biddeford', 'Buxton', 'Cape Elizabeth', 'Dayton',
        'Falmouth', 'Gorham', 'Hollis', 'Kennebunk', 'Kennebunkport',
        'Lyman', 'Old Orchard Beach', 'Portland', 'Saco', 'Scarborough',
        'South Portland', 'Waterboro', 'Westbrook'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland']),
      serviceAreaRadius: 25,
      lat: 43.5069,
      lng: -70.4567,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Willow Creek Fuel (Saco, ME)');

    // ============================================
    // 19. EAGLE OIL — Arundel, ME
    // Small operation (1 employee). Broken SSL cert.
    // Same-day emergency delivery per reviews.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Eagle Oil',
      slug: 'eagle-oil',
      phone: '(207) 468-3411',
      email: 'eagleoil@rocketmail.com',
      website: 'https://eagleoilmaine.com',
      addressLine1: "45 Fritz's Ln",
      city: 'Arundel',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04002', '04005', '04014', '04030', '04042',
        '04043', '04046', '04064', '04072', '04073',
        '04076', '04083', '04085', '04090', '04093'
      ]),
      serviceCities: JSON.stringify([
        'Alfred', 'Arundel', 'Biddeford', 'Buxton', 'Kennebunk',
        'Kennebunkport', 'Lyman', 'Old Orchard Beach', 'Saco',
        'Sanford', 'Scarborough', 'Springvale', 'Waterboro', 'Wells'
      ]),
      serviceCounties: JSON.stringify(['York']),
      serviceAreaRadius: 20,
      lat: 43.4326,
      lng: -70.5123,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Eagle Oil (Arundel, ME)');

    // ============================================
    // 20. SOPO FUEL CO — South Portland, ME
    // Related to Vic & Sons (same address). Very small coverage area.
    // Orders via Droplet Fuel platform. Est. 2022.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'SoPo Fuel Co',
      slug: 'sopo-fuel-co',
      phone: '(207) 805-0476',
      email: 'sopofuel@gmail.com',
      website: 'https://sopofuel.com',
      addressLine1: '14 Ocean St',
      city: 'South Portland',
      state: 'ME',
      postalCodesServed: JSON.stringify(['04106', '04107']),
      serviceCities: JSON.stringify(['South Portland', 'Cape Elizabeth']),
      serviceCounties: JSON.stringify(['Cumberland']),
      serviceAreaRadius: 10,
      lat: 43.6418,
      lng: -70.2540,
      hoursWeekday: '7:30 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted SoPo Fuel Co (South Portland, ME)');

    // ============================================
    // 21. ALFRED OIL COMPANY — Alfred, ME
    // BBB confirmed. Site down (broken SSL). 24hr emergency burner.
    // Senior + volume discounts. Est. 2001.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Alfred Oil Company',
      slug: 'alfred-oil',
      phone: '(207) 324-5557',
      email: null,
      website: 'https://alfredoil.com',
      addressLine1: '90 Back Rd',
      city: 'Alfred',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04001', '04002', '04005', '04014', '04027',
        '04030', '04042', '04043', '04046', '04048',
        '04054', '04056', '04064', '04072', '04073',
        '04074', '04076', '04083', '04087', '04090',
        '04093', '03901', '03906', '03907'
      ]),
      serviceCities: JSON.stringify([
        'Acton', 'Alfred', 'Arundel', 'Berwick', 'Biddeford',
        'Buxton', 'Hollis Center', 'Kennebunk', 'Kennebunkport',
        'Lebanon', 'Limerick', 'Lyman', 'Newfield', 'North Berwick',
        'North Waterboro', 'Ogunquit', 'Old Orchard Beach', 'Saco',
        'Sanford', 'Scarborough', 'Shapleigh', 'Springvale',
        'Waterboro', 'Wells'
      ]),
      serviceCounties: JSON.stringify(['York']),
      serviceAreaRadius: 25,
      lat: 43.4809,
      lng: -70.7035,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Alfred Oil Company (Alfred, ME)');

    // ============================================
    // 22. KALER OIL — North Bath, ME
    // Est. 1956, family-run (Robert J. Kaler Jr. + 3 sons).
    // Delivery schedule by day (Mon-Fri). $175 emergency fee.
    // Saturday office hours.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Kaler Oil',
      slug: 'kaler-oil',
      phone: '(207) 443-2438',
      email: 'bkaler@kaleroil.com',
      website: 'https://kaleroil.com',
      addressLine1: '322 Whiskeag Rd',
      city: 'North Bath',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Sagadahoc County
        '04530', '04579',
        // Cumberland County
        '04003', '04008', '04011', '04079', '04086',
        '04222', '04252', '04066',
        // Lincoln County
        '04535', '04537', '04538', '04542', '04553',
        '04556', '04562', '04571', '04576', '04578',
        // Androscoggin County (edge)
        '04287',
        // Kennebec County (edge)
        '04342', '04350', '04357'
      ]),
      serviceCities: JSON.stringify([
        'Alna', 'Arrowsic', 'Bailey Island', 'Bath', 'Boothbay',
        'Boothbay Harbor', 'Bowdoin', 'Bowdoinham', 'Brunswick',
        'Dresden', 'Durham', 'Edgecomb', 'Georgetown', 'Harpswell',
        'Lisbon Falls', 'Newcastle', 'North Bath', 'Orrs Island',
        'Phippsburg', 'Richmond', 'Southport', 'Topsham',
        'Trevett', 'West Bath', 'Westport', 'Wiscasset', 'Woolwich'
      ]),
      serviceCounties: JSON.stringify([
        'Sagadahoc', 'Cumberland', 'Lincoln', 'Androscoggin', 'Kennebec'
      ]),
      serviceAreaRadius: 30,
      lat: 43.9380,
      lng: -69.8483,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted Kaler Oil (North Bath, ME)');

    // ============================================
    // 23. C.B. HASKELL FUEL — Windsor, ME
    // 32 years, BBB A+. 24hr emergency. Wix site (not scrapable).
    // Also plumbing/heating services + wood pellets.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'C.B. Haskell Fuel',
      slug: 'cb-haskell-fuel',
      phone: '(207) 549-7669',
      email: 'cbhaskellfuel@yahoo.com',
      website: 'https://cbhaskellfuel.com',
      addressLine1: '714 Augusta-Rockland Rd',
      city: 'Windsor',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // Kennebec County
        '04330', '04344', '04345', '04346', '04347',
        '04351', '04358', '04359', '04363', '04926',
        '04935', '04989',
        // Lincoln County
        '04535', '04341', '04342', '04348', '04543',
        '04553', '04555', '04572',
        // Sagadahoc County
        '04357',
        // Knox County
        '04862',
        // Waldo County
        '04949'
      ]),
      serviceCities: JSON.stringify([
        'Alna', 'Augusta', 'China', 'Coopers Mills', 'Damariscotta',
        'Dresden', 'East Vassalboro', 'Farmingdale', 'Gardiner',
        'Hallowell', 'Jefferson', 'Liberty', 'Manchester',
        'Newcastle', 'Nobleboro', 'North Vassalboro', 'Randolph',
        'Richmond', 'South China', 'South Gardiner', 'Union',
        'Vassalboro', 'Waldoboro', 'Whitefield', 'Windsor'
      ]),
      serviceCounties: JSON.stringify([
        'Kennebec', 'Lincoln', 'Knox', 'Waldo', 'Sagadahoc'
      ]),
      serviceAreaRadius: 30,
      lat: 44.2688,
      lng: -69.5690,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 082] Upserted C.B. Haskell Fuel (Windsor, ME)');

    console.log('[Migration 082] ✅ ME suppliers complete (9 new scrapable + 1 update + 13 directory)');
  },

  async down(sequelize) {
    const domains = [
      'ofarrellenergy.com', 'ajsdiscountoil.com', 'ne-fuels.com',
      'paulsservicesinc.com', 'rroil.me', 'countryfuelllc.com',
      'hometownfuelme.com', 'coastlineenergyllc.com', 'winterwood-farm.com',
      'ggcashfuel.com', 'bobscashfuel.com', 'rinaldienergy.com',
      'topitoffoilme.com', 'arrowoilmaine.com', 'conroysoil.com',
      'vicandsonsfuelco.com', 'willowcreekfuel.me', 'eagleoilmaine.com',
      'sopofuel.com', 'alfredoil.com', 'kaleroil.com', 'cbhaskellfuel.com',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    // Revert Higgins Energy
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug = 'higgins-energy'
    `);
    console.log('[Migration 082] Rollback: Deactivated ME suppliers + reverted Higgins');
  }
};
