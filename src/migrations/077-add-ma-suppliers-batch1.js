/**
 * Migration 077: Add 10 Massachusetts Suppliers (Batch 1)
 *
 * NewEnglandOil.com banner advertiser cross-reference — first batch of
 * qualified COD/will-call suppliers verified from their own websites.
 *
 *  1. Oilman Inc — Foxborough (Norfolk County, COD confirmed, prices scrapable)
 *  2. Plainville Oil — Foxboro (Bristol/Norfolk, on-demand, price via iframe)
 *  3. American Discount Oil — Palmer (Hampden/Hampshire/Worcester, COD, prices scrapable)
 *  4. Fast Fill Oil — West Springfield (Hampden, COD explicit, prices scrapable)
 *  5. Vickers Oil — West Springfield (Hampden, will-call explicit, prices scrapable)
 *  6. Nala Industries — Upton (Worcester/Middlesex/Norfolk, will-call, prices scrapable)
 *  7. Orlando Fuel Service — Framingham (Middlesex/Worcester, will-call, prices scrapable)
 *  8. Al's Oil Service — Shrewsbury (Worcester, COD + will-call, NOT scrapable)
 *  9. Frasco Fuel Oil — West Springfield (Hampden, cash payment, prices scrapable)
 * 10. Southbridge Tire & Oil — Southbridge (Worcester/Windham CT, will-call, prices scrapable)
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '077-add-ma-suppliers-batch1',

  async up(sequelize) {
    // ============================================
    // 1. OILMAN INC — Foxborough, MA
    // COD confirmed: prices labeled "cash price" in HTML.
    // Prices in static HTML: <h1>$3.759</h1>
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Oilman Inc',
      slug: 'oilman-inc',
      phone: '(877) 698-2900',
      email: 'oilmanonline@gmail.com',
      website: 'https://oilmanonline.com',
      addressLine1: '227 Cocasset Street',
      city: 'Foxborough',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '02021', '02030', '02035', '02038', '02048', '02052', '02056',
        '02062', '02067', '02081', '02090', '02093', '02356', '02703',
        '02760', '02762', '02766'
      ]),
      serviceCities: JSON.stringify([
        'Foxborough', 'Mansfield', 'Sharon', 'Walpole', 'Westwood',
        'Wrentham', 'Norfolk', 'Norwood', 'Franklin', 'Medfield',
        'Canton', 'Dover', 'Easton', 'Attleboro', 'North Attleboro',
        'Norton', 'Plainville'
      ]),
      serviceCounties: JSON.stringify(['Norfolk', 'Bristol']),
      serviceAreaRadius: 20,
      lat: 42.0654,
      lng: -71.2484,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 5:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Oilman Inc (Foxborough, MA)');

    // ============================================
    // 2. PLAINVILLE OIL — Foxboro, MA
    // On-demand ordering with price on homepage (iframe).
    // Price via: plainville-oil.com/price/plainville-oil_price.php
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Plainville Oil',
      slug: 'plainville-oil',
      phone: '(508) 594-9326',
      email: 'office@plainville-oil.com',
      website: 'https://www.plainville-oil.com',
      addressLine1: null,
      city: 'Foxboro',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '02019', '02035', '02038', '02048', '02056', '02081', '02093',
        '02703', '02760', '02761', '02762', '02766', '02769'
      ]),
      serviceCities: JSON.stringify([
        'Plainville', 'Attleboro', 'North Attleboro', 'South Attleboro',
        'Wrentham', 'Norfolk', 'Mansfield', 'Franklin', 'Bellingham',
        'Norton', 'Foxboro', 'Walpole', 'Rehoboth'
      ]),
      serviceCounties: JSON.stringify(['Norfolk', 'Bristol']),
      serviceAreaRadius: 15,
      lat: 42.0615,
      lng: -71.2477,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 125,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Plainville Oil (Foxboro, MA)');

    // ============================================
    // 3. AMERICAN DISCOUNT OIL — Palmer, MA
    // COD confirmed ("low COD prices"). Prices on regional pages.
    // Affiliated with Pioneer Valley Oil & Propane.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'American Discount Oil',
      slug: 'american-discount-oil',
      phone: '(413) 289-9428',
      email: null,
      website: 'https://americandiscountoil.com',
      addressLine1: '1182 Park Street',
      city: 'Palmer',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01007', '01009', '01010', '01013', '01020', '01022', '01028',
        '01031', '01033', '01036', '01037', '01040', '01041', '01056',
        '01057', '01069', '01074', '01075', '01079', '01080', '01081',
        '01082', '01083', '01092', '01094', '01095', '01101', '01103',
        '01104', '01105', '01106', '01107', '01108', '01109', '01118',
        '01119', '01128', '01129', '01151', '01506', '01515', '01518',
        '01521', '01535', '01566', '01585'
      ]),
      serviceCities: JSON.stringify([
        'Palmer', 'Springfield', 'Chicopee', 'Holyoke', 'East Longmeadow',
        'Longmeadow', 'Ludlow', 'Wilbraham', 'Monson', 'Belchertown',
        'Granby', 'South Hadley', 'Hampden', 'Indian Orchard', 'Brimfield',
        'Sturbridge', 'Ware', 'Warren', 'West Warren', 'Bondsville',
        'Thorndike', 'Three Rivers', 'Wales', 'Hardwick', 'Brookfield',
        'North Brookfield', 'West Brookfield', 'East Brookfield',
        'South Barre', 'Holland'
      ]),
      serviceCounties: JSON.stringify(['Hampden', 'Hampshire', 'Worcester']),
      serviceAreaRadius: 35,
      lat: 42.1585,
      lng: -72.3285,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted American Discount Oil (Palmer, MA)');

    // ============================================
    // 4. FAST FILL OIL — West Springfield, MA
    // COD explicit: "cash on delivery, check, money orders"
    // Prices in static HTML on homepage.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Fast Fill Oil',
      slug: 'fast-fill-oil',
      phone: '(413) 739-1165',
      email: null,
      website: 'https://fastfilloil.com',
      addressLine1: '75 Union Street',
      city: 'West Springfield',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01001', '01007', '01009', '01013', '01020', '01022', '01028',
        '01030', '01033', '01036', '01040', '01041', '01056', '01057',
        '01069', '01075', '01077', '01079', '01080', '01085', '01089',
        '01095', '01101', '01103', '01104', '01105', '01106', '01107',
        '01108', '01109', '01118', '01119', '01128', '01129', '01151'
      ]),
      serviceCities: JSON.stringify([
        'West Springfield', 'Springfield', 'Chicopee', 'Holyoke',
        'Agawam', 'East Longmeadow', 'Longmeadow', 'Ludlow',
        'Wilbraham', 'Monson', 'Palmer', 'Belchertown', 'Granby',
        'South Hadley', 'Hampden', 'Southwick', 'Westfield',
        'Feeding Hills', 'Indian Orchard', 'Bondsville',
        'Thorndike', 'Three Rivers', 'Woronoco'
      ]),
      serviceCounties: JSON.stringify(['Hampden', 'Hampshire']),
      serviceAreaRadius: 25,
      lat: 42.1044,
      lng: -72.6189,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: '8:00 AM - 2:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Fast Fill Oil (West Springfield, MA)');

    // ============================================
    // 5. VICKERS OIL — West Springfield, MA
    // Will-call explicit: "will call delivery" on website.
    // 24/7 emergency service. Deliveries Mon-Sat.
    // Same address as Fast Fill Oil — sister companies.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Vickers Oil',
      slug: 'vickers-oil',
      phone: '(413) 737-3477',
      email: null,
      website: 'https://www.vickersoil.com',
      addressLine1: '75 Union Street',
      city: 'West Springfield',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01001', '01007', '01009', '01010', '01013', '01020', '01022',
        '01027', '01028', '01030', '01033', '01034', '01036', '01040',
        '01041', '01056', '01057', '01069', '01071', '01073', '01075',
        '01077', '01079', '01080', '01081', '01083', '01085', '01089',
        '01092', '01095', '01101', '01103', '01104', '01105', '01106',
        '01107', '01108', '01109', '01118', '01119', '01128', '01129',
        '01151', '01521'
      ]),
      serviceCities: JSON.stringify([
        'West Springfield', 'Springfield', 'Chicopee', 'Holyoke',
        'Agawam', 'East Longmeadow', 'Longmeadow', 'Ludlow',
        'Wilbraham', 'Monson', 'Palmer', 'Belchertown', 'Granby',
        'South Hadley', 'Hampden', 'Southwick', 'Westfield',
        'Feeding Hills', 'Indian Orchard', 'Bondsville',
        'Thorndike', 'Three Rivers', 'Brimfield', 'Easthampton',
        'Granville', 'Russell', 'Southampton', 'Wales', 'Warren',
        'West Warren', 'Holland'
      ]),
      serviceCounties: JSON.stringify(['Hampden', 'Hampshire']),
      serviceAreaRadius: 30,
      lat: 42.1044,
      lng: -72.6189,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 2:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 50,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Vickers Oil (West Springfield, MA)');

    // ============================================
    // 6. NALA INDUSTRIES (Nala Fuels) — Upton, MA
    // Will-call on own site: "will call basis"
    // Price on /oil-prices page (Squarespace SSR).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Nala Industries',
      slug: 'nala-industries',
      phone: '(508) 473-3835',
      email: 'info@nalafuels.com',
      website: 'https://www.nalaindustries.com',
      addressLine1: '11 Walker Drive',
      city: 'Upton',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01501', '01503', '01504', '01507', '01519', '01524', '01527',
        '01529', '01532', '01534', '01537', '01540', '01560', '01562',
        '01568', '01569', '01570', '01571', '01581', '01588', '01590',
        '01701', '01702', '01721', '01745', '01746', '01747', '01748',
        '01756', '01757', '01760', '01770', '01772',
        '02019', '02021', '02026', '02030', '02038', '02052', '02053',
        '02054', '02056', '02062', '02081', '02090', '02093'
      ]),
      serviceCities: JSON.stringify([
        'Upton', 'Sutton', 'Grafton', 'Milford', 'Hopedale', 'Mendon',
        'Northbridge', 'Medway', 'Bellingham', 'Holliston', 'Hopkinton',
        'Westborough', 'Shrewsbury', 'Framingham', 'Natick', 'Sherborn',
        'Medfield', 'Norwood', 'Westwood', 'Canton', 'Dedham', 'Walpole',
        'Franklin', 'Norfolk', 'Wrentham', 'Millis', 'Dover',
        'Blackstone', 'Millville', 'Douglas', 'Uxbridge', 'Ashland',
        'Southborough', 'Northborough', 'Marlborough'
      ]),
      serviceCounties: JSON.stringify(['Worcester', 'Middlesex', 'Norfolk']),
      serviceAreaRadius: 30,
      lat: 42.1584,
      lng: -71.5822,
      hoursWeekday: '9:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Nala Industries (Upton, MA)');

    // ============================================
    // 7. ORLANDO FUEL SERVICE — Framingham, MA
    // Will-call confirmed: "No contract one-time oil deliveries
    // or will call oil deliveries are always available."
    // Price on homepage (Wix SSR): $3.79
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Orlando Fuel Service',
      slug: 'orlando-fuel-service',
      phone: '(508) 620-6251',
      email: 'Sales@AOrlandooil.com',
      website: 'https://www.aorlandooil.com',
      addressLine1: '2 Cedar Street',
      city: 'Framingham',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01701', '01702', '01718', '01721', '01745', '01746', '01747',
        '01748', '01749', '01756', '01757', '01760', '01770', '01772',
        '01776', '01778',
        '01519', '01527', '01529', '01532', '01534', '01537', '01545',
        '01560', '01568', '01581', '01588',
        '02019', '02030', '02038', '02052', '02053', '02054'
      ]),
      serviceCities: JSON.stringify([
        'Framingham', 'Ashland', 'Hopkinton', 'Holliston', 'Milford',
        'Upton', 'Bellingham', 'Franklin', 'Medway', 'Millis',
        'Medfield', 'Dover', 'Sherborn', 'Natick', 'Wayland',
        'Wellesley', 'Sudbury', 'Marlborough', 'Southborough',
        'Westborough', 'Northborough', 'Grafton', 'Shrewsbury',
        'Mendon', 'Hopedale'
      ]),
      serviceCounties: JSON.stringify(['Middlesex', 'Worcester', 'Norfolk']),
      serviceAreaRadius: 25,
      lat: 42.2791,
      lng: -71.4166,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Orlando Fuel Service (Framingham, MA)');

    // ============================================
    // 8. AL'S OIL SERVICE — Shrewsbury, MA
    // COD + will-call confirmed from own website.
    // First 3 deliveries require COD. 150 gal minimum.
    // NOT scrapable — Hibu JS-rendered site.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Al's Oil Service",
      slug: 'als-oil-service',
      phone: '(508) 753-7221',
      email: null,
      website: 'https://www.alsoilservice.com',
      addressLine1: '307 Hartford Turnpike',
      city: 'Shrewsbury',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01501', '01503', '01505', '01507', '01516', '01519', '01520',
        '01524', '01527', '01529', '01531', '01532', '01534', '01537',
        '01540', '01541', '01542', '01543', '01545', '01550', '01560',
        '01562', '01566', '01568', '01569', '01570', '01581', '01583',
        '01585', '01588', '01590',
        '01601', '01602', '01603', '01604', '01605', '01606', '01607',
        '01608', '01609', '01610',
        '01746', '01747', '01749', '01752', '01756', '01757', '01760',
        '01770', '01772'
      ]),
      serviceCities: JSON.stringify([
        'Shrewsbury', 'Worcester', 'Auburn', 'Millbury', 'Boylston',
        'Grafton', 'Holden', 'Northborough', 'Westborough', 'Rutland',
        'Sutton', 'Charlton', 'Dudley', 'Oxford', 'Spencer',
        'Leicester', 'Paxton', 'Sterling', 'West Boylston',
        'Southborough', 'Northbridge', 'Upton', 'Uxbridge',
        'Hopkinton', 'Marlborough', 'Berlin', 'Douglas', 'Webster',
        'Sturbridge', 'Mendon', 'Hopedale', 'Milford', 'Blackstone',
        'Millville', 'Clinton', 'Lancaster'
      ]),
      serviceCounties: JSON.stringify(['Worcester', 'Middlesex']),
      serviceAreaRadius: 30,
      lat: 42.2862,
      lng: -71.7231,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log("[Migration 077] Upserted Al's Oil Service (Shrewsbury, MA)");

    // ============================================
    // 9. FRASCO FUEL OIL — West Springfield, MA
    // Cash payment confirmed: "All prices are for cash payment"
    // Price on /order/ page: var price1 = '3.90'
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Frasco Fuel Oil',
      slug: 'frasco-fuel-oil',
      phone: '(413) 734-3578',
      email: null,
      website: 'https://frascofueloil.com',
      addressLine1: '2383 Westfield Street',
      city: 'West Springfield',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01001', '01007', '01009', '01013', '01020', '01022', '01027',
        '01028', '01030', '01033', '01034', '01036', '01040', '01041',
        '01056', '01057', '01069', '01071', '01075', '01077', '01085',
        '01089', '01095', '01101', '01103', '01104', '01105', '01106',
        '01107', '01108', '01109', '01118', '01119', '01128', '01129',
        '01151'
      ]),
      serviceCities: JSON.stringify([
        'West Springfield', 'Springfield', 'Chicopee', 'Holyoke',
        'Agawam', 'East Longmeadow', 'Longmeadow', 'Ludlow',
        'Wilbraham', 'Monson', 'Hampden', 'Southwick', 'Westfield',
        'Feeding Hills', 'Indian Orchard', 'Granville', 'Russell',
        'Palmer', 'Belchertown', 'Granby', 'South Hadley',
        'Easthampton', 'Woronoco'
      ]),
      serviceCounties: JSON.stringify(['Hampden', 'Hampshire']),
      serviceAreaRadius: 25,
      lat: 42.1069,
      lng: -72.6665,
      hoursWeekday: '8:30 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Frasco Fuel Oil (West Springfield, MA)');

    // ============================================
    // 10. SOUTHBRIDGE TIRE & OIL — Southbridge, MA
    // Will-call confirmed from own website.
    // Also serves Thompson/Woodstock CT corridor.
    // Price in SSR: "CASH OIL PRICE: $3.69/Gal"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Southbridge Tire & Oil',
      slug: 'southbridge-tire-oil',
      phone: '(508) 765-0978',
      email: 'michelle@southbridgetire.com',
      website: 'https://www.southbridgetireandoil.com',
      addressLine1: '136 Central Street',
      city: 'Southbridge',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01506', '01507', '01510', '01515', '01518', '01521', '01524',
        '01529', '01535', '01537', '01540', '01550', '01560', '01566',
        '01569', '01570', '01571', '01585', '01588', '01590',
        '06230', '06234', '06235', '06242', '06255', '06259',
        '06260', '06263', '06277', '06279', '06281'
      ]),
      serviceCities: JSON.stringify([
        'Southbridge', 'Charlton', 'Sturbridge', 'Webster', 'Dudley',
        'Spencer', 'Oxford', 'Auburn', 'Millbury', 'Brimfield',
        'Holland', 'Wales', 'Brookfield', 'East Brookfield',
        'North Brookfield', 'West Brookfield',
        'Woodstock', 'Eastford', 'Pomfret', 'Putnam', 'Thompson'
      ]),
      serviceCounties: JSON.stringify(['Worcester', 'Windham']),
      serviceAreaRadius: 25,
      lat: 42.0782,
      lng: -72.0314,
      hoursWeekday: '7:30 AM - 5:00 PM',
      hoursSaturday: '7:30 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 077] Upserted Southbridge Tire & Oil (Southbridge, MA)');

    console.log('[Migration 077] All 10 MA suppliers upserted');
  },

  async down(sequelize) {
    const domains = [
      'oilmanonline.com', 'plainville-oil.com', 'americandiscountoil.com',
      'fastfilloil.com', 'vickersoil.com', 'nalaindustries.com',
      'aorlandooil.com', 'alsoilservice.com', 'frascofueloil.com',
      'southbridgetireandoil.com'
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 077] Rollback: Deactivated 10 MA suppliers');
  }
};
