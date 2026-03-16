/**
 * Migration 108: Add Fulton NY / Oswego County area suppliers
 *
 * Coverage gap: ZIP 13069 (Fulton, Oswego County) had only Glider Oil.
 * Adding 5 suppliers to bring coverage to 6 total.
 *
 * New suppliers:
 *   - E & V Energy (Fulton, NY) — COD confirmed, no scrapable prices. 6 counties.
 *   - North Shore Oil / Mirabito (West Monroe, NY) — Will-call confirmed. 7 counties.
 *   - Liberty Fuels (Camden, NY) — COD confirmed, also propane COD. 6 counties.
 *   - Buell Fuels (Deansboro, NY) — Online ordering, 24hr service. 6 counties.
 *   - NOCO Energy (Cato, NY) — Will-call confirmed. Cato office covers Cayuga/Oswego.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '108-add-fulton-ny-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'E & V Energy',
        slug: 'e-v-energy',
        phone: '(315) 598-6778',
        email: 'fulton@eandvenergy.com',
        website: 'https://eandvenergy.com',
        addressLine1: '365 N First St',
        city: 'Fulton',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Fulton', 'Minetto', 'Oswego', 'Phoenix', 'Hannibal', 'Pennellville',
          'New Haven', 'Lycoming', 'Martville', 'Sterling', 'Plainville', 'Mexico',
          'Baldwinsville', 'Meridian', 'Hastings', 'Central Square', 'Clay',
          'Fair Haven', 'Brewerton', 'Cato', 'Mallory', 'Memphis', 'Maple View',
          'Liverpool', 'Red Creek', 'Parish', 'Warners', 'Jordan', 'West Monroe',
          'Weedsport', 'Syracuse', 'Cicero', 'Constantia', 'Elbridge', 'Camillus',
          'Pulaski', 'Port Byron', 'South Butler', 'Wolcott', 'Savannah',
          'Skaneateles Falls', 'Bridgeport', 'Marcellus', 'Bernhards Bay',
          'East Syracuse', 'Mottville', 'Rose', 'Orwell', 'Sandy Creek',
          'Montezuma', 'Minoa', 'North Rose', 'Altmar', 'Williamstown',
          'Kirkville', 'Sodus Point', 'Cleveland', 'Clyde', 'Fayetteville',
          'Alton', 'Nedrow',
        ]),
        serviceCounties: JSON.stringify([
          'Oswego', 'Cayuga', 'Onondaga', 'Wayne', 'Madison', 'Oneida',
        ]),
        serviceAreaRadius: 40,
        lat: 43.3219,
        lng: -76.4176,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'North Shore Oil',
        slug: 'north-shore-oil',
        phone: '(315) 668-8181',
        email: 'bpurdy@northshoreoil.com',
        website: 'https://northshoreoil.com',
        addressLine1: '2634 State Route 49',
        city: 'West Monroe',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'West Monroe', 'Central Square', 'Mallory', 'Constantia', 'Hastings',
          'Brewerton', 'Cicero', 'Bridgeport', 'Bernhards Bay', 'Pennellville',
          'Clay', 'Parish', 'Syracuse', 'Liverpool', 'Cleveland', 'Maple View',
          'Phoenix', 'East Syracuse', 'Kirkville', 'Williamstown', 'Minoa',
          'Westdale', 'Mexico', 'Fulton', 'North Bay', 'Altmar', 'Fayetteville',
          'Warners', 'New Haven', 'Baldwinsville', 'Sylvan Beach', 'Verona Beach',
          'Chittenango', 'Camden', 'McConnellsville', 'Pulaski', 'Blossvale',
          'Orwell', 'Plainville', 'Memphis', 'Camillus', 'Durhamville',
          'Lycoming', 'Minetto', 'Manlius', 'Canastota', 'Richland', 'Oswego',
          'Jamesville', 'Wampsville', 'Clockville', 'Meridian', 'Marcellus',
          'Jordan', 'Nedrow', 'Elbridge', 'Hannibal', 'Taberg', 'Sandy Creek',
          'Redfield', 'Verona', 'Pompey', 'Lacona', 'Martville', 'Oneida',
          'Mottville', 'Skaneateles Falls', 'Weedsport', 'Cazenovia', 'Cato',
          'La Fayette', 'Sherrill', 'Marietta', 'Lee Center', 'Sterling',
        ]),
        serviceCounties: JSON.stringify([
          'Oswego', 'Onondaga', 'Madison', 'Oneida', 'Cayuga', 'Jefferson', 'Lewis',
        ]),
        serviceAreaRadius: 50,
        lat: 43.2934,
        lng: -76.0865,
        hoursWeekday: '7:00 AM - 5:00 PM',
        hoursSaturday: '8:00 AM - 12:00 PM',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Liberty Fuels',
        slug: 'liberty-fuels',
        phone: '(315) 245-4035',
        email: 'Contact@libertyfuelscny.com',
        website: 'https://libertyfuelscny.com',
        addressLine1: '69 Liberty St',
        city: 'Camden',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Camden', 'Westdale', 'McConnellsville', 'Cleveland', 'Blossvale',
          'Taberg', 'North Bay', 'Williamstown', 'Bernhards Bay', 'Sylvan Beach',
          'Verona Beach', 'Durhamville', 'Lee Center', 'Constantia', 'West Leyden',
          'Bridgeport', 'Altmar', 'Verona', 'West Monroe', 'Ava', 'Rome',
          'Mallory', 'Canastota', 'Wampsville', 'Parish', 'Richland', 'Redfield',
          'Kirkville', 'Constableville', 'Hastings', 'Cicero', 'Central Square',
          'Orwell', 'Sherrill', 'Westernville', 'Chittenango', 'Oneida',
          'Clockville', 'Maple View', 'Vernon', 'Brewerton', 'Minoa',
          'East Syracuse', 'Vernon Center', 'Syracuse', 'Pulaski', 'Boonville',
          'Oriskany', 'Westmoreland', 'Fayetteville', 'Stittville', 'Pennellville',
          'Lacona', 'Holland Patent', 'Clay', 'Turin', 'Peterboro', 'Clark Mills',
          'Mexico', 'Whitesboro', 'Munnsville', 'Liverpool', 'Manlius', 'Knoxboro',
          'Marcy', 'Port Leyden', 'Franklin Springs', 'Alder Creek', 'Sandy Creek',
          'Lorraine', 'New York Mills', 'Cazenovia', 'Yorkville', 'Oriskany Falls',
          'Remsen',
        ]),
        serviceCounties: JSON.stringify([
          'Oneida', 'Oswego', 'Lewis', 'Madison', 'Onondaga', 'Jefferson',
        ]),
        serviceAreaRadius: 40,
        lat: 43.3348,
        lng: -75.7479,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Buell Fuels',
        slug: 'buell-fuels',
        phone: '(315) 841-3000',
        email: null,
        website: 'https://buellfuel.com',
        addressLine1: '2676 State Route 12B',
        city: 'Deansboro',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Deansboro', 'Franklin Springs', 'Clinton', 'Oriskany Falls', 'Knoxboro',
          'Sangerfield', 'Vernon Center', 'Waterville', 'Clark Mills', 'Westmoreland',
          'Solsville', 'New Hartford', 'Vernon', 'Madison', 'Chadwicks', 'Sauquoit',
          'Munnsville', 'Washington Mills', 'Cassville', 'Whitesboro', 'Bouckville',
          'Sherrill', 'New York Mills', 'Yorkville', 'North Brookfield', 'Oneida',
          'Oriskany', 'Clayville', 'Utica', 'Bridgewater', 'Morrisville',
          'Hubbardsville', 'Peterboro', 'Brookfield', 'Hamilton', 'Marcy', 'Verona',
          'Leonardsville', 'West Winfield', 'West Eaton', 'Wampsville',
          'West Edmeston', 'Frankfort', 'Rome', 'Clockville', 'Eaton', 'Stittville',
          'Canastota', 'Erieville', 'Ilion', 'Durhamville', 'Earlville',
          'Verona Beach', 'Cazenovia', 'Sylvan Beach', 'Holland Patent', 'Sherburne',
          'Burlington Flats', 'Edmeston', 'Richfield Springs', 'Barneveld',
          'Blossvale', 'Herkimer', 'Smyrna', 'Georgetown', 'Chittenango', 'Poland',
          'McConnellsville', 'North Bay', 'Lee Center', 'West Burlington',
          'New Woodstock', 'Mohawk', 'Schuyler Lake',
        ]),
        serviceCounties: JSON.stringify([
          'Oneida', 'Madison', 'Herkimer', 'Chenango', 'Otsego', 'Onondaga',
        ]),
        serviceAreaRadius: 50,
        lat: 42.9034,
        lng: -75.4008,
        hoursWeekday: '7:30 AM - 4:30 PM',
        hoursSaturday: '8:00 AM - 12:00 PM',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'NOCO Energy',
        slug: 'noco-energy',
        phone: '(800) 662-6776',
        email: null,
        website: 'https://noco.com',
        addressLine1: '2688 East Main Street',
        city: 'Cato',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Cato', 'Weedsport', 'Van Buren', 'Fulton', 'Auburn', 'Oswego',
          'Port Byron', 'Jordan', 'Elbridge', 'Baldwinsville', 'Meridian',
          'Montezuma',
        ]),
        serviceCounties: JSON.stringify([
          'Cayuga', 'Oswego', 'Onondaga',
        ]),
        serviceAreaRadius: 30,
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

    console.log('[Migration 108] Added 5 Fulton NY / Oswego County area suppliers');
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('e-v-energy', 'north-shore-oil', 'liberty-fuels', 'buell-fuels', 'noco-energy')`
    );
  }
};
