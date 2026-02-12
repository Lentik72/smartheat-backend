/**
 * Migration 044: Add Bangor ME Area COD Suppliers
 * - Sinclair's Home Heating (Hermon, ME) - Penobscot County
 * - CN Brown Energy (Brewer, ME) - Penobscot County
 * - Hopkins Energy (Hermon, ME) - Penobscot County
 * - D.A. Pearson Heating Oils (Hermon, ME) - Penobscot County
 * - Fettinger Fuels (Exeter, ME) - Penobscot County, scrapable prices
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '044-add-bangor-me-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // SINCLAIR'S HOME HEATING - Hermon, ME
      // ============================================
      {
        id: uuidv4(),
        name: "Sinclair's Home Heating",
        slug: 'sinclairs-home-heating',
        phone: '(207) 848-2036',
        email: null,
        website: 'https://www.sinclairshomeheating.com',
        addressLine1: '48 Billings Rd',
        city: 'Hermon',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Penobscot County - Core service area
          '04401', // Bangor
          '04402', // Bangor
          '04412', // Brewer
          '04468', // Old Town
          '04473', // Orono
          '04429', // Holden
          '04444', // Hampden
          '04472', // Orrington
          '04419', // Carmel
          '04456', // Levant
          '04449', // Hudson
          '04450', // Kenduskeag
          '04411', // Bradley
          '04428', // Eddington
          '04434', // Etna
          '04488', // Stetson
          '04427', // Corinth
          '04430', // East Corinth
          '04410', // Bradford
          '04422', // Charleston
          '04969', // Plymouth
          '04461', // Newport
          '04418', // Clifton
          '04457', // Lincoln (partial)
          '04448', // Howland (partial)
          '04453'  // Lagrange
        ]),
        serviceCities: JSON.stringify([
          'Bangor', 'Hermon', 'Brewer', 'Old Town', 'Orono', 'Holden',
          'Hampden', 'Orrington', 'Carmel', 'Levant', 'Hudson', 'Kenduskeag',
          'Bradley', 'Eddington', 'Etna', 'Stetson', 'Corinth', 'East Corinth',
          'Bradford', 'Charleston', 'Plymouth', 'Newport', 'Clifton', 'Lagrange'
        ]),
        serviceCounties: JSON.stringify(['Penobscot']),
        serviceAreaRadius: 30,
        lat: 44.8037,
        lng: -68.8961,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '7:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(207) 848-2036',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // CN BROWN ENERGY - Brewer, ME
      // ============================================
      {
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
          // Penobscot County - Core service area
          '04401', // Bangor
          '04402', // Bangor
          '04412', // Brewer
          '04468', // Old Town
          '04473', // Orono
          '04429', // Holden
          '04444', // Hampden
          '04472', // Orrington
          '04419', // Carmel
          '04456', // Levant
          '04449', // Hudson
          '04450', // Kenduskeag
          '04411', // Bradley
          '04428', // Eddington
          '04434', // Etna
          '04488', // Stetson
          '04427', // Corinth
          '04430', // East Corinth
          '04410', // Bradford
          '04422', // Charleston
          '04969', // Plymouth
          '04461', // Newport
          '04457', // Lincoln
          '04462', // Millinocket
          '04463', // East Millinocket
          '04448', // Howland
          '04453', // Lagrange
          '04459', // Mattawamkeag
          '04460', // Medway
          '04418', // Clifton
          '04930'  // Dexter
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
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: 'yes', // Senior discount 2¢/gal for 55+
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // HOPKINS ENERGY - Hermon, ME
      // ============================================
      {
        id: uuidv4(),
        name: 'Hopkins Energy',
        slug: 'hopkins-energy',
        phone: '(207) 949-2200',
        email: null,
        website: 'https://hopkinsenergy.com',
        addressLine1: '800 Coldbrook Rd',
        city: 'Hermon',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Penobscot County - Core service area
          '04401', // Bangor
          '04402', // Bangor
          '04412', // Brewer
          '04468', // Old Town
          '04473', // Orono
          '04429', // Holden
          '04444', // Hampden
          '04472', // Orrington
          '04419', // Carmel
          '04456', // Levant
          '04449', // Hudson
          '04450', // Kenduskeag
          '04411', // Bradley
          '04428', // Eddington
          '04434', // Etna
          '04488', // Stetson
          '04427', // Corinth
          '04430', // East Corinth
          '04410', // Bradford
          '04422', // Charleston
          '04969', // Plymouth
          '04461', // Newport
          '04418', // Clifton
          '04453', // Lagrange
          '04457', // Lincoln (partial)
          '04448'  // Howland (partial)
        ]),
        serviceCities: JSON.stringify([
          'Bangor', 'Hermon', 'Brewer', 'Old Town', 'Orono', 'Holden',
          'Hampden', 'Orrington', 'Carmel', 'Levant', 'Hudson', 'Kenduskeag',
          'Bradley', 'Eddington', 'Etna', 'Stetson', 'Corinth', 'East Corinth',
          'Bradford', 'Charleston', 'Plymouth', 'Newport', 'Clifton', 'Lagrange'
        ]),
        serviceCounties: JSON.stringify(['Penobscot']),
        serviceAreaRadius: 35,
        lat: 44.8120,
        lng: -68.9150,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true, // $175 emergency delivery fee
        emergencyPhone: '(207) 949-2200',
        seniorDiscount: 'yes', // Senior + Military discounts
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // D.A. PEARSON HEATING OILS - Hermon, ME
      // ============================================
      {
        id: uuidv4(),
        name: 'D.A. Pearson Heating Oils',
        slug: 'da-pearson-heating-oils',
        phone: '(207) 848-5463',
        email: null,
        website: 'https://www.dapearson.com',
        addressLine1: '509 York Rd',
        city: 'Hermon',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Penobscot County - Core service area
          '04401', // Bangor
          '04402', // Bangor
          '04412', // Brewer
          '04468', // Old Town
          '04473', // Orono
          '04429', // Holden
          '04444', // Hampden
          '04472', // Orrington
          '04419', // Carmel
          '04456', // Levant
          '04449', // Hudson
          '04450', // Kenduskeag
          '04411', // Bradley
          '04428', // Eddington
          '04434', // Etna
          '04488', // Stetson
          '04427', // Corinth
          '04430', // East Corinth
          '04410', // Bradford
          '04422', // Charleston
          '04969', // Plymouth
          '04461', // Newport
          '04418'  // Clifton
        ]),
        serviceCities: JSON.stringify([
          'Bangor', 'Hermon', 'Brewer', 'Old Town', 'Orono', 'Holden',
          'Hampden', 'Orrington', 'Carmel', 'Levant', 'Hudson', 'Kenduskeag',
          'Bradley', 'Eddington', 'Etna', 'Stetson', 'Corinth', 'East Corinth',
          'Bradford', 'Charleston', 'Plymouth', 'Newport', 'Clifton'
        ]),
        serviceCounties: JSON.stringify(['Penobscot']),
        serviceAreaRadius: 25,
        lat: 44.8100,
        lng: -68.9050,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: '7:30 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: true, // 24/7 on weekends
        emergencyDelivery: true,
        emergencyPhone: '(207) 848-5463',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // FETTINGER FUELS - Exeter, ME (HAS SCRAPABLE PRICES)
      // ============================================
      {
        id: uuidv4(),
        name: 'Fettinger Fuels',
        slug: 'fettinger-fuels',
        phone: '(207) 379-3320',
        email: null,
        website: 'https://www.fettingerfuels.com',
        addressLine1: '1220 Stetson Rd',
        city: 'Exeter',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Penobscot County - Core service area
          '04435', // Exeter
          '04401', // Bangor
          '04402', // Bangor
          '04412', // Brewer
          '04468', // Old Town
          '04473', // Orono
          '04429', // Holden
          '04444', // Hampden
          '04472', // Orrington
          '04419', // Carmel
          '04456', // Levant
          '04449', // Hudson
          '04450', // Kenduskeag
          '04411', // Bradley
          '04428', // Eddington
          '04434', // Etna
          '04488', // Stetson
          '04427', // Corinth
          '04430', // East Corinth
          '04410', // Bradford
          '04422', // Charleston
          '04969', // Plymouth
          '04461', // Newport
          '04418', // Clifton
          '04930', // Dexter
          '04426', // Dover-Foxcroft
          '04443', // Guilford
          '04464', // Milo
          '04481'  // Sebec
        ]),
        serviceCities: JSON.stringify([
          'Exeter', 'Bangor', 'Hermon', 'Brewer', 'Old Town', 'Orono', 'Holden',
          'Hampden', 'Orrington', 'Carmel', 'Levant', 'Hudson', 'Kenduskeag',
          'Bradley', 'Eddington', 'Etna', 'Stetson', 'Corinth', 'East Corinth',
          'Bradford', 'Charleston', 'Plymouth', 'Newport', 'Clifton',
          'Dexter', 'Dover-Foxcroft', 'Guilford', 'Milo', 'Sebec'
        ]),
        serviceCounties: JSON.stringify(['Penobscot', 'Piscataquis']),
        serviceAreaRadius: 40,
        lat: 44.9450,
        lng: -69.1250,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']), // Also bio blend
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true, // 24-hour emergency service
        emergencyPhone: '(207) 379-3320',
        seniorDiscount: 'yes', // Senior + Military discounts
        active: true,
        verified: false,
        allowPriceDisplay: true, // Displays prices on website banner!
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Insert all suppliers
    for (const supplier of suppliers) {
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
          emergencyDelivery: supplier.emergencyDelivery === true ? 'yes' : 'no',
          allowPriceDisplay: supplier.allowPriceDisplay === true
        }
      });
    }

    // Safety UPDATE: Ensure only Fettinger has allowPriceDisplay = true
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN (
        'sinclairs-home-heating',
        'cn-brown-energy',
        'hopkins-energy',
        'da-pearson-heating-oils'
      ) AND allow_price_display = true
    `);

    console.log('✅ Migration 044: Added 5 Bangor ME area COD suppliers (Penobscot County)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (
        'sinclairs-home-heating',
        'cn-brown-energy',
        'hopkins-energy',
        'da-pearson-heating-oils',
        'fettinger-fuels'
      )
    `);
    console.log('✅ Migration 044 rolled back');
  }
};
