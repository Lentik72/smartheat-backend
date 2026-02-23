/**
 * Migration 072: Add Westchester/Putnam Suppliers
 *
 * Adds 2 verified COD/will-call suppliers serving Westchester and Putnam counties:
 *
 * 1. Check Oil & Propane (Peekskill, NY) - "CASH ON DELIVERY (COD)" on own site
 * 2. Marshall Oil Company (Pound Ridge, NY) - "Will Call Delivery" on own site
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '072-add-westchester-putnam-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // 1. CHECK OIL & PROPANE - Peekskill, NY (Westchester County)
      // "CASH ON DELIVERY (COD)" on /payment-options.html
      // ============================================
      {
        id: uuidv4(),
        name: 'Check Oil & Propane',
        slug: 'check-oil-and-propane',
        phone: '(914) 736-6573',
        email: 'checkoilpeekskill@gmail.com',
        website: 'https://www.checkoilllc.com',
        addressLine1: '701 North Division Street',
        city: 'Peekskill',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Westchester County
          '10566', // Peekskill
          '10511', // Buchanan
          '10567', // Cortlandt Manor
          '10517', // Crompond
          '10547', // Mohegan Lake
          '10548', // Montrose
          '10596', // Verplanck
          '10537', // Lake Peekskill
          '10520', // Croton on Hudson
          '10562', // Ossining
          '10598', // Yorktown Heights
          '10588', // Shrub Oak
          '10589', // Somers
          '10536', // Katonah
          '10506', // Bedford
          '10507', // Bedford Hills
          '10549', // Mount Kisco
          '10514', // Chappaqua
          '10504', // Armonk
          '10510', // Briarcliff Manor
          '10570', // Pleasantville
          '10595', // Valhalla
          '10532', // Hawthorne
          '10591', // Sleepy Hollow / Tarrytown
          '10533', // Irvington
          '10583', // Scarsdale
          '10546', // Millwood
          '10526', // Goldens Bridge
          '10590', // South Salem
          '10576', // Pound Ridge
          '10578', // Purdys
          '10501', // Amawalk
          '10505', // Baldwin Place
          '10527', // Granite Springs
          '10587', // Shenorock
          '10540', // Lincolndale / Lake Lincolndale
          '10521', // Crugers
          // Putnam County
          '10541', // Mahopac
          '10512', // Carmel / Lake Carmel
          '10509', // Brewster / Southeast
          '10516', // Cold Spring / Nelsonville / Philipstown
          '10524', // Garrison
          '10579', // Putnam Valley
          '10535', // Jefferson Valley
          '12563', // Patterson
        ]),
        serviceCities: JSON.stringify([
          'Peekskill', 'Buchanan', 'Cortlandt Manor', 'Crompond', 'Mohegan Lake',
          'Montrose', 'Verplanck', 'Lake Peekskill', 'Croton on Hudson', 'Ossining',
          'Yorktown Heights', 'Shrub Oak', 'Somers', 'Katonah', 'Bedford',
          'Bedford Hills', 'Mount Kisco', 'Chappaqua', 'Armonk', 'Briarcliff Manor',
          'Pleasantville', 'Valhalla', 'Hawthorne', 'Sleepy Hollow', 'Tarrytown',
          'Irvington', 'Scarsdale', 'Millwood', 'Goldens Bridge', 'South Salem',
          'Pound Ridge', 'Purdys', 'Amawalk', 'Baldwin Place', 'Granite Springs',
          'Shenorock', 'Lincolndale', 'Lake Lincolndale', 'Crugers',
          'Mahopac', 'Carmel', 'Lake Carmel', 'Brewster', 'Cold Spring',
          'Garrison', 'Putnam Valley', 'Jefferson Valley', 'Patterson',
          'Nelsonville', 'Philipstown', 'Southeast'
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Putnam']),
        serviceAreaRadius: 25,
        lat: 41.2901,
        lng: -73.9204,
        hoursWeekday: '7:00 AM - 4:00 PM',
        hoursSaturday: '7:00 AM - 4:00 PM',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'propane']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },

      // ============================================
      // 2. MARSHALL OIL COMPANY - Pound Ridge, NY (Westchester County)
      // "Will Call Delivery" section on /heating-oil/heating-oil-delivery/
      // "order heating oil as needed" — in business since 1938, BBB A+ rated
      // ============================================
      {
        id: uuidv4(),
        name: 'Marshall Oil Company',
        slug: 'marshall-oil-company',
        phone: '(914) 764-5766',
        email: null,
        website: 'https://wp.marshalloilco.com',
        addressLine1: '130 Salem Rd',
        city: 'Pound Ridge',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Westchester County (full service)
          '10504', // Armonk
          '10506', // Bedford / Banksville
          '10507', // Bedford Hills
          '10514', // Chappaqua
          '10518', // Cross River
          '10519', // Croton Falls
          '10526', // Goldens Bridge
          '10536', // Katonah
          '10549', // Mount Kisco
          '10560', // North Salem
          '10576', // Pound Ridge
          '10578', // Purdys
          '10589', // Somers
          '10590', // South Salem / Vista
          // Fairfield County, CT (full service)
          '06830', // Greenwich
          '06831', // Greenwich
          '06840', // New Canaan
          '06903', // North Stamford
          '06877', // Ridgefield
          // Limited service areas
          '10509', // Brewster
          '10598', // Yorktown Heights
          '06897', // Wilton, CT
        ]),
        serviceCities: JSON.stringify([
          'Armonk', 'Banksville', 'Bedford', 'Bedford Hills', 'Chappaqua',
          'Cross River', 'Croton Falls', 'Goldens Bridge', 'Katonah',
          'Mount Kisco', 'North Salem', 'Pound Ridge', 'Purdys', 'Somers',
          'South Salem', 'Vista', 'Greenwich', 'New Canaan', 'North Stamford',
          'Ridgefield', 'Brewster', 'Yorktown Heights', 'Wilton'
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Fairfield', 'Putnam']),
        serviceAreaRadius: 20,
        lat: 41.2068,
        lng: -73.5757,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
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

    console.log('[Migration 072] Added 2 Westchester/Putnam suppliers (Check Oil & Propane, Marshall Oil)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('check-oil-and-propane', 'marshall-oil-company')
    `);
    console.log('[Migration 072] Rolled back Westchester/Putnam suppliers');
  }
};
