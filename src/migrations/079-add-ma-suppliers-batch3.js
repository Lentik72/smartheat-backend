/**
 * Migration 079: Add 6 Massachusetts Suppliers (Batch 3) + Expand Broco Energy MA Coverage
 *
 * NewEnglandOil.com banner advertiser cross-reference — third batch of
 * qualified COD/will-call suppliers verified from their own websites.
 *
 *  1. Ron's Fuel Oil — Athol (Worcester/Franklin)
 *     COD confirmed: "Today's cash price" on own site. 24-hour emergency.
 *     Prices scrapable (GoDaddy SSR static HTML).
 *  2. The Oil Peddler — South Dennis (Barnstable/Cape Cod)
 *     COD confirmed: Explicit COD blog post + "LOW, LOW CASH OIL PRICES".
 *     Prices scrapable (WordPress static HTML, tiered table).
 *  3. Vickers Oil (Supreme Oil) — West Springfield (Hampden/Hampshire)
 *     COD confirmed: "Will-call delivery" on own site. Mon-Sat delivery.
 *     Prices scrapable (static HTML table, tiered).
 *  4. Highway Fuel — Hingham (Norfolk/Plymouth)
 *     COD confirmed: "Discount Prices" family dealer since 1991, South Shore.
 *     Prices NOT scrapable (no prices on site).
 *  5. Kieras Oil Inc — North Amherst (Hampshire/Franklin/Hampden/Worcester)
 *     Likely COD: Listed on HeatFleet (COD marketplace), since 1949.
 *     Prices NOT scrapable (Hibu JS SPA).
 *  6. Will & Son Trucking — Milford (Worcester/Norfolk/Middlesex)
 *     Likely COD: Family trucking co, order-on-demand model.
 *     Prices NOT scrapable (Hibu JS SPA).
 *
 *  7. Broco Energy — Haverhill (EXISTING supplier, expand with MA coverage)
 *     Already in system for NH. Add MA towns/ZIPs in Essex + Middlesex counties.
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '079-add-ma-suppliers-batch3',

  async up(sequelize) {
    // ============================================
    // 1. RON'S FUEL OIL — Athol, MA
    // COD confirmed: "Today's cash price for 150 gallons or more"
    // 24-hour emergency: (978) 249-0263 and (978) 652-2328
    // GoDaddy site but SSR — price in static HTML.
    // Also offers prepay/budget plans as alternatives.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Ron's Fuel Oil",
      slug: 'rons-fuel-oil',
      phone: '(978) 249-3548',
      email: null,
      website: 'https://ronsfuelinc.com',
      addressLine1: '575 South St',
      city: 'Athol',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01331', '01344', '01349', '01351', '01354', '01355', '01360',
        '01364', '01366', '01368', '01376', '01378',
        '01430', '01436', '01440', '01475'
      ]),
      serviceCities: JSON.stringify([
        'Athol', 'Orange', 'Petersham', 'Phillipston', 'Royalston',
        'Erving', 'New Salem', 'Warwick', 'Wendell',
        'Ashburnham', 'Baldwinville', 'Gardner', 'Gill', 'Greenfield',
        'Millers Falls', 'Montague', 'Northfield', 'Templeton',
        'Turners Falls', 'Winchendon'
      ]),
      serviceCounties: JSON.stringify(['Worcester', 'Franklin']),
      serviceAreaRadius: 25,
      lat: 42.5835,
      lng: -72.2279,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log("[Migration 079] Upserted Ron's Fuel Oil (Athol, MA)");

    // ============================================
    // 2. THE OIL PEDDLER — South Dennis, MA
    // COD confirmed: oilpeddler.com/what-is-cod-oil-delivery-blog/
    // "LOW, LOW CASH OIL PRICES" on homepage.
    // WordPress site, prices in static HTML tiered table.
    // Cape Cod coverage: Sandwich to Truro.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'The Oil Peddler',
      slug: 'the-oil-peddler',
      phone: '(508) 398-0070',
      email: 'oilpeddlerpricing@gmail.com',
      website: 'https://oilpeddler.com',
      addressLine1: '435 Route 134',
      city: 'South Dennis',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '02537', '02542', '02561', '02562', '02563', '02601', '02630',
        '02631', '02632', '02633', '02634', '02635', '02637', '02638',
        '02639', '02641', '02642', '02643', '02644', '02645', '02646',
        '02647', '02648', '02649', '02650', '02651', '02652', '02653',
        '02655', '02657', '02659', '02660', '02661', '02662', '02663',
        '02664', '02666', '02667', '02668', '02669', '02670', '02671',
        '02672', '02673', '02675'
      ]),
      serviceCities: JSON.stringify([
        'Sandwich', 'Mashpee', 'Barnstable', 'Hyannis', 'Yarmouth',
        'Dennis', 'South Dennis', 'Harwich', 'Brewster', 'Chatham',
        'Orleans', 'Eastham', 'Wellfleet', 'Truro',
        'West Barnstable', 'Osterville', 'Cotuit', 'Centerville',
        'Marstons Mills', 'West Yarmouth', 'South Yarmouth',
        'Dennis Port', 'West Dennis', 'East Dennis',
        'Harwich Port', 'East Harwich', 'West Harwich',
        'North Chatham', 'South Chatham', 'West Chatham',
        'East Orleans', 'North Eastham'
      ]),
      serviceCounties: JSON.stringify(['Barnstable']),
      serviceAreaRadius: 30,
      lat: 41.6898,
      lng: -70.1559,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 079] Upserted The Oil Peddler (South Dennis, MA)');

    // ============================================
    // 3. VICKERS OIL (Supreme Oil) — West Springfield, MA
    // COD confirmed: "Will-call" delivery on vickersoil.com.
    // Also offers automatic delivery, pre-pay, budget contracts.
    // Mon-Sat delivery, 24-hour emergency service.
    // Static HTML table with tiered pricing.
    // Same entity as Supreme Oil at same address.
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
        '01001', '01007', '01008', '01009', '01010', '01013', '01020',
        '01022', '01027', '01028', '01030', '01033', '01034', '01036',
        '01040', '01041', '01056', '01057', '01069', '01071', '01073',
        '01075', '01077', '01079', '01080', '01081', '01083', '01089',
        '01090', '01092', '01095', '01101', '01103', '01104', '01105',
        '01106', '01107', '01108', '01109', '01151', '01521'
      ]),
      serviceCities: JSON.stringify([
        'Agawam', 'Belchertown', 'Bondsville', 'Chicopee',
        'East Longmeadow', 'Feeding Hills', 'Granby', 'Hampden',
        'Holyoke', 'Indian Orchard', 'Longmeadow', 'Ludlow',
        'Monson', 'Palmer', 'South Hadley', 'Springfield',
        'Southwick', 'Thorndike', 'Three Rivers', 'West Springfield',
        'Wilbraham', 'Brimfield', 'Easthampton', 'Holland',
        'Russell', 'Southampton', 'Wales', 'Warren', 'West Warren',
        'Blandford', 'Granville'
      ]),
      serviceCounties: JSON.stringify(['Hampden', 'Hampshire']),
      serviceAreaRadius: 30,
      lat: 42.1085,
      lng: -72.6449,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 2:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 079] Upserted Vickers Oil (West Springfield, MA)');

    // ============================================
    // 4. HIGHWAY FUEL — Hingham, MA
    // Discount prices, family owned since 1991. South Shore.
    // 24Hr Emergency Burner Service. Mon-Sat delivery.
    // Prices NOT scrapable (no prices on site).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Highway Fuel',
      slug: 'highway-fuel',
      phone: '(781) 749-7733',
      email: null,
      website: 'https://www.highwayfuel.biz',
      addressLine1: '450 Cushing St',
      city: 'Hingham',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '02025', '02043', '02045', '02061', '02066', '02169', '02170',
        '02171', '02184', '02188', '02189', '02190', '02339', '02370'
      ]),
      serviceCities: JSON.stringify([
        'Braintree', 'Cohasset', 'Hanover', 'Hingham', 'Hull',
        'Norwell', 'Quincy', 'Rockland', 'Scituate', 'Weymouth'
      ]),
      serviceCounties: JSON.stringify(['Norfolk', 'Plymouth']),
      serviceAreaRadius: 15,
      lat: 42.1838,
      lng: -70.9027,
      hoursWeekday: '6:00 AM - 5:00 PM',
      hoursSaturday: '6:00 AM - 5:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 079] Upserted Highway Fuel (Hingham, MA)');

    // ============================================
    // 5. KIERAS OIL INC — North Amherst, MA
    // Family-owned since 1949. On HeatFleet (COD marketplace).
    // 24-hour emergency service. Hampshire/Franklin coverage.
    // Prices NOT scrapable (Hibu JS SPA).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Kieras Oil Inc',
      slug: 'kieras-oil',
      phone: '(413) 549-1144',
      email: 'kieras@comcast.net',
      website: 'https://www.kierasoil.com',
      addressLine1: '97 Russellville Rd',
      city: 'North Amherst',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01002', '01003', '01004', '01007', '01012', '01022', '01027',
        '01032', '01033', '01035', '01038', '01039', '01050', '01053',
        '01054', '01056', '01059', '01060', '01061', '01062', '01063',
        '01066', '01070', '01072', '01073', '01075', '01082', '01084',
        '01093', '01094', '01096', '01098', '01301', '01330', '01337',
        '01338', '01339', '01340', '01341', '01342', '01344', '01346',
        '01349', '01351', '01354', '01355', '01360', '01364', '01366',
        '01367', '01370', '01373', '01375', '01376', '01378', '01379'
      ]),
      serviceCities: JSON.stringify([
        'Amherst', 'North Amherst', 'Sunderland', 'Hadley', 'Hatfield',
        'Whately', 'South Deerfield', 'Leverett', 'Shutesbury',
        'Northampton', 'Florence', 'Haydenville', 'Leeds',
        'Deerfield', 'Montague', 'Granby', 'Conway', 'Belchertown',
        'South Hadley', 'Williamsburg', 'Wendell', 'Millers Falls',
        'Easthampton', 'New Salem', 'Greenfield', 'Turners Falls',
        'Goshen', 'Chesterfield', 'Gill', 'Ashfield',
        'Shelburne Falls', 'Orange', 'Petersham', 'Erving',
        'Northfield', 'Warwick', 'Buckland', 'Charlemont',
        'Colrain', 'Heath', 'Plainfield', 'Worthington',
        'Cummington', 'Southampton'
      ]),
      serviceCounties: JSON.stringify([
        'Hampshire', 'Franklin', 'Hampden', 'Worcester'
      ]),
      serviceAreaRadius: 35,
      lat: 42.4100,
      lng: -72.5450,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 079] Upserted Kieras Oil Inc (North Amherst, MA)');

    // ============================================
    // 6. WILL & SON TRUCKING — Milford, MA
    // Family trucking co, 25+ years trucking, 6 years in oil.
    // Order-on-demand model. Sat delivery. Milford/Bellingham area.
    // Prices NOT scrapable (Hibu JS SPA).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Will & Son Trucking',
      slug: 'will-and-son-trucking',
      phone: '(508) 538-3645',
      email: 'willandsontrucking@gmail.com',
      website: 'https://www.willandsontrucking.com',
      addressLine1: '32 Carroll St',
      city: 'Milford',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01504', '01516', '01529', '01569', '01746', '01747', '01756',
        '01757', '02019', '02038', '02053', '02054'
      ]),
      serviceCities: JSON.stringify([
        'Bellingham', 'Blackstone', 'Douglas', 'Franklin', 'Holliston',
        'Hopedale', 'Medway', 'Mendon', 'Milford', 'Millis',
        'Millville', 'Uxbridge'
      ]),
      serviceCounties: JSON.stringify(['Worcester', 'Norfolk', 'Middlesex']),
      serviceAreaRadius: 15,
      lat: 42.1530,
      lng: -71.5198,
      hoursWeekday: '9:00 AM - 5:00 PM',
      hoursSaturday: '9:00 AM - 5:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 079] Upserted Will & Son Trucking (Milford, MA)');

    // ============================================
    // 7. BROCO ENERGY — Expand existing supplier with MA coverage
    // Already in system for NH (Rockingham/Hillsborough).
    // Add MA towns in Essex + Middlesex counties.
    // Cash discount at delivery confirmed on site.
    // ============================================
    const maZips = [
      '01803', '01810', '01812', '01821', '01830', '01831', '01832',
      '01833', '01834', '01835', '01844', '01845', '01860', '01864',
      '01867', '01876', '01880', '01887', '01890', '01906', '01913',
      '01921', '01923', '01940', '01949', '01950', '01952', '01960',
      '01969', '01983', '01985', '02155', '02176', '02180'
    ];
    const maCities = [
      'Amesbury', 'Andover', 'Billerica', 'Boxford', 'Burlington',
      'Danvers', 'Georgetown', 'Groveland', 'Haverhill', 'Lynnfield',
      'Medford', 'Melrose', 'Merrimac', 'Methuen', 'Middleton',
      'Newburyport', 'North Andover', 'North Reading', 'Peabody',
      'Reading', 'Rowley', 'Salisbury', 'Saugus', 'Stoneham',
      'Tewksbury', 'Topsfield', 'Wakefield', 'West Newbury',
      'Wilmington', 'Winchester'
    ];
    const maCounties = ['Essex', 'Middlesex'];

    // Append MA ZIPs, cities, and counties to existing Broco Energy record
    // Uses jsonb concatenation to merge with existing NH data
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(postal_codes_served, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:maZips]) AS val
          ) combined
        ),
        service_cities = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_cities, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:maCities]) AS val
          ) combined
        ),
        service_counties = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_counties, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:maCounties]) AS val
          ) combined
        ),
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%brocoenergy.com%'
        AND active = true
    `, {
      replacements: { maZips, maCities, maCounties }
    });
    console.log('[Migration 079] Expanded Broco Energy with MA coverage');

    console.log('[Migration 079] ✅ MA suppliers batch 3 complete (6 new + 1 expanded)');
  },

  async down(sequelize) {
    const domains = [
      'ronsfuelinc.com',
      'oilpeddler.com',
      'vickersoil.com',
      'highwayfuel.biz',
      'kierasoil.com',
      'willandsontrucking.com',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 079] Rollback: Deactivated batch 3 MA suppliers');
  }
};
