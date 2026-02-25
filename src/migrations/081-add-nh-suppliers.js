/**
 * Migration 081: Add 11 New Hampshire Suppliers
 *
 * NewEnglandOil.com banner advertiser cross-reference — New Hampshire batch.
 * All suppliers verified COD/will-call from their own websites.
 *
 * SCRAPABLE (6):
 *  1. County Energy Products — Chelmsford, MA → NH (since 1925, 5th gen family)
 *     COD confirmed: will-call + automatic delivery. Separate NH/MA prices on homepage.
 *     Existing scrape-config entry (countyenergyproducts.com). NO DB record yet.
 *  2. Foley Oil Co — Belmont, NH (75+ years, Lakes Region)
 *     COD confirmed: will-call delivery. Price in <p class="price"> on homepage.
 *  3. Davis Oil and Propane — Keene, NH (since 1926, Monadnock Region)
 *     COD confirmed: "Cash Price" language. Price in fuel-price div, no $ sign.
 *  4. Fitch Fuel Co — Lancaster, NH (Northern NH, 10-day cash price)
 *     COD confirmed: posted cash prices on /prices/ page. Elementor widget.
 *  5. Joel's Oil — Canterbury, NH (Central NH)
 *     COD confirmed: cash/check at delivery. Price in JSON-LD on product page (Wix).
 *     NOTE: Must use www.joelsoil.com (www prefix required for static HTML).
 *  6. Noble Fuels — North Berwick, ME → NH Seacoast
 *     COD confirmed: cash/check only, 100 gal min. Price in OG meta on product page.
 *     NOTE: Must use noblefuelsinc.com (no www — TLS fails with www prefix).
 *
 * DIRECTORY-ONLY (5):
 *  7. Flagship Fuel — Greenland, NH (Seacoast, Droplet widget)
 *  8. Discount Energy — Rochester, NH (40+ years, will-call, broad coverage)
 *  9. Reed Family Energy — Acton, ME → NH (small family, cash/card)
 * 10. Hometown Oil — Portsmouth, NH (20+ years, woman-owned, will-call)
 * 11. Welch Oil — York, ME → NH (will-call primary, since 2007)
 *
 * EXCLUDED (not added):
 *  - Fielding's Oil & Propane — contract-focused, auto-delivery emphasis
 *  - Quality Fuels LLC — online ordering only
 *  - R.E. Hinkley Co — excluded by review
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '081-add-nh-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. COUNTY ENERGY PRODUCTS — Chelmsford, MA → NH
    // COD confirmed: will-call + automatic delivery available.
    // Separate NH/MA prices on homepage. 5th generation family, since 1925.
    // Existing scrape-config entry but NO DB record — this creates it.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'County Energy Products',
      slug: 'county-energy-products',
      phone: '(978) 250-5855',
      email: 'countyenergyproducts@gmail.com',
      website: 'https://countyenergyproducts.com',
      addressLine1: '8 Emerson Avenue',
      city: 'Chelmsford',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        // NH — Hillsborough County
        '03031', '03051', '03052', '03053', '03054',
        '03060', '03062', '03063', '03110',
        // NH — Rockingham County
        '03038', '03076', '03079', '03086', '03841',
        // MA — Middlesex County
        '01432', '01450', '01451', '01460', '01463',
        '01718', '01720', '01741', '01742', '01803',
        '01821', '01824', '01826', '01827', '01850',
        '01851', '01852', '01854', '01862', '01863',
        '01876', '01879', '01886', '01887',
        // MA — Essex County
        '01810', '01844'
      ]),
      serviceCities: JSON.stringify([
        // NH
        'Bedford', 'Derry', 'Hollis', 'Hudson', 'Litchfield',
        'Londonderry', 'Merrimack', 'Nashua', 'Pelham', 'Salem', 'Windham',
        // MA
        'Acton', 'Andover', 'Ayer', 'Bedford', 'Billerica', 'Burlington',
        'Carlisle', 'Chelmsford', 'Concord', 'Dracut', 'Dunstable',
        'Groton', 'Harvard', 'Littleton', 'Lowell', 'Methuen',
        'Pepperell', 'Tewksbury', 'Tyngsboro', 'Westford', 'Wilmington'
      ]),
      serviceCounties: JSON.stringify([
        'Hillsborough', 'Rockingham', 'Middlesex', 'Essex'
      ]),
      serviceAreaRadius: 30,
      lat: 42.6340,
      lng: -71.3673,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted County Energy Products (Chelmsford, MA → NH)');

    // ============================================
    // 2. FOLEY OIL CO — Belmont, NH
    // COD confirmed: will-call delivery. 75+ years, Lakes Region.
    // Price in <p class="price"> on homepage: $3.849/gal
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Foley Oil Co',
      slug: 'foley-oil-co',
      phone: '(603) 524-1417',
      email: 'info@foleyoilco.com',
      website: 'https://foleyoilco.com',
      addressLine1: '39 Old State Road',
      city: 'Belmont',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // Belknap County
        '03220', '03225', '03246', '03249', '03253',
        '03254', '03256', '03269', '03276',
        // Merrimack County
        '03224', '03235', '03243', '03261', '03263', '03307',
        // Grafton County
        '03217', '03222', '03227', '03241', '03245',
        '03251', '03262', '03264', '03266', '03279',
        '03282', '03285', '03233',
        // Carroll County (edge)
        '03226'
      ]),
      serviceCities: JSON.stringify([
        'Alexandria', 'Alton', 'Ashland', 'Barnstead', 'Belmont',
        'Bridgewater', 'Bristol', 'Campton', 'Canterbury', 'Center Harbor',
        'Franklin', 'Gilford', 'Gilmanton', 'Hebron', 'Hill',
        'Holderness', 'Laconia', 'Lincoln', 'Meredith', 'Moultonboro',
        'New Hampton', 'North Woodstock', 'Northfield', 'Pittsfield',
        'Plymouth', 'Rumney', 'Sanbornton', 'Thornton', 'Tilton',
        'Warren', 'Wentworth', 'Woodstock'
      ]),
      serviceCounties: JSON.stringify([
        'Belknap', 'Grafton', 'Merrimack', 'Carroll'
      ]),
      serviceAreaRadius: 35,
      lat: 43.4453,
      lng: -71.4781,
      hoursWeekday: '7:30 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Foley Oil Co (Belmont, NH)');

    // ============================================
    // 3. DAVIS OIL AND PROPANE — Keene, NH
    // COD confirmed: "Cash Price" language on homepage. Since 1926.
    // Price in fuel-price div: #2 Fuel Cash Price: 3.799 (no $ sign).
    // Day-specific delivery routes (Mon-Fri by town).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Davis Oil and Propane',
      slug: 'davis-oil-and-propane',
      phone: '(603) 352-1306',
      email: null,
      website: 'https://davisoilandpropane.com',
      addressLine1: '559 Main Street',
      city: 'Keene',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // Cheshire County
        '03431', '03441', '03443', '03444', '03445', '03446',
        '03447', '03448', '03449', '03452', '03455', '03456',
        '03462', '03464', '03465', '03466', '03467', '03468',
        '03469', '03470',
        // Sullivan County (edge)
        '03602', '03608', '03609'
      ]),
      serviceCities: JSON.stringify([
        'Alstead', 'Ashuelot', 'Chesterfield', 'Dublin', 'Fitzwilliam',
        'Gilsum', 'Harrisville', 'Hinsdale', 'Keene', 'Marlborough',
        'Marlow', 'Nelson', 'Richmond', 'Roxbury', 'Spofford',
        'Stoddard', 'Sullivan', 'Surry', 'Swanzey', 'Troy',
        'Walpole', 'West Chesterfield', 'Westmoreland', 'Winchester'
      ]),
      serviceCounties: JSON.stringify(['Cheshire', 'Sullivan']),
      serviceAreaRadius: 25,
      lat: 42.9191,
      lng: -72.2753,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Davis Oil and Propane (Keene, NH)');

    // ============================================
    // 4. FITCH FUEL CO — Lancaster, NH
    // COD confirmed: 10-day cash prices posted on /prices/ page.
    // 24/7 emergency fuel delivery. Northern NH + VT border.
    // Price in Elementor widget: <span class="elementor-price-list-price">$3.999</span>
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Fitch Fuel Co',
      slug: 'fitch-fuel-co',
      phone: '(603) 788-4904',
      email: 'info@fitchfuelco.com',
      website: 'https://fitchfuelco.com',
      addressLine1: '178 Summer Street',
      city: 'Lancaster',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // Coos County
        '03584', '03582', '03583', '03590', '03597', '03595',
        '03570', '03576', '03581', '03588',
        // Grafton County (overlap)
        '03574', '03561', '03585'
      ]),
      serviceCities: JSON.stringify([
        'Bethlehem', 'Berlin', 'Colebrook', 'Dalton', 'Gorham',
        'Groveton', 'Jefferson', 'Lancaster', 'Littleton', 'Milan',
        'North Stratford', 'Stark', 'Twin Mountain', 'Whitefield'
      ]),
      serviceCounties: JSON.stringify(['Coos', 'Grafton']),
      serviceAreaRadius: 30,
      lat: 44.4887,
      lng: -71.5694,
      hoursWeekday: '7:30 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Fitch Fuel Co (Lancaster, NH)');

    // ============================================
    // 5. JOEL'S OIL — Canterbury, NH
    // COD confirmed: cash/check at delivery. Central NH.
    // Price in JSON-LD schema on /product-page/heating-oil: "price":"3.45"
    // NOTE: Must use www.joelsoil.com — without www, Wix returns JS-only.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Joel's Oil",
      slug: 'joels-oil',
      phone: '(603) 892-5505',
      email: 'joelsoilco@gmail.com',
      website: 'https://www.joelsoil.com',
      addressLine1: '50 Center Road',
      city: 'Canterbury',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // Merrimack County
        '03224', '03229', '03234', '03235', '03261', '03263',
        '03275', '03301', '03303', '03304', '03307',
        // Belknap County (edge)
        '03220', '03225', '03269', '03276',
        // Hillsborough County (edge — confirmed Goffstown/Manchester)
        '03045', '03102', '03103', '03104', '03106'
      ]),
      serviceCities: JSON.stringify([
        'Barnstead', 'Belmont', 'Boscawen', 'Bow', 'Canterbury',
        'Chichester', 'Concord', 'Dunbarton', 'Epsom', 'Franklin',
        'Goffstown', 'Hooksett', 'Hopkinton', 'Loudon', 'Manchester',
        'Northfield', 'Pembroke', 'Penacook', 'Pittsfield',
        'Salisbury', 'Sanbornton', 'Tilton'
      ]),
      serviceCounties: JSON.stringify([
        'Merrimack', 'Belknap', 'Hillsborough'
      ]),
      serviceAreaRadius: 25,
      lat: 43.3392,
      lng: -71.5651,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log("[Migration 081] Upserted Joel's Oil (Canterbury, NH)");

    // ============================================
    // 6. NOBLE FUELS — North Berwick, ME → NH Seacoast
    // COD confirmed: cash/check only, 100 gal min free delivery.
    // Price in OG meta tag on product page: product:price:amount content="3.69"
    // NOTE: Must use noblefuelsinc.com (no www — TLS fails with www prefix).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Noble Fuels',
      slug: 'noble-fuels',
      phone: '(207) 676-2100',
      email: null,
      website: 'https://noblefuelsinc.com',
      addressLine1: '118 Wells Street',
      city: 'North Berwick',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // ME — York County
        '03901', '03902', '03903', '03904', '03905', '03906',
        '03907', '03908', '03909', '03910', '03911',
        '04002', '04005', '04042', '04043', '04046',
        '04061', '04073', '04083', '04090', '04093',
        // ME — Cumberland County (edge)
        '04072', '04074',
        // NH — Strafford County
        '03820', '03824', '03825', '03835', '03839',
        '03867', '03868', '03878', '03872',
        // NH — Rockingham County
        '03801', '03833', '03840', '03842', '03844',
        '03854', '03857', '03862', '03870', '03871', '03885'
      ]),
      serviceCities: JSON.stringify([
        // ME
        'Berwick', 'Biddeford', 'Buxton', 'Eliot', 'Hollis',
        'Kennebunk', 'Kennebunkport', 'Kittery', 'North Berwick',
        'Ogunquit', 'Saco', 'Sanford', 'Scarborough', 'South Berwick',
        'Springvale', 'Waterboro', 'Wells', 'York',
        // NH
        'Barrington', 'Dover', 'Durham', 'Exeter', 'Farmington',
        'Greenland', 'Hampton', 'Hampton Falls', 'New Castle',
        'Newmarket', 'North Hampton', 'Portsmouth', 'Rochester',
        'Rye', 'Somersworth', 'Stratham'
      ]),
      serviceCounties: JSON.stringify([
        'York', 'Cumberland', 'Strafford', 'Rockingham'
      ]),
      serviceAreaRadius: 35,
      lat: 43.3025,
      lng: -70.7360,
      hoursWeekday: '8:30 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Noble Fuels (North Berwick, ME → NH)');

    // ============================================
    // 7. FLAGSHIP FUEL — Greenland, NH
    // COD confirmed: Droplet on-demand ordering widget. Seacoast NH + southern ME.
    // Prices via Droplet — NOT scrapable.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Flagship Fuel',
      slug: 'flagship-fuel',
      phone: '(603) 988-0555',
      email: 'team@flagshipfuelco.com',
      website: 'https://flagshipfuelco.com',
      addressLine1: '26 Alden Ave',
      city: 'Greenland',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // NH — Rockingham County (Seacoast)
        '03801', '03811', '03826', '03833', '03840',
        '03842', '03844', '03848', '03854', '03856',
        '03857', '03858', '03862', '03870', '03871',
        '03874', '03885',
        // NH — Strafford County (nearby)
        '03820', '03824', '03825', '03869',
        // ME — York County (southern)
        '03901', '03902', '03903', '03904', '03905',
        '03906', '03907', '03908', '03909', '03910', '03911'
      ]),
      serviceCities: JSON.stringify([
        'Atkinson', 'Barrington', 'Dover', 'Durham', 'East Kingston',
        'Exeter', 'Greenland', 'Hampton', 'Hampton Falls', 'Kensington',
        'New Castle', 'Newfields', 'Newmarket', 'Newton', 'North Hampton',
        'Portsmouth', 'Rollinsford', 'Rye', 'Seabrook', 'Stratham',
        // ME
        'Berwick', 'Cape Neddick', 'Eliot', 'Kittery', 'North Berwick',
        'Ogunquit', 'South Berwick', 'York'
      ]),
      serviceCounties: JSON.stringify(['Rockingham', 'Strafford', 'York']),
      serviceAreaRadius: 25,
      lat: 43.0395,
      lng: -70.8231,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Flagship Fuel (Greenland, NH)');

    // ============================================
    // 8. DISCOUNT ENERGY — Rochester, NH
    // COD confirmed: "Payment must be received on or in advance of each delivery"
    //   + "will-call basis". 40+ years, family-owned.
    // #2 heating oil + K-1 kerosene. 100 gal min. Broad NH + ME coverage.
    // Prices NOT scrapable (not on site).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Discount Energy',
      slug: 'discount-energy',
      phone: '(603) 335-3007',
      email: null,
      website: 'https://www.discountenergy.org',
      addressLine1: '11 Dreyer Way',
      city: 'Rochester',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // NH — Strafford County
        '03815', '03820', '03824', '03825', '03839',
        '03849', '03851', '03855', '03867', '03868',
        '03869', '03872', '03878', '03882', '03884',
        // NH — Rockingham County
        '03801', '03819', '03826', '03833', '03838',
        '03840', '03842', '03844', '03848', '03854',
        '03856', '03857', '03858', '03862', '03870',
        '03871', '03874', '03885',
        '03032', '03042', '03044', '03077', '03290',
        // NH — Belknap County (edge)
        '03809', '03225',
        // NH — Merrimack County (edge)
        '03234', '03263', '03275', '03307',
        // NH — Carroll County (edge)
        '03830', '03894',
        // ME — York County
        '03901', '03903', '03904', '03906', '03908',
        '03909', '04001', '04073', '04083', '04090'
      ]),
      serviceCities: JSON.stringify([
        // NH — Strafford
        'Barrington', 'Center Strafford', 'Dover', 'Durham', 'Farmington',
        'Madbury', 'Milton', 'New Durham', 'Rochester', 'Rollinsford',
        'Somersworth', 'Strafford', 'Wakefield',
        // NH — Rockingham
        'Atkinson', 'Candia', 'Chester', 'Deerfield', 'East Kingston',
        'Epping', 'Exeter', 'Fremont', 'Greenland', 'Hampton',
        'Hampton Falls', 'Kensington', 'New Castle', 'Newfields',
        'Newmarket', 'Newton', 'North Hampton', 'Nottingham',
        'Portsmouth', 'Raymond', 'Rye', 'Seabrook', 'Stratham',
        // NH — other
        'Alton', 'Barnstead', 'Epsom', 'Loudon', 'Pittsfield', 'Wolfeboro',
        // ME
        'Acton', 'Berwick', 'Eliot', 'Kittery', 'North Berwick',
        'Sanford', 'Shapleigh', 'South Berwick', 'Wells', 'York'
      ]),
      serviceCounties: JSON.stringify([
        'Strafford', 'Rockingham', 'Belknap', 'Merrimack', 'Carroll', 'York'
      ]),
      serviceAreaRadius: 40,
      lat: 43.3045,
      lng: -70.9756,
      hoursWeekday: '7:30 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Discount Energy (Rochester, NH)');

    // ============================================
    // 9. REED FAMILY ENERGY — Acton, ME → NH
    // COD confirmed: "Cash or card accepted", advance payment.
    // Small family operation (Joe & Kelsey Reed). No street address.
    // Serves York County ME + Strafford/Carroll NH.
    // Prices NOT scrapable (simple site, no prices).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Reed Family Energy',
      slug: 'reed-family-energy',
      phone: '(207) 569-5543',
      email: null,
      website: 'https://reedfamilyenergy.com',
      addressLine1: null,
      city: 'Acton',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // ME — York County
        '04001', '04024', '04030', '04048', '04049',
        '04061', '04073', '04083',
        '03901', '03906', '03908',
        // NH — Strafford County
        '03815', '03825', '03839', '03851', '03855',
        '03867', '03868', '03869', '03878', '03882',
        // NH — Carroll County
        '03830', '03849', '03872',
        // NH — Belknap County (edge)
        '03809', '03810'
      ]),
      serviceCities: JSON.stringify([
        // ME
        'Acton', 'Alfred', 'Berwick', 'Hollis', 'Limerick',
        'Limington', 'North Berwick', 'Sanford', 'Shapleigh',
        'South Berwick', 'Springvale', 'Waterboro',
        // NH
        'Alton', 'Barrington', 'Center Strafford', 'East Wakefield',
        'Farmington', 'Middleton', 'Milton', 'New Durham',
        'Rochester', 'Rollinsford', 'Sanbornville', 'Somersworth',
        'Strafford', 'Wakefield'
      ]),
      serviceCounties: JSON.stringify([
        'York', 'Strafford', 'Carroll', 'Belknap'
      ]),
      serviceAreaRadius: 30,
      lat: 43.5338,
      lng: -70.9058,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Reed Family Energy (Acton, ME → NH)');

    // ============================================
    // 10. HOMETOWN OIL — Portsmouth, NH
    // COD confirmed: "Order when you need it", will-call delivery.
    // 20+ years, woman-owned. 24-hour emergency service.
    // Prices via myfuelaccount.com portal — NOT scrapable.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Hometown Oil',
      slug: 'hometown-oil',
      phone: '(603) 501-4555',
      email: 'info@jarzombekenergy.com',
      website: 'https://www.hometown-oil.com',
      addressLine1: '300 Constitution Ave, Suite 1',
      city: 'Portsmouth',
      state: 'NH',
      postalCodesServed: JSON.stringify([
        // NH — Rockingham County
        '03801', '03833', '03840', '03842', '03844',
        '03854', '03856', '03857', '03861', '03870',
        '03871', '03885',
        '03042', '03044', '03290',
        // NH — Strafford County
        '03820', '03823', '03824', '03825', '03835',
        '03839', '03867', '03868', '03869', '03878', '03884',
        // ME — York County
        '03901', '03902', '03903', '03904', '03905',
        '03908', '03909', '03910', '03911'
      ]),
      serviceCities: JSON.stringify([
        // NH
        'Barrington', 'Dover', 'Durham', 'Epping', 'Exeter',
        'Farmington', 'Fremont', 'Greenland', 'Hampton', 'Hampton Falls',
        'Lee', 'Madbury', 'New Castle', 'Newfields', 'Newmarket',
        'Nottingham', 'Portsmouth', 'Rochester', 'Rollinsford',
        'Rye', 'Somersworth', 'Strafford', 'Stratham',
        // ME
        'Berwick', 'Eliot', 'Kittery', 'South Berwick', 'York'
      ]),
      serviceCounties: JSON.stringify([
        'Rockingham', 'Strafford', 'York'
      ]),
      serviceAreaRadius: 30,
      lat: 43.0374,
      lng: -70.7906,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Hometown Oil (Portsmouth, NH)');

    // ============================================
    // 11. WELCH OIL — York, ME → NH
    // COD confirmed: will-call is primary service. "Order when you need it."
    // Founded 2007 by Jim, Jan, and Jeff Welch.
    // Prices via Droplet widget — NOT scrapable.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Welch Oil',
      slug: 'welch-oil',
      phone: '(207) 363-2770',
      email: 'info@welchheatingoil.com',
      website: 'https://welchheatingoil.com',
      addressLine1: '129 Cape Neddick Road',
      city: 'York',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        // ME — York County
        '03901', '03902', '03903', '03904', '03905',
        '03906', '03907', '03908', '03909', '03910', '03911',
        '04073', '04090',
        // NH — Rockingham County
        '03801', '03833', '03840', '03842', '03844',
        '03854', '03856', '03857', '03862', '03870',
        '03871', '03885',
        // NH — Strafford County
        '03820', '03823', '03824', '03825', '03835',
        '03839', '03867', '03868', '03869', '03878'
      ]),
      serviceCities: JSON.stringify([
        // ME
        'Berwick', 'Cape Neddick', 'Eliot', 'Kittery', 'North Berwick',
        'Ogunquit', 'Sanford', 'South Berwick', 'Wells', 'York',
        // NH
        'Barrington', 'Dover', 'Durham', 'Exeter', 'Farmington',
        'Greenland', 'Hampton', 'Hampton Falls', 'Lee', 'Madbury',
        'New Castle', 'Newfields', 'Newmarket', 'North Hampton',
        'Portsmouth', 'Rochester', 'Rollinsford', 'Rye',
        'Somersworth', 'Stratham'
      ]),
      serviceCounties: JSON.stringify([
        'York', 'Rockingham', 'Strafford'
      ]),
      serviceAreaRadius: 35,
      lat: 43.1859,
      lng: -70.6105,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 081] Upserted Welch Oil (York, ME → NH)');

    console.log('[Migration 081] ✅ NH suppliers complete (6 scrapable + 5 directory)');
  },

  async down(sequelize) {
    const domains = [
      'countyenergyproducts.com',
      'foleyoilco.com',
      'davisoilandpropane.com',
      'fitchfuelco.com',
      'joelsoil.com',
      'noblefuelsinc.com',
      'flagshipfuelco.com',
      'discountenergy.org',
      'reedfamilyenergy.com',
      'hometown-oil.com',
      'welchheatingoil.com',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 081] Rollback: Deactivated NH suppliers');
  }
};
