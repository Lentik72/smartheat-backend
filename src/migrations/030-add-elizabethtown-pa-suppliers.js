/**
 * Migration 030: Add Elizabethtown, PA (17022) area suppliers
 * Capitol City Oil and Rolling Hills Energy - both verified via web search
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '030-add-elizabethtown-pa-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Capitol City Oil',
        slug: 'capitol-city-oil',
        phone: '(717) 737-4188',
        website: 'https://capitolcityoil.com',
        addressLine1: '2220 Gettysburg Rd',
        city: 'Camp Hill',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Cumberland County
          '17011', // Camp Hill
          '17013', // Carlisle
          '17043', // Lemoyne
          '17070', // New Cumberland
          '17050', '17055', // Mechanicsburg
          '17007', // Boiling Springs
          '17015', // Carlisle area
          '17065', // Mount Holly Springs
          // Dauphin County
          '17022', // Elizabethtown
          '17033', // Hershey
          '17036', // Hummelstown
          '17057', // Middletown
          '17101', '17102', '17103', '17104', '17109', '17110', '17111', '17112', // Harrisburg
          '17025', // Enola
          '17078', // Palmyra
          '17034', // Highspire
          '17113', // Steelton
          '17018', // Dauphin
          '17028', // Grantville
          // Perry County
          '17020', // Duncannon
          '17062', // New Bloomfield
          '17074', // Newport
          '17053', // Marysville
          '17090', // Shermans Dale
          // York County
          '17019', // Dillsburg
          '17315', // Dover
          '17339', // Lewisberry
          '17370', // Wellsville
          '17319', // Etters
          // Lancaster County (northern edge)
          '17501', // Akron
          '17543', // Lititz
          '17545', // Manheim
          '17552', // Mount Joy
          // Lebanon County
          '17042', // Lebanon
          '17046'  // Lebanon
        ]),
        serviceCities: JSON.stringify([
          'Camp Hill', 'Carlisle', 'Lemoyne', 'New Cumberland', 'Mechanicsburg',
          'Shiremanstown', 'Boiling Springs', 'Elizabethtown', 'Hershey',
          'Hummelstown', 'Middletown', 'Harrisburg', 'Enola', 'Palmyra',
          'Highspire', 'Steelton', 'Dauphin', 'Grantville', 'Duncannon',
          'New Bloomfield', 'Newport', 'Marysville', 'Shermans Dale',
          'Dillsburg', 'Dover', 'Lewisberry', 'Wellsville', 'Etters',
          'Lititz', 'Manheim', 'Mount Joy', 'Lebanon'
        ]),
        serviceCounties: JSON.stringify(['Cumberland', 'Dauphin', 'York', 'Perry', 'Lancaster', 'Lebanon']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        hoursWeekday: '7:30am-4:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Rolling Hills Energy',
        slug: 'rolling-hills-energy',
        phone: '(717) 587-6413',
        website: null,
        addressLine1: '2843 Mill Rd',
        city: 'Elizabethtown',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          '17022', // Elizabethtown
          '17057', // Middletown
          '17033', // Hershey
          '17036', // Hummelstown
          '17078', // Palmyra
          '17552', // Mount Joy
          '17545', // Manheim
          '17543', // Lititz
          '17501', // Akron
          '17011', // Camp Hill
          '17025', // Enola
          '17053', // Marysville
          '17020', // Duncannon
          '17062', // New Bloomfield
          '17074', // Newport
          '17090', // Shermans Dale
          '17019', // Dillsburg
          '17070', // New Cumberland
          '17113', // Steelton
          '17034'  // Highspire
        ]),
        serviceCities: JSON.stringify([
          'Elizabethtown', 'Middletown', 'Hershey', 'Hummelstown', 'Palmyra',
          'Mount Joy', 'Manheim', 'Lititz', 'Camp Hill', 'Enola', 'Marysville',
          'Duncannon', 'New Bloomfield', 'Newport', 'Shermans Dale', 'Dillsburg',
          'New Cumberland', 'Steelton', 'Highspire'
        ]),
        serviceCounties: JSON.stringify(['Dauphin', 'Lancaster', 'Perry', 'Cumberland']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'bioheat']),
        minimumGallons: null,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
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
          weekend_delivery, emergency_delivery, senior_discount, notes,
          active, verified, allow_price_display, created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :paymentMethods, :fuelTypes, :minimumGallons,
          :hoursWeekday, :hoursSaturday, :hoursSunday,
          :weekendDelivery, :emergencyDelivery, :seniorDiscount, :notes,
          :active, :verified, :allowPriceDisplay, :createdAt, :updatedAt
        )
        ON CONFLICT (id) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          website: supplier.website || null,
          hoursWeekday: supplier.hoursWeekday || null,
          hoursSaturday: supplier.hoursSaturday || null,
          hoursSunday: supplier.hoursSunday || null,
          weekendDelivery: supplier.weekendDelivery || false,
          emergencyDelivery: supplier.emergencyDelivery || false,
          seniorDiscount: supplier.seniorDiscount || false,
          allowPriceDisplay: supplier.allowPriceDisplay !== false,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null
        }
      });

      console.log(`[Migration 030] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'capitol-city-oil',
        'rolling-hills-energy'
      )
    `);
  }
};
