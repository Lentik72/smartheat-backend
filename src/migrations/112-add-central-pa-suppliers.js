/**
 * Migration 112: Add Central PA suppliers for 17007 (Boiling Springs) coverage gap
 *
 * Coverage gap triggered by price alert subscriber in uncovered ZIP 17007.
 *
 * New suppliers:
 *   - Dolan Oil Service (York Haven, PA) — COD + will-call confirmed. Scrapable prices.
 *     Northern York County + Southern Cumberland County. Oil $4.799, propane $2.10.
 *   - Talley Petroleum (Grantville, PA) — Will-call confirmed. No scrapable prices.
 *     Residential: Dauphin/Cumberland/Lebanon/Perry/Schuylkill counties.
 *
 * Also adds 17007 to Best Price Oil and Edris Oil coverage via scrape-config.json.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '112-add-central-pa-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Dolan Oil Service',
        slug: 'dolan-oil-service',
        phone: '(717) 938-8080',
        email: 'Jackie@DolanOilService.com',
        website: 'https://dolanoilservice.com',
        addressLine1: '955 York Haven Road',
        city: 'York Haven',
        state: 'PA',
        serviceCities: JSON.stringify([
          'York Haven', 'York', 'West York', 'East York', 'Dover', 'Dillsburg',
          'Mechanicsburg', 'Camp Hill', 'Lemoyne', 'New Cumberland', 'Etters',
          'Red Lion', 'Dallastown', 'Manchester', 'Lewisberry', 'Wellsville',
          'Franklintown', 'Rossville', 'Mount Wolf', 'Wrightsville', 'Hallam',
          'East Prospect', 'Windsor', 'Jacobus', 'Thomasville', 'Newberrytown',
          'Goldsboro', 'Grantham', 'Bowmansdale', 'Lisburn', 'Admire',
          'Davidsburg', 'Shiloh', 'Strinestown', 'Kralltown', 'New Salem',
          'Yorklyn', 'Yorkana', 'Cly', 'Yocumtown',
        ]),
        serviceCounties: JSON.stringify(['York', 'Cumberland']),
        serviceAreaRadius: 25,
        lat: 40.0678,
        lng: -76.7203,
        hoursWeekday: '7:30 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: 100,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        name: 'Talley Petroleum',
        slug: 'talley-petroleum',
        phone: '(717) 469-0338',
        email: 'info@talleypetro.com',
        website: 'https://talleypetro.com',
        addressLine1: '10046 Allentown Blvd',
        city: 'Grantville',
        state: 'PA',
        serviceCities: JSON.stringify([
          'Grantville', 'Harrisburg', 'Hershey', 'Hummelstown', 'Middletown',
          'Palmyra', 'Annville', 'Lebanon', 'Carlisle', 'Mechanicsburg',
          'Camp Hill', 'Enola', 'Duncannon', 'Marysville', 'Newport',
          'Lykens', 'Elizabethville', 'Millersburg', 'Pottsville',
          'Minersville', 'Schuylkill Haven', 'Boiling Springs',
        ]),
        serviceCounties: JSON.stringify([
          'Dauphin', 'Cumberland', 'Lebanon', 'Perry', 'Schuylkill',
        ]),
        serviceAreaRadius: 50,
        lat: 40.3734,
        lng: -76.6827,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
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

    console.log('[Migration 112] Added 2 Central PA suppliers (Dolan Oil Service, Talley Petroleum)');
  },
};
