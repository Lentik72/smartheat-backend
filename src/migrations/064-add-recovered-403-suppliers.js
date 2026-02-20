/**
 * Migration 064: Add Recovered 403-Blocked Suppliers
 *
 * Adds 3 verified COD/will-call suppliers that were previously in scrape-config
 * but had no database records. These were discovered during the got-scraping
 * TLS fallback implementation — their websites block native fetch (403) but
 * serve content to browser-like TLS fingerprints.
 *
 * 1. Hellen Fuels Corp (Uxbridge, MA) - "Cash Price of the Day", "will-call deliveries"
 * 2. Liberty Bell Discount Fuel (Wynnewood, PA) - "No Long-Term Contracts", "Order as needed"
 * 3. Lowest Price Oil (Portland, ME) - "will-call and online ordering", prepay model
 *
 * Note: Order Oil Online (orderoilonline.com) skipped — same company as
 * Lowest Price Oil (both owned by Nice Fuel Co., Portland ME).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '064-add-recovered-403-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // 1. HELLEN FUELS CORP - Uxbridge, MA (Worcester County)
      // "Cash Price of the Day", "will-call deliveries"
      // In business since 1978
      // ============================================
      {
        id: uuidv4(),
        name: 'Hellen Fuels Corp',
        slug: 'hellen-fuels-corp',
        phone: '(508) 278-6006',
        email: null,
        website: 'https://www.hellenfuelscorp.com',
        addressLine1: '287 N Main St',
        city: 'Uxbridge',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          '01569', // Uxbridge
          '01588', // Whitinsville
          '01534', // Northbridge
          '01756', // Mendon
          '01747', // Hopedale
          '01757', // Milford
          '01504', // Blackstone
          '01590', // Sutton
          '01516', // Douglas
          '01527', // Millbury
          '01529', // Millville
          '01764', // Upton
          '01519', // Grafton
          '01560', // South Grafton
          '01536', // North Grafton
          '01526', // Manchaug
        ]),
        serviceCities: JSON.stringify([
          'Uxbridge', 'Whitinsville', 'Northbridge', 'Mendon', 'Hopedale',
          'Milford', 'Blackstone', 'Sutton', 'Douglas', 'Millbury',
          'Millville', 'Upton', 'Grafton', 'South Grafton', 'Manchaug',
        ]),
        serviceCounties: JSON.stringify(['Worcester']),
        serviceAreaRadius: 15,
        lat: 42.0806,
        lng: -71.6317,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // 2. LIBERTY BELL DISCOUNT FUEL - Wynnewood, PA (Delaware County)
      // "No Long-Term Contracts: Order as needed, with no commitments or hidden fees"
      // "never require you to sign a contract"
      // In business since 1964
      // ============================================
      {
        id: uuidv4(),
        name: 'Liberty Bell Discount Fuel',
        slug: 'liberty-bell-discount-oil',
        phone: '(610) 449-1355',
        email: 'libertybelloil@libertybelldiscountoil.com',
        website: 'https://www.libertybelldiscountoil.com',
        addressLine1: '530 Twin Oaks Rd',
        city: 'Wynnewood',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Delaware County
          '19018', // Clifton Heights
          '19023', // Darby
          '19026', // Drexel Hill
          '19029', // Essington
          '19032', // Folcroft
          '19033', // Folsom
          '19036', // Glenolden
          '19041', // Haverford
          '19050', // Lansdowne
          '19063', // Media
          '19064', // Springfield
          '19065', // Morton
          '19073', // Newtown Square
          '19074', // Norwood
          '19076', // Prospect Park
          '19078', // Ridley Park
          '19079', // Sharon Hill
          '19081', // Swarthmore
          '19082', // Upper Darby
          '19083', // Havertown
          '19085', // Villanova
          '19086', // Wallingford
          '19008', // Broomall
          '19013', // Chester
          '19014', // Aston
          '19015', // Brookhaven
          '19342', // Glen Mills
          '19010', // Bryn Mawr
          // Montgomery County
          '19003', // Ardmore
          '19004', // Bala Cynwyd
          '19027', // Elkins Park
          '19035', // Gladwyne
          '19038', // Glenside
          '19046', // Jenkintown
          '19066', // Merion Station
          '19072', // Narberth
          '19096', // Wynnewood
          '19401', // Norristown
          '19406', // King of Prussia
          '19428', // Conshohocken
          '19462', // Plymouth Meeting
          // Chester County
          '19312', // Berwyn
          '19087', // Wayne
          '19301', // Paoli
          '19380', // West Chester
        ]),
        serviceCities: JSON.stringify([
          'Broomall', 'Bryn Mawr', 'Chester', 'Aston', 'Brookhaven',
          'Clifton Heights', 'Darby', 'Drexel Hill', 'Essington', 'Folcroft',
          'Folsom', 'Glenolden', 'Haverford', 'Lansdowne', 'Media',
          'Springfield', 'Morton', 'Newtown Square', 'Norwood', 'Prospect Park',
          'Ridley Park', 'Sharon Hill', 'Swarthmore', 'Upper Darby', 'Havertown',
          'Villanova', 'Wallingford', 'Glen Mills',
          'Ardmore', 'Bala Cynwyd', 'Gladwyne', 'Narberth', 'Wynnewood',
          'Merion Station', 'Conshohocken', 'Norristown', 'King of Prussia',
          'Wayne', 'Paoli', 'Berwyn', 'West Chester',
        ]),
        serviceCounties: JSON.stringify(['Delaware', 'Montgomery', 'Chester']),
        serviceAreaRadius: 20,
        lat: 39.9751,
        lng: -75.2251,
        hoursWeekday: '7:30 AM - 5:00 PM',
        hoursSaturday: '7:30 AM - 5:00 PM',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // 3. LOWEST PRICE OIL - Portland, ME (Cumberland County)
      // "will-call and online ordering", prepay model, no contracts
      // Owned by Nice Fuel Co. (also operates Order Oil Online — same fleet)
      // In business 20+ years
      // ============================================
      {
        id: uuidv4(),
        name: 'Lowest Price Oil',
        slug: 'lowest-price-oil',
        phone: '(207) 773-2825',
        email: null,
        website: 'https://www.lowestpriceoil.com',
        addressLine1: '306 Presumpscot St',
        city: 'Portland',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          '04101', // Portland
          '04102', // Portland
          '04103', // Portland
          '04106', // South Portland
          '04107', // Cape Elizabeth
          '04092', // Westbrook
          '04105', // Falmouth
          '04096', // Yarmouth
          '04110', // Cumberland Foreside
          '04021', // Cumberland Center
          '04097', // North Yarmouth
          '04078', // Scarborough
          '04074', // Scarborough
          '04038', // Gorham
          '04062', // Windham
          '04032', // Freeport
          '04039', // Gray
          '04084', // Standish
          '04093', // Buxton
          '04072', // Saco
          '04005', // Biddeford
          '04064', // Old Orchard Beach
          '04043', // Kennebunk
          '04046', // Kennebunkport
          '04071', // Raymond
          '04015', // Casco
          '04029', // Sebago
          '04069', // Pownal
          '04011', // Brunswick
          '04086', // Topsham
        ]),
        serviceCities: JSON.stringify([
          'Portland', 'South Portland', 'Westbrook', 'Cape Elizabeth',
          'Falmouth', 'Yarmouth', 'North Yarmouth', 'Cumberland Center',
          'Scarborough', 'Gorham', 'Windham', 'Gray', 'Freeport',
          'Standish', 'Buxton', 'Saco', 'Biddeford', 'Old Orchard Beach',
          'Kennebunk', 'Kennebunkport', 'Raymond', 'Casco', 'Sebago',
          'Pownal', 'Brunswick', 'Topsham',
        ]),
        serviceCounties: JSON.stringify(['Cumberland', 'York', 'Sagadahoc']),
        serviceAreaRadius: 30,
        lat: 43.6759,
        lng: -70.2635,
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
      },
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, email, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          lat, lng, hours_weekday, hours_saturday, hours_sunday,
          emergency_delivery, weekend_delivery, payment_methods, fuel_types,
          minimum_gallons, senior_discount, allow_price_display, notes, active,
          created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :lat, :lng, :hoursWeekday, :hoursSaturday, :hoursSunday,
          :emergencyDelivery, :weekendDelivery, :paymentMethods, :fuelTypes,
          :minimumGallons, :seniorDiscount, :allowPriceDisplay, :notes, :active,
          NOW(), NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          postal_codes_served = EXCLUDED.postal_codes_served,
          service_cities = EXCLUDED.service_cities,
          service_counties = EXCLUDED.service_counties,
          service_area_radius = EXCLUDED.service_area_radius,
          hours_weekday = EXCLUDED.hours_weekday,
          hours_saturday = EXCLUDED.hours_saturday,
          hours_sunday = EXCLUDED.hours_sunday,
          emergency_delivery = EXCLUDED.emergency_delivery,
          weekend_delivery = EXCLUDED.weekend_delivery,
          payment_methods = EXCLUDED.payment_methods,
          minimum_gallons = EXCLUDED.minimum_gallons,
          senior_discount = EXCLUDED.senior_discount,
          allow_price_display = EXCLUDED.allow_price_display,
          updated_at = NOW()
      `, {
        replacements: {
          ...supplier,
          emergencyDelivery: supplier.emergencyDelivery === true,
          weekendDelivery: supplier.weekendDelivery === true,
          seniorDiscount: supplier.seniorDiscount === true,
          allowPriceDisplay: supplier.allowPriceDisplay === true,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null,
          email: supplier.email || null,
        }
      });
    }

    console.log('[Migration 064] Added 3 recovered 403-blocked suppliers');
    console.log('[Migration 064] - Hellen Fuels Corp (Uxbridge, MA)');
    console.log('[Migration 064] - Liberty Bell Discount Fuel (Wynnewood, PA)');
    console.log('[Migration 064] - Lowest Price Oil (Portland, ME)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'hellen-fuels-corp', 'liberty-bell-discount-oil', 'lowest-price-oil'
      )
    `);
    console.log('[Migration 064] Rolled back recovered 403-blocked suppliers');
  }
};
