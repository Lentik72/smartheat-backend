/**
 * Migration 050: Add Northern NH & Lakes Region Suppliers
 *
 * Fills coverage gaps for Northern NH (Grafton/Coos County) and Lakes Region (Belknap County)
 *
 * All suppliers verified COD/will-call from their OWN websites:
 * - Harris Energy: "Will-Call Delivery – You monitor your own level... call us when you need a delivery"
 * - Presby Energy: "COD – Cash on Delivery" and "Will-Call for Delivery"
 * - Dutile & Sons: "TODAY'S 10 DAY CASH PRICES" + separate Auto Delivery Application = will-call default
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '050-add-northern-nh-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // HARRIS ENERGY - Littleton, NH (Northern NH)
      // ============================================
      {
        id: uuidv4(),
        name: 'Harris Energy',
        slug: 'harris-energy',
        phone: '(603) 444-2774',
        email: null,
        website: 'https://harrisenergyinc.com',
        addressLine1: '456 West Main Street',
        city: 'Littleton',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // Grafton County NH
          '03561', // Littleton
          '03574', // Bethlehem
          '03580', // Franconia, Easton
          '03585', // Lisbon, Lyman, Landaff
          '03586', // Sugar Hill
          '03595', // Twin Mountain
          '03598', // Whitefield, Dalton
          '03740', // Bath
          '03785', // Woodsville
        ]),
        serviceCities: JSON.stringify([
          'Littleton', 'Bethlehem', 'Bretton Woods', 'Dalton', 'Easton',
          'Franconia', 'Landaff', 'Lyman', 'Lisbon', 'Sugar Hill',
          'Bath', 'Twin Mountain', 'Whitefield', 'Woodsville'
        ]),
        serviceCounties: JSON.stringify(['Grafton', 'Coos']),
        serviceAreaRadius: 30,
        lat: 44.3064,
        lng: -71.7701,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // Review mentioned arrival "within the hour" for emergency
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'check', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
        minimumGallons: 100,
        seniorDiscount: true, // $0.03/gal discount for 65+
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // PRESBY ENERGY - Franconia, NH (Northern NH)
      // ============================================
      {
        id: uuidv4(),
        name: 'Presby Energy',
        slug: 'presby-energy',
        phone: '(603) 823-5298',
        email: null,
        website: 'https://presbyenergy.com',
        addressLine1: '244 Main Street',
        city: 'Franconia',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // Grafton County NH
          '03561', // Littleton
          '03574', // Bethlehem
          '03580', // Franconia, Easton
          '03585', // Lisbon, Lyman, Landaff
          '03586', // Sugar Hill
          '03595', // Twin Mountain
          '03598', // Whitefield, Dalton
        ]),
        serviceCities: JSON.stringify([
          'Bethlehem', 'Littleton', 'Franconia', 'Sugar Hill', 'Easton',
          'Lisbon', 'Lyman', 'Landaff', 'Twin Mountain', 'Whitefield', 'Dalton'
        ]),
        serviceCounties: JSON.stringify(['Grafton', 'Coos']),
        serviceAreaRadius: 25,
        lat: 44.2273,
        lng: -71.7476,
        hoursWeekday: null, // Delivery schedule by day/route
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour burner service
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'check', 'cash']), // Visa, MC, Discover, Amex
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'propane']),
        minimumGallons: 125,
        seniorDiscount: null,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // DUTILE & SONS - Laconia, NH (Lakes Region)
      // ============================================
      {
        id: uuidv4(),
        name: 'Dutile & Sons Oil Company',
        slug: 'dutile-sons-oil',
        phone: '(603) 524-5217',
        email: null,
        website: 'https://www.dutileoil.net',
        addressLine1: '242 Messer Street',
        city: 'Laconia',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          // Belknap County NH
          '03246', // Laconia
          '03247', // Laconia
          '03220', // Belmont
          '03226', // Center Harbor
          '03237', // Gilmanton
          '03249', // Gilford
          '03253', // Meredith
          '03254', // Moultonborough
          '03256', // New Hampton
          '03269', // Sanbornton
          '03809', // Alton
          '03810', // Alton Bay
          // Merrimack County NH
          '03235', // Franklin
          '03276', // Tilton, Northfield
          '03242', // Hill
        ]),
        serviceCities: JSON.stringify([
          'Laconia', 'Belmont', 'Center Harbor', 'Franklin', 'Gilford',
          'Gilmanton', 'Hill', 'Meredith', 'Moultonborough', 'New Hampton',
          'Northfield', 'Sanbornton', 'Tilton', 'Alton'
        ]),
        serviceCounties: JSON.stringify(['Belknap', 'Merrimack']),
        serviceAreaRadius: 25,
        lat: 43.5278,
        lng: -71.4704,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // "employees are pleased to serve you day and night"
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'check', 'cash']), // Online payment portal
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene']), // Also coal
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

    console.log('[Migration 050] Added 3 Northern NH & Lakes Region suppliers');

    // Safety: Ensure allowPriceDisplay is correctly set
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = true
      WHERE slug IN ('harris-energy', 'presby-energy', 'dutile-sons-oil')
    `);

    console.log('[Migration 050] ✅ Northern NH & Lakes Region coverage complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('harris-energy', 'presby-energy', 'dutile-sons-oil')
    `);
    console.log('[Migration 050] Rolled back Northern NH & Lakes Region suppliers');
  }
};
