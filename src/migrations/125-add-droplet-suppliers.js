/**
 * Migration 125: Add 19 Droplet Fuel suppliers + mark all Droplet suppliers do_not_pitch
 *
 * Droplet Fuel provides turnkey website + ordering for small COD dealers.
 * These suppliers will never claim listings (Droplet manages everything).
 * We scrape them passively via POST form pattern.
 *
 * NEW SUPPLIERS (19):
 *  1. G&G Oil LLC — Southington, CT
 *  2. T&M Fuel LLC — Fairless Hills, PA
 *  3. Elite Oil Heating & A/C — Swansea, MA
 *  4. Exeter Fuel Company — Exeter, RI
 *  5. Roberge Energy — South Berwick, ME
 *  6. My Express Oil — Langhorne, PA
 *  7. Affordable Fuel Delivery — Modena, NY
 *  8. Oppure Oil LLC — Winchendon, MA
 *  9. Reis Fuel LLC — Mount Olive, NJ
 * 10. FJB Oil LLC — Wolcott, CT
 * 11. On Demand Oil LLC — Uncasville, CT
 * 12. Top Tier Fuel LLC — Windsor Locks, CT
 * 13. Miner Discount Fuel — Westerly, RI
 * 14. Libra Fuels — Epping, NH
 * 15. L&H Fuel Oil LLC — Holtsville, NY
 * 16. Precision Heating Oil — Miller Place, NY
 * 17. Mayday Oil LLC — North Franklin, CT
 * 18. Bonilla's Fuel Services — Bay Shore, NY
 * 19. Phillips Oil & Propane LLC — Prospect, CT
 *
 * EXISTING SUPPLIERS marked do_not_pitch (11):
 *   Barrco Fuel, Ever Ready Oil, Wicked Warm Oil, Welch Oil,
 *   Vic & Sons, SoPo Fuel, Flagship Fuel, Tirpak Energy,
 *   Morse Fuels, Ferguson Oil, E-Z Oil
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '125-add-droplet-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. G&G OIL LLC — Southington, CT
    // Family-owned (Dvorani brothers), 20+ years. HOD #1110.
    // COD: "No Contracts Necessary" + "Cash or Credit Card Online Ordering"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'G&G Oil LLC',
      slug: 'g-and-g-oil-llc',
      phone: '(203) 815-9572',
      email: 'info@ggoilct.com',
      website: 'https://ggoilct.com',
      addressLine1: '1170 Meriden Ave.',
      city: 'Southington',
      state: 'CT',
      serviceCities: JSON.stringify([
        'Avon', 'Beacon Falls', 'Berlin', 'Bristol', 'Burlington', 'Cheshire',
        'Farmington', 'Hamden', 'Meriden', 'Middlefield', 'Middletown',
        'Naugatuck', 'New Britain', 'Plantsville', 'Plymouth', 'Terryville',
        'Portland', 'Prospect', 'Southbury', 'Southington', 'Thomaston',
        'Wallingford', 'Waterbury', 'Watertown', 'Wolcott',
      ]),
      serviceCounties: JSON.stringify(['Hartford', 'Litchfield', 'Middlesex', 'New Haven']),
      serviceAreaRadius: 25,
      lat: 41.5962,
      lng: -72.8821,
      hoursWeekday: '24/7',
      hoursSaturday: '24/7',
      hoursSunday: '24/7',
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted G&G Oil LLC (Southington, CT)');

    // ============================================
    // 2. T&M FUEL LLC — Fairless Hills, PA
    // Lower Bucks County. Droplet platform = per-order.
    // DIFFERENT from "T & M Fuel" in Attleboro, MA (migration 032).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'T&M Fuel LLC',
      slug: 't-and-m-fuel-llc-pa',
      phone: '(267) 981-8143',
      email: 'tmfuelllc@gmail.com',
      website: 'https://tmfuelllc.com',
      addressLine1: null,
      city: 'Fairless Hills',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Southampton', 'Levittown', 'Fairless Hills', 'Bristol', 'Newtown',
        'Feasterville', 'Trevose', 'Croydon', 'Morrisville', 'Washington Crossing',
        'Langhorne', 'Bensalem', 'Yardley',
      ]),
      serviceCounties: JSON.stringify(['Bucks']),
      serviceAreaRadius: 20,
      lat: 40.1765,
      lng: -74.8569,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted T&M Fuel LLC (Fairless Hills, PA)');

    // ============================================
    // 3. ELITE OIL HEATING & A/C — Swansea, MA
    // COD: "No Contracts Necessary", cash/CC for first 3 deliveries.
    // Min 100 gal (under 100 = $35 fee).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Elite Oil Heating & A/C',
      slug: 'elite-oil-heating-and-ac',
      phone: '(508) 219-6040',
      email: null,
      website: 'https://eliteoilheatac.com',
      addressLine1: '515 Wilbur Avenue',
      city: 'Swansea',
      state: 'MA',
      serviceCities: JSON.stringify([
        'Mansfield', 'North Attleboro', 'Plainville', 'Raynham', 'Assonet',
        'Attleboro', 'Berkley', 'Dartmouth', 'Dighton', 'Fall River', 'Norton',
        'Rehoboth', 'Seekonk', 'Somerset', 'South Attleboro', 'Swansea',
        'Taunton', 'Westport',
        'Barrington', 'Bristol', 'East Providence', 'Little Compton',
        'Middletown', 'Newport', 'Portsmouth', 'Tiverton', 'Warren',
        'Central Falls', 'Pawtucket',
      ]),
      serviceCounties: JSON.stringify(['Bristol', 'Newport', 'Providence']),
      serviceAreaRadius: 25,
      lat: 41.7443,
      lng: -71.1918,
      hoursWeekday: '8:00 AM - 4:30 PM',
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
    console.log('[Migration 125] Upserted Elite Oil Heating & A/C (Swansea, MA)');

    // ============================================
    // 4. EXETER FUEL COMPANY — Exeter, RI
    // Founded 1991. COD: explicit "$25 delivery charge for C.O.D."
    // Fuels: oil, kerosene, diesel.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Exeter Fuel Company',
      slug: 'exeter-fuel-company',
      phone: '(401) 392-0457',
      email: 'rbesson@exeterfuel.com',
      website: 'https://exeterfuel.com',
      addressLine1: '335 Nooseneck Hill Rd',
      city: 'Exeter',
      state: 'RI',
      serviceCities: JSON.stringify([
        'Coventry', 'Greene', 'West Greenwich', 'Exeter', 'North Kingstown',
        'East Greenwich', 'South Kingstown', 'Wakefield', 'Narragansett',
        'Charlestown', 'Carolina', 'Hope Valley', 'Hopkinton', 'Richmond',
        'Bradford', 'Westerly', 'Ashaway', 'Saunderstown', 'Jamestown',
        'Johnston', 'Cranston', 'West Warwick',
      ]),
      serviceCounties: JSON.stringify(['Washington', 'Kent', 'Providence']),
      serviceAreaRadius: 25,
      lat: 41.5773,
      lng: -71.5598,
      hoursWeekday: '9:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 1:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Exeter Fuel Company (Exeter, RI)');

    // ============================================
    // 5. ROBERGE ENERGY — South Berwick, ME
    // COD: "Cash or Credit Card Online Ordering" + "No Contracts Necessary"
    // Fuels: oil, K1 kerosene, on/off-road diesel.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Roberge Energy',
      slug: 'roberge-energy',
      phone: '(207) 606-9242',
      email: 'robergeenergy@gmail.com',
      website: 'https://robergeenergy.com',
      addressLine1: null,
      city: 'South Berwick',
      state: 'ME',
      serviceCities: JSON.stringify([
        'Acton', 'Berwick', 'Cape Neddick', 'Eliot', 'Kittery', 'Kittery Point',
        'Lebanon', 'North Berwick', 'Ogunquit', 'Sanford', 'South Berwick',
        'Springvale', 'Wells', 'York', 'York Harbor',
        'Dover', 'Farmington', 'Greenland', 'Milton', 'Milton Mills',
        'New Castle', 'Portsmouth', 'Rochester', 'Rollinsford', 'Rye',
        'Somersworth',
      ]),
      serviceCounties: JSON.stringify(['York', 'Strafford', 'Rockingham']),
      serviceAreaRadius: 25,
      lat: 43.2334,
      lng: -70.8098,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Roberge Energy (South Berwick, ME)');

    // ============================================
    // 6. MY EXPRESS OIL / ENERGY EXPRESS LLC — Langhorne, PA
    // Parent: ECI Comfort (established HVAC).
    // COD: "Choose Will-Call Delivery" + "No Contracts Necessary"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'My Express Oil',
      slug: 'my-express-oil',
      phone: '(215) 638-1552',
      email: null,
      website: 'https://myexpressoil.com',
      addressLine1: '1115 W Gillam Avenue',
      city: 'Langhorne',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Bensalem', 'Bristol', 'Langhorne', 'Levittown', 'Newtown',
        'Warminster', 'Doylestown', 'Hatboro', 'Abington', 'Jenkintown',
        'Cheltenham', 'Willow Grove', 'Horsham', 'Huntingdon Valley',
      ]),
      serviceCounties: JSON.stringify(['Bucks', 'Montgomery', 'Philadelphia']),
      serviceAreaRadius: 25,
      lat: 40.1746,
      lng: -74.9225,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted My Express Oil (Langhorne, PA)');

    // ============================================
    // 7. AFFORDABLE FUEL DELIVERY LLC — Modena, NY
    // Ulster/Dutchess/Orange counties.
    // NOT a duplicate of "Affordable Fuel Corp" (Putnam/Westchester) or
    // "Affordable Fuel Inc" (Seekonk MA).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Affordable Fuel Delivery',
      slug: 'affordable-fuel-delivery-ny',
      phone: '(845) 883-0194',
      email: 'Affordablefueldelivery@gmail.com',
      website: 'https://affordablefueldelivery.com',
      addressLine1: null,
      city: 'Modena',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Newburgh', 'New Paltz', 'Highland', 'Modena', 'Kingston',
        'Poughkeepsie', 'Beacon', 'Fishkill', 'Middletown', 'Wallkill',
        'Marlboro', 'Milton', 'Plattekill', 'Gardiner', 'Clintondale',
      ]),
      serviceCounties: JSON.stringify(['Ulster', 'Dutchess', 'Orange']),
      serviceAreaRadius: 30,
      lat: 41.6554,
      lng: -74.1093,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Affordable Fuel Delivery (Modena, NY)');

    // ============================================
    // 8. OPPURE OIL LLC — Winchendon, MA
    // Founded 2013. BBB member. Min 75 gal.
    // COD: "No Contract. Order oil anytime. Cancel anytime."
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Oppure Oil LLC',
      slug: 'oppure-oil-llc',
      phone: '(800) 359-4802',
      email: 'info@oppureoil.com',
      website: 'https://oppureoil.com',
      addressLine1: '87 Central Street',
      city: 'Winchendon',
      state: 'MA',
      serviceCities: JSON.stringify([
        'Ashburnham', 'Ashby', 'Athol', 'Baldwinville', 'Barre',
        'East Templeton', 'Fitchburg', 'Gardner', 'Hubbardston', 'Lancaster',
        'Leominster', 'Lunenburg', 'Orange', 'Petersham', 'Phillipston',
        'Princeton', 'Royalston', 'Sterling', 'Templeton', 'Townsend',
        'Westminster', 'Winchendon',
      ]),
      serviceCounties: JSON.stringify(['Worcester']),
      serviceAreaRadius: 25,
      lat: 42.6832,
      lng: -72.0441,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 75,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Oppure Oil LLC (Winchendon, MA)');

    // ============================================
    // 9. REIS FUEL LLC — Mount Olive, NJ
    // Family-run, 20+ years, 4,500 customers. Same day delivery.
    // COD: "Order online and pay with cash or a credit card" + "No Contracts"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Reis Fuel LLC',
      slug: 'reis-fuel-llc',
      phone: '(862) 254-2293',
      email: null,
      website: 'https://reisfuel.com',
      addressLine1: '98 Crease Road',
      city: 'Mount Olive',
      state: 'NJ',
      serviceCities: JSON.stringify([
        'Budd Lake', 'Chester', 'Denville', 'Dover', 'East Hanover', 'Flanders',
        'Hackettstown', 'Lake Hopatcong', 'Landing', 'Long Valley', 'Madison',
        'Mendham', 'Mine Hill', 'Morris Plains', 'Morristown', 'Mount Olive',
        'Netcong', 'Parsippany', 'Randolph', 'Rockaway', 'Roxbury', 'Stanhope',
        'Wharton',
        'Augusta', 'Branchville', 'Franklin', 'Hamburg', 'Highland Lakes',
        'Lafayette', 'Newton', 'Ogdensburg', 'Sparta', 'Sussex', 'Vernon',
        'Belvidere', 'Blairstown', 'Columbia', 'Great Meadows', 'Hackettstown',
        'Hope', 'Oxford', 'Phillipsburg', 'Washington',
      ]),
      serviceCounties: JSON.stringify(['Morris', 'Sussex', 'Warren']),
      serviceAreaRadius: 30,
      lat: 40.8724,
      lng: -74.7355,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Reis Fuel LLC (Mount Olive, NJ)');

    // ============================================
    // 10. FJB OIL LLC — Wolcott, CT
    // Family-owned. COD: explicit "CoD (Cash on Delivery)" + "will-call"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'FJB Oil LLC',
      slug: 'fjb-oil-llc',
      phone: '(203) 441-4704',
      email: 'admin@fjboil.com',
      website: 'https://fjboil.com',
      addressLine1: '770 Bound Line Rd.',
      city: 'Wolcott',
      state: 'CT',
      serviceCities: JSON.stringify([
        'Bristol', 'Plainville', 'Southington',
        'Oakville', 'Plymouth', 'Terryville', 'Thomaston', 'Watertown',
        'Cheshire', 'Middlebury', 'Naugatuck', 'Prospect', 'Waterbury', 'Wolcott',
      ]),
      serviceCounties: JSON.stringify(['Hartford', 'Litchfield', 'New Haven']),
      serviceAreaRadius: 20,
      lat: 41.6021,
      lng: -72.9721,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted FJB Oil LLC (Wolcott, CT)');

    // ============================================
    // 11. ON DEMAND OIL LLC — Uncasville, CT
    // HOD #1231. Multiple locations.
    // COD: "Cash or Credit Card Online Ordering" + "No Contracts"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'On Demand Oil LLC',
      slug: 'on-demand-oil-llc',
      phone: '(860) 319-7533',
      email: 'Ondemandfueloil@gmail.com',
      website: 'https://ondemandfueloil.com',
      addressLine1: null,
      city: 'Uncasville',
      state: 'CT',
      serviceCities: JSON.stringify([
        'Montville', 'Uncasville', 'Oakdale', 'Norwich', 'Preston',
        'Griswold', 'Lisbon', 'Jewett City', 'Baltic', 'Sprague',
        'Franklin', 'Windham', 'Willimantic', 'Lebanon', 'Colchester',
        'Salem', 'Waterford', 'East Lyme', 'Niantic', 'Groton',
        'New London', 'Ledyard', 'Gales Ferry',
      ]),
      serviceCounties: JSON.stringify(['New London', 'Windham']),
      serviceAreaRadius: 25,
      lat: 41.4348,
      lng: -72.1079,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted On Demand Oil LLC (Uncasville, CT)');

    // ============================================
    // 12. TOP TIER FUEL LLC — Windsor Locks, CT
    // CT License S9-397670, E1-123982, HOD #1240.
    // COD: "No Contracts Necessary" + reviews confirm one-time purchases.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Top Tier Fuel LLC',
      slug: 'top-tier-fuel-llc',
      phone: '(860) 502-5944',
      email: 'Toptierfuel@gmail.com',
      website: 'https://toptierfuelllc.com',
      addressLine1: '465 Spring Street Unit E',
      city: 'Windsor Locks',
      state: 'CT',
      serviceCities: JSON.stringify([
        'Avon', 'Bloomfield', 'Bristol', 'East Granby', 'East Hartford',
        'East Windsor', 'Ellington', 'Enfield', 'Farmington', 'Glastonbury',
        'Granby', 'Hartford', 'Manchester', 'Newington', 'Rockville',
        'Simsbury', 'Somers', 'South Windsor', 'Suffield', 'Tolland',
        'Vernon', 'West Hartford', 'Wethersfield', 'Windsor', 'Windsor Locks',
      ]),
      serviceCounties: JSON.stringify(['Hartford', 'Tolland']),
      serviceAreaRadius: 25,
      lat: 41.9293,
      lng: -72.6271,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: 'By appointment',
      hoursSunday: 'By appointment',
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Top Tier Fuel LLC (Windsor Locks, CT)');

    // ============================================
    // 13. MINER DISCOUNT FUEL — Westerly, RI
    // COD: EXPLICIT "Choose cash on delivery for flexibility" (pricing page).
    // Prior config note "NOT COD" was incorrect.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Miner Discount Fuel',
      slug: 'miner-discount-fuel',
      phone: '(401) 315-4328',
      email: null,
      website: 'https://minerdiscountfuel.com',
      addressLine1: '4 Spuchy Drive',
      city: 'Westerly',
      state: 'RI',
      serviceCities: JSON.stringify([
        'Westerly', 'Charlestown', 'South Kingstown', 'Narragansett',
        'Hopkinton', 'Richmond', 'Exeter', 'North Kingstown',
        'Groton', 'Mystic', 'Stonington', 'Pawcatuck', 'Waterford',
        'East Lyme', 'Niantic', 'Old Lyme', 'New London',
      ]),
      serviceCounties: JSON.stringify(['Washington', 'New London']),
      serviceAreaRadius: 25,
      lat: 41.3773,
      lng: -71.8273,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: 'Emergency only',
      hoursSunday: 'Emergency only',
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Miner Discount Fuel (Westerly, RI)');

    // ============================================
    // 14. LIBRA FUELS — Epping, NH
    // COD: "Cash or Credit Card Online Ordering" + "No Contracts"
    // 61+ towns in southern NH.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Libra Fuels',
      slug: 'libra-fuels',
      phone: '(603) 244-8456',
      email: 'cs@librafuels.com',
      website: 'https://librafuels.com',
      addressLine1: null,
      city: 'Epping',
      state: 'NH',
      serviceCities: JSON.stringify([
        'Auburn', 'Atkinson', 'Barrington', 'Bedford', 'Bow', 'Candia',
        'Chester', 'Derry', 'Dover', 'Durham', 'Epping', 'Exeter',
        'Goffstown', 'Hampton', 'Hooksett', 'Hudson', 'Kingston', 'Lee',
        'Londonderry', 'Manchester', 'Merrimack', 'Nashua', 'Newmarket',
        'North Hampton', 'Nottingham', 'Pelham', 'Portsmouth', 'Raymond',
        'Rye', 'Salem', 'Seabrook', 'Stratham', 'Windham',
      ]),
      serviceCounties: JSON.stringify(['Rockingham', 'Hillsborough', 'Strafford', 'Merrimack']),
      serviceAreaRadius: 30,
      lat: 43.0334,
      lng: -71.0743,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Libra Fuels (Epping, NH)');

    // ============================================
    // 15. L&H FUEL OIL LLC — Holtsville, NY
    // Suffolk County Long Island. 7 days/week delivery.
    // Also has static pricing page at /heating-oil-prices/.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'L&H Fuel Oil LLC',
      slug: 'l-and-h-fuel-oil-llc',
      phone: '(631) 868-7211',
      email: 'lhfuel@gmail.com',
      website: 'https://lhfuel.com',
      addressLine1: null,
      city: 'Holtsville',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Bellport', 'Medford', 'Coram', 'Patchogue', 'Bohemia',
        'Stony Brook', 'Centereach', 'Miller Place', 'Port Jefferson',
        'Brookhaven', 'Riverhead', 'Rocky Point', 'Shirley', 'Holtsville',
        'Sayville', 'Middle Island', 'Hauppauge', 'Holbrook', 'Ronkonkoma',
      ]),
      serviceCounties: JSON.stringify(['Suffolk']),
      serviceAreaRadius: 25,
      lat: 40.8154,
      lng: -73.0452,
      hoursWeekday: '7 days/week',
      hoursSaturday: '7 days/week',
      hoursSunday: '7 days/week',
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted L&H Fuel Oil LLC (Holtsville, NY)');

    // ============================================
    // 16. PRECISION HEATING OIL — Miller Place, NY
    // Suffolk County. Novellino family.
    // COD: "Cash or Credit Card" + "No Contracts"
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Precision Heating Oil',
      slug: 'precision-heating-oil',
      phone: '(631) 828-2713',
      email: 'precisionheatingoil@gmail.com',
      website: 'https://precisionheatingoil.com',
      addressLine1: '369 Pipe Stave Hollow Road',
      city: 'Miller Place',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Brookhaven', 'Holtsville', 'Nesconset', 'Selden', 'Center Moriches',
        'Bellport', 'East Setauket', 'Medford', 'Rocky Point', 'Stony Brook',
        'Ridge', 'Central Islip', 'Islip', 'Patchogue', 'Smithtown',
        'Mastic', 'Bohemia', 'Holbrook', 'Mount Sinai', 'Sayville',
        'Miller Place', 'Coram', 'Port Jefferson',
      ]),
      serviceCounties: JSON.stringify(['Suffolk']),
      serviceAreaRadius: 20,
      lat: 40.9601,
      lng: -72.9879,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Precision Heating Oil (Miller Place, NY)');

    // ============================================
    // 17. MAYDAY OIL LLC — North Franklin, CT
    // Min 50 gal. Veterans/seniors 2 cents off.
    // Tiers: 50=$5.69, 100=$5.14, 125+=$4.99, 300+=$4.94.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Mayday Oil LLC',
      slug: 'mayday-oil-llc',
      phone: '(860) 642-8052',
      email: 'maydayoil@yahoo.com',
      website: 'https://maydayoil.com',
      addressLine1: '545 Pond Road',
      city: 'North Franklin',
      state: 'CT',
      serviceCities: JSON.stringify([
        'Hampton', 'Willimantic', 'Scotland', 'Chaplin', 'Preston',
        'Windham', 'Coventry', 'Plainfield', 'Canterbury', 'Hebron',
        'Uncasville', 'Mansfield Center', 'Norwich', 'North Franklin',
        'Salem', 'Bozrah', 'Lebanon', 'Voluntown', 'Colchester',
        'Montville', 'Andover',
      ]),
      serviceCounties: JSON.stringify(['Windham', 'New London', 'Tolland']),
      serviceAreaRadius: 25,
      lat: 41.6187,
      lng: -72.1476,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 50,
      seniorDiscount: true,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Mayday Oil LLC (North Franklin, CT)');

    // ============================================
    // 18. BONILLA'S FUEL SERVICES — Bay Shore, NY
    // Suffolk County. Cash + CC pricing displayed separately.
    // Mon-Sat 8am-8pm, Sunday 9am-5pm.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Bonilla's Fuel Services",
      slug: 'bonillas-fuel-services',
      phone: '(631) 922-8330',
      email: 'bonillasfuelservices@yahoo.com',
      website: 'https://bonillasfuelservices.com',
      addressLine1: '9 N Cardinal Court',
      city: 'Bay Shore',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Melville', 'Huntington Station', 'Bay Shore', 'Islip', 'Holbrook',
        'Oakdale', 'North Babylon', 'Brentwood', 'Lindenhurst', 'West Islip',
        'Bellport', 'Copiague', 'Shirley', 'Bohemia', 'Deer Park', 'Selden',
        'Commack', 'Patchogue', 'Amityville', 'Smithtown',
      ]),
      serviceCounties: JSON.stringify(['Suffolk']),
      serviceAreaRadius: 25,
      lat: 40.7254,
      lng: -73.2454,
      hoursWeekday: '8:00 AM - 8:00 PM',
      hoursSaturday: '8:00 AM - 8:00 PM',
      hoursSunday: '9:00 AM - 5:00 PM',
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Bonilla\'s Fuel Services (Bay Shore, NY)');

    // ============================================
    // 19. PHILLIPS OIL & PROPANE LLC — Prospect, CT
    // Founded 2011, family-owned. HOD #983. Min 50 gal.
    // COD: implicit "Cash or credit card" + online ordering.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Phillips Oil & Propane LLC',
      slug: 'phillips-oil-and-propane-llc',
      phone: '(203) 758-6778',
      email: 'phillipsoil@me.com',
      website: 'https://phillipsoilllc.com',
      addressLine1: null,
      city: 'Prospect',
      state: 'CT',
      serviceCities: JSON.stringify([
        'Southbury', 'Middlebury', 'Waterbury', 'Wolcott', 'Cheshire',
        'Prospect', 'Naugatuck', 'Oxford', 'Beacon Falls', 'Bethany',
        'Hamden', 'Seymour', 'Woodbridge', 'Ansonia', 'Derby',
        'Orange', 'West Haven', 'Milford', 'Shelton', 'Stratford',
        'Trumbull', 'Bethlehem', 'Woodbury', 'Watertown',
      ]),
      serviceCounties: JSON.stringify(['New Haven', 'Fairfield', 'Litchfield']),
      serviceAreaRadius: 25,
      lat: 41.5020,
      lng: -72.9788,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane']),
      minimumGallons: 50,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 125] Upserted Phillips Oil & Propane LLC (Prospect, CT)');

    // ============================================
    // Mark ALL Droplet suppliers as do_not_pitch
    // Includes 19 new + 11 existing (30 total)
    // ============================================
    const dropletDomains = [
      // 19 new
      'ggoilct.com', 'tmfuelllc.com', 'eliteoilheatac.com', 'exeterfuel.com',
      'robergeenergy.com', 'myexpressoil.com', 'affordablefueldelivery.com',
      'oppureoil.com', 'reisfuel.com', 'fjboil.com', 'ondemandfueloil.com',
      'toptierfuelllc.com', 'minerdiscountfuel.com', 'librafuels.com',
      'lhfuel.com', 'precisionheatingoil.com', 'maydayoil.com',
      'bonillasfuelservices.com', 'phillipsoilllc.com',
      // 11 existing
      'barrcofuel.com', 'everreadyoilny.com', 'wickedwarmoil.com',
      'welchheatingoil.com', 'vicandsonsfuelco.com', 'sopofuel.com',
      'flagshipfuelco.com', 'tirpakenergy.com', 'morsefuels.com',
      'ferguson-oil.com', 'e-zoil.net',
    ];

    const domainConditions = dropletDomains
      .map(d => `LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%${d}%'`)
      .join(' OR ');

    const [updateResult] = await sequelize.query(`
      UPDATE suppliers SET do_not_pitch = true, updated_at = NOW()
      WHERE ${domainConditions}
    `);

    const updateCount = updateResult?.[1] || updateResult?.rowCount || 0;
    console.log(`[Migration 125] Set do_not_pitch=true on ${updateCount} Droplet suppliers`);

    console.log('[Migration 125] ✅ Complete: 19 new suppliers + do_not_pitch on all Droplet suppliers');
  },

  async down(sequelize) {
    // Deactivate the 19 new suppliers
    const newDomains = [
      'ggoilct.com', 'tmfuelllc.com', 'eliteoilheatac.com', 'exeterfuel.com',
      'robergeenergy.com', 'myexpressoil.com', 'affordablefueldelivery.com',
      'oppureoil.com', 'reisfuel.com', 'fjboil.com', 'ondemandfueloil.com',
      'toptierfuelllc.com', 'minerdiscountfuel.com', 'librafuels.com',
      'lhfuel.com', 'precisionheatingoil.com', 'maydayoil.com',
      'bonillasfuelservices.com', 'phillipsoilllc.com',
    ];

    const conditions = newDomains
      .map(d => `LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%${d}%'`)
      .join(' OR ');

    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE ${conditions}
    `);

    // Clear do_not_pitch on all suppliers
    await sequelize.query(`
      UPDATE suppliers SET do_not_pitch = false, updated_at = NOW()
      WHERE do_not_pitch = true
    `);

    console.log('[Migration 125] Rollback: deactivated 19 new suppliers, cleared do_not_pitch');
  }
};
