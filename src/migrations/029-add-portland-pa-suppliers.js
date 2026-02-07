/**
 * Migration 029: Add Portland, PA (18351) area suppliers
 * All verified via web search to serve Northampton County / Portland area
 * All offer COD/Will Call delivery
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '029-add-portland-pa-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'R.F. Ohl',
        slug: 'rf-ohl',
        phone: '(610) 377-1098',
        website: 'https://www.rfohl.com',
        addressLine1: '160 S 2nd St',
        city: 'Lehighton',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          '18235', // Lehighton
          '18071', // Palmerton
          '18229', // Jim Thorpe
          '18255', // Weatherly
          '18210', // Albrightsville
          '18624', // Lake Harmony
          '18232', // Lansford
          '18240', // Nesquehoning
          '18250', // Summit Hill
          '18101', '18102', '18103', '18104', '18105', // Allentown
          '18015', '18016', '18017', '18018', // Bethlehem
          '18042', '18043', '18044', '18045', // Easton
          '18064', // Nazareth
          '18360', // Stroudsburg
          '18301', // East Stroudsburg
          '18344', // Mount Pocono
          '18322', // Brodheadsville
          '18091', // Wind Gap
          '18014', // Bath
          '18032', // Catasauqua
          '18037', // Coplay
          '18052', // Whitehall
          '18088', // Walnutport
          '18080', // Slatington
          '18351', // Portland
          '18083', // Stockertown
          '18055', // Hellertown
          '18252', // Tamaqua
          '18211', // Andreas
          '18013', // Bangor
          '18072', // Pen Argyl
          '18343', // Mount Bethel
          '18066', // New Tripoli
          '18069', // Orefield
          '18078', // Schnecksville
          '18036', // Coopersburg
          '18049', // Emmaus
          '18062', // Macungie
          '18324', // Bushkill Falls
          '18326', // Cresco
          '18330', // Effort
          '18332', // Henryville
          '18334', // Kresgeville
          '18346', // Pocono Summit
          '18350', // Scotrun
          '18354', // Sciota
          '18355', // Scotrun
          '18372'  // Tannersville
        ]),
        serviceCities: JSON.stringify([
          'Lehighton', 'Palmerton', 'Jim Thorpe', 'Weatherly', 'Albrightsville',
          'Lake Harmony', 'Lansford', 'Nesquehoning', 'Summit Hill', 'Allentown',
          'Bethlehem', 'Easton', 'Nazareth', 'Stroudsburg', 'East Stroudsburg',
          'Mount Pocono', 'Brodheadsville', 'Wind Gap', 'Bath', 'Catasauqua',
          'Coplay', 'Whitehall', 'Walnutport', 'Slatington', 'Portland',
          'Stockertown', 'Hellertown', 'Tamaqua', 'Andreas', 'Bangor',
          'Pen Argyl', 'Mount Bethel', 'Coopersburg', 'Emmaus', 'Macungie'
        ]),
        serviceCounties: JSON.stringify(['Carbon', 'Monroe', 'Northampton', 'Lehigh', 'Schuylkill']),
        serviceAreaRadius: 50,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: '8:00am-4:30pm',
        hoursSaturday: '8:00am-2:00pm',
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Family owned since 1984. COD/Will Call available. 24/7 phone service. Also does HVAC.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: "Tolino's Fuel Service",
        slug: 'tolinos-fuel-service',
        phone: '(610) 588-3338',
        website: 'https://tolinosfuel.com',
        addressLine1: '225 Flicksville Rd',
        city: 'Bangor',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          '18013', // Bangor
          '18014', // Bath
          '18072', // Pen Argyl
          '18091', // Wind Gap
          '18351', // Portland
          '18064', // Nazareth
          '18042', '18043', '18044', '18045', // Easton
          '18015', '18016', '18017', '18018', // Bethlehem
          '18322', // Brodheadsville
          '18085', // Tatamy
          '18301', // East Stroudsburg
          '18360', // Stroudsburg
          '18343', // Mount Bethel
          '18083', // Stockertown
          '18037', // Coplay
          '18032', // Catasauqua
          '18052', // Whitehall
          '18088', // Walnutport
          '18071', // Palmerton
          '18330', // Effort
          '18334', // Kresgeville
          '18344', // Mount Pocono
          '18326'  // Cresco
        ]),
        serviceCities: JSON.stringify([
          'Bangor', 'East Bangor', 'Bath', 'Pen Argyl', 'Wind Gap', 'Portland',
          'Nazareth', 'Easton', 'Bethlehem', 'Brodheadsville', 'Tatamy',
          'East Stroudsburg', 'Stroudsburg', 'Mount Bethel', 'Stockertown',
          'Coplay', 'Catasauqua', 'Whitehall', 'Walnutport', 'Palmerton'
        ]),
        serviceCounties: JSON.stringify(['Northampton', 'Monroe', 'Warren', 'Lehigh', 'Carbon', 'Pike']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel', 'gasoline']),
        minimumGallons: 150,
        hoursWeekday: '7:00am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Family owned since 1955. Will Call may take up to 3 days. After-hours emergency available.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Fuel Cell Petrol',
        slug: 'fuel-cell-petrol',
        phone: '(877) 456-3835',
        website: 'https://www.fuelcellpetrol.com',
        addressLine1: '221 Bushkill St',
        city: 'Stockertown',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          '18083', // Stockertown
          '18085', // Tatamy
          '18064', // Nazareth
          '18042', '18043', '18044', '18045', // Easton
          '18091', // Wind Gap
          '18015', '18016', '18017', '18018', // Bethlehem
          '18014', // Bath
          '18072', // Pen Argyl
          '18013', // Bangor
          '18351', // Portland
          '18360', // Stroudsburg
          '18322', // Brodheadsville
          '18101', '18102', '18103', '18104', // Allentown
          '18067', // Northampton
          '18032', // Catasauqua
          '18037', // Coplay
          '18052', // Whitehall
          '18071', // Palmerton
          '18088', // Walnutport
          '18080', // Slatington
          '18055', // Hellertown
          '18343', // Mount Bethel
          '18063', // Martins Creek
          '18334', // Kresgeville
          '18330', // Effort
          '18327', // Delaware Water Gap
          '18321', // Bartonsville
          '18066', // New Tripoli
          '18069', // Orefield
          '18036', // Coopersburg
          '18301', // East Stroudsburg
          '18344'  // Mount Pocono
        ]),
        serviceCities: JSON.stringify([
          'Stockertown', 'Tatamy', 'Nazareth', 'Easton', 'Wind Gap', 'Bethlehem',
          'Bath', 'Pen Argyl', 'Bangor', 'Portland', 'Stroudsburg', 'Brodheadsville',
          'Allentown', 'Northampton', 'Catasauqua', 'Coplay', 'Whitehall',
          'Palmerton', 'Walnutport', 'Slatington', 'Hellertown', 'Mount Bethel',
          'Martins Creek', 'Kresgeville', 'Effort', 'Delaware Water Gap',
          'Bartonsville', 'East Stroudsburg', 'Mount Pocono'
        ]),
        serviceCounties: JSON.stringify(['Northampton', 'Monroe', 'Carbon', 'Lehigh', 'Bucks', 'Schuylkill']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'gasoline', 'bioheat']),
        minimumGallons: 75,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: true,
        notes: 'Einfalt family, 50+ years. Often delivers in 48 hours. Same-day emergency available. Veteran/first responder discounts.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Pennywise Fuel',
        slug: 'pennywise-fuel-pa',
        phone: '(570) 629-0800',
        website: 'https://www.pennywisefuel.com',
        addressLine1: '219 Shine Hill Rd',
        city: 'Henryville',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          '18332', // Henryville
          '18372', // Tannersville
          '18360', // Stroudsburg
          '18301', // East Stroudsburg
          '18344', // Mount Pocono
          '18347', // Pocono Pines
          '18346', // Pocono Summit
          '18349', // Pocono Manor
          '18466', // Tobyhanna
          '18341', // Mountainhome
          '18322', // Brodheadsville
          '18353', // Saylorsburg
          '18321', // Bartonsville
          '18330', // Effort
          '18331', // Gilbert
          '18334', // Kresgeville
          '18210', // Albrightsville
          '18351', // Portland
          '18013', // Bangor
          '18072', // Pen Argyl
          '18091', // Wind Gap
          '18064', // Nazareth
          '18014', // Bath
          '18042', '18045', // Easton
          '18083', // Stockertown
          '18085', // Tatamy
          '18229', // Jim Thorpe
          '18071', // Palmerton
          '18324', // Bushkill
          '18337', // Milford
          '18328', // Dingmans Ferry
          '18327', // Delaware Water Gap
          '18343', // Mount Bethel
          '18038', // Danielsville
          '18350', // Scotrun
          '18354', // Sciota
          '18326', // Cresco
          '18325', // Canadensis
          '18058', // Kunkletown
          '18211', // Andreas
          '18252'  // Tamaqua (partial)
        ]),
        serviceCities: JSON.stringify([
          'Henryville', 'Tannersville', 'Stroudsburg', 'East Stroudsburg',
          'Mount Pocono', 'Pocono Pines', 'Pocono Summit', 'Tobyhanna',
          'Mountainhome', 'Brodheadsville', 'Saylorsburg', 'Bartonsville',
          'Effort', 'Gilbert', 'Kresgeville', 'Albrightsville', 'Portland',
          'Bangor', 'Pen Argyl', 'Wind Gap', 'Nazareth', 'Bath', 'Easton',
          'Stockertown', 'Tatamy', 'Jim Thorpe', 'Palmerton', 'Bushkill',
          'Milford', 'Dingmans Ferry', 'Delaware Water Gap', 'Mount Bethel',
          'Cresco', 'Canadensis', 'Kunkletown'
        ]),
        serviceCounties: JSON.stringify(['Monroe', 'Pike', 'Carbon', 'Northampton', 'Wayne', 'Lackawanna', 'Lehigh']),
        serviceAreaRadius: 40,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '8:00am-4:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Over 40 years in business. 24/7 emergency service. Delivery trucks run 5 days a week. App available.',
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

      console.log(`[Migration 029] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'rf-ohl',
        'tolinos-fuel-service',
        'fuel-cell-petrol',
        'pennywise-fuel-pa'
      )
    `);
  }
};
