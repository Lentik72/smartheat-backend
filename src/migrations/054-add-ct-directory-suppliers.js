/**
 * Migration 054: Add CT Directory Suppliers
 *
 * Adds 3 verified COD/will-call suppliers across Connecticut:
 * - Sisters Oil Service: "cash-on-delivery (COD) basis" on sistersoil.com
 * - River Valley Oil Service: "Current C.O.D. Oil Price" on rivervalleyos.com
 * - Reliable Oil & Heat: "C.O.D. delivery" + "Will-call deliveries" on reliableoilandheat.com
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '054-add-ct-directory-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // SISTERS OIL SERVICE - Canton, CT (Hartford County)
      // "cash-on-delivery (COD) basis" on sistersoil.com
      // Price page: "Per Gallon C.O.D." — CALL FOR PRICING
      // ============================================
      {
        id: uuidv4(),
        name: 'Sisters Oil Service',
        slug: 'sisters-oil-service',
        phone: '(860) 693-4663',
        email: 'info@sistersoil.com',
        website: 'https://www.sistersoil.com',
        addressLine1: '292 Albany Tpke',
        city: 'Canton',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Hartford County
          '06019', // Canton
          '06001', // Avon
          '06032', // Farmington
          '06085', // Unionville (Farmington)
          '06035', // Granby
          '06070', // Simsbury
          '06089', // Weatogue (Simsbury)
          '06081', // Tariffville (Simsbury)
          '06013', // Burlington
          // Litchfield County
          '06063', // Barkhamsted
          '06057', // New Hartford
          '06027', // Hartland / East Hartland
          '06791', // Harwinton
        ]),
        serviceCities: JSON.stringify([
          'Canton', 'Avon', 'Burlington', 'Simsbury', 'Farmington', 'Unionville',
          'Granby', 'Barkhamsted', 'Tariffville', 'New Hartford', 'Hartland', 'Harwinton'
        ]),
        serviceCounties: JSON.stringify(['Hartford', 'Litchfield']),
        serviceAreaRadius: 15,
        lat: 41.8354,
        lng: -72.8984,
        hoursWeekday: null, // Mon-Fri, specific times not listed
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // After-hours: (860) 978-7546
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 125,
        seniorDiscount: null,
        allowPriceDisplay: false, // "CALL FOR PRICING"
        notes: null,
        active: true,
      },

      // ============================================
      // RIVER VALLEY OIL SERVICE - Middletown, CT (Middlesex County)
      // "Current C.O.D. Oil Price" on rivervalleyos.com
      // ============================================
      {
        id: uuidv4(),
        name: 'River Valley Oil Service',
        slug: 'river-valley-oil-service',
        phone: '(860) 342-5670',
        email: null,
        website: 'https://rivervalleyos.com',
        addressLine1: '310 South Main St',
        city: 'Middletown',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Middlesex County
          '06457', // Middletown
          '06480', // Portland
          '06416', // Cromwell
          '06424', // East Hampton
          '06414', // Cobalt
          '06455', // Middlefield
          '06422', // Durham
          '06441', // Higganum
          '06438', // Haddam
          '06423', // East Haddam
          '06419', // Killingworth
          '06412', // Chester
          '06417', // Deep River
          '06442', // Ivoryton (Essex)
          '06426', // Essex
          '06498', // Westbrook
          '06475', // Old Saybrook
          '06413', // Clinton
          // Hartford County
          '06109', // Wethersfield
          '06111', // Newington
          '06067', // Rocky Hill
          '06033', // Glastonbury
          '06037', // Berlin
          '06447', // Marlborough
          // New Haven County
          '06450', // Meriden
          '06437', // Guilford
          '06443', // Madison
          // New London County
          '06371', // Old Lyme / Lyme
          '06333', // East Lyme
          '06420', // Salem
          // Tolland County
          '06248', // Hebron
          '06231', // Amston (Hebron)
          '06415', // Colchester
        ]),
        serviceCities: JSON.stringify([
          'Middletown', 'Portland', 'Cromwell', 'Wethersfield', 'Newington',
          'East Hampton', 'Cobalt', 'Rocky Hill', 'Middlefield', 'Durham',
          'Higganum', 'Haddam', 'Meriden', 'Glastonbury', 'Hebron', 'Berlin',
          'East Haddam', 'Guilford', 'Marlborough', 'Amston', 'Colchester',
          'Salem', 'Lyme', 'Old Lyme', 'East Lyme', 'Killingworth', 'Chester',
          'Deep River', 'Ivoryton', 'Essex', 'Westbrook', 'Old Saybrook',
          'Clinton', 'Madison'
        ]),
        serviceCounties: JSON.stringify(['Middlesex', 'Hartford', 'New Haven', 'New London', 'Tolland']),
        serviceAreaRadius: 30,
        lat: 41.5515,
        lng: -72.6497,
        hoursWeekday: null, // Not listed on site
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour emergency service
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // "Call For Price"
        notes: null,
        active: true,
      },

      // ============================================
      // RELIABLE OIL & HEAT CO. - Stamford, CT (Fairfield County)
      // "C.O.D. delivery" + "Will-call deliveries" on reliableoilandheat.com
      // Parent of Pramer Fuel, Steve's Fuel, Darien Fuel
      // ============================================
      {
        id: uuidv4(),
        name: 'Reliable Oil & Heat',
        slug: 'reliable-oil-and-heat',
        phone: '(203) 324-2141',
        email: null,
        website: 'https://reliableoilandheat.com',
        addressLine1: '351 Courtland Ave',
        city: 'Stamford',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County
          '06820', // Darien
          '06830', // Greenwich
          '06831', // Greenwich (North)
          '06840', // New Canaan
          '06850', // Norwalk
          '06851', // Norwalk
          '06853', // Norwalk (South)
          '06854', // Norwalk (East)
          '06855', // Norwalk
          '06901', // Stamford
          '06902', // Stamford
          '06903', // Stamford (North)
          '06905', // Stamford
          '06906', // Stamford
          '06907', // Stamford
          '06883', // Weston
          '06880', // Westport
          '06897', // Wilton
        ]),
        serviceCities: JSON.stringify([
          'Darien', 'Greenwich', 'New Canaan', 'Norwalk', 'Stamford',
          'Weston', 'Westport', 'Wilton'
        ]),
        serviceCounties: JSON.stringify(['Fairfield']),
        serviceAreaRadius: 15,
        lat: 41.0699,
        lng: -73.5157,
        hoursWeekday: '7:30 AM - 3:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: null,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // No public prices
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

    console.log('[Migration 054] Added 3 CT directory suppliers (Sisters Oil, River Valley, Reliable Oil)');

    // Safety: Ensure allowPriceDisplay is correctly set for all three
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN ('sisters-oil-service', 'river-valley-oil-service', 'reliable-oil-and-heat')
      AND allow_price_display = true
    `);

    console.log('[Migration 054] ✅ CT directory supplier expansion complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('sisters-oil-service', 'river-valley-oil-service', 'reliable-oil-and-heat')
    `);
    console.log('[Migration 054] Rolled back CT directory suppliers');
  }
};
