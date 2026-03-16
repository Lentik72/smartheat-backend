/**
 * Migration 109: Add Dansville NY / Livingston County area suppliers
 *
 * Coverage gap: ZIP 14437 (Dansville, Livingston County) had only State Fuel Company.
 * Adding 4 new suppliers + expanding NOCO coverage to bring total to 6.
 *
 * New suppliers:
 *   - Valley Propane & Fuels / Mirabito (Dansville, NY) — Will-call + COD confirmed. 7 counties.
 *   - Reisdorf Oil & Propane (Warsaw, NY) — Will-call confirmed. 10 counties.
 *   - Hometowne Energy (Brockport, NY) — Will-call confirmed. 4 offices, 15+ counties.
 *   - Rinker Oil & Propane (Cuba, NY) — Will-call confirmed. 7 counties incl PA.
 *
 * Also upserts NOCO Energy with expanded serviceCities/serviceCounties for Lima/Cohocton offices.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '109-add-dansville-ny-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Valley Propane & Fuels',
        slug: 'valley-propane-fuels',
        phone: '(585) 683-8827',
        email: 'ccumberbatch@valley-fuel.com',
        website: 'https://valley-fuels.com',
        addressLine1: '10121 Poags Hole Road',
        city: 'Dansville',
        state: 'NY',
        serviceCities: JSON.stringify([
          'Dansville', 'Perkinsville', 'Wayland', 'Canaseraga', 'Scottsburg',
          'Nunda', 'Arkport', 'Groveland', 'Swain', 'Cohocton', 'Dalton',
          'Springwater', 'Sonyea', 'Atlanta', 'Conesus', 'Mount Morris',
          'Hornell', 'Avoca', 'Hunt', 'Naples', 'Hemlock', 'Honeoye', 'Livonia',
          'Almond', 'Castile', 'Geneseo', 'Portageville', 'Angelica', 'Leicester',
          'Livonia Center', 'Silver Lake', 'Prattsburgh', 'Lakeville', 'Fillmore',
          'Kanona', 'Alfred', 'Perry', 'Canisteo', 'Silver Springs', 'Alfred Station',
          'South Lima', 'Retsof', 'Piffard', 'Bath', 'Hume', 'Pike', 'Lima',
          'Middlesex', 'Avon', 'Branchport', 'York', 'Gainesville', 'Pavilion',
          'Belmont', 'Cameron', 'West Bloomfield', 'Bliss', 'Bloomfield',
          'Rushville', 'Greenwood', 'Linwood', 'Houghton', 'Belfast', 'Warsaw',
          'Pulteney', 'Hammondsport', 'East Bloomfield', 'Andover', 'Caneadea',
          'Caledonia', 'Canandaigua', 'Jasper', 'Wyoming', 'Rushford', 'Keuka Park',
        ]),
        serviceCounties: JSON.stringify([
          'Livingston', 'Steuben', 'Allegany', 'Ontario', 'Wyoming', 'Yates', 'Genesee',
        ]),
        serviceAreaRadius: 40,
        lat: 42.5609,
        lng: -77.6958,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: '8:00 AM - 12:00 PM',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Reisdorf Oil & Propane',
        slug: 'reisdorf-oil-propane',
        phone: '(585) 786-2560',
        email: 'tonypeca@gmail.com',
        website: 'https://reisdorfoil.com',
        addressLine1: '3758 S Warsaw Rd',
        city: 'Warsaw',
        state: 'NY',
        serviceCities: JSON.stringify([
          'Warsaw', 'Wyoming', 'Dale', 'Silver Springs', 'Perry', 'Silver Lake',
          'Pavilion', 'Gainesville', 'Varysburg', 'Castile', 'Attica',
          'East Bethany', 'Leicester', 'North Java', 'Alexander', 'Piffard',
          'Mount Morris', 'Bliss', 'Retsof', 'York', 'Pike', 'Java Center',
          'Linwood', 'Strykersville', 'Darien Center', 'Portageville', 'Stafford',
          'Sonyea', 'Batavia', 'Cowlesville', 'Java Village', 'Hunt', 'Le Roy',
          'Caledonia', 'Nunda', 'East Pembroke', 'Dalton', 'Geneseo', 'Arcade',
          'Groveland', 'South Byron', 'Hume', 'Wales Center', 'Avon', 'Alden',
          'South Wales', 'Mumford', 'Freedom', 'Corfu', 'Fillmore', 'Swain',
          'Centerville', 'Marilla', 'Lakeville', 'Crittenden', 'Byron', 'Sandusky',
          'Scottsburg', 'Chaffee', 'Livonia', 'Conesus', 'Holland', 'South Lima',
          'Yorkshire', 'Elba', 'Oakfield', 'Houghton', 'Dansville', 'Bergen',
          'Livonia Center', 'Basom', 'East Aurora', 'Sardinia', 'Farmersville Station',
          'Canaseraga',
        ]),
        serviceCounties: JSON.stringify([
          'Wyoming', 'Genesee', 'Livingston', 'Allegany', 'Erie', 'Monroe',
          'Cattaraugus', 'Ontario', 'Steuben', 'Orleans',
        ]),
        serviceAreaRadius: 50,
        lat: 42.7395,
        lng: -78.1326,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Hometowne Energy',
        slug: 'hometowne-energy',
        phone: '(585) 391-4529',
        email: null,
        website: 'https://www.hometowneenergy.com',
        addressLine1: '500 Holley Street',
        city: 'Brockport',
        state: 'NY',
        serviceCities: JSON.stringify([
          'Brockport', 'Rochester', 'Newark', 'Penn Yan', 'Henrietta',
          'West Henrietta', 'Pittsford', 'East Rochester', 'Spencerport',
          'North Greece', 'Rush', 'Penfield', 'Churchville', 'Adams Basin',
          'Mendon', 'Honeoye Falls', 'Webster', 'Fishers', 'Fairport',
          'Mumford', 'Hilton', 'Bergen', 'Clarkson', 'Victor', 'Macedon',
          'West Bloomfield', 'Caledonia', 'Avon', 'Le Roy', 'Lima',
          'South Lima', 'Walworth', 'East Bloomfield', 'Hamlin', 'Bloomfield',
          'Linwood', 'Holley', 'Byron', 'Lakeville', 'Clarendon', 'Livonia Center',
          'York', 'Shortsville', 'Palmyra', 'Geneseo', 'Livonia', 'Retsof',
          'Piffard', 'Manchester', 'Marion', 'Elba', 'Hemlock', 'Williamson',
          'Canandaigua', 'Honeoye', 'Leicester', 'Conesus', 'Batavia',
          'Geneva', 'Seneca Falls', 'Waterloo', 'Clifton Springs', 'Phelps',
          'Naples', 'Dundee', 'Ovid', 'Gorham', 'Stanley', 'Rushville',
          'Springwater', 'Wayland', 'Cohocton', 'Dansville',
        ]),
        serviceCounties: JSON.stringify([
          'Monroe', 'Livingston', 'Ontario', 'Wayne', 'Genesee', 'Orleans',
          'Wyoming', 'Yates', 'Seneca',
        ]),
        serviceAreaRadius: 50,
        lat: 43.2137,
        lng: -77.9392,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Rinker Oil & Propane',
        slug: 'rinker-oil-propane',
        phone: '(585) 968-4884',
        email: null,
        website: 'https://www.rinkeroilandpropane.com',
        addressLine1: '29 Water Street',
        city: 'Cuba',
        state: 'NY',
        serviceCities: JSON.stringify([
          'Cuba', 'Black Creek', 'Hinsdale', 'West Clarksville', 'Friendship',
          'Belfast', 'Franklinville', 'Olean', 'Caneadea', 'Bolivar', 'Richburg',
          'Portville', 'Rushford', 'Scio', 'Ceres', 'Houghton', 'Allentown',
          'Little Genesee', 'Belmont', 'Allegany', 'Centerville', 'Alma',
          'Angelica', 'Freedom', 'Wellsville', 'Ellicottville', 'Hume', 'Fillmore',
          'Sandusky', 'Delevan', 'Almond', 'West Valley', 'Yorkshire', 'Pike',
          'Sardinia', 'Portageville', 'Arcade', 'Alfred', 'Bliss', 'Hunt',
          'Chaffee', 'Andover', 'Alfred Station', 'Salamanca', 'Little Valley',
          'Swain', 'Gainesville', 'Whitesville', 'Dalton', 'Canaseraga',
        ]),
        serviceCounties: JSON.stringify([
          'Allegany', 'Cattaraugus', 'Steuben', 'Wyoming', 'Erie', 'Livingston',
        ]),
        serviceAreaRadius: 45,
        lat: 42.2176,
        lng: -78.2753,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      // Expand NOCO Energy coverage for Lima/Cohocton offices
      {
        name: 'NOCO Energy',
        slug: 'noco-energy',
        phone: '(800) 662-6776',
        email: null,
        website: 'https://noco.com',
        addressLine1: '2688 East Main Street',
        city: 'Cato',
        state: 'NY',
        serviceCities: JSON.stringify([
          // Cato office
          'Cato', 'Weedsport', 'Van Buren', 'Fulton', 'Auburn', 'Oswego',
          'Port Byron', 'Jordan', 'Elbridge', 'Baldwinsville', 'Meridian',
          'Montezuma',
          // Lima/Rochester office
          'Lima', 'Avon', 'Livonia', 'Geneseo', 'Caledonia', 'Conesus',
          'Lakeville', 'Livonia Center', 'South Lima', 'Hemlock', 'Honeoye Falls',
          'Honeoye', 'Leicester', 'Mount Morris', 'Piffard', 'Retsof', 'York',
          'West Bloomfield', 'Bloomfield', 'East Bloomfield', 'Linwood',
          'Dansville', 'Nunda', 'Springwater',
          // Cohocton office
          'Cohocton', 'Bath', 'Hornell', 'Naples', 'Canandaigua', 'Wayland',
        ]),
        serviceCounties: JSON.stringify([
          'Cayuga', 'Oswego', 'Onondaga',
          'Livingston', 'Ontario', 'Monroe', 'Genesee', 'Wayne', 'Steuben',
        ]),
        serviceAreaRadius: 50,
        lat: 43.1694,
        lng: -76.5673,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
    ];

    for (const s of suppliers) {
      await upsertSupplier(sequelize, s);
    }

    console.log('[Migration 109] Added 4 Dansville NY suppliers + expanded NOCO coverage');
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('valley-propane-fuels', 'reisdorf-oil-propane', 'hometowne-energy', 'rinker-oil-propane')`
    );
    // Note: NOCO rollback not included — it's an expansion, not a new record
  }
};
