/**
 * Migration 040: Add Jennison Fuels
 * Central NY COD supplier - West Winfield area
 * "We accept cash, check or credit cards at the time of delivery, no hidden fees"
 * Listed as cash heating oil company on aggregator sites
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '040-add-jennison-fuels',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Jennison Fuels',
      slug: 'jennison-fuels',
      phone: '(315) 855-5020',
      email: null,
      website: 'https://www.jennisonfuels.com',
      addressLine1: '107 Burrows Road',
      city: 'West Winfield',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        // Otsego County
        '13491', // West Winfield
        '13439', // Richfield Springs
        '13457', // Schuyler Lake
        '13468', // Springfield Center
        // Herkimer County
        '13357', // Ilion/Cedarville/Litchfield
        '13361', // Jordanville
        '13322', // Clayville
        // Madison County
        '13314', // Brookfield
        '13364', // Leonardsville
        '13485', // West Edmeston
        '13335', // Edmeston
        '13313', // Bridgewater
        // Oneida County
        '13318', // Cassville
        '13456'  // Sauquoit
      ]),
      serviceCities: JSON.stringify([
        'West Winfield', 'Richfield Springs', 'Bridgewater', 'Cassville',
        'Sauquoit', 'Brookfield', 'Leonardsville', 'West Edmeston',
        'Edmeston', 'Clayville', 'Schuyler Lake', 'Springfield Center',
        'Jordanville', 'Cedarville', 'Litchfield'
      ]),
      serviceCounties: JSON.stringify(['Otsego', 'Herkimer', 'Madison', 'Oneida']),
      serviceAreaRadius: 25,
      lat: 42.8834,
      lng: -75.1892,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
      minimumGallons: 100,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      weekendDelivery: true,
      emergencyDelivery: 'unknown',
      emergencyPhone: null,
      seniorDiscount: 'unknown',
      active: true,
      verified: false,
      allowPriceDisplay: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, slug, phone, email, website, address_line1, city, state,
        postal_codes_served, service_cities, service_counties, service_area_radius,
        lat, lng, payment_methods, fuel_types, minimum_gallons,
        hours_weekday, hours_saturday, hours_sunday, weekend_delivery, emergency_delivery,
        emergency_phone, senior_discount, notes, active, verified, allow_price_display,
        created_at, updated_at
      ) VALUES (
        :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
        :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
        :lat, :lng, :paymentMethods, :fuelTypes, :minimumGallons,
        :hoursWeekday, :hoursSaturday, :hoursSunday, :weekendDelivery, :emergencyDelivery,
        :emergencyPhone, :seniorDiscount, :notes, :active, :verified, :allowPriceDisplay,
        :createdAt, :updatedAt
      )
      ON CONFLICT (slug) DO NOTHING
    `, {
      replacements: {
        ...supplier,
        notes: null,
        weekendDelivery: supplier.weekendDelivery === true ? 'yes' : 'no',
        allowPriceDisplay: supplier.allowPriceDisplay === true
      }
    });

    console.log('✅ Migration 040: Added Jennison Fuels (West Winfield, NY)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'jennison-fuels'`);
    console.log('✅ Migration 040 rolled back');
  }
};
