/**
 * Migration 049: Add Cheshire County NH Suppliers
 *
 * Fills coverage gap for West Chesterfield, NH (03466) and surrounding Cheshire County
 *
 * All suppliers verified COD/will-call from their OWN websites:
 * - Patten Energy: "will call service", "payment required at time of delivery"
 * - Bob's Fuel Company: "Will Call Delivery Options"
 * - Discount Oil of Keene: Public pricing with 100 gal min (implied COD)
 * - Swanzey Oil: "Order Online 24/7", "Pay by cash, check or credit card"
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '049-add-cheshire-nh-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // PATTEN ENERGY - Keene, NH
      // ============================================
      {
        id: uuidv4(),
        name: 'Patten Energy',
        slug: 'patten-energy',
        phone: '(603) 352-7444',
        email: null,
        website: 'https://pattenenergynh.com',
        addressLine1: '180 Emerald Street',
        city: 'Keene',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // Cheshire County NH
          '03431', // Keene, North Swanzey, Roxbury, Surry
          '03441', // Ashuelot
          '03443', // Chesterfield
          '03444', // Dublin
          '03445', // Sullivan
          '03446', // Swanzey
          '03447', // Fitzwilliam
          '03448', // Gilsum
          '03450', // Harrisville
          '03451', // Hinsdale
          '03452', // Jaffrey
          '03455', // Marlborough
          '03456', // Marlow
          '03457', // Nelson
          '03462', // Spofford
          '03464', // Stoddard
          '03465', // Troy
          '03466', // West Chesterfield
          '03467', // Westmoreland
          '03469', // West Swanzey
          '03470', // Winchester
          '03601', // Alstead
          '03608', // Drewsville
          '03609', // Walpole
          // Hillsborough County NH
          '03449', // Hancock
          '03468', // West Peterborough
        ]),
        serviceCities: JSON.stringify([
          'Keene', 'Ashuelot', 'Chesterfield', 'Dublin', 'Sullivan', 'Swanzey',
          'Fitzwilliam', 'Gilsum', 'Harrisville', 'Hinsdale', 'Jaffrey',
          'Marlborough', 'Marlow', 'Nelson', 'Spofford', 'Stoddard', 'Troy',
          'West Chesterfield', 'Westmoreland', 'West Swanzey', 'Winchester',
          'Alstead', 'Drewsville', 'Walpole', 'Hancock', 'West Peterborough'
        ]),
        serviceCounties: JSON.stringify(['Cheshire', 'Hillsborough']),
        serviceAreaRadius: 25,
        lat: 42.9356,
        lng: -72.2784,
        hoursWeekday: null, // Owner answers 24/7
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true, // 24/7 availability
        paymentMethods: JSON.stringify(['credit_card', 'check', 'cash', 'money_order']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        seniorDiscount: true, // 5¢ off for seniors
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // BOB'S FUEL COMPANY - Winchester, NH (Tri-State)
      // ============================================
      {
        id: uuidv4(),
        name: "Bob's Fuel Company",
        slug: 'bobs-fuel-company',
        phone: '(603) 239-6721',
        email: null,
        website: 'https://bobsfuelcompany.com',
        addressLine1: '21 Warwick Road',
        city: 'Winchester',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // NH - Cheshire County
          '03431', // Keene
          '03441', // Ashuelot
          '03443', // Chesterfield
          '03446', // Swanzey
          '03447', // Fitzwilliam
          '03448', // Gilsum
          '03450', // Harrisville
          '03451', // Hinsdale
          '03452', // Jaffrey
          '03455', // Marlborough
          '03461', // Rindge
          '03462', // Spofford
          '03465', // Troy
          '03466', // West Chesterfield
          '03467', // Westmoreland
          '03469', // West Swanzey
          '03470', // Winchester
          '03601', // Alstead
          '03609', // Walpole
          '03467', // Westmoreland
          // MA - Franklin County
          '01301', // Greenfield
          '01302', // Greenfield
          '01337', // Bernardston
          '01340', // Colrain
          '01344', // Erving
          '01354', // Gill
          '01360', // Northfield
          '01367', // Rowe
          '01370', // Shelburne Falls
          '01376', // Turners Falls
          '01351', // Montague
          '01346', // Heath
          '01368', // Royalston
          '01378', // Warwick
          '01379', // Wendell
          // VT - Windham County
          '05301', // Brattleboro
          '05302', // Brattleboro
          '05304', // Brattleboro
          '05341', // Dummerston
          '05346', // Putney
          '05354', // Guilford
          '05363', // Vernon
        ]),
        serviceCities: JSON.stringify([
          // NH
          'Alstead', 'Ashuelot', 'Chesterfield', 'Fitzwilliam', 'Gilsum',
          'Harrisville', 'Hinsdale', 'Jaffrey', 'Keene', 'Marlborough',
          'Richmond', 'Rindge', 'Roxbury', 'Spofford', 'Sullivan', 'Surry',
          'Swanzey', 'Troy', 'Walpole', 'West Chesterfield', 'Westmoreland',
          'West Swanzey', 'Winchester',
          // MA
          'Bernardston', 'Colrain', 'Erving', 'Gill', 'Greenfield', 'Leyden',
          'Millers Falls', 'Montague', 'Northfield', 'Royalston', 'Shelburne',
          'Turners Falls', 'Warwick',
          // VT
          'Brattleboro', 'Dummerston', 'Guilford', 'Vernon'
        ]),
        serviceCounties: JSON.stringify(['Cheshire', 'Franklin', 'Windham']),
        serviceAreaRadius: 35,
        lat: 42.7732,
        lng: -72.3820,
        hoursWeekday: '8:15 AM - 5:00 PM', // Oct-Mar hours
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // Fees apply
        weekendDelivery: true, // $200 fee
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check', 'paypal']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: 100,
        seniorDiscount: true, // $0.02 off for 65+
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // DISCOUNT OIL OF KEENE - Keene, NH
      // ============================================
      {
        id: uuidv4(),
        name: 'Discount Oil of Keene',
        slug: 'discount-oil-of-keene',
        phone: '(603) 352-0583',
        email: null,
        website: 'https://discountoilofkeene.com',
        addressLine1: '11 Sheridan Avenue',
        city: 'Keene',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // NH - Cheshire County
          '03431', // Keene
          '03441', // Ashuelot
          '03443', // Chesterfield
          '03444', // Dublin
          '03445', // Sullivan
          '03446', // Swanzey
          '03447', // Fitzwilliam
          '03448', // Gilsum
          '03450', // Harrisville
          '03451', // Hinsdale
          '03452', // Jaffrey
          '03455', // Marlborough
          '03456', // Marlow
          '03457', // Nelson
          '03461', // Rindge
          '03462', // Spofford
          '03464', // Stoddard
          '03465', // Troy
          '03466', // West Chesterfield
          '03467', // Westmoreland
          '03469', // West Swanzey
          '03470', // Winchester
          '03601', // Alstead
          '03608', // Drewsville
          '03609', // Walpole
          // NH - Hillsborough County
          '03449', // Hancock
          '03458', // Peterborough
          '03468', // West Peterborough
          // NH - Sullivan County
          '03602', // Acworth
          '03603', // South Acworth
          '03607', // Charlestown
          // VT - Windham County
          '05301', // Brattleboro
          '05341', // Dummerston
          '05346', // Putney
          '05354', // Guilford
          '05355', // Newfane
          '05356', // South Newfane
          '05359', // Townshend
          '05363', // Vernon
          '05361', // Westminster
        ]),
        serviceCities: JSON.stringify([
          // NH
          'Keene', 'West Swanzey', 'Marlborough', 'Swanzey', 'Spofford',
          'Sullivan', 'Troy', 'Gilsum', 'Harrisville', 'Westmoreland',
          'Nelson', 'Chesterfield', 'Dublin', 'Winchester', 'Hinsdale',
          'Jaffrey', 'West Chesterfield', 'Ashuelot', 'Alstead', 'Walpole',
          'Fitzwilliam', 'Marlow', 'Stoddard', 'Rindge', 'Peterborough',
          'Hancock', 'Acworth', 'Charlestown',
          // VT
          'Brattleboro', 'Putney', 'Westminster', 'Dummerston', 'Vernon',
          'Newfane', 'Townshend', 'Guilford'
        ]),
        serviceCounties: JSON.stringify(['Cheshire', 'Hillsborough', 'Sullivan', 'Windham']),
        serviceAreaRadius: 40,
        lat: 42.9340,
        lng: -72.2782,
        hoursWeekday: null, // Not specified
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour technicians on call
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'check', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: 100,
        seniorDiscount: null,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // SWANZEY OIL - West Swanzey, NH
      // ============================================
      {
        id: uuidv4(),
        name: 'Swanzey Oil',
        slug: 'swanzey-oil',
        phone: '(603) 357-5400',
        email: null,
        website: 'https://swanzeyoil.com',
        addressLine1: '919 West Swanzey Road',
        city: 'West Swanzey',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // Cheshire County NH
          '03431', // Keene
          '03441', // Ashuelot
          '03443', // Chesterfield
          '03444', // Dublin
          '03445', // Sullivan
          '03446', // Swanzey
          '03447', // Fitzwilliam
          '03448', // Gilsum
          '03450', // Harrisville
          '03451', // Hinsdale
          '03452', // Jaffrey
          '03455', // Marlborough
          '03456', // Marlow
          '03457', // Nelson
          '03461', // Rindge
          '03462', // Spofford
          '03464', // Stoddard
          '03465', // Troy
          '03466', // West Chesterfield
          '03467', // Westmoreland
          '03469', // West Swanzey
          '03470', // Winchester
          '03601', // Alstead
          '03608', // Drewsville
          '03609', // Walpole
        ]),
        serviceCities: JSON.stringify([
          'Keene', 'Ashuelot', 'Chesterfield', 'Dublin', 'Sullivan', 'Swanzey',
          'Fitzwilliam', 'Gilsum', 'Harrisville', 'Hinsdale', 'Jaffrey',
          'Marlborough', 'Marlow', 'Nelson', 'Rindge', 'Spofford', 'Stoddard',
          'Troy', 'West Chesterfield', 'Westmoreland', 'West Swanzey',
          'Winchester', 'Alstead', 'Drewsville', 'Walpole'
        ]),
        serviceCounties: JSON.stringify(['Cheshire']),
        serviceAreaRadius: 25,
        lat: 42.8640,
        lng: -72.3173,
        hoursWeekday: '7:30 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: null, // Online ordering 24/7
        paymentMethods: JSON.stringify(['credit_card', 'check', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
        minimumGallons: null, // Not specified
        seniorDiscount: null,
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
        }
      });
    }

    console.log('[Migration 049] Added 4 Cheshire County NH suppliers');

    // Safety: Ensure allowPriceDisplay is correctly set
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = true
      WHERE slug IN ('patten-energy', 'bobs-fuel-company', 'discount-oil-of-keene', 'swanzey-oil')
    `);

    console.log('[Migration 049] ✅ Cheshire County NH coverage complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('patten-energy', 'bobs-fuel-company', 'discount-oil-of-keene', 'swanzey-oil')
    `);
    console.log('[Migration 049] Rolled back Cheshire County NH suppliers');
  }
};
