/**
 * Migration 026: Add Hometown Fuel and Reliable Fuel
 * Both confirmed to offer will-call/on-demand delivery
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '026-add-hometown-reliable-fuel',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Hometown Fuel',
        slug: 'hometown-fuel-ct',
        phone: '(203) 304-1922',
        website: 'https://myhometownfuel.com',
        addressLine1: '22 Longview Heights Rd',
        city: 'Newtown',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06470', '06482', // Newtown
          '06810', '06811', // Danbury
          '06801', // Bethel
          '06877', // Ridgefield
          '06776', // New Milford
          '06804', // Brookfield
          '06896', // Redding
          '06468', // Monroe
          '06812', // New Fairfield
          '06488', // Southbury
          '06798', // Woodbury
          '06784'  // Sherman
        ]),
        serviceCities: JSON.stringify([
          'Newtown', 'Sandy Hook', 'Botsford', 'Hawleyville',
          'Danbury', 'Bethel', 'Ridgefield', 'New Milford',
          'Brookfield', 'Redding', 'Monroe', 'New Fairfield',
          'Southbury', 'Woodbury', 'Sherman'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Litchfield', 'New Haven']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        hoursWeekday: '8:00am-5:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        seniorDiscount: false,
        active: true,
        verified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Reliable Heating LLC',
        slug: 'reliable-heating-llc',
        phone: '(203) 994-5355',
        website: 'https://reliableheatingllc.com',
        addressLine1: '4 Sand Cut Rd, Unit 3',
        city: 'Brookfield',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06804', // Brookfield
          '06801', // Bethel
          '06776', // New Milford
          '06784', // Sherman
          '06810', '06811', // Danbury
          '06812', // New Fairfield
          '06470', '06482', // Newtown
          '06896', // Redding
          '06877', // Ridgefield
          '06897', // Wilton
          '06883', // Weston
          '06829', // Georgetown
          '06798', // Woodbury
          '06793', // Washington
          '06783', // Roxbury
          '06752', // Bridgewater
          '06751', // Bethlehem
          '06755'  // Gaylordsville
        ]),
        serviceCities: JSON.stringify([
          'Brookfield', 'Bethel', 'New Milford', 'Sherman',
          'Danbury', 'New Fairfield', 'Newtown', 'Redding',
          'Ridgefield', 'Wilton', 'Weston', 'Georgetown',
          'Woodbury', 'Washington', 'Roxbury', 'Bridgewater',
          'Bethlehem', 'Gaylordsville'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Litchfield']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        hoursWeekday: '8:00am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,  // 24/7 emergency after 4:30pm
        seniorDiscount: false,
        active: true,
        verified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          payment_methods, fuel_types,
          hours_weekday, hours_saturday, hours_sunday,
          weekend_delivery, emergency_delivery, senior_discount,
          active, verified, created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :paymentMethods, :fuelTypes,
          :hoursWeekday, :hoursSaturday, :hoursSunday,
          :weekendDelivery, :emergencyDelivery, :seniorDiscount,
          :active, :verified, :createdAt, :updatedAt
        )
        ON CONFLICT (id) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          hoursWeekday: supplier.hoursWeekday || null,
          hoursSaturday: supplier.hoursSaturday || null,
          hoursSunday: supplier.hoursSunday || null,
          weekendDelivery: supplier.weekendDelivery || false,
          emergencyDelivery: supplier.emergencyDelivery || false,
          seniorDiscount: supplier.seniorDiscount || false
        }
      });

      console.log(`[Migration 026] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('hometown-fuel-ct', 'reliable-heating-llc')
    `);
  }
};
