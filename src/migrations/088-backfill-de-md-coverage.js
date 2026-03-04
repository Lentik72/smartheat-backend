/**
 * Migration 088: Backfill postalCodesServed for DE/MD suppliers
 *
 * Coverage gap fix: ZIP 19962 (Magnolia, Kent County DE) showed only 1 supplier.
 * Root cause: 2 enabled suppliers had no postalCodesServed configured.
 *
 * Suppliers updated:
 *   - Terroco Oil (Dover, DE) — Kent/Sussex/New Castle DE + Cecil/Kent/Queen Anne's/Caroline MD
 *   - AWE Oil (Newark, DE) — New Castle DE + Chester/Delaware County PA + Cecil County MD
 *
 * Sources: Company websites, HeatFleet, FuelWonk. Both confirmed COD.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '088-backfill-de-md-coverage',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Terroco Oil',
        slug: 'terroco-oil',
        phone: '(800) 505-4281',
        email: null,
        website: 'https://www.terrocooil.com',
        addressLine1: '3799 N. Dupont Hwy.',
        city: 'Dover',
        state: 'DE',
        postalCodesServed: JSON.stringify([
          // Kent County DE
          '19901', // Dover (HQ)
          '19902', // Dover AFB
          '19904', // Dover
          '19934', // Camden Wyoming
          '19938', // Clayton
          '19942', // Farmington
          '19943', // Felton
          '19946', // Frederica
          '19952', // Harrington
          '19953', // Hartly
          '19954', // Houston
          '19955', // Kenton
          '19962', // Magnolia
          '19964', // Marydel
          '19977', // Smyrna
          '19979', // Viola
          '19980', // Woodside
          // New Castle County DE (southern)
          '19701', // Bear
          '19706', // Delaware City
          '19708', // Kirkwood
          '19709', // Middletown
          '19720', // New Castle
          '19730', // Odessa
          '19731', // Port Penn
          '19733', // Saint Georges
          '19734', // Townsend
          // Sussex County DE (northern)
          '19941', // Ellendale
          '19947', // Georgetown
          '19950', // Greenwood
          '19960', // Lincoln
          '19963', // Milford
          // Cecil County MD
          '21913', // Cecilton
          '21915', // Chesapeake City
          '21919', // Earleville
          // Kent County MD
          '21610', // Betterton
          '21620', // Chestertown
          '21635', // Galena
          '21645', // Kennedyville
          '21650', // Massey
          '21651', // Millington
          '21667', // Still Pond
          // Queen Anne's County MD
          '21607', // Barclay
          '21617', // Centreville
          '21623', // Church Hill
          '21628', // Crumpton
          '21644', // Ingleside
          '21657', // Queen Anne
          '21668', // Sudlersville
          // Caroline County MD
          '21629', // Denton
          '21636', // Goldsboro
          '21639', // Greensboro
          '21640', // Henderson
          '21641', // Hillsboro
          '21660', // Ridgely
        ]),
        serviceCities: JSON.stringify([
          'Dover', 'Camden Wyoming', 'Clayton', 'Felton', 'Frederica', 'Harrington',
          'Hartly', 'Houston', 'Kenton', 'Magnolia', 'Marydel', 'Smyrna', 'Viola', 'Woodside',
          'Bear', 'Delaware City', 'Kirkwood', 'Middletown', 'New Castle', 'Odessa',
          'Port Penn', 'Saint Georges', 'Townsend',
          'Ellendale', 'Georgetown', 'Greenwood', 'Lincoln', 'Milford',
          'Cecilton', 'Chesapeake City', 'Earleville',
          'Betterton', 'Chestertown', 'Galena', 'Kennedyville', 'Massey', 'Millington',
          'Centreville', 'Church Hill', 'Crumpton', 'Queen Anne', 'Sudlersville',
          'Denton', 'Goldsboro', 'Greensboro', 'Henderson', 'Ridgely',
        ]),
        serviceCounties: JSON.stringify(['Kent', 'New Castle', 'Sussex', 'Cecil', 'Kent MD', 'Queen Annes', 'Caroline']),
        serviceAreaRadius: 40,
        lat: 39.1582,
        lng: -75.5244,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'AWE Oil',
        slug: 'awe-oil',
        phone: '(302) 737-1123',
        email: null,
        website: 'http://www.aweoil.com',
        addressLine1: '122 Capitol Trail',
        city: 'Newark',
        state: 'DE',
        postalCodesServed: JSON.stringify([
          // New Castle County DE
          '19701', // Bear
          '19702', // Newark
          '19703', // Claymont
          '19706', // Delaware City
          '19707', // Hockessin
          '19708', // Kirkwood
          '19709', // Middletown
          '19710', // Montchanin
          '19711', // Newark (HQ)
          '19713', // Newark
          '19720', // New Castle
          '19730', // Odessa
          '19731', // Port Penn
          '19733', // Saint Georges
          '19734', // Townsend
          '19735', // Winterthur
          '19736', // Yorklyn
          '19801', // Wilmington
          '19802', // Wilmington
          '19803', // Wilmington
          '19804', // Wilmington
          '19805', // Wilmington
          '19806', // Wilmington
          '19807', // Wilmington
          '19808', // Wilmington
          '19809', // Wilmington
          '19810', // Wilmington
          // Chester County PA (partial)
          '19310', // Atglen
          '19311', // Avondale
          '19317', // Chadds Ford
          '19320', // Coatesville
          '19330', // Cochranville
          '19348', // Kennett Square
          '19350', // Landenberg
          '19358', // Modena
          '19362', // Nottingham
          '19363', // Oxford
          '19372', // Thorndale
          '19375', // Unionville
          '19380', // West Chester
          '19382', // West Chester
          '19390', // West Grove
          // Delaware County PA (partial)
          '19014', // Aston
          '19017', // Chester Heights
          '19060', // Garnet Valley
          '19061', // Marcus Hook
          '19063', // Media
          '19073', // Newtown Square
          '19342', // Glen Mills
          '19373', // Thornton
          // Cecil County MD
          '21901', // North East
          '21903', // Perryville
          '21904', // Port Deposit
          '21911', // Rising Sun
          '21913', // Cecilton
          '21914', // Charlestown
          '21915', // Chesapeake City
          '21917', // Colora
          '21919', // Earleville
          '21920', // Elk Mills
          '21921', // Elkton
        ]),
        serviceCities: JSON.stringify([
          'Newark', 'Wilmington', 'Bear', 'Claymont', 'Delaware City', 'Hockessin',
          'Kirkwood', 'Middletown', 'Montchanin', 'New Castle', 'Odessa', 'Port Penn',
          'Rockland', 'Saint Georges', 'Townsend', 'Winterthur', 'Yorklyn',
          'Kennett Square', 'West Grove', 'Avondale', 'Landenberg', 'Oxford',
          'Chadds Ford', 'Coatesville', 'Cochranville', 'West Chester',
          'Atglen', 'Thorndale', 'Unionville', 'Nottingham', 'Modena',
          'Aston', 'Glen Mills', 'Garnet Valley', 'Marcus Hook', 'Thornton',
          'Chester Heights', 'Media',
          'Elkton', 'North East', 'Perryville', 'Port Deposit', 'Rising Sun',
          'Chesapeake City', 'Charlestown', 'Earleville', 'Elk Mills', 'Colora', 'Cecilton',
        ]),
        serviceCounties: JSON.stringify(['New Castle', 'Chester', 'Delaware', 'Cecil']),
        serviceAreaRadius: 30,
        lat: 39.6837,
        lng: -75.7497,
        hoursWeekday: '8:00 AM - 4:30 PM',
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
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          website = EXCLUDED.website,
          address_line1 = EXCLUDED.address_line1,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          postal_codes_served = EXCLUDED.postal_codes_served,
          service_cities = EXCLUDED.service_cities,
          service_counties = EXCLUDED.service_counties,
          service_area_radius = EXCLUDED.service_area_radius,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          hours_weekday = EXCLUDED.hours_weekday,
          hours_saturday = EXCLUDED.hours_saturday,
          emergency_delivery = EXCLUDED.emergency_delivery,
          weekend_delivery = EXCLUDED.weekend_delivery,
          payment_methods = EXCLUDED.payment_methods,
          fuel_types = EXCLUDED.fuel_types,
          minimum_gallons = EXCLUDED.minimum_gallons,
          allow_price_display = EXCLUDED.allow_price_display,
          active = EXCLUDED.active,
          scrape_status = 'active',
          consecutive_scrape_failures = 0,
          last_scrape_failure_at = NULL,
          scrape_failure_dates = NULL,
          updated_at = NOW()
      `, {
        replacements: supplier,
        type: sequelize.QueryTypes.INSERT
      });

      console.log(`[Migration 088] ${supplier.name} (${supplier.city}, ${supplier.state}) — coverage backfilled`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = NULL,
        service_cities = NULL,
        service_counties = NULL,
        updated_at = NOW()
      WHERE slug IN ('terroco-oil', 'awe-oil')
    `);
    console.log('[Migration 088] Coverage data cleared');
  }
};
