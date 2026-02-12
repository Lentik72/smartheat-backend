/**
 * Migration 045: Add CN Brown Energy (fix for 044)
 * CN Brown Energy didn't insert in migration 044 - adding explicitly
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '045-add-cn-brown-energy',

  async up(sequelize) {
    // First check if it exists
    const [existing] = await sequelize.query(
      `SELECT id, slug FROM suppliers WHERE slug = 'cn-brown-energy' OR name ILIKE '%cn brown%'`
    );

    if (existing && existing.length > 0) {
      console.log('⚠️  CN Brown Energy already exists:', existing[0]);
      return;
    }

    const supplier = {
      id: uuidv4(),
      name: 'CN Brown Energy',
      slug: 'cn-brown-energy',
      phone: '(207) 989-4367',
      email: null,
      website: 'https://www.cnbrown.com',
      addressLine1: '341 Wilson St',
      city: 'Brewer',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04401', '04402', '04412', '04468', '04473', '04429', '04444', '04472',
        '04419', '04456', '04449', '04450', '04411', '04428', '04434', '04488',
        '04427', '04430', '04410', '04422', '04969', '04461', '04457', '04462',
        '04463', '04448', '04453', '04459', '04460', '04418', '04930'
      ]),
      serviceCities: JSON.stringify([
        'Bangor', 'Brewer', 'Old Town', 'Orono', 'Holden', 'Hampden',
        'Orrington', 'Carmel', 'Levant', 'Hudson', 'Kenduskeag', 'Bradley',
        'Eddington', 'Etna', 'Stetson', 'Corinth', 'East Corinth', 'Bradford',
        'Charleston', 'Plymouth', 'Newport', 'Lincoln', 'Millinocket',
        'East Millinocket', 'Howland', 'Lagrange', 'Mattawamkeag', 'Medway',
        'Clifton', 'Dexter'
      ]),
      serviceCounties: JSON.stringify(['Penobscot', 'Piscataquis']),
      serviceAreaRadius: 50,
      lat: 44.7912,
      lng: -68.7420,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: null,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      weekendDelivery: 'no',
      emergencyDelivery: 'no',
      emergencyPhone: null,
      seniorDiscount: 'yes',
      notes: null,
      active: true,
      verified: false,
      allowPriceDisplay: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
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
      `, {
        replacements: supplier
      });
      console.log('✅ Migration 045: Added CN Brown Energy (Brewer, ME)');
    } catch (err) {
      console.error('❌ Migration 045 failed:', err.message);
      throw err; // Re-throw to see the actual error
    }
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'cn-brown-energy'`);
    console.log('✅ Migration 045 rolled back');
  }
};
