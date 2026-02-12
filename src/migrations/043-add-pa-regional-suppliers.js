/**
 * Migration 043: Add PA Regional COD Suppliers
 * - Highhouse Energy (Honesdale, PA) - Wayne County, scrapable
 * - Pocono Fuels (Hawley, PA) - Wayne/Pike County
 * - Miller's Gas & Oil (Shamokin, PA) - Northumberland County
 * - Leighow Energy (Danville, PA) - Montour/Northumberland, scrapable
 * - Quality Discount Fuels (Port Carbon, PA) - Schuylkill County, scrapable
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '043-add-pa-regional-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // HIGHHOUSE ENERGY - Honesdale, PA (Wayne County)
      // ============================================
      {
        id: uuidv4(),
        name: 'Highhouse Energy',
        slug: 'highhouse-energy',
        phone: '(570) 253-3520',
        email: null,
        website: 'https://highhouseenergy.com',
        addressLine1: '333 Erie Street',
        city: 'Honesdale',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Wayne County
          '18431', // Honesdale
          '18428', // Hawley
          '18435', // Lackawaxen
          '18436', // Lake Ariel
          '18437', // Lake Como
          '18438', // Lakeville
          '18439', // Lakewood
          '18453', // Pleasant Mount
          '18461', // Starlight
          '18462', // Starrucca
          '18469', // Tyler Hill
          '18470', // Union Dale
          '18472', // Waymart
          '18473', // White Mills
          '18407', // Carbondale
          '18414', // Dalton
          '18447', // Olyphant (partial)
          // Lackawanna County
          '18403', // Archbald
          '18411', // Clarks Summit
          '18424', // Gouldsboro
          '18434', // Jessup
          '18444', // Moscow
          '18505', '18507', '18508', '18509', '18510', // Scranton
          // Susquehanna County
          '18801', // Montrose
          '18810', // Athens (partial)
          '18812', // Brackney
          '18817', // East Rush
          '18822', // Gibson
          '18824', // Hallstead
          '18826', // Herrick Center
          '18830', // Jackson
          '18832', // Kingsley
          '18840', // New Milford
          '18844', // Springville
          '18847', // Susquehanna
          '18848', // Thompson
          // Pike County
          '18323', // Buck Hill Falls
          '18324', // Bushkill
          '18325', // Canadensis
          '18328', // Dingmans Ferry
          '18332', // Henryville
          '18336', // Matamoras
          '18337', // Milford
          '18340', // Millrift
          '18371'  // Shohola
        ]),
        serviceCities: JSON.stringify([
          'Honesdale', 'Hawley', 'Lake Ariel', 'Waymart', 'Carbondale',
          'Forest City', 'Milford', 'Lackawaxen', 'Lakeville', 'Lakewood',
          'Pleasant Mount', 'Starlight', 'Tyler Hill', 'White Mills',
          'Scranton', 'Clarks Summit', 'Moscow', 'Dalton', 'Gouldsboro',
          'Montrose', 'New Milford', 'Hallstead', 'Susquehanna',
          'Bushkill', 'Dingmans Ferry', 'Matamoras', 'Milford'
        ]),
        serviceCounties: JSON.stringify(['Wayne', 'Lackawanna', 'Susquehanna', 'Pike']),
        serviceAreaRadius: 40,
        lat: 41.5765,
        lng: -75.2588,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'propane']),
        minimumGallons: 100,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(570) 253-3520',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // POCONO FUELS - Hawley, PA (Pike/Wayne County)
      // ============================================
      {
        id: uuidv4(),
        name: 'Pocono Fuels',
        slug: 'pocono-fuels',
        phone: '(570) 226-4501',
        email: null,
        website: 'https://poconofuels.com',
        addressLine1: '2203 US Route 6',
        city: 'Hawley',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Pike County
          '18428', // Hawley
          '18435', // Lackawaxen
          '18323', // Buck Hill Falls
          '18324', // Bushkill
          '18325', // Canadensis
          '18326', // Cresco
          '18328', // Dingmans Ferry
          '18332', // Henryville
          '18336', // Matamoras
          '18337', // Milford
          '18340', // Millrift
          '18341', // Mountainhome
          '18344', // Mount Pocono
          '18347', // Pocono Pines
          '18348', // Pocono Lake
          '18349', // Pocono Manor
          '18350', // Scotrun
          '18355', // Scotrun
          '18371', // Shohola
          '18466', // Tobyhanna
          // Wayne County
          '18431', // Honesdale
          '18436', // Lake Ariel
          '18438', // Lakeville
          '18439', // Lakewood
          '18472', // Waymart
          '18473', // White Mills
          // Monroe County
          '18301', // East Stroudsburg
          '18302', // East Stroudsburg
          '18321', // Bartonsville
          '18322', // Brodheadsville
          '18330', // Effort
          '18334', // Kresgeville
          '18360', // Stroudsburg
          '18372'  // Tannersville
        ]),
        serviceCities: JSON.stringify([
          'Hawley', 'Lackawaxen', 'Bushkill', 'Canadensis', 'Dingmans Ferry',
          'Milford', 'Mount Pocono', 'Pocono Pines', 'Tobyhanna',
          'Honesdale', 'Lake Ariel', 'Lakeville', 'Waymart', 'White Mills',
          'East Stroudsburg', 'Stroudsburg', 'Brodheadsville', 'Tannersville'
        ]),
        serviceCounties: JSON.stringify(['Pike', 'Wayne', 'Monroe']),
        serviceAreaRadius: 35,
        lat: 41.4745,
        lng: -75.1818,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'propane']),
        minimumGallons: 150,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(570) 226-4501',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // MILLER'S GAS & OIL - Shamokin, PA (Northumberland County)
      // ============================================
      {
        id: uuidv4(),
        name: "Miller's Gas & Oil",
        slug: 'millers-gas-and-oil',
        phone: '(570) 644-0318',
        email: null,
        website: 'https://millergasandoil.com',
        addressLine1: '6507 State Route 61',
        city: 'Shamokin',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Northumberland County
          '17872', // Shamokin
          '17866', // Coal Township
          '17801', // Sunbury
          '17821', // Danville (partial)
          '17847', // Milton
          '17857', // Northumberland
          '17834', // Kulpmont
          '17840', // Marion Heights
          '17851', // Mount Carmel
          '17860', // Paxinos
          '17867', // Rebuck
          '17876', // Shamokin Dam
          '17881', // Trevorton
          '17824', // Elysburg
          // Snyder County
          '17870', // Selinsgrove
          '17842', // Middleburg
          '17827', // Freeburg
          '17832', // Herndon
          '17844', // Mifflinburg (partial)
          '17855', // New Berlin
          '17864', // Port Trevorton
          '17812', // Beaver Springs
          '17836', // Kreamer
          '17837', // Lewisburg (partial)
          // Union County
          '17837', // Lewisburg
          '17844', // Mifflinburg
          '17845', // Millmont
          '17856', // New Columbia
          '17886', // Winfield
          '17889', // Winfield
          // Montour County
          '17821', // Danville
          '17820', // Catawissa (partial)
          '17884', // Washingtonville
          // Columbia County
          '17815', // Bloomsburg
          '17820', // Catawissa
          '17814', // Benton
          '17858', // Orangeville
          '17829'  // Espy
        ]),
        serviceCities: JSON.stringify([
          'Shamokin', 'Coal Township', 'Sunbury', 'Mount Carmel', 'Kulpmont',
          'Paxinos', 'Trevorton', 'Elysburg', 'Marion Heights', 'Rebuck',
          'Northumberland', 'Milton', 'Shamokin Dam',
          'Selinsgrove', 'Middleburg', 'Freeburg', 'Port Trevorton',
          'Lewisburg', 'Mifflinburg', 'New Berlin', 'New Columbia', 'Winfield',
          'Danville', 'Washingtonville', 'Catawissa',
          'Bloomsburg', 'Benton', 'Orangeville'
        ]),
        serviceCounties: JSON.stringify(['Northumberland', 'Snyder', 'Union', 'Montour', 'Columbia']),
        serviceAreaRadius: 35,
        lat: 40.7890,
        lng: -76.5588,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'propane']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(570) 644-0318',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // LEIGHOW ENERGY - Danville, PA (Montour/Northumberland)
      // ============================================
      {
        id: uuidv4(),
        name: 'Leighow Energy',
        slug: 'leighow-energy',
        phone: '(570) 275-3901',
        email: null,
        website: 'https://leighowoil.com',
        addressLine1: '118 Eyer Road',
        city: 'Danville',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Montour County
          '17821', // Danville
          '17884', // Washingtonville
          // Northumberland County
          '17824', // Elysburg
          '17857', // Northumberland
          '17801', // Sunbury
          '17847', // Milton
          '17860', // Paxinos
          '17876', // Shamokin Dam
          '17872', // Shamokin (partial)
          // Columbia County
          '17815', // Bloomsburg
          '17820', // Catawissa
          '17814', // Benton
          '17858', // Orangeville
          '17846', // Millville
          '17829', // Espy
          '17835', // Jerseytown
          // Union County
          '17837', // Lewisburg
          '17856', // New Columbia
          '17886', // Winfield
          '17889', // Winfield
          // Snyder County
          '17870', // Selinsgrove
          // Luzerne County (partial)
          '17752', // Riverside
          '17774'  // Turbotville (partial)
        ]),
        serviceCities: JSON.stringify([
          'Danville', 'Washingtonville', 'Riverside',
          'Elysburg', 'Northumberland', 'Sunbury', 'Milton', 'Paxinos', 'Shamokin Dam',
          'Bloomsburg', 'Catawissa', 'Benton', 'Orangeville', 'Millville',
          'Lewisburg', 'New Columbia', 'Winfield',
          'Selinsgrove', 'Turbotville'
        ]),
        serviceCounties: JSON.stringify(['Montour', 'Northumberland', 'Columbia', 'Union', 'Snyder']),
        serviceAreaRadius: 30,
        lat: 40.9634,
        lng: -76.6127,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
        minimumGallons: 125,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(570) 275-3901',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // QUALITY DISCOUNT FUELS - Port Carbon, PA (Schuylkill County)
      // ============================================
      {
        id: uuidv4(),
        name: 'Quality Discount Fuels',
        slug: 'quality-discount-fuels',
        phone: '(570) 622-4198',
        email: null,
        website: 'https://www.qualitydiscountfuels.com',
        addressLine1: '1 2nd Street',
        city: 'Port Carbon',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Schuylkill County
          '17965', // Port Carbon
          '17901', // Pottsville
          '17921', // Ashland
          '17931', // Girardville
          '17934', // Gordon
          '17935', // Hegins
          '17938', // Klingerstown
          '17941', // Lavelle
          '17943', // Llewellyn
          '17948', // Mahanoy City
          '17954', // Minersville
          '17959', // New Philadelphia
          '17960', // New Ringgold
          '17961', // Orwigsburg
          '17963', // Pine Grove
          '17968', // Ringtown
          '17970', // Saint Clair
          '17972', // Schuylkill Haven
          '17976', // Shenandoah
          '17978', // Spring Glen
          '17980', // Summit Station
          '17981', // Tamaqua (partial)
          '17982', // Tower City
          '17983', // Tremont
          '17985', // Zion Grove
          '17929', // Frackville
          // Northumberland County (border)
          '17851', // Mount Carmel
          '17834', // Kulpmont
          '17872'  // Shamokin (partial - call to verify)
        ]),
        serviceCities: JSON.stringify([
          'Port Carbon', 'Pottsville', 'Ashland', 'Girardville', 'Gordon',
          'Hegins', 'Lavelle', 'Mahanoy City', 'Minersville', 'New Philadelphia',
          'New Ringgold', 'Orwigsburg', 'Pine Grove', 'Ringtown', 'Saint Clair',
          'Schuylkill Haven', 'Shenandoah', 'Shenandoah Heights', 'Summit Station',
          'Tamaqua', 'Tower City', 'Tremont', 'Zion Grove', 'Frackville',
          'Mount Carmel', 'Kulpmont'
        ]),
        serviceCounties: JSON.stringify(['Schuylkill', 'Northumberland']),
        serviceAreaRadius: 25,
        lat: 40.6965,
        lng: -76.1688,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
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

    console.log('✅ Migration 043: Added 5 PA regional COD suppliers (Wayne, Pike, Northumberland, Montour, Schuylkill)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (
        'highhouse-energy',
        'pocono-fuels',
        'millers-gas-and-oil',
        'leighow-energy',
        'quality-discount-fuels'
      )
    `);
    console.log('✅ Migration 043 rolled back');
  }
};
