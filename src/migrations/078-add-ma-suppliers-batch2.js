/**
 * Migration 078: Add 5 Massachusetts Suppliers (Batch 2)
 *
 * NewEnglandOil.com banner advertiser cross-reference — second batch of
 * qualified COD/will-call suppliers verified from their own websites.
 *
 *  1. Patriot Liquid Energy — Uxbridge (Worcester/Middlesex/Norfolk/Suffolk/Bristol/Essex/Plymouth)
 *     Will-call model: posted daily price + online order. Prices scrapable.
 *  2. M.J. Meehan / Order Your Oil — Bellingham (Worcester/Middlesex/Norfolk/Bristol)
 *     COD confirmed: HeatFleet "COD Deliveries", FAQ "check paying customers".
 *     Prices NOT scrapable (Gravity Form). Also sells off-road diesel.
 *  3. Spartan Oil — Salem (Essex/Middlesex/Suffolk/Norfolk/Plymouth)
 *     COD confirmed: "cash-paying customers" on own site. 24-hour emergency.
 *     Prices NOT scrapable (Hibu JS SPA).
 *  4. Atlantic Oil — Amesbury (Essex MA + Rockingham NH)
 *     Will-call confirmed: "will-call oil delivery" on own site. 3rd-generation since 1940s.
 *     Prices NOT scrapable (Droplet Fuel widget). Also sells kerosene + diesel.
 *  5. Old Man Oil — Holden (Worcester/Middlesex/Hampshire/Hampden/Franklin)
 *     COD confirmed: "C.O.D." in company name. Broad Central MA coverage.
 *     Prices scrapable via zipleads JSON API (100-299 gal tier).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '078-add-ma-suppliers-batch2',

  async up(sequelize) {
    // ============================================
    // 1. PATRIOT LIQUID ENERGY — Uxbridge, MA
    // Will-call model: posted daily price + MyFuelAccount portal.
    // Aggregator-listed on HeatFleet, FuelWonk, NewEnglandOil.
    // Price in static HTML: <span class="price">3.89</span>
    // Huge service area: Central MA to Greater Boston.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Patriot Liquid Energy',
      slug: 'patriot-liquid-energy',
      phone: '(508) 234-6003',
      email: 'info@patriotliquidenergy.com',
      website: 'https://patriotliquidenergy.com',
      addressLine1: '410 N Main St',
      city: 'Uxbridge',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01501', '01503', '01504', '01505', '01510', '01516', '01519',
        '01520', '01522', '01524', '01525', '01526', '01527', '01529',
        '01532', '01534', '01536', '01537', '01540', '01542', '01545',
        '01546', '01560', '01568', '01569', '01570', '01571', '01580',
        '01581', '01582', '01583', '01586', '01588', '01590', '01601',
        '01602', '01603', '01604', '01605', '01606', '01607', '01608',
        '01609', '01610', '01701', '01702', '01718', '01719', '01720',
        '01721', '01740', '01742', '01745', '01746', '01747', '01748',
        '01749', '01752', '01754', '01756', '01757', '01760', '01770',
        '01772', '01773', '01775', '01776', '01778', '01784', '01803',
        '01810', '01821', '01864', '01867', '01880', '01887', '01890',
        '01906', '01940', '02018', '02019', '02021', '02026', '02027',
        '02030', '02032', '02035', '02038', '02043', '02052', '02053',
        '02054', '02056', '02062', '02067', '02070', '02071', '02072',
        '02081', '02090', '02093', '02130', '02131', '02132', '02136',
        '02148', '02155', '02169', '02170', '02171', '02176', '02180',
        '02184', '02186', '02188', '02189', '02190', '02324', '02356',
        '02368', '02375', '02420', '02421', '02445', '02446', '02451',
        '02452', '02453', '02454', '02458', '02459', '02460', '02461',
        '02462', '02464', '02465', '02466', '02467', '02468', '02472',
        '02474', '02476', '02478', '02481', '02482', '02492', '02493',
        '02494', '02703', '02760', '02761', '02762', '02763'
      ]),
      serviceCities: JSON.stringify([
        'Uxbridge', 'Northbridge', 'Whitinsville', 'Douglas', 'Sutton',
        'Grafton', 'Millbury', 'Worcester', 'Auburn', 'Oxford',
        'Webster', 'Dudley', 'Blackstone', 'Millville', 'Mendon',
        'Hopedale', 'Milford', 'Upton', 'Westborough', 'Shrewsbury',
        'Boylston', 'West Boylston', 'Holden', 'Paxton', 'Leicester',
        'Spencer', 'Framingham', 'Natick', 'Ashland', 'Holliston',
        'Sherborn', 'Hopkinton', 'Southborough', 'Marlborough',
        'Hudson', 'Bolton', 'Berlin', 'Clinton', 'Lancaster',
        'Concord', 'Maynard', 'Sudbury', 'Wayland', 'Weston',
        'Wellesley', 'Needham', 'Newton', 'Brookline', 'Brighton',
        'Boston', 'Dorchester', 'Roxbury', 'Jamaica Plain', 'Roslindale',
        'West Roxbury', 'Hyde Park', 'Milton', 'Quincy', 'Braintree',
        'Weymouth', 'Holbrook', 'Randolph', 'Canton', 'Sharon',
        'Norwood', 'Westwood', 'Dover', 'Medfield', 'Millis',
        'Norfolk', 'Walpole', 'Foxborough', 'Franklin', 'Bellingham',
        'Plainville', 'Wrentham', 'North Attleboro', 'Attleboro',
        'Dedham', 'Stoughton', 'Avon', 'Easton', 'Mansfield',
        'Woburn', 'Burlington', 'Reading', 'Wakefield', 'Winchester',
        'Lexington', 'Arlington', 'Belmont', 'Watertown', 'Waltham',
        'Medford', 'Malden', 'Melrose', 'Stoneham', 'Saugus',
        'Lynn', 'Lynnfield', 'Wilmington'
      ]),
      serviceCounties: JSON.stringify([
        'Worcester', 'Middlesex', 'Norfolk', 'Suffolk', 'Essex',
        'Plymouth', 'Bristol'
      ]),
      serviceAreaRadius: 50,
      lat: 42.0827,
      lng: -71.6283,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 125,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 078] Upserted Patriot Liquid Energy (Uxbridge, MA)');

    // ============================================
    // 2. M.J. MEEHAN / ORDER YOUR OIL — Bellingham, MA
    // COD confirmed: HeatFleet lists "COD Deliveries".
    // FAQ: "check paying customers will still need to call the office".
    // Excavating company that also sells heating oil + off-road diesel.
    // Prices NOT scrapable (Gravity Form / WooCommerce backend).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'M.J. Meehan / Order Your Oil',
      slug: 'mj-meehan-order-your-oil',
      phone: '(508) 282-7854',
      email: 'info@mjmeehanexc.com',
      website: 'https://orderyouroil.com',
      addressLine1: '235B Maple St',
      city: 'Bellingham',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01504', '01519', '01525', '01529', '01534', '01536', '01537',
        '01540', '01560', '01564', '01569', '01570', '01581', '01582',
        '01586', '01588', '01590', '01701', '01702', '01718', '01721',
        '01746', '01747', '01748', '01749', '01756', '01757', '01770',
        '01772', '01775', '01778', '02019', '02026', '02030', '02032',
        '02035', '02038', '02048', '02052', '02053', '02054', '02056',
        '02062', '02067', '02070', '02071', '02081', '02090', '02093',
        '02324', '02357', '02375', '02481', '02482', '02492', '02493',
        '02494', '02703', '02760', '02762', '02763'
      ]),
      serviceCities: JSON.stringify([
        'Bellingham', 'Franklin', 'Milford', 'Medway', 'Holliston',
        'Hopkinton', 'Mendon', 'Millis', 'Norfolk', 'Wrentham',
        'Blackstone', 'Douglas', 'Grafton', 'Hopedale', 'Northbridge',
        'Sutton', 'Upton', 'Uxbridge', 'Attleboro', 'North Attleboro',
        'Plainville', 'Foxborough', 'Mansfield', 'Norton',
        'Framingham', 'Ashland', 'Natick', 'Sherborn', 'Wellesley',
        'Needham', 'Dover', 'Dedham', 'Norwood', 'Sharon', 'Walpole',
        'Westwood', 'Medfield', 'Southborough', 'Westborough',
        'Whitinsville', 'Manchaug', 'Linwood', 'Fayville'
      ]),
      serviceCounties: JSON.stringify([
        'Worcester', 'Middlesex', 'Norfolk', 'Bristol'
      ]),
      serviceAreaRadius: 25,
      lat: 42.1046,
      lng: -71.4486,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 078] Upserted M.J. Meehan / Order Your Oil (Bellingham, MA)');

    // ============================================
    // 3. SPARTAN OIL — Salem, MA
    // COD confirmed: "cash-paying customers" on own Hibu site.
    // Cash/checks only — no credit card. 24-hour emergency service.
    // Saturday delivery (same-day if before 11:30 AM).
    // Prices NOT scrapable (Hibu JS SPA).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Spartan Oil',
      slug: 'spartan-oil',
      phone: '(978) 744-0342',
      email: 'spartanoilsalem@gmail.com',
      website: 'https://www.spartanoilsalem.com',
      addressLine1: '14 Commercial St',
      city: 'Salem',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01730', '01801', '01803', '01810', '01833', '01834', '01860',
        '01864', '01867', '01876', '01880', '01887', '01890', '01901',
        '01902', '01904', '01905', '01906', '01907', '01908', '01910',
        '01915', '01921', '01922', '01929', '01930', '01938', '01940',
        '01944', '01945', '01949', '01950', '01951', '01960', '01965',
        '01966', '01969', '01970', '01982', '01983', '01984', '02108',
        '02109', '02110', '02111', '02113', '02114', '02115', '02116',
        '02118', '02119', '02120', '02121', '02122', '02124', '02125',
        '02126', '02127', '02128', '02129', '02130', '02131', '02132',
        '02134', '02135', '02136', '02141', '02143', '02144', '02145',
        '02148', '02149', '02150', '02151', '02152', '02155', '02176',
        '02180', '02420', '02421', '02445', '02446', '02451', '02452',
        '02453', '02458', '02459', '02460', '02461', '02462', '02464',
        '02465', '02466', '02467', '02468', '02472', '02474', '02476',
        '02478'
      ]),
      serviceCities: JSON.stringify([
        'Salem', 'Beverly', 'Peabody', 'Danvers', 'Marblehead',
        'Swampscott', 'Lynn', 'Saugus', 'Nahant', 'Lynnfield',
        'Middleton', 'Topsfield', 'Wenham', 'Hamilton', 'Ipswich',
        'Rowley', 'Georgetown', 'Groveland', 'Boxford', 'Gloucester',
        'Rockport', 'Manchester', 'Essex', 'Newburyport', 'Newbury',
        'Andover', 'North Andover', 'Merrimac',
        'Woburn', 'Burlington', 'Reading', 'Wakefield', 'Winchester',
        'Wilmington', 'North Reading', 'Stoneham', 'Melrose',
        'Medford', 'Malden', 'Everett', 'Somerville', 'Cambridge',
        'Arlington', 'Lexington', 'Belmont', 'Watertown',
        'Boston', 'Charlestown', 'East Boston', 'South Boston',
        'Dorchester', 'Roxbury', 'Allston', 'Brighton',
        'Chelsea', 'Revere', 'Winthrop', 'Brookline',
        'Newton', 'Waltham'
      ]),
      serviceCounties: JSON.stringify([
        'Essex', 'Middlesex', 'Suffolk', 'Norfolk', 'Plymouth'
      ]),
      serviceAreaRadius: 30,
      lat: 42.5247,
      lng: -70.9010,
      hoursWeekday: '8:00 AM - 6:00 PM',
      hoursSaturday: '8:00 AM - 5:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 078] Upserted Spartan Oil (Salem, MA)');

    // ============================================
    // 4. ATLANTIC OIL — Amesbury, MA
    // Will-call confirmed: "will-call oil delivery" on own site.
    // 3rd-generation family business since 1940s. 24-hour burner service.
    // Serves both MA (Essex County) and NH (Rockingham County).
    // Prices NOT scrapable (Droplet Fuel widget, ZIP+email form).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Atlantic Oil',
      slug: 'atlantic-oil',
      phone: '(978) 388-1415',
      email: null,
      website: 'https://atlanticoil.net',
      addressLine1: '82 Haverhill Road',
      city: 'Amesbury',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01830', '01831', '01832', '01833', '01834', '01835', '01860',
        '01913', '01921', '01922', '01938', '01950', '01951', '01952',
        '01969', '01985',
        '03811', '03827', '03833', '03840', '03842', '03844', '03848',
        '03858', '03862', '03865', '03870', '03874', '03885'
      ]),
      serviceCities: JSON.stringify([
        'Amesbury', 'Boxford', 'Byfield', 'Georgetown', 'Groveland',
        'Haverhill', 'Ipswich', 'Merrimac', 'Newbury', 'Newburyport',
        'Plum Island', 'Rowley', 'Salisbury', 'West Newbury',
        'Atkinson', 'East Kingston', 'Exeter', 'Greenland', 'Rye',
        'Hampton', 'Hampton Beach', 'Hampton Falls', 'Kensington',
        'Kingston', 'Newton', 'North Hampton', 'Plaistow', 'Seabrook',
        'South Hampton', 'Stratham'
      ]),
      serviceCounties: JSON.stringify(['Essex', 'Rockingham']),
      serviceAreaRadius: 25,
      lat: 42.8567,
      lng: -70.9416,
      hoursWeekday: '8:30 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 125,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 078] Upserted Atlantic Oil (Amesbury, MA)');

    // ============================================
    // 5. OLD MAN OIL (Old Man C.O.D. Oil LLC) — Holden, MA
    // COD confirmed: "C.O.D." in company legal name.
    // "No strings! No contracts! No pre-pay! Simply call when you need oil!"
    // Broad Central MA coverage (75+ towns). Website updated Jan 2026.
    // YellowPages incorrectly says "CLOSED" — site live, DOT active.
    // Prices via zipleads JSON API (json_api pattern in scrape-config).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Old Man Oil',
      slug: 'old-man-oil',
      phone: '(508) 886-8998',
      email: null,
      website: 'https://oldmanoil.net',
      addressLine1: '752 Main Street',
      city: 'Holden',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '01005', '01010', '01037', '01068', '01074', '01082', '01083',
        '01092', '01094', '01331', '01355', '01366', '01368', '01420',
        '01430', '01431', '01434', '01436', '01438', '01440', '01451',
        '01452', '01453', '01462', '01464', '01467', '01473', '01475',
        '01501', '01503', '01505', '01506', '01507', '01510', '01515',
        '01518', '01519', '01520', '01522', '01523', '01524', '01527',
        '01531', '01532', '01535', '01536', '01537', '01541', '01542',
        '01543', '01545', '01550', '01562', '01564', '01566', '01581',
        '01583', '01585', '01590', '01602', '01605', '01606', '01609',
        '01612', '01740', '01749', '01752'
      ]),
      serviceCities: JSON.stringify([
        'Holden', 'Rutland', 'Paxton', 'West Boylston', 'Worcester',
        'Jefferson', 'Oakham', 'Princeton', 'Barre', 'South Barre',
        'Hubbardston', 'Leicester', 'Cherry Valley', 'Spencer',
        'Boylston', 'Sterling', 'Westminster', 'Hardwick',
        'Gilbertville', 'Templeton', 'Baldwinville', 'Rochdale',
        'East Brookfield', 'Shrewsbury', 'Gardner', 'Clinton',
        'Lancaster', 'Fitchburg', 'Petersham', 'Leominster',
        'Auburn', 'Charlton', 'West Brookfield', 'Brookfield',
        'Oxford', 'Millbury', 'Berlin', 'Ware', 'Northborough',
        'North Grafton', 'Grafton', 'South Grafton', 'Warren',
        'West Warren', 'New Salem', 'Bolton', 'Lunenburg',
        'Still River', 'Ashburnham', 'Athol', 'Westborough',
        'Sturbridge', 'Fiskdale', 'Devens', 'Hudson', 'Sutton',
        'Harvard', 'Winchendon', 'Shirley', 'Ashby', 'Brimfield',
        'Marlborough', 'Southbridge', 'Royalston',
        'North Brookfield', 'New Braintree', 'Wheelwright',
        'North Oxford', 'West Millbury'
      ]),
      serviceCounties: JSON.stringify([
        'Worcester', 'Middlesex', 'Hampshire', 'Hampden', 'Franklin'
      ]),
      serviceAreaRadius: 35,
      lat: 42.3518,
      lng: -71.8626,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 078] Upserted Old Man Oil (Holden, MA)');

    console.log('[Migration 078] ✅ MA suppliers batch 2 complete (5 suppliers)');
  },

  async down(sequelize) {
    const domains = [
      'patriotliquidenergy.com',
      'orderyouroil.com',
      'spartanoilsalem.com',
      'atlanticoil.net',
      'oldmanoil.net',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 078] Rollback: Deactivated batch 2 MA suppliers');
  }
};
