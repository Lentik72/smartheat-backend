/**
 * Migration 052: Add CT Coverage Suppliers
 *
 * Adds 4 verified COD/will-call suppliers across Connecticut:
 * - Energy Direct LLC (Granby): "COD Oil Delivery" in page title on own site
 * - Town Oil Co (Wethersfield): "Will Call Delivery gives you full control" on own site
 * - J.J. Sullivan Inc (Guilford): "Will-Call/On-Demand Delivery" on own delivery page
 * - General Oil (Waterford): "Will-Call" on own site + "C.O.D. delivery" on dealer listing
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '052-add-ct-coverage-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // ENERGY DIRECT LLC - Granby, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'Energy Direct LLC',
        slug: 'energy-direct-llc',
        phone: '(860) 325-0016',
        email: 'order@yourenergydirect.net',
        website: 'https://yourenergydirect.net',
        addressLine1: '5 Brook Pasture Ln',
        city: 'Granby',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Hartford County CT
          '06035', // Granby
          '06026', // East Granby
          '06002', // Bloomfield
          '06095', // Windsor
          '06096', // Windsor Locks
          '06070', // Simsbury
          '06089', // Weatogue (Simsbury)
          '06019', // Canton
          '06078', // Suffield
          '06093', // West Suffield
          // Litchfield County CT
          '06027', // East Hartland / Hartland
          // Hampden County MA
          '01077', // Southwick
          '01034', // Granville
        ]),
        serviceCities: JSON.stringify([
          'Granby', 'East Granby', 'Bloomfield', 'Windsor', 'Windsor Locks',
          'Simsbury', 'Weatogue', 'Canton', 'Suffield', 'West Suffield',
          'Hartland', 'East Hartland', 'Southwick', 'Granville'
        ]),
        serviceCounties: JSON.stringify(['Hartford', 'Litchfield', 'Hampden']),
        serviceAreaRadius: 15,
        lat: 41.9545,
        lng: -72.7907,
        hoursWeekday: null, // Not listed on website
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: null, // Not mentioned
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'debit']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        seniorDiscount: null,
        allowPriceDisplay: true, // Price on homepage ($3.86/gal)
        notes: null,
        active: true,
      },

      // ============================================
      // TOWN OIL CO - Wethersfield, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'Town Oil Company',
        slug: 'town-oil-company',
        phone: '(860) 529-6813',
        email: 'hello@townoil.com',
        website: 'https://www.townoilcompany.com',
        addressLine1: '786 Silas Deane Hwy, Suite 1',
        city: 'Wethersfield',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Hartford County
          '06001', // Avon
          '06002', // Bloomfield
          '06010', // Bristol
          '06013', // Burlington
          '06016', // Broad Brook
          '06023', // East Berlin
          '06029', // East Windsor
          '06032', // Farmington
          '06033', // Glastonbury
          '06037', // Berlin
          '06040', // Manchester
          '06051', '06052', '06053', // New Britain
          '06062', // Plainville
          '06067', // Rocky Hill
          '06070', // Simsbury
          '06073', // South Glastonbury
          '06074', // South Windsor
          '06081', // Tariffville
          '06085', // Unionville
          '06089', // Weatogue
          '06095', // Windsor
          '06096', // Windsor Locks
          '06103', '06105', '06106', '06112', '06114', '06120', // Hartford
          '06107', '06110', '06119', // West Hartford
          '06108', '06118', // East Hartford
          '06109', // Wethersfield
          '06111', // Newington
          // Tolland County
          '06043', // Bolton
          '06238', // Coventry / Andover
          '06248', // Hebron
          // Middlesex County
          '06416', // Cromwell
          '06422', // Durham
          '06424', // East Hampton
          '06455', // Middlefield
          '06456', // Middle Haddam
          '06457', // Middletown
          '06480', // Portland
          '06481', // Rockfall
          // New Haven County
          '06450', '06451', // Meriden
          '06479', // Plantsville
          '06489', // Southington
        ]),
        serviceCities: JSON.stringify([
          'Avon', 'Berlin', 'Bloomfield', 'Bristol', 'Burlington', 'Broad Brook',
          'East Berlin', 'East Hartford', 'East Windsor', 'Farmington', 'Glastonbury',
          'Hartford', 'Manchester', 'New Britain', 'Newington', 'Plainville',
          'Rocky Hill', 'Simsbury', 'South Glastonbury', 'South Windsor', 'Southington',
          'Tariffville', 'Unionville', 'Weatogue', 'West Hartford', 'Wethersfield',
          'Windsor', 'Windsor Locks', 'Bolton', 'Andover', 'Hebron',
          'Cromwell', 'Durham', 'East Hampton', 'Middle Haddam', 'Middlefield',
          'Middletown', 'Portland', 'Rockfall', 'Meriden', 'Plantsville', 'Marlborough'
        ]),
        serviceCounties: JSON.stringify(['Hartford', 'Tolland', 'Middlesex', 'New Haven']),
        serviceAreaRadius: 25,
        lat: 41.7143,
        lng: -72.6525,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24/7 for service contract holders
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // No public price
        notes: null,
        active: true,
      },

      // ============================================
      // J.J. SULLIVAN INC - Guilford, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'J.J. Sullivan Inc',
        slug: 'jj-sullivan-inc',
        phone: '(203) 453-2781',
        email: 'info@jjsullivaninc.com',
        website: 'https://jjsullivaninc.com',
        addressLine1: '229 River Street',
        city: 'Guilford',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // New Haven County
          '06437', // Guilford
          '06405', // Branford
          '06471', // North Branford
          '06443', // Madison
          '06473', // North Haven
          '06512', // East Haven
          '06472', // Northford
          // Middlesex County
          '06413', // Clinton
          '06419', // Killingworth
          '06422', // Durham
          '06498', // Westbrook
        ]),
        serviceCities: JSON.stringify([
          'Guilford', 'Branford', 'North Branford', 'Madison', 'Clinton',
          'Killingworth', 'Durham', 'Westbrook', 'North Haven', 'East Haven', 'Northford'
        ]),
        serviceCounties: JSON.stringify(['New Haven', 'Middlesex']),
        serviceAreaRadius: 20,
        lat: 41.2887,
        lng: -72.6818,
        hoursWeekday: '7:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24/7 phone, expedited service
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: 100,
        seniorDiscount: null,
        allowPriceDisplay: true, // "Today's Fuel Prices" on homepage ($4.099)
        notes: null,
        active: true,
      },

      // ============================================
      // GENERAL OIL - Waterford, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'General Oil',
        slug: 'general-oil',
        phone: '(860) 443-1306',
        email: 'Office@GenOilCompany.com',
        website: 'https://genoilcompany.com',
        addressLine1: '17R Boston Post Rd',
        city: 'Waterford',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // New London County
          '06320', // New London
          '06333', // East Lyme
          '06334', // Bozrah
          '06335', // Gales Ferry
          '06339', // Ledyard
          '06340', // Groton / Noank
          '06353', // Montville
          '06355', // Mystic
          '06357', // Niantic
          '06359', // North Stonington
          '06360', // Norwich
          '06365', // Preston
          '06370', // Oakdale
          '06371', // Old Lyme / Lyme
          '06375', // Quaker Hill
          '06378', // Stonington
          '06379', // Pawcatuck
          '06382', // Uncasville
          '06385', // Waterford
          '06420', // Salem
        ]),
        serviceCities: JSON.stringify([
          'Old Lyme', 'Lyme', 'East Lyme', 'Niantic', 'Salem', 'Montville',
          'Oakdale', 'Uncasville', 'Gales Ferry', 'Norwich', 'Waterford',
          'Quaker Hill', 'New London', 'Ledyard', 'Groton', 'Mystic',
          'Stonington', 'Noank', 'Bozrah', 'North Stonington', 'Preston', 'Pawcatuck'
        ]),
        serviceCounties: JSON.stringify(['New London']),
        serviceAreaRadius: 20,
        lat: 41.3443,
        lng: -72.1488,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24/7 emergency service
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // No public price
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

    console.log('[Migration 052] Added 4 CT coverage suppliers');

    // Safety: Ensure allowPriceDisplay is correctly set
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN ('town-oil-company', 'general-oil')
      AND allow_price_display = true
    `);

    console.log('[Migration 052] ✅ CT coverage expansion complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('energy-direct-llc', 'town-oil-company', 'jj-sullivan-inc', 'general-oil')
    `);
    console.log('[Migration 052] Rolled back CT coverage suppliers');
  }
};
