/**
 * Migration 025: Add Sherman CT area COD suppliers
 * Thermanet Fuel Oil, Toro Fuel, South Britain Oil
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '025-add-sherman-ct-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Thermanet Fuel Oil',
        slug: 'thermanet-fuel-oil',
        phone: '(860) 355-5777',
        website: null,
        addressLine1: '19 Echo Dr',
        city: 'New Milford',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06776', // New Milford
          '06752', // Bridgewater
          '06757', // Kent
          '06783', // Roxbury
          '06793', // Washington
          '06794', // Washington Depot
          '06784', // Sherman
          '06751', // Bethlehem
          '06759'  // Litchfield
        ]),
        serviceCities: JSON.stringify([
          'New Milford', 'Bridgewater', 'Kent', 'Roxbury',
          'Washington', 'Sherman', 'Bethlehem', 'Litchfield'
        ]),
        serviceCounties: JSON.stringify(['Litchfield', 'Fairfield']),
        serviceAreaRadius: 20,
        paymentMethods: JSON.stringify(['cod', 'cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: true,  // Same-day 7 days/week
        emergencyDelivery: false,
        seniorDiscount: false,
        active: true,
        verified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Toro Fuel',
        slug: 'toro-fuel',
        phone: '(203) 441-2289',
        website: 'https://mytorofuelct.com',
        addressLine1: '95 Garfield Ave',
        city: 'Danbury',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06810', '06811', '06813', '06814', '06816', '06817', // Danbury
          '06784', // Sherman
          '06804', // Brookfield
          '06812', // New Fairfield
          '06801', // Bethel
          '06470', '06482', // Newtown
          '06877', // Ridgefield
          '06896', // Redding
          '06750', // Bantam
          '06776'  // New Milford
        ]),
        serviceCities: JSON.stringify([
          'Danbury', 'Sherman', 'Brookfield', 'New Fairfield',
          'Bethel', 'Newtown', 'Ridgefield', 'Redding', 'New Milford'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Litchfield']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['cod', 'cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: true,  // Same-day delivery
        emergencyDelivery: false,
        seniorDiscount: false,
        active: true,
        verified: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'South Britain Oil',
        slug: 'south-britain-oil',
        phone: '(203) 264-3707',
        website: 'https://southbritainoil.com',
        addressLine1: '424 Old Field Rd',
        city: 'Southbury',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06488', // Southbury
          '06470', '06482', // Newtown
          '06478', // Oxford
          '06798', // Woodbury
          '06783', // Roxbury
          '06752', // Bridgewater
          '06784', // Sherman
          '06804', // Brookfield
          '06751', // Bethlehem
          '06762'  // Middlebury
        ]),
        serviceCities: JSON.stringify([
          'Southbury', 'Newtown', 'Oxford', 'Woodbury',
          'Roxbury', 'Bridgewater', 'Sherman', 'Brookfield',
          'Bethlehem', 'Middlebury'
        ]),
        serviceCounties: JSON.stringify(['New Haven', 'Fairfield', 'Litchfield']),
        serviceAreaRadius: 20,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        hoursWeekday: '7:30am-5:00pm',  // Winter hours
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,  // Mon-Fri only for regular hours
        emergencyDelivery: true, // 24-Hour Emergency Services
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
          payment_methods, fuel_types, minimum_gallons,
          hours_weekday, hours_saturday, hours_sunday,
          weekend_delivery, emergency_delivery, senior_discount,
          active, verified, created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :paymentMethods, :fuelTypes, :minimumGallons,
          :hoursWeekday, :hoursSaturday, :hoursSunday,
          :weekendDelivery, :emergencyDelivery, :seniorDiscount,
          :active, :verified, :createdAt, :updatedAt
        )
        ON CONFLICT (slug) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          minimumGallons: supplier.minimumGallons || null,
          hoursWeekday: supplier.hoursWeekday || null,
          hoursSaturday: supplier.hoursSaturday || null,
          hoursSunday: supplier.hoursSunday || null,
          weekendDelivery: supplier.weekendDelivery || false,
          emergencyDelivery: supplier.emergencyDelivery || false,
          seniorDiscount: supplier.seniorDiscount || false
        }
      });

      console.log(`[Migration 025] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('thermanet-fuel-oil', 'toro-fuel', 'south-britain-oil')
    `);
  }
};
