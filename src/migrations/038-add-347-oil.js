/**
 * Migration 038: Add 347 Oil (Alex and Sons)
 * Northern Westchester County, NY - COD confirmed
 * New company founded 2024, owner has decades of industry experience
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '038-add-347-oil',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: '347 Oil',
      slug: '347-oil',
      phone: '(914) 522-6291',
      email: null,
      website: 'https://sites.google.com/view/347oil/home',
      addressLine1: null, // Not provided
      city: 'Bedford',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        // Bedford area
        '10506', // Bedford
        '10507', // Bedford Hills
        '10536', // Katonah
        // Lewisboro area
        '10590', // South Salem
        '10518', // Cross River
        '10526', // Goldens Bridge
        // North Salem / Pound Ridge
        '10560', // North Salem
        '10578', // Purdys
        '10576', // Pound Ridge
        // Somers area
        '10589', // Somers
        '10501', // Amawalk
        // Yorktown area
        '10598', // Yorktown Heights
        '10588', // Shrub Oak
        '10547', // Mohegan Lake
        '10535', // Jefferson Valley
        // Cortlandt area
        '10520', // Croton-on-Hudson
        '10511', // Buchanan
        '10548', // Montrose
        '10567', // Cortlandt Manor
        // New Castle area
        '10514', // Chappaqua
        '10546', // Millwood
        // Mount Kisco
        '10549'  // Mount Kisco
      ]),
      serviceCities: JSON.stringify([
        'Bedford', 'Bedford Hills', 'Bedford Village', 'Katonah',
        'South Salem', 'Cross River', 'Goldens Bridge', 'Waccabuc',
        'North Salem', 'Purdys', 'Pound Ridge',
        'Somers', 'Amawalk', 'Shenorock', 'Lincolndale', 'Baldwin Place',
        'Yorktown', 'Yorktown Heights', 'Crompond', 'Jefferson Valley', 'Shrub Oak', 'Mohegan Lake',
        'Croton-on-Hudson', 'Buchanan', 'Montrose', 'Verplanck', 'Cortlandt Manor',
        'Chappaqua', 'Millwood', 'New Castle',
        'Mount Kisco'
      ]),
      serviceCounties: JSON.stringify(['Westchester']),
      serviceAreaRadius: 20,
      lat: 41.2048,
      lng: -73.6437,
      paymentMethods: JSON.stringify(['cash']), // COD confirmed
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      hoursWeekday: null, // Not specified on website
      hoursSaturday: null,
      hoursSunday: null,
      weekendDelivery: 'unknown',
      emergencyDelivery: 'unknown',
      emergencyPhone: null,
      seniorDiscount: 'unknown',
      notes: null,
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
        allowPriceDisplay: supplier.allowPriceDisplay === true
      }
    });

    console.log('✅ Migration 038: Added 347 Oil (Northern Westchester)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = '347-oil'`);
    console.log('✅ Migration 038 rolled back');
  }
};
