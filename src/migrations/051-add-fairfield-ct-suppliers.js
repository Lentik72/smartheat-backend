/**
 * Migration 051: Add Fairfield County CT Suppliers
 *
 * Fills coverage gaps in southwestern CT (Fairfield County) and cross-border NY (Westchester)
 *
 * All suppliers verified COD/will-call from their OWN websites:
 * - Park City Fuel: "CASH ON DELIVERY" explicit navigation link
 * - Westmore Oil Express: On-demand ordering, contracts redirected to separate "Westmore Fuel" site
 * - Piro Petroleum: "we provide premium heating oil on a will call basis"
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '051-add-fairfield-ct-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // PARK CITY FUEL - Bridgeport, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'Park City Fuel',
        slug: 'park-city-fuel',
        phone: '(203) 330-8980',
        email: 'info@parkcityfuel.com',
        website: 'https://parkcityfuel.com',
        addressLine1: '335 Charles Street',
        city: 'Bridgeport',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County CT
          '06401', // Ansonia
          '06601', '06602', '06604', '06605', '06606', '06607', '06608', '06610', // Bridgeport
          '06820', // Darien
          '06418', // Derby
          '06612', // Easton
          '06824', '06825', // Fairfield
          '06484', // Shelton (Huntington)
          '06460', '06461', // Milford
          '06468', // Monroe
          '06840', // New Canaan
          '06470', '06482', // Newtown, Sandy Hook
          '06850', '06851', '06853', '06854', '06855', // Norwalk
          '06477', // Orange
          '06478', // Oxford
          '06896', // Redding
          '06877', // Ridgefield
          '06483', // Seymour
          '06484', // Shelton
          '06614', '06615', // Stratford
          '06611', // Trumbull
          '06883', // Weston
          '06880', '06881', // Westport
          '06897', // Wilton
          // New Haven County CT
          '06525', // Woodbridge
          '06801', // Bethel
        ]),
        serviceCities: JSON.stringify([
          'Ansonia', 'Bethel', 'Bridgeport', 'Darien', 'Derby', 'Easton', 'Fairfield',
          'Huntington', 'Milford', 'Monroe', 'New Canaan', 'Newtown', 'Norwalk', 'Orange',
          'Oxford', 'Redding', 'Ridgefield', 'Sandy Hook', 'Seymour', 'Shelton', 'Southport',
          'Stamford', 'Stratford', 'Trumbull', 'Weston', 'Westport', 'Wilton', 'Woodbridge'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'New Haven']),
        serviceAreaRadius: 30,
        lat: 41.1792,
        lng: -73.1894,
        hoursWeekday: '7:30 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: null, // Not specified
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['cash']), // COD
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // No price on site
        notes: null,
        active: true,
      },

      // ============================================
      // WESTMORE OIL EXPRESS - Greenwich, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'Westmore Oil Express',
        slug: 'westmore-oil-express',
        phone: '(203) 356-9665',
        email: 'info@westmoreoilexpress.com',
        website: 'https://www.westmoreoilexpress.com',
        addressLine1: '86 North Water Street',
        city: 'Greenwich',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County CT
          '06807', // Cos Cob
          '06820', // Darien
          '06830', '06831', // Greenwich
          '06840', // New Canaan
          '06878', // Riverside
          '06897', // Wilton
          '06901', '06902', '06903', '06905', '06906', '06907', // Stamford
          // Westchester County NY
          '10504', // Armonk
          '10506', // Bedford
          '10514', // Chappaqua
          '10523', // Elmsford
          '10528', // Harrison
          '10532', // Hawthorne
          '10536', // Katonah
          '10538', // Larchmont
          '10543', // Mamaroneck
          '10549', // Mount Kisco
          '10801', '10802', '10803', '10804', '10805', // New Rochelle
          '10570', // Pleasantville
          '10573', // Port Chester
          '10576', // Pound Ridge
          '10577', // Purchase
          '10580', // Rye
          '10573', // Rye Brook (shares with Port Chester)
          '10594', // Thornwood
          '10595', // Valhalla
          '10604', '10605', '10606', '10607', // White Plains
          '10604', // West Harrison
        ]),
        serviceCities: JSON.stringify([
          // CT
          'Cos Cob', 'Darien', 'Greenwich', 'New Canaan', 'Riverside', 'Stamford', 'Wilton',
          // NY
          'Armonk', 'Bedford', 'Chappaqua', 'Elmsford', 'Harrison', 'Hawthorne', 'Katonah',
          'Larchmont', 'Mamaroneck', 'Mount Kisco', 'New Rochelle', 'Pleasantville',
          'Port Chester', 'Pound Ridge', 'Purchase', 'Rye', 'Rye Brook', 'Thornwood',
          'Valhalla', 'White Plains', 'West Harrison'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Westchester']),
        serviceAreaRadius: 25,
        lat: 41.0262,
        lng: -73.6282,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null, // Yelp says 8AM-12PM but site says closed
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour emergency via (888) 696-4031
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'debit']),
        fuelTypes: JSON.stringify(['heating_oil', 'bioheat']), // Bioheat Plus biodiesel blend
        minimumGallons: 150,
        seniorDiscount: null,
        allowPriceDisplay: false, // Price behind quote form
        notes: null,
        active: true,
      },

      // ============================================
      // PIRO PETROLEUM - Norwalk, CT
      // ============================================
      {
        id: uuidv4(),
        name: 'Piro Petroleum',
        slug: 'piro-petroleum',
        phone: '(203) 846-3835',
        email: null,
        website: 'https://www.piroinc.com',
        addressLine1: '6 Honey Hill Road',
        city: 'Norwalk',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Norwalk + 25 mile radius - Fairfield County CT
          '06850', '06851', '06853', '06854', '06855', // Norwalk
          '06820', // Darien
          '06824', '06825', // Fairfield
          '06830', '06831', // Greenwich
          '06840', // New Canaan
          '06870', // Old Greenwich
          '06878', // Riverside
          '06901', '06902', '06903', '06905', '06906', '06907', // Stamford
          '06880', '06881', // Westport
          '06883', // Weston
          '06897', // Wilton
          '06614', '06615', // Stratford
          '06611', // Trumbull
          '06604', '06605', '06606', // Bridgeport
          // Westchester County NY (within 25 mi)
          '10573', // Port Chester
          '10580', // Rye
          '10801', // New Rochelle
        ]),
        serviceCities: JSON.stringify([
          'Norwalk', 'Darien', 'Fairfield', 'Greenwich', 'New Canaan', 'Old Greenwich',
          'Riverside', 'Stamford', 'Westport', 'Weston', 'Wilton', 'Stratford', 'Trumbull',
          'Bridgeport', 'Port Chester', 'Rye', 'New Rochelle'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Westchester']),
        serviceAreaRadius: 25,
        lat: 41.1177,
        lng: -73.4082,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: '8:00 AM - 5:00 PM', // Mon-Sat same hours
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour emergency service
        weekendDelivery: true, // Open Saturday
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // Uses Droplet ordering, no public price
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

    console.log('[Migration 051] Added 3 Fairfield County CT suppliers');

    // Safety: Ensure allowPriceDisplay is correctly set to FALSE (no public prices)
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN ('park-city-fuel', 'westmore-oil-express', 'piro-petroleum')
    `);

    console.log('[Migration 051] ✅ Fairfield County CT coverage complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('park-city-fuel', 'westmore-oil-express', 'piro-petroleum')
    `);
    console.log('[Migration 051] Rolled back Fairfield County CT suppliers');
  }
};
