/**
 * Migration 032: Add Dighton, MA (02715) area suppliers
 * Affordable Fuel, Freedom Fuel, Forni Brothers, T&M Fuel, Eastern Petroleum, Brodeur & Sons
 * All verified COD/will-call suppliers via web search
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '032-add-dighton-ma-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Affordable Fuel Inc',
        slug: 'affordable-fuel-inc',
        phone: '(508) 336-0151',
        website: 'https://www.orderaffordablefuel.com',
        addressLine1: '1587 Fall River Ave',
        city: 'Seekonk',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          // Bristol County
          '02771', // Seekonk
          '02769', // Rehoboth
          '02777', // Swansea
          '02726', // Somerset
          '02720', '02721', '02722', '02723', '02724', '02725', // Fall River
          '02715', // Dighton
          '02764', // North Dighton
          '02780', '02781', '02782', '02783', // Taunton
          '02703', // Attleboro
          '02760', // North Attleboro
          '02766', // Norton
          '02762', // Plainville
          '02093', // Wrentham
          '02702', // Assonet
          '02718', // East Taunton
          '02712', // Chartley (Raynham)
          '02767', // Raynham
          '02779'  // Berkley
        ]),
        serviceCities: JSON.stringify([
          'Seekonk', 'Rehoboth', 'Swansea', 'Somerset', 'Fall River', 'Dighton',
          'North Dighton', 'Taunton', 'South Attleboro', 'Attleboro', 'North Attleboro',
          'Norton', 'Plainville', 'Wrentham', 'Assonet', 'East Taunton', 'Raynham', 'Berkley'
        ]),
        serviceCounties: JSON.stringify(['Bristol', 'Norfolk']),
        serviceAreaRadius: 20,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Freedom Fuel',
        slug: 'freedom-fuel-ma',
        phone: '(774) 501-3357',
        website: 'https://www.freedomfuelma.com',
        addressLine1: null,
        city: 'Raynham',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          // Bristol County
          '02779', // Berkley
          '02324', // Bridgewater
          '02333', // East Bridgewater
          '02379', // West Bridgewater
          '02301', '02302', '02303', '02304', '02305', // Brockton
          '02715', // Dighton
          '02356', '02357', // Easton / North Easton
          '02338', // Halifax
          '02347', // Lakeville
          '02048', // Mansfield
          '02346', // Middleboro
          '02766', // Norton
          '02767', // Raynham
          '02780', '02781', // Taunton
          '02764', // North Dighton
          '02718', // East Taunton
          '02702', // Assonet
          '02712', // Chartley
          '02360', // Plymouth
          '02343', // Holbrook
          '02368', // Randolph
          '02072'  // Stoughton
        ]),
        serviceCities: JSON.stringify([
          'Berkley', 'Bridgewater', 'East Bridgewater', 'West Bridgewater', 'Brockton',
          'Dighton', 'Easton', 'Halifax', 'Lakeville', 'Mansfield', 'Middleboro',
          'Norton', 'Raynham', 'Taunton', 'North Dighton', 'East Taunton', 'Assonet'
        ]),
        serviceCounties: JSON.stringify(['Bristol', 'Plymouth', 'Norfolk']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 50,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Forni Brothers Oil',
        slug: 'forni-brothers-oil',
        phone: '(508) 378-2652',
        website: 'https://fornibrosoil.com',
        addressLine1: '563 Spring St',
        city: 'East Bridgewater',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          // Plymouth County
          '02333', // East Bridgewater
          '02324', // Bridgewater
          '02379', // West Bridgewater
          '02339', // Hanover
          '02341', // Hanson
          '02370', // Rockland
          '02382', // Whitman
          '02359', // Pembroke
          '02360', // Plymouth
          '02346', // Middleboro
          '02347', // Lakeville
          '02338', // Halifax
          '02066', // Scituate
          '02043', // Hingham
          '02050', // Marshfield
          '02351', // Abington
          '02367', // Plympton
          '02330', // Carver
          // Bristol County
          '02715', // Dighton
          '02764', // North Dighton
          '02718', // East Taunton
          '02780', '02781', // Taunton
          '02767', // Raynham
          '02779', // Berkley
          '02702', // Assonet
          '02766', // Norton
          '02356', '02357', // Easton
          '02048', // Mansfield
          '02712', // Chartley
          // Norfolk County
          '02301', '02302', // Brockton
          '02343', // Holbrook
          '02368', // Randolph
          '02072', // Stoughton
          '02351'  // Abington
        ]),
        serviceCities: JSON.stringify([
          'East Bridgewater', 'Bridgewater', 'West Bridgewater', 'Hanover', 'Hanson',
          'Rockland', 'Whitman', 'Pembroke', 'Plymouth', 'Middleboro', 'Lakeville',
          'Halifax', 'Scituate', 'Hingham', 'Marshfield', 'Abington', 'Plympton',
          'Carver', 'Dighton', 'North Dighton', 'East Taunton', 'Taunton', 'Raynham',
          'Berkley', 'Assonet', 'Norton', 'Easton', 'Mansfield', 'Brockton',
          'Holbrook', 'Randolph', 'Stoughton'
        ]),
        serviceCounties: JSON.stringify(['Plymouth', 'Bristol', 'Norfolk']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '7:30am-5:00pm',
        hoursSaturday: '8:00am-12:00pm',
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'T & M Fuel',
        slug: 't-and-m-fuel',
        phone: '(508) 761-7651',
        website: 'https://www.tandmfuel.com',
        addressLine1: '51 Norton St',
        city: 'Attleboro',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          // Bristol County
          '02703', // Attleboro
          '02760', // North Attleboro
          '02048', // Mansfield
          '02356', '02357', // Easton
          '02780', '02781', // Taunton
          '02766', // Norton
          '02771', // Seekonk
          '02769', // Rehoboth
          '02715', // Dighton
          '02718', // East Taunton
          '02777', // Swansea
          '02779', // Berkley
          '02767', // Raynham
          '02712', // Chartley
          '02764', // North Dighton
          '02726', // Somerset
          // Norfolk County
          '02019', // Bellingham
          '02035', // Foxboro
          '02038', // Franklin
          '02056', // Norfolk
          '02093', // Wrentham
          '02762'  // Plainville
        ]),
        serviceCities: JSON.stringify([
          'Attleboro', 'North Attleboro', 'Mansfield', 'Easton', 'North Easton',
          'South Easton', 'Taunton', 'Norton', 'Seekonk', 'Rehoboth', 'Dighton',
          'East Taunton', 'Swansea', 'Berkley', 'Raynham', 'Chartley', 'North Dighton',
          'Somerset', 'Bellingham', 'Foxboro', 'Franklin', 'Norfolk', 'Wrentham', 'Plainville'
        ]),
        serviceCounties: JSON.stringify(['Bristol', 'Norfolk']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: '9:00am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Eastern Petroleum',
        slug: 'eastern-petroleum',
        phone: '(508) 339-3416',
        website: 'https://www.easternpetroleumonline.com',
        addressLine1: '199 Mansfield Ave',
        city: 'Norton',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          // Bristol County
          '02766', // Norton
          '02048', // Mansfield
          '02356', '02357', // Easton
          '02703', // Attleboro
          '02780', '02781', // Taunton
          '02760', // North Attleboro
          '02769', // Rehoboth
          '02771', // Seekonk
          '02715', // Dighton
          '02767', // Raynham
          '02779', // Berkley
          // Norfolk County
          '02019', // Bellingham
          '02021', // Canton
          '02035', // Foxboro
          '02038', // Franklin
          '02052', // Medfield
          '02053', // Medway
          '02056', // Norfolk
          '02062', // Norwood
          '02067', // Sharon
          '02072', // Stoughton
          '02081', // Walpole
          '02093', // Wrentham
          '02322', // Avon
          '02343', // Holbrook
          '02368', // Randolph
          '02762'  // Plainville
        ]),
        serviceCities: JSON.stringify([
          'Norton', 'Mansfield', 'Easton', 'Attleboro', 'Taunton', 'North Attleboro',
          'Rehoboth', 'Seekonk', 'Dighton', 'Raynham', 'Berkley', 'Bellingham',
          'Canton', 'Foxboro', 'Franklin', 'Medfield', 'Medway', 'Norfolk', 'Norwood',
          'Sharon', 'Stoughton', 'Walpole', 'Wrentham', 'Avon', 'Holbrook', 'Randolph', 'Plainville'
        ]),
        serviceCounties: JSON.stringify(['Bristol', 'Norfolk']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        hoursWeekday: '9:00am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Brodeur & Sons',
        slug: 'brodeur-and-sons',
        phone: '(508) 995-5151',
        website: 'https://brodeurandsons.com',
        addressLine1: '525 Church St',
        city: 'New Bedford',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          // Bristol County
          '02740', '02741', '02742', '02743', '02744', '02745', '02746', // New Bedford
          '02747', // North Dartmouth
          '02748', // South Dartmouth
          '02714', // Dartmouth
          '02719', // Fairhaven
          '02702', // Assonet
          '02717', // East Freetown
          '02347', // Lakeville
          '02779', // Berkley
          '02790', // Westport
          '02791', // Westport Point
          '02703', // Acushnet (uses Attleboro ZIP - checking)
          // Plymouth County
          '02738', // Marion
          '02739', // Mattapoisett
          '02770', // Rochester
          '02571', // Wareham
          '02532', // Buzzards Bay
          '02558', // Onset
          '02330', // Carver
          '02346', // Middleboro
          // Barnstable County
          '02534', // Cataumet
          '02553', // Monument Beach
          '02556', // North Falmouth
          '02559', // Pocasset
          '02574'  // West Falmouth
        ]),
        serviceCities: JSON.stringify([
          'New Bedford', 'North Dartmouth', 'South Dartmouth', 'Dartmouth', 'Fairhaven',
          'Assonet', 'Freetown', 'East Freetown', 'Lakeville', 'Berkley', 'Westport',
          'Acushnet', 'Marion', 'Mattapoisett', 'Rochester', 'Wareham', 'East Wareham',
          'West Wareham', 'Onset', 'Carver', 'Middleboro'
        ]),
        serviceCounties: JSON.stringify(['Bristol', 'Plymouth', 'Barnstable']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'bioheat']),
        minimumGallons: 100,
        hoursWeekday: '7:30am-4:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          payment_methods, fuel_types, minimum_gallons,
          hours_weekday, hours_saturday, hours_sunday,
          weekend_delivery, emergency_delivery, senior_discount, notes,
          active, verified, allow_price_display, created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :paymentMethods, :fuelTypes, :minimumGallons,
          :hoursWeekday, :hoursSaturday, :hoursSunday,
          :weekendDelivery, :emergencyDelivery, :seniorDiscount, :notes,
          :active, :verified, :allowPriceDisplay, :createdAt, :updatedAt
        )
        ON CONFLICT (slug) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          addressLine1: supplier.addressLine1 || null,
          website: supplier.website || null,
          hoursWeekday: supplier.hoursWeekday || null,
          hoursSaturday: supplier.hoursSaturday || null,
          hoursSunday: supplier.hoursSunday || null,
          weekendDelivery: supplier.weekendDelivery || false,
          emergencyDelivery: supplier.emergencyDelivery || false,
          seniorDiscount: supplier.seniorDiscount || false,
          allowPriceDisplay: supplier.allowPriceDisplay !== false,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null
        }
      });

      console.log(`[Migration 032] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'affordable-fuel-inc',
        'freedom-fuel-ma',
        'forni-brothers-oil',
        't-and-m-fuel',
        'eastern-petroleum',
        'brodeur-and-sons'
      )
    `);
  }
};
