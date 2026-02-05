/**
 * Add CT Suppliers for Yantic (06389) Coverage
 *
 * Adds 8 researched suppliers serving the Yantic, CT area.
 * Based on web research from HomeHeatingExpert.com directory
 * and individual company websites.
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const { initSupplierModel, getSupplierModel } = require('../src/models/Supplier');

// CT ZIP codes for eastern CT service area (Norwich/New London County area)
const easternCTZips = [
  '06389', // Yantic
  '06360', // Norwich
  '06365', // Preston
  '06382', // Uncasville (Montville)
  '06335', // Gales Ferry
  '06320', // New London
  '06340', // Groton
  '06355', // Mystic
  '06378', // Stonington
  '06359', // North Stonington
  '06339', // Ledyard
  '06333', // East Lyme
  '06357', // Niantic
  '06385', // Waterford
  '06379', // Pawcatuck
  '06351', // Jewett City (Griswold)
  '06354', // Moosup
  '06374', // Plainfield
  '06377', // Sterling
  '06380', // Taftville
  '06384', // Voluntown
  '06226', // Willimantic
  '06076', // Stafford Springs
  '06250', // Mansfield Center
  '06231', // Amston
  '06232', // Andover
  '06234', // Brooklyn
  '06237', // Columbia
  '06238', // Coventry
  '06241', // Danielson
  '06242', // Dayville
  '06254', // North Franklin
  '06256', // North Windham
  '06259', // Pomfret
  '06260', // Putnam
  '06262', // Quinebaug
  '06264', // Scotland
  '06266', // South Windham
  '06268', // Storrs
  '06277', // Thompson
  '06279', // Willington
  '06280', // Windham
  '06029', // Ellington
  '06035', // Granby
  '06084', // Tolland
  '06247', // Hampton
  '06235', // Chaplin
  '06331', // Canterbury
  '06330', // Baltic
  '06334', // Bozrah
];

// Suppliers to add
const suppliers = [
  {
    name: 'MidKnight Oil Company',
    phone: '860-535-3400',
    email: null, // Not publicly listed
    website: 'https://midknightoilcompany.com',
    addressLine1: '42 Boombridge Road',
    city: 'North Stonington',
    state: 'CT',
    postalCodesServed: [
      '06359', '06378', '06355', '06379', '06340', '06320', '06335', '06339',
      '06333', '06357', '06385', '06382', '06389', '06360', '06365'
    ],
    serviceCounties: ['New London'],
    serviceCities: ['North Stonington', 'Stonington', 'Mystic', 'Pawcatuck', 'Groton', 'New London', 'Gales Ferry', 'Ledyard', 'East Lyme', 'Niantic', 'Waterford', 'Uncasville', 'Yantic', 'Norwich', 'Preston'],
    lat: 41.4504,
    lng: -71.8748,
    hoursWeekday: '7:00 AM - 5:00 PM',
    hoursSaturday: 'Closed',
    hoursSunday: 'Closed',
    weekendDelivery: 'no',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-535-3400',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card'],
    fuelTypes: ['oil', 'diesel', 'kerosene'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Family owned since 1989. Same-day/next-day delivery. No online pricing.'
  },
  {
    name: 'OnDemand Fuel Oil',
    phone: '860-908-3590',
    email: 'support@ondemandfueloil.com',
    website: 'https://ondemandfueloil.com',
    addressLine1: null,
    city: 'Uncasville',
    state: 'CT',
    postalCodesServed: [
      '06382', '06389', '06360', '06365', '06335', '06339', '06333', '06357',
      '06385', '06320', '06340', '06355', '06378', '06379', '06351', '06380',
      '06330', '06334'
    ],
    serviceCounties: ['New London'],
    serviceCities: ['Uncasville', 'Yantic', 'Norwich', 'Preston', 'Gales Ferry', 'Ledyard', 'East Lyme', 'Niantic', 'Waterford', 'New London', 'Groton', 'Mystic', 'Stonington', 'Pawcatuck', 'Jewett City', 'Taftville', 'Baltic', 'Bozrah'],
    lat: 41.4334,
    lng: -72.1087,
    hoursWeekday: '7:00 AM - 5:00 PM',
    hoursSaturday: '8:00 AM - 12:00 PM',
    hoursSunday: 'Closed',
    weekendDelivery: 'yes',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-908-3590',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['credit_card', 'debit_card'],
    fuelTypes: ['oil'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Online ordering available. Explicitly serves Yantic. Has website pricing - ADD TO SCRAPER.'
  },
  {
    name: 'Ives Brothers Oil',
    phone: '860-423-1336',
    email: null,
    website: 'https://ivesbrosoil.com',
    addressLine1: '155 Boston Post Road',
    city: 'Willimantic',
    state: 'CT',
    postalCodesServed: [
      '06226', '06232', '06237', '06238', '06250', '06268', '06279', '06280',
      '06256', '06266', '06235', '06247', '06259', '06264', '06389', '06360',
      '06330', '06331'
    ],
    serviceCounties: ['Windham', 'Tolland', 'New London'],
    serviceCities: ['Willimantic', 'Andover', 'Columbia', 'Coventry', 'Mansfield Center', 'Storrs', 'Willington', 'Windham', 'North Windham', 'South Windham', 'Chaplin', 'Hampton', 'Pomfret', 'Scotland', 'Yantic', 'Norwich', 'Baltic', 'Canterbury'],
    lat: 41.7106,
    lng: -72.2092,
    hoursWeekday: '8:00 AM - 4:30 PM',
    hoursSaturday: 'Closed',
    hoursSunday: 'Closed',
    weekendDelivery: 'no',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-423-1336',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card'],
    fuelTypes: ['oil', 'kerosene'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Serving eastern CT since 1947. Has website pricing - ADD TO SCRAPER.'
  },
  {
    name: 'Town & Country Discount Oil',
    phone: '860-376-2063',
    email: null,
    website: 'https://townandcountrydiscountoilllc.com',
    addressLine1: '27 Main Street',
    city: 'Voluntown',
    state: 'CT',
    postalCodesServed: [
      '06384', '06351', '06354', '06374', '06377', '06234', '06241', '06242',
      '06260', '06262', '06277', '06331', '06389', '06360', '06365', '06339'
    ],
    serviceCounties: ['New London', 'Windham'],
    serviceCities: ['Voluntown', 'Jewett City', 'Moosup', 'Plainfield', 'Sterling', 'Brooklyn', 'Danielson', 'Dayville', 'Putnam', 'Quinebaug', 'Thompson', 'Canterbury', 'Yantic', 'Norwich', 'Preston', 'Ledyard'],
    lat: 41.5776,
    lng: -71.8615,
    hoursWeekday: '7:00 AM - 4:00 PM',
    hoursSaturday: 'Closed',
    hoursSunday: 'Closed',
    weekendDelivery: 'no',
    emergencyDelivery: 'unknown',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card'],
    fuelTypes: ['oil', 'kerosene'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Discount oil company serving eastern CT. Has website pricing - ADD TO SCRAPER.'
  },
  {
    name: 'Yankee Oil',
    phone: '860-423-3138',
    email: null,
    website: 'https://yankeeoil.com',
    addressLine1: '551 Storrs Road',
    city: 'Mansfield Center',
    state: 'CT',
    postalCodesServed: [
      '06250', '06268', '06226', '06238', '06237', '06232', '06279', '06084',
      '06076', '06029', '06035', '06280', '06256', '06266', '06235', '06247',
      '06389', '06360', '06330'
    ],
    serviceCounties: ['Tolland', 'Windham', 'Hartford', 'New London'],
    serviceCities: ['Mansfield Center', 'Storrs', 'Willimantic', 'Coventry', 'Columbia', 'Andover', 'Willington', 'Tolland', 'Stafford Springs', 'Ellington', 'Granby', 'Windham', 'North Windham', 'South Windham', 'Chaplin', 'Hampton', 'Yantic', 'Norwich', 'Baltic'],
    lat: 41.7887,
    lng: -72.2501,
    hoursWeekday: '7:30 AM - 4:30 PM',
    hoursSaturday: 'Closed',
    hoursSunday: 'Closed',
    weekendDelivery: 'no',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-423-3138',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card'],
    fuelTypes: ['oil', 'kerosene', 'diesel'],
    seniorDiscount: 'yes',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Serving northeastern CT since 1980. 10% senior discount. Has website pricing - ADD TO SCRAPER.'
  },
  {
    name: 'Mayday Oil',
    phone: '860-642-7277',
    email: null,
    website: 'https://maydayoil.com',
    addressLine1: '137 Route 32',
    city: 'North Franklin',
    state: 'CT',
    postalCodesServed: [
      '06254', '06389', '06360', '06365', '06382', '06335', '06339', '06330',
      '06334', '06331', '06351', '06380', '06226', '06280', '06256', '06266',
      '06237', '06235'
    ],
    serviceCounties: ['New London', 'Windham'],
    serviceCities: ['North Franklin', 'Yantic', 'Norwich', 'Preston', 'Uncasville', 'Gales Ferry', 'Ledyard', 'Baltic', 'Bozrah', 'Canterbury', 'Jewett City', 'Taftville', 'Willimantic', 'Windham', 'North Windham', 'South Windham', 'Columbia', 'Chaplin'],
    lat: 41.6151,
    lng: -72.1476,
    hoursWeekday: '7:00 AM - 5:00 PM',
    hoursSaturday: 'By appointment',
    hoursSunday: 'Closed',
    weekendDelivery: 'yes',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-642-7277',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card', 'debit_card'],
    fuelTypes: ['oil', 'kerosene'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Located in North Franklin, close to Yantic. Has website pricing - ADD TO SCRAPER.'
  },
  {
    name: "McGuire's Oil",
    phone: '860-889-7220',
    email: null,
    website: 'https://mcguiresoil.com',
    addressLine1: '265 Route 164',
    city: 'Preston',
    state: 'CT',
    postalCodesServed: [
      '06365', '06389', '06360', '06382', '06335', '06339', '06351', '06380',
      '06330', '06334', '06320', '06340', '06333', '06357', '06385'
    ],
    serviceCounties: ['New London'],
    serviceCities: ['Preston', 'Yantic', 'Norwich', 'Uncasville', 'Gales Ferry', 'Ledyard', 'Jewett City', 'Taftville', 'Baltic', 'Bozrah', 'New London', 'Groton', 'East Lyme', 'Niantic', 'Waterford'],
    lat: 41.5087,
    lng: -72.0876,
    hoursWeekday: '8:00 AM - 4:30 PM',
    hoursSaturday: 'Closed',
    hoursSunday: 'Closed',
    weekendDelivery: 'no',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-889-7220',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card'],
    fuelTypes: ['oil', 'kerosene'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Family owned, serving Preston area. No online pricing - call for quote.'
  },
  {
    name: 'Brunelli Energy',
    phone: '860-889-5335',
    email: null,
    website: 'https://brunellienergy.com',
    addressLine1: '79 Fitchville Road',
    city: 'Bozrah',
    state: 'CT',
    postalCodesServed: [
      '06334', '06389', '06360', '06365', '06382', '06335', '06339', '06330',
      '06254', '06351', '06380', '06320', '06340', '06333', '06357', '06385'
    ],
    serviceCounties: ['New London'],
    serviceCities: ['Bozrah', 'Yantic', 'Norwich', 'Preston', 'Uncasville', 'Gales Ferry', 'Ledyard', 'Baltic', 'North Franklin', 'Jewett City', 'Taftville', 'New London', 'Groton', 'East Lyme', 'Niantic', 'Waterford'],
    lat: 41.5451,
    lng: -72.1701,
    hoursWeekday: '7:30 AM - 4:30 PM',
    hoursSaturday: 'Closed',
    hoursSunday: 'Closed',
    weekendDelivery: 'no',
    emergencyDelivery: 'yes',
    emergencyPhone: '860-889-5335',
    hoursSource: 'website',
    minimumGallons: 100,
    paymentMethods: ['cash', 'check', 'credit_card'],
    fuelTypes: ['oil', 'kerosene', 'propane'],
    seniorDiscount: 'unknown',
    source: 'web_research',
    allowPriceDisplay: true,
    notes: 'Full service energy company. HVAC services available. No online pricing - call for quote.'
  }
];

async function addSuppliers() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    initSupplierModel(sequelize);
    const Supplier = getSupplierModel();

    console.log('\n📦 Adding 8 CT suppliers for Yantic (06389) coverage...\n');

    let added = 0;
    let skipped = 0;

    for (const supplierData of suppliers) {
      // Check if supplier already exists by name
      const existing = await Supplier.findOne({
        where: { name: supplierData.name }
      });

      if (existing) {
        console.log(`⏭️  Skipping ${supplierData.name} - already exists`);
        skipped++;
        continue;
      }

      // Generate slug from name
      const slug = supplierData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      await Supplier.create({
        ...supplierData,
        slug,
        active: true,
        verified: false
      });

      console.log(`✅ Added: ${supplierData.name} (${supplierData.city}, ${supplierData.state})`);
      added++;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Summary: ${added} added, ${skipped} skipped`);
    console.log('='.repeat(50));

    // Show suppliers that need scraping
    console.log('\n🔍 Suppliers with website pricing (ADD TO SCRAPER):');
    suppliers
      .filter(s => s.notes && s.notes.includes('ADD TO SCRAPER'))
      .forEach(s => {
        console.log(`   - ${s.name}: ${s.website}`);
      });

    await sequelize.close();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addSuppliers();
