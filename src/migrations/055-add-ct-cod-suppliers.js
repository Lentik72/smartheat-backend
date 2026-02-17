/**
 * Migration 055: Add CT COD Suppliers
 *
 * Adds 2 verified COD suppliers in Connecticut:
 * - Incredible Oil: "lowest daily COD price" on incredibleoil.com (public tiered pricing)
 * - Economy Fuel / Rural Fuels: "COD home heating oil delivery" on economyfuelco.com
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '055-add-ct-cod-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // INCREDIBLE OIL - Wallingford, CT (New Haven County)
      // "lowest daily COD price" on incredibleoil.com
      // Tiered pricing: 300+=$3.39, 100-299=$3.49, 50-99=$3.99
      // ============================================
      {
        id: uuidv4(),
        name: 'Incredible Oil',
        slug: 'incredible-oil',
        phone: '(203) 265-4328',
        email: 'info@incredibleoil.com',
        website: 'https://www.incredibleoil.com',
        addressLine1: '5 Barker Dr',
        city: 'Wallingford',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // New Haven County
          '06492', // Wallingford
          '06410', // Cheshire
          '06450', // Meriden
          '06451', // Meriden (North)
          '06405', // Branford
          '06471', // North Branford
          '06473', // North Haven
          '06437', // Guilford
          '06443', // Madison
          '06514', // Hamden
          '06517', // Hamden
          '06518', // Hamden
          '06524', // Bethany
          // Middlesex County
          '06413', // Clinton
          '06416', // Cromwell
          '06422', // Durham
          '06455', // Middlefield
          '06457', // Middletown
          // Hartford County
          '06037', // Berlin
          '06489', // Southington
        ]),
        serviceCities: JSON.stringify([
          'Wallingford', 'Cheshire', 'Meriden', 'Branford', 'North Branford',
          'North Haven', 'Guilford', 'Madison', 'Hamden', 'Clinton', 'Cromwell',
          'Durham', 'Middlefield', 'Middletown', 'Berlin', 'Southington'
        ]),
        serviceCounties: JSON.stringify(['New Haven', 'Middlesex', 'Hartford']),
        serviceAreaRadius: 20,
        lat: 41.4570,
        lng: -72.8231,
        hoursWeekday: null, // Not listed on site
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // Emergency deliveries available
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: 50,
        seniorDiscount: true, // Senior discounts mentioned
        allowPriceDisplay: true, // Tiered COD prices on homepage
        notes: null,
        active: true,
      },

      // ============================================
      // ECONOMY FUEL / RURAL FUELS - Trumbull, CT (Fairfield County)
      // "COD home heating oil delivery" on economyfuelco.com
      // Now part of Rural Fuels family
      // ============================================
      {
        id: uuidv4(),
        name: 'Economy Fuel',
        slug: 'economy-fuel-ct',
        phone: '(203) 364-5816',
        email: null,
        website: 'https://www.economyfuelco.com',
        addressLine1: '7176 Main St',
        city: 'Trumbull',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County
          '06611', // Trumbull
          '06612', // Easton
          '06468', // Monroe
          '06484', // Shelton
          '06614', // Stratford
          '06615', // Stratford
          '06604', // Bridgeport
          '06605', // Bridgeport
          '06606', // Bridgeport
          '06610', // Bridgeport
          '06824', // Fairfield
          '06825', // Fairfield
          '06877', // Ridgefield
          '06896', // Redding
          '06801', // Bethel
          '06470', // Newtown
          '06482', // Sandy Hook (Newtown)
          '06820', // Darien
          '06840', // New Canaan
          '06850', // Norwalk
          '06851', // Norwalk
          '06883', // Weston
          '06880', // Westport
          '06897', // Wilton
          '06830', // Greenwich
          '06901', // Stamford
          '06902', // Stamford
          // New Haven County
          '06401', // Ansonia
          '06524', // Bethany
          '06418', // Derby
          '06460', // Milford
          '06477', // Orange
          '06478', // Oxford
          '06483', // Seymour
          '06488', // Southbury
          '06516', // West Haven
          '06525', // Woodbridge
          '06510', // New Haven
          '06511', // New Haven
        ]),
        serviceCities: JSON.stringify([
          'Trumbull', 'Easton', 'Monroe', 'Shelton', 'Stratford', 'Bridgeport',
          'Fairfield', 'Ridgefield', 'Redding', 'Bethel', 'Newtown', 'Sandy Hook',
          'Darien', 'New Canaan', 'Norwalk', 'Weston', 'Westport', 'Wilton',
          'Greenwich', 'Stamford', 'Ansonia', 'Bethany', 'Derby', 'Milford',
          'Orange', 'Oxford', 'Seymour', 'Southbury', 'West Haven', 'Woodbridge',
          'New Haven'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'New Haven']),
        serviceAreaRadius: 25,
        lat: 41.2428,
        lng: -73.2007,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: null,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // Prices in portal only
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

    console.log('[Migration 055] Added 2 CT COD suppliers (Incredible Oil, Economy Fuel)');

    // Safety: Ensure allowPriceDisplay is correctly set
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug = 'economy-fuel-ct'
      AND allow_price_display = true
    `);

    console.log('[Migration 055] ✅ CT COD supplier expansion complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('incredible-oil', 'economy-fuel-ct')
    `);
    console.log('[Migration 055] Rolled back CT COD suppliers');
  }
};
