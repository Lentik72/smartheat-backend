/**
 * Migration 033: Add Kent County, DE (Magnolia 19962) area suppliers
 * Terroco Oil - verified COD heating oil supplier
 * Serves both Delaware ($3.999) and Maryland ($4.099) with different pricing
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '033-add-kent-county-de-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Terroco Oil',
        slug: 'terroco-oil-de',
        phone: '(302) 734-7433',
        website: 'https://terrocooil.com',
        addressLine1: '3799 N. Dupont Hwy',
        city: 'Dover',
        state: 'DE',
        postalCodesServed: JSON.stringify([
          // Kent County, DE
          '19901', '19902', '19903', '19904', '19905', '19906', // Dover
          '19934', // Camden Wyoming
          '19936', // Cheswold
          '19938', // Clayton
          '19943', // Felton
          '19946', // Frederica
          '19952', // Harrington
          '19953', // Hartly
          '19954', // Houston
          '19955', // Kenton
          '19960', // Lincoln
          '19961', // Little Creek
          '19962', // Magnolia
          '19964', // Marydel (DE side)
          '19977', // Smyrna
          '19979', // Viola
          '19980', // Woodside
          // New Castle County, DE (southern)
          '19709', // Middletown
          '19730', // Odessa
          '19734', // Townsend
          // Sussex County, DE
          '19933', // Bridgeville
          '19941', // Ellendale
          '19943', // Felton
          '19947', // Georgetown
          '19950', // Greenwood
          '19956', // Laurel
          '19963', // Milford
          '19966', // Millsboro
          '19968', // Milton
          '19971', // Rehoboth Beach
          '19973', // Seaford
          '19975'  // Selbyville
        ]),
        serviceCities: JSON.stringify([
          'Dover', 'Dover AFB', 'Camden Wyoming', 'Cheswold', 'Clayton',
          'Felton', 'Frederica', 'Harrington', 'Hartly', 'Houston',
          'Kenton', 'Lincoln', 'Little Creek', 'Magnolia', 'Marydel',
          'Smyrna', 'Viola', 'Woodside', 'Middletown', 'Odessa', 'Townsend',
          'Bridgeville', 'Ellendale', 'Georgetown', 'Greenwood', 'Laurel',
          'Milford', 'Millsboro', 'Milton', 'Rehoboth Beach', 'Seaford', 'Selbyville'
        ]),
        serviceCounties: JSON.stringify(['Kent', 'New Castle', 'Sussex']),
        serviceAreaRadius: 40,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: '8:00am-4:30pm',
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
        name: 'Terroco Oil',
        slug: 'terroco-oil-md',
        phone: '(302) 734-7433',
        website: 'https://terrocooil.com',
        addressLine1: '3799 N. Dupont Hwy',
        city: 'Dover',
        state: 'MD',
        postalCodesServed: JSON.stringify([
          // Caroline County, MD
          '21629', // Denton
          '21632', // Federalsburg
          '21636', // Goldsboro
          '21639', // Greensboro
          '21640', // Henderson
          '21649', // Marydel (MD side)
          '21655', // Preston
          '21660', // Ridgely
          // Queen Anne's County, MD
          '21607', // Barclay
          '21617', // Church Hill
          '21619', // Chester
          '21620', // Chestertown
          '21623', // Crumpton
          '21628', // Grasonville
          '21644', // Ingleside
          '21657', // Queen Anne
          '21666', // Queenstown
          '21668', // Stevensville
          // Kent County, MD
          '21610', // Betterton
          '21620', // Chestertown
          '21645', // Kennedyville
          '21651', // Millington
          '21661', // Rock Hall
          '21667', // Still Pond
          // Talbot County, MD
          '21601', // Easton
          '21612', // Bozman
          '21625', // Cordova
          '21647', // McDaniel
          '21652', // Neavitt
          '21654', // Oxford
          '21663', // St Michaels
          '21671', // Tilghman
          '21673', // Trappe
          '21676', // Wittman
          // Dorchester County, MD
          '21613', // Cambridge
          '21622', // Church Creek
          '21631', // East New Market
          '21634', // Fishing Creek
          '21635', // Galena
          '21643', // Hurlock
          '21659', // Rhodesdale
          '21664', // Secretary
          '21669', // Taylors Island
          '21672', // Toddville
          // Cecil County, MD (southern)
          '21911', // Rising Sun
          '21915', // Chesapeake City
          '21921'  // Elkton
        ]),
        serviceCities: JSON.stringify([
          'Denton', 'Federalsburg', 'Goldsboro', 'Greensboro', 'Henderson',
          'Marydel', 'Preston', 'Ridgely', 'Barclay', 'Church Hill',
          'Chester', 'Chestertown', 'Crumpton', 'Grasonville', 'Ingleside',
          'Queen Anne', 'Queenstown', 'Stevensville', 'Betterton', 'Kennedyville',
          'Millington', 'Rock Hall', 'Still Pond', 'Easton', 'Cordova',
          'Oxford', 'St Michaels', 'Trappe', 'Cambridge', 'Hurlock',
          'Secretary', 'Elkton', 'Chesapeake City', 'Rising Sun'
        ]),
        serviceCounties: JSON.stringify(['Caroline', 'Queen Anne\'s', 'Kent', 'Talbot', 'Dorchester', 'Cecil']),
        serviceAreaRadius: 40,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: '8:00am-4:30pm',
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
        ON CONFLICT (slug) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          addressLine1: supplier.addressLine1 || null,
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

      console.log(`[Migration 033] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'terroco-oil-de',
        'terroco-oil-md'
      )
    `);
  }
};
