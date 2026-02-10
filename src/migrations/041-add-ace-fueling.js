/**
 * Migration 041: Add Ace Fueling
 * Lower Bucks County, PA + Montgomery County - COD confirmed
 * "Ace Fueling operates exclusively on a (cash on delivery) model with absolutely no contracts required ever."
 * 5¢ off COD discount, 3¢ senior discount
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '041-add-ace-fueling',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Ace Fueling',
      slug: 'ace-fueling',
      phone: '(215) 458-7523',
      email: null,
      website: 'https://ace4oil.com',
      addressLine1: '2605 Durham Rd',
      city: 'Bristol',
      state: 'PA',
      postalCodesServed: JSON.stringify([
        // Bucks County
        '19007', // Bristol
        '19021', // Croydon
        '19030', // Fairless Hills
        '19047', // Langhorne
        '19053', // Feasterville-Trevose
        '19054', // Levittown
        '19055', // Levittown
        '19056', // Levittown
        '19057', // Levittown
        '19067', // Morrisville/Yardley
        '18940', // Newtown
        '18954', // Richboro
        '18966', // Southampton
        '18974', // Warminster
        '18977', // Washington Crossing
        // Montgomery County
        '19040', // Hatboro
        '19044', // Horsham
        '19446', // Lansdale
        '19454'  // North Wales
      ]),
      serviceCities: JSON.stringify([
        'Bristol', 'Croydon', 'Levittown', 'Morrisville', 'Langhorne',
        'Fairless Hills', 'Feasterville-Trevose', 'Southampton', 'Richboro',
        'Yardley', 'Newtown', 'Warminster', 'Washington Crossing',
        'Horsham', 'Hatboro', 'Lansdale', 'North Wales'
      ]),
      serviceCounties: JSON.stringify(['Bucks', 'Montgomery']),
      serviceAreaRadius: 25,
      lat: 40.1184,
      lng: -74.8643,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 50,
      hoursWeekday: '24/7',
      hoursSaturday: '24/7',
      hoursSunday: '24/7',
      weekendDelivery: true,
      emergencyDelivery: true,
      emergencyPhone: '(215) 458-7523',
      seniorDiscount: 'yes',
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
        emergencyDelivery: supplier.emergencyDelivery === true ? 'yes' : 'no',
        allowPriceDisplay: supplier.allowPriceDisplay === true
      }
    });

    console.log('✅ Migration 041: Added Ace Fueling (Bristol, PA)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'ace-fueling'`);
    console.log('✅ Migration 041 rolled back');
  }
};
