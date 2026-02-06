/**
 * Migration 031: Add York, PA (17405) area suppliers
 * Edris Oil, Marstellar Oil, RA Bair, Best Price Oil - verified via web search
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '031-add-york-pa-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Edris Oil Service',
        slug: 'edris-oil-service',
        phone: '(717) 848-5001',
        website: 'https://www.edrisoil.com',
        addressLine1: '1225 Columbia Ave',
        city: 'York',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // York County
          '17401', '17402', '17403', '17404', '17405', '17406', '17407', '17408', // York
          '17313', // Dallastown
          '17315', // Dover
          '17318', // Emigsville
          '17319', // Etters
          '17322', // Felton
          '17327', // Glen Rock
          '17329', // Glenville
          '17331', '17332', // Hanover
          '17339', // Lewisberry
          '17345', // Loganville
          '17347', // Mount Wolf
          '17349', // New Freedom
          '17352', // New Park
          '17356', // Railroad
          '17360', // Seven Valleys
          '17361', // Shrewsbury
          '17362', // Spring Grove
          '17363', // Stewartstown
          '17365', // Thomasville
          '17368', // Wellsville
          '17370', // Windsor
          '17371', // Wrightsville
          '17372', // York Haven
          '17301', // Abbottstown
          '17309', // Brogue
          '17311', // Codorus
          '17314', // Delta
          '17317', // East Prospect
          '17321', // Fawn Grove
          '17324', // Franklintown
          '17340', // Lineboro (MD border)
          '17344', // Manchester
          '17350', // New Oxford
          '17353', // Porters Sideling
          '17355', // Red Lion
          '17358', // Rossville
          '17364', // York New Salem
          // Lancaster County
          '17501', // Akron
          '17512', // Columbia
          '17520', // East Petersburg
          '17022', // Elizabethtown
          '17543', // Lititz
          '17545', // Manheim
          '17547', // Marietta
          '17552', // Mount Joy
          '17554', // Mountville
          '17557', // New Holland
          '17579', // Strasburg
          // Dauphin County
          '17033', // Hershey
          '17034', // Highspire
          '17036', // Hummelstown
          '17057', // Middletown
          '17078', // Palmyra
          '17113', // Steelton
          // Cumberland County
          '17011', // Camp Hill
          '17043', // Lemoyne
          '17050', '17055', // Mechanicsburg
          '17070', // New Cumberland
          // Adams County
          '17304', // Biglerville
          '17307', // Bendersville
          '17320', // East Berlin
          '17325', // Gettysburg
          '17340', // Littlestown
          '17350', // New Oxford
          // Perry County
          '17019', // Dillsburg
          '17020'  // Duncannon
        ]),
        serviceCities: JSON.stringify([
          'York', 'Dallastown', 'Dover', 'Emigsville', 'Etters', 'Felton',
          'Glen Rock', 'Glenville', 'Hanover', 'Lewisberry', 'Loganville',
          'Mount Wolf', 'New Freedom', 'New Park', 'Railroad', 'Seven Valleys',
          'Shrewsbury', 'Spring Grove', 'Stewartstown', 'Thomasville', 'Wellsville',
          'Windsor', 'Wrightsville', 'York Haven', 'Red Lion', 'Manchester',
          'Columbia', 'Elizabethtown', 'Marietta', 'Mount Joy', 'Hershey',
          'Hummelstown', 'Middletown', 'Palmyra', 'Camp Hill', 'Mechanicsburg',
          'New Cumberland', 'East Berlin', 'Gettysburg', 'Dillsburg'
        ]),
        serviceCounties: JSON.stringify(['York', 'Lancaster', 'Adams', 'Dauphin', 'Cumberland', 'Perry', 'Lebanon', 'Baltimore', 'Carroll', 'Harford']),
        serviceAreaRadius: 40,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '7:30am-4:00pm',
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
      },
      {
        id: uuidv4(),
        name: 'Marstellar Oil & Concrete',
        slug: 'marstellar-oil-concrete',
        phone: '(717) 834-6200',
        website: 'https://marstellaroilconcrete.com',
        addressLine1: '2011 State Road',
        city: 'Duncannon',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Perry County
          '17020', // Duncannon
          '17024', // Elliottsburg
          '17037', // Ickesburg
          '17045', // Liverpool
          '17047', // Loysville
          '17053', // Marysville
          '17062', // New Bloomfield
          '17074', // Newport
          '17090', // Shermans Dale
          // Dauphin County
          '17101', '17102', '17103', '17104', '17109', '17110', '17111', '17112', // Harrisburg
          '17025', // Enola
          '17033', // Hershey
          '17034', // Highspire
          '17036', // Hummelstown
          '17057', // Middletown
          '17078', // Palmyra
          '17113', // Steelton
          '17018', // Dauphin
          '17061', // Millersburg
          '17048', // Lykens
          '17038', // Jonestown
          // Cumberland County
          '17011', // Camp Hill
          '17013', // Carlisle
          '17015', // Carlisle
          '17043', // Lemoyne
          '17050', '17055', // Mechanicsburg
          '17070', // New Cumberland
          '17007', // Boiling Springs
          // York County (Northern)
          '17019', // Dillsburg
          '17401', '17402', '17403', '17404', '17405', // York
          '17372', // York Haven
          '17070', // New Cumberland
          // Juniata County
          '17059', // Mifflintown
          '17063', // Mifflin
          '17082'  // Port Royal
        ]),
        serviceCities: JSON.stringify([
          'Duncannon', 'Elliottsburg', 'Liverpool', 'Loysville', 'Marysville',
          'New Bloomfield', 'Newport', 'Shermans Dale', 'Harrisburg', 'Enola',
          'Hershey', 'Highspire', 'Hummelstown', 'Middletown', 'Palmyra',
          'Steelton', 'Dauphin', 'Camp Hill', 'Carlisle', 'Lemoyne',
          'Mechanicsburg', 'New Cumberland', 'Dillsburg', 'York', 'York Haven',
          'North York', 'Mifflintown'
        ]),
        serviceCounties: JSON.stringify(['Perry', 'Dauphin', 'Cumberland', 'York', 'Juniata']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 50,
        hoursWeekday: '8:00am-5:00pm',
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
        name: 'RA Bair & Son Oil Service',
        slug: 'ra-bair-son-oil-service',
        phone: '(717) 235-2766',
        website: 'https://www.bairoilinc.com',
        addressLine1: '2011 Larue Rd',
        city: 'Seven Valleys',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // York County (Southern)
          '17360', // Seven Valleys
          '17345', // Loganville
          '17327', // Glen Rock
          '17356', // Railroad
          '17401', '17402', '17403', '17404', '17405', // York
          '17311', // Codorus
          '17361', // Shrewsbury
          '17364', // York New Salem
          '17313', // Dallastown
          '17362', // Spring Grove
          '17329', // Glenville
          '17355', // Red Lion
          '17349', // New Freedom
          '17340', // Lineboro
          '17363', // Stewartstown
          '17344', // Manchester
          '17322', // Felton
          '17331', // Hanover
          '17365', // Thomasville
          '17370', // Windsor
          '17318', // Emigsville
          '17352', // New Park
          '17317', // East Prospect
          '17321', // Fawn Grove
          '17347', // Mount Wolf
          '17309', // Brogue
          '17320', // East Berlin
          '17371', // Wrightsville
          '17301', // Abbottstown
          '17512', // Columbia
          '17547', // Marietta
          '17520', // Bainbridge
          '17358', // Rossville
          '17368', // Wellsville
          '17339', // Lewisberry
          '17324', // Franklintown
          '17019', // Dillsburg
          '17372', // York Haven
          '17350', // New Oxford
          '17552', // Mount Joy
          '17554'  // Mountville
        ]),
        serviceCities: JSON.stringify([
          'Seven Valleys', 'Loganville', 'Glen Rock', 'Railroad', 'York',
          'Codorus', 'Shrewsbury', 'York New Salem', 'Dallastown', 'Spring Grove',
          'Glenville', 'Red Lion', 'New Freedom', 'Lineboro', 'Stewartstown',
          'Manchester', 'Felton', 'Hanover', 'Thomasville', 'Windsor',
          'Emigsville', 'New Park', 'East Prospect', 'Fawn Grove', 'Mount Wolf',
          'Brogue', 'East Berlin', 'Wrightsville', 'Abbottstown', 'Columbia',
          'Marietta', 'Bainbridge', 'Rossville', 'Wellsville', 'Lewisberry',
          'Franklintown', 'Dillsburg', 'York Haven', 'New Oxford', 'Mount Joy'
        ]),
        serviceCounties: JSON.stringify(['York', 'Lancaster', 'Adams']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'gasoline']),
        minimumGallons: null,
        hoursWeekday: '7:00am-5:00pm',
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
      },
      {
        id: uuidv4(),
        name: 'Best Price Oil',
        slug: 'best-price-oil',
        phone: '(717) 564-8237',
        website: 'https://bestpriceoilco.com',
        addressLine1: '3798 Paxton Street',
        city: 'Harrisburg',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Dauphin County
          '17101', '17102', '17103', '17104', '17109', '17110', '17111', '17112', // Harrisburg
          '17018', // Dauphin
          '17033', // Hershey
          '17034', // Highspire
          '17036', // Hummelstown
          '17057', // Middletown
          '17078', // Palmyra
          '17113', // Steelton
          '17028', // Grantville
          // Cumberland County
          '17011', // Camp Hill
          '17013', // Carlisle
          '17043', // Lemoyne
          '17050', '17055', // Mechanicsburg
          '17070', // New Cumberland
          '17025', // Enola
          // Perry County
          '17020', // Duncannon
          '17053', // Marysville
          '17062', // New Bloomfield
          '17074', // Newport
          '17090', // Shermans Dale
          // York County (Northern)
          '17019', // Dillsburg
          '17315', // Dover
          '17319', // Etters
          '17324', // Franklintown
          '17339', // Lewisberry
          '17344', // Manchester
          '17347', // Mount Wolf
          '17358', // Rossville
          '17368', // Wellsville
          '17372', // York Haven
          // Lebanon County
          '17003', // Annville
          '17042', // Lebanon
          '17078', // Palmyra
          '17067', // Myerstown
          // Lancaster County (Northern)
          '17022', // Elizabethtown
          '17552'  // Mount Joy
        ]),
        serviceCities: JSON.stringify([
          'Harrisburg', 'Dauphin', 'Hershey', 'Highspire', 'Hummelstown',
          'Middletown', 'Palmyra', 'Steelton', 'Grantville', 'Camp Hill',
          'Carlisle', 'Lemoyne', 'Mechanicsburg', 'New Cumberland', 'Enola',
          'Duncannon', 'Marysville', 'New Bloomfield', 'Newport', 'Shermans Dale',
          'Dillsburg', 'Dover', 'Etters', 'Franklintown', 'Lewisberry',
          'Manchester', 'Mount Wolf', 'Rossville', 'Wellsville', 'York Haven',
          'Annville', 'Lebanon', 'Elizabethtown', 'Mount Joy'
        ]),
        serviceCounties: JSON.stringify(['Dauphin', 'Cumberland', 'Perry', 'York', 'Lebanon', 'Lancaster']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
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

      console.log(`[Migration 031] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'edris-oil-service',
        'marstellar-oil-concrete',
        'ra-bair-son-oil-service',
        'best-price-oil'
      )
    `);
  }
};
