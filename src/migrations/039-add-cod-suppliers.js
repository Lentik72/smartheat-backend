/**
 * Migration 039: Add 6 verified COD suppliers
 * NY: Economy Fuel, Putnam Energy, Economy Oil, Superior Fuel Oil, Buy Rite Oil
 * CT: Bethany Fuel
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '039-add-cod-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Economy Fuel',
        slug: 'economy-fuel',
        phone: '(914) 739-5590',
        email: 'ken@economyfuelny.com',
        website: 'https://www.economyfuelny.com',
        addressLine1: '500 Highland Ave',
        city: 'Peekskill',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Northern Westchester
          '10566', // Peekskill
          '10567', // Cortlandt Manor
          '10547', // Mohegan Lake
          '10548', // Montrose
          '10520', // Croton-on-Hudson
          '10511', // Buchanan
          '10598', // Yorktown Heights
          '10588', // Shrub Oak
          '10535', // Jefferson Valley
          '10549', // Mount Kisco
          '10546', // Millwood
          '10589', // Somers
          '10501', // Amawalk
          '10536', // Katonah
          '10507', // Bedford Hills
          // Putnam County
          '10512', // Carmel
          '10541', // Mahopac
          '10579', // Putnam Valley
          '10509', // Brewster
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10542', // Mahopac Falls
          '10576', // Pound Ridge
          // Orange County (partial)
          '10922', // Fort Montgomery
          '10928'  // Highland Falls
        ]),
        serviceCities: JSON.stringify([
          'Peekskill', 'Cortlandt Manor', 'Mohegan Lake', 'Montrose', 'Croton-on-Hudson',
          'Buchanan', 'Yorktown Heights', 'Shrub Oak', 'Jefferson Valley', 'Mount Kisco',
          'Millwood', 'Somers', 'Amawalk', 'Katonah', 'Bedford Hills',
          'Carmel', 'Mahopac', 'Putnam Valley', 'Brewster', 'Cold Spring',
          'Garrison', 'Lake Peekskill', 'Mahopac Falls', 'Pound Ridge',
          'Fort Montgomery', 'Highland Falls'
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Putnam', 'Orange']),
        serviceAreaRadius: 25,
        lat: 41.2901,
        lng: -73.9212,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: 'unknown',
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Putnam Energy',
        slug: 'putnam-energy',
        phone: '(845) 225-6565',
        email: 'mail@putnampropane.com',
        website: 'https://putnampropane.com',
        addressLine1: '30 Fowler Ave',
        city: 'Carmel',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Putnam County
          '10512', // Carmel
          '10509', // Brewster
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          '12563', // Patterson
          // Westchester County
          '10501', // Amawalk
          '10502', // Ardsley
          '10506', // Bedford
          '10507', // Bedford Hills
          '10567', // Cortlandt Manor
          '10518', // Cross River
          '10520', // Croton Falls
          '10526', // Goldens Bridge
          '10527', // Granite Springs
          '10535', // Jefferson Valley
          '10536', // Katonah
          '10540', // Lincolndale
          '10547', // Mohegan Lake
          '10549', // Mount Kisco
          '10560', // North Salem
          '10566', // Peekskill
          '10576', // Pound Ridge
          '10578', // Purdys
          '10587', // Shenorock
          '10588', // Shrub Oak
          '10589', // Somers
          '10590', // South Salem
          '10597', // Waccabuc
          '10598', // Yorktown Heights
          // Dutchess County
          '12508', // Beacon
          '12524', // Fishkill
          '12527', // Glenham
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12564', // Pawling
          '12570', // Poughquag
          '12582', // Stormville
          '12590', // Wappingers Falls
          // Orange County
          '10996'  // West Point
        ]),
        serviceCities: JSON.stringify([
          'Carmel', 'Brewster', 'Cold Spring', 'Garrison', 'Lake Peekskill', 'Mahopac',
          'Mahopac Falls', 'Putnam Valley', 'Patterson',
          'Amawalk', 'Baldwin Place', 'Bedford', 'Bedford Hills', 'Cortlandt Manor',
          'Cross River', 'Croton Falls', 'Goldens Bridge', 'Granite Springs',
          'Jefferson Valley', 'Katonah', 'Lincolndale', 'Mohegan Lake', 'Mount Kisco',
          'North Salem', 'Peekskill', 'Pound Ridge', 'Purdys', 'Shenorock',
          'Shrub Oak', 'Somers', 'South Salem', 'Waccabuc', 'Yorktown Heights',
          'Beacon', 'Castle Point', 'Fishkill', 'Glenham', 'Holmes', 'Hopewell Junction',
          'Hughsonville', 'Pawling', 'Poughquag', 'Stormville', 'Wappingers Falls',
          'West Point'
        ]),
        serviceCounties: JSON.stringify(['Putnam', 'Westchester', 'Dutchess', 'Orange']),
        serviceAreaRadius: 30,
        lat: 41.4301,
        lng: -73.6812,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
        hoursWeekday: '9:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(845) 225-6565',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Economy Oil',
        slug: 'economy-oil',
        phone: '(845) 206-4322',
        email: null,
        website: 'https://www.economy-oil.com',
        addressLine1: '300 Westage Business Center Dr #100',
        city: 'Fishkill',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Dutchess County
          '12524', // Fishkill
          '12508', // Beacon
          '12590', // Wappingers Falls
          '12601', // Poughkeepsie
          '12603', // Poughkeepsie
          '12538', // Hyde Park
          '12540', // Lagrangeville
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12533', // Hopewell Junction
          '12582', // Stormville
          '12564', // Pawling
          '12572', // Red Hook
          '12571', // Rhinebeck
          '12545', // Millbrook
          // Orange County
          '12550', // Newburgh
          '12553', // New Windsor
          '10940', // Middletown
          '10941', // Middletown
          '12549', // Montgomery
          '12586', // Walden
          '10924', // Goshen
          '10990', // Warwick
          // Ulster County
          '12401', // Kingston
          '12561', // New Paltz
          '12528', // Highland
          '12477', // Saugerties
          '12446', // Kerhonkson
          // Sullivan County
          '12701', // Monticello
          '12754', // Liberty
          '12779', // South Fallsburg
          // Greene County
          '12414', // Catskill
          '12431', // Greenville
          // Columbia County
          '12534'  // Hudson
        ]),
        serviceCities: JSON.stringify([
          'Fishkill', 'Beacon', 'Wappingers Falls', 'Poughkeepsie', 'Hyde Park',
          'Lagrangeville', 'Pleasant Valley', 'Poughquag', 'Hopewell Junction',
          'Stormville', 'Pawling', 'Red Hook', 'Rhinebeck', 'Millbrook',
          'Newburgh', 'New Windsor', 'Middletown', 'Montgomery', 'Walden', 'Goshen', 'Warwick',
          'Kingston', 'New Paltz', 'Highland', 'Saugerties', 'Kerhonkson',
          'Monticello', 'Liberty', 'South Fallsburg',
          'Catskill', 'Greenville', 'Hudson'
        ]),
        serviceCounties: JSON.stringify(['Dutchess', 'Orange', 'Ulster', 'Sullivan', 'Greene', 'Columbia', 'Delaware']),
        serviceAreaRadius: 50,
        lat: 41.5354,
        lng: -73.8968,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: '7:30 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: 'unknown',
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Superior Fuel Oil',
        slug: 'superior-fuel-oil',
        phone: '(914) 930-8655',
        email: 'superiorfuel@outlook.com',
        website: 'https://www.superiorfueloilinc.com',
        addressLine1: 'P.O. Box 951',
        city: 'Mohegan Lake',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Westchester County
          '10547', // Mohegan Lake
          '10566', // Peekskill
          '10567', // Cortlandt Manor
          '10598', // Yorktown Heights
          '10588', // Shrub Oak
          '10520', // Croton-on-Hudson
          '10510', // Briarcliff Manor
          '10562', // Ossining
          '10549', // Mount Kisco
          '10514', // Chappaqua
          '10591', // Tarrytown
          '10523', // Elmsford
          '10530', // Hartsdale
          '10583', // Scarsdale
          '10605', // White Plains
          '10701', // Yonkers
          '10548', // Montrose
          '10511', // Buchanan
          '10589', // Somers
          '10536', // Katonah
          '10507', // Bedford Hills
          // Putnam County
          '10541', // Mahopac
          '10512', // Carmel
          '10516', // Cold Spring
          '10537', // Lake Peekskill
          // Rockland County
          '10960', // Nyack
          '10977', // Spring Valley
          '10901', // Suffern
          '10954', // Nanuet
          '10956', // New City
          '10989', // Valley Cottage
          // Orange County
          '12550', // Newburgh
          '10950', // Monroe
          '10928', // Highland Falls
          // Dutchess County
          '12508', // Beacon
          '12527'  // Glenham
        ]),
        serviceCities: JSON.stringify([
          'Mohegan Lake', 'Peekskill', 'Cortlandt Manor', 'Yorktown Heights', 'Shrub Oak',
          'Croton-on-Hudson', 'Briarcliff Manor', 'Ossining', 'Mount Kisco', 'Chappaqua',
          'Tarrytown', 'Elmsford', 'Hartsdale', 'Scarsdale', 'White Plains', 'Yonkers',
          'Montrose', 'Buchanan', 'Somers', 'Katonah', 'Bedford Hills',
          'Mahopac', 'Carmel', 'Cold Spring', 'Lake Peekskill',
          'Nyack', 'Spring Valley', 'Suffern', 'Nanuet', 'New City', 'Valley Cottage',
          'Newburgh', 'Monroe', 'Highland Falls',
          'Beacon', 'Glenham'
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Putnam', 'Rockland', 'Orange', 'Dutchess']),
        serviceAreaRadius: 35,
        lat: 41.3134,
        lng: -73.8465,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(845) 520-9080',
        seniorDiscount: true,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Buy Rite Oil',
        slug: 'buy-rite-oil',
        phone: '(845) 463-7000',
        email: 'info@buyriteoil.com',
        website: 'https://buyriteoil.com',
        addressLine1: '1145 Route 55, Suite 5',
        city: 'Lagrangeville',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Dutchess County
          '12540', // Lagrangeville
          '12601', // Poughkeepsie
          '12603', // Poughkeepsie
          '12590', // Wappingers Falls
          '12508', // Beacon
          '12524', // Fishkill
          '12538', // Hyde Park
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12533', // Hopewell Junction
          '12582', // Stormville
          '12564', // Pawling
          '12572', // Red Hook
          '12571', // Rhinebeck
          '12574', // Rhinecliff
          '12580', // Staatsburgh
          '12531', // Holmes
          '12545', // Millbrook
          '12567', // Pine Plains
          '12501', // Amenia
          '12592', // Wassaic
          '12594', // Wingdale
          '12522', // Dover Plains
          '12578', // Salt Point
          '12585', // Verbank
          '12581', // Stanfordville
          '12546', // Millerton
          // Putnam County
          '10509', // Brewster
          '10512', // Carmel
          '10516', // Cold Spring
          '10541', // Mahopac
          '10579', // Putnam Valley
          '12563', // Patterson
          '10542', // Mahopac Falls
          '10537'  // Lake Peekskill
        ]),
        serviceCities: JSON.stringify([
          'Lagrangeville', 'Poughkeepsie', 'Wappingers Falls', 'Beacon', 'Fishkill',
          'Hyde Park', 'Pleasant Valley', 'Poughquag', 'Hopewell Junction', 'Stormville',
          'Pawling', 'Red Hook', 'Rhinebeck', 'Rhinecliff', 'Staatsburg', 'Holmes',
          'Millbrook', 'Pine Plains', 'Amenia', 'Wassaic', 'Wingdale', 'Dover Plains',
          'Salt Point', 'Verbank', 'Stanfordville', 'Millerton', 'Clinton Corners',
          'Tivoli', 'Milan', 'Gallatin', 'New Hamburg', 'Chelsea', 'Billings', 'Glenham',
          'Brewster', 'Carmel', 'Cold Spring', 'Mahopac', 'Putnam Valley', 'Patterson',
          'Mahopac Falls', 'Lake Peekskill', 'Lake Carmel', 'Kent'
        ]),
        serviceCounties: JSON.stringify(['Dutchess', 'Putnam']),
        serviceAreaRadius: 35,
        lat: 41.6498,
        lng: -73.7715,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: 'unknown',
        emergencyPhone: null,
        seniorDiscount: true,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Bethany Fuel',
        slug: 'bethany-fuel',
        phone: '(203) 308-4645',
        email: 'karl@bethanyfuel.com',
        website: 'https://www.bethanyfuel.com',
        addressLine1: '861 Litchfield Turnpike',
        city: 'Bethany',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // New Haven County
          '06524', // Bethany
          '06525', // Woodbridge
          '06477', // Orange
          '06518', // Hamden
          '06517', // Hamden
          '06514', // Hamden
          '06515', // New Haven
          '06511', // New Haven
          '06513', // New Haven
          '06519', // New Haven
          '06473', // North Haven
          '06410', // Cheshire
          '06451', // Meriden
          '06450', // Meriden
          '06492', // Wallingford
          '06712', // Prospect
          '06706', // Waterbury
          '06708', // Waterbury
          '06704', // Waterbury
          '06705', // Waterbury
          '06702', // Waterbury
          '06710', // Waterbury
          '06770', // Naugatuck
          '06401', // Ansonia
          '06403', // Beacon Falls
          '06478', // Oxford
          '06483', // Seymour
          '06418', // Derby
          // Fairfield County
          '06484', // Shelton
          '06468', // Monroe
          '06611', // Trumbull
          '06610', // Stratford
          '06614', // Stratford
          '06615', // Stratford
          '06606', // Bridgeport
          // Litchfield County
          '06762', // Middlebury
          '06795'  // Woodbury
        ]),
        serviceCities: JSON.stringify([
          'Bethany', 'Woodbridge', 'Orange', 'Hamden', 'New Haven', 'North Haven',
          'Cheshire', 'Meriden', 'Wallingford', 'Prospect', 'Waterbury', 'Naugatuck',
          'Ansonia', 'Beacon Falls', 'Oxford', 'Seymour', 'Derby',
          'Shelton', 'Monroe', 'Trumbull', 'Stratford', 'Bridgeport',
          'Middlebury', 'Woodbury'
        ]),
        serviceCounties: JSON.stringify(['New Haven', 'Fairfield', 'Litchfield']),
        serviceAreaRadius: 25,
        lat: 41.4257,
        lng: -73.0065,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 50,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: 'unknown',
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, email, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          lat, lng, payment_methods, fuel_types, minimum_gallons,
          hours_weekday, hours_saturday, hours_sunday, weekend_delivery, emergency_delivery,
          emergency_phone, senior_discount, notes, active, verified, allow_price_display,
          created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :lat, :lng, :paymentMethods, :fuelTypes, :minimumGallons,
          :hoursWeekday, :hoursSaturday, :hoursSunday, :weekendDelivery, :emergencyDelivery,
          :emergencyPhone, :seniorDiscount, :notes, :active, :verified, :allowPriceDisplay,
          :createdAt, :updatedAt
        )
        ON CONFLICT (slug) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          notes: null,
          allowPriceDisplay: supplier.allowPriceDisplay === true
        }
      });

      console.log(`[Migration 039] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'economy-fuel',
        'putnam-energy',
        'economy-oil',
        'superior-fuel-oil',
        'buy-rite-oil',
        'bethany-fuel'
      )
    `);
    console.log('Migration 039 rolled back');
  }
};
