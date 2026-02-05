/**
 * Migration 028: Add Vernon/Tolland County area suppliers
 * Verified via web search to serve 06066 (Vernon Rockville)
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '028-add-vernon-area-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Gottier Fuel Company',
        slug: 'gottier-fuel-company',
        phone: '(860) 875-6281',
        website: 'https://www.gottierfuel.com',
        addressLine1: '221 W Main St',
        city: 'Vernon Rockville',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06066', // Vernon Rockville
          '06084', // Tolland
          '06029', // Ellington
          '06074', // South Windsor
          '06238', // Coventry
          '06043', // Bolton
          '06279', // Willington
          '06040', '06042', // Manchester
          '06071', // Somers
          '06016'  // Broad Brook
        ]),
        serviceCities: JSON.stringify([
          'Vernon', 'Vernon Rockville', 'Rockville', 'Tolland', 'Ellington',
          'South Windsor', 'Coventry', 'Bolton', 'Willington', 'Manchester',
          'Somers', 'Broad Brook'
        ]),
        serviceCounties: JSON.stringify(['Tolland', 'Hartford']),
        serviceAreaRadius: 20,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: '7:30am-5:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Family owned since 1960. Automatic delivery system. 24-hour emergency service.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Troiano Oil Company',
        slug: 'troiano-oil-company',
        phone: '(860) 745-0321',
        website: 'https://www.troianooil.com',
        addressLine1: '777 Enfield St',
        city: 'Enfield',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06082', // Enfield
          '06066', // Vernon Rockville
          '06084', // Tolland
          '06029', // Ellington
          '06040', '06042', // Manchester
          '06074', // South Windsor
          '06016', // Broad Brook
          '06088', // East Windsor
          '06078', // Suffield
          '06096', // Windsor Locks
          '06095', // Windsor
          '06002', // Bloomfield
          '06071', // Somers
          '06238', // Coventry
          '06043'  // Bolton
        ]),
        serviceCities: JSON.stringify([
          'Enfield', 'Vernon', 'Vernon Rockville', 'Tolland', 'Ellington',
          'Manchester', 'South Windsor', 'Broad Brook', 'East Windsor',
          'Suffield', 'Windsor Locks', 'Windsor', 'Bloomfield', 'Somers',
          'Coventry', 'Bolton', 'Glastonbury', 'East Hartford'
        ]),
        serviceCounties: JSON.stringify(['Hartford', 'Tolland']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: '8:00am-4:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Family owned since 1934. Three generations. Automatic and Will Call delivery.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Ferguson Oil',
        slug: 'ferguson-oil-ct',
        phone: '(860) 698-9472',
        website: 'https://ferguson-oil.com',
        addressLine1: '78 Brainard Rd',
        city: 'Enfield',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06082', // Enfield
          // Note: Vernon 06066 NOT verified - only adjacent Manchester confirmed
          '06040', '06042', // Manchester
          '06074', // South Windsor
          '06088', // East Windsor
          '06078', // Suffield
          '06096', // Windsor Locks
          '06095', // Windsor
          '06002', // Bloomfield
          '06001', // Avon
          '06010', // Bristol
          '06051', '06052', // New Britain
          '06037', // Berlin
          '06106', '06114', // Hartford
          '06108', // East Hartford
          '06033'  // Glastonbury
        ]),
        serviceCities: JSON.stringify([
          'Enfield', 'Manchester', 'South Windsor', 'East Windsor',
          'Suffield', 'Windsor Locks', 'Windsor', 'Bloomfield', 'Avon',
          'Bristol', 'New Britain', 'Berlin', 'Hartford', 'East Hartford',
          'Glastonbury', 'Farmington'
        ]),
        serviceCounties: JSON.stringify(['Hartford', 'Middlesex', 'New London']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Delivers premium Heating Oil Plus. Online ordering available.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Connecticut Valley Oil',
        slug: 'connecticut-valley-oil',
        phone: null,
        website: 'https://www.ctvalleyoil.com',
        addressLine1: null,
        city: 'Enfield',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06082', // Enfield
          '06066', // Vernon Rockville
          '06084', // Tolland
          '06029', // Ellington
          '06040', '06042', // Manchester
          '06074', // South Windsor
          '06016', // Broad Brook
          '06088', // East Windsor
          '06078', // Suffield
          '06096', // Windsor Locks
          '06095', // Windsor
          '06002', // Bloomfield
          '06071', // Somers
          '06043', // Bolton
          '06026', // East Granby
          '06070'  // Simsbury
        ]),
        serviceCities: JSON.stringify([
          'Enfield', 'Vernon Rockville', 'Tolland', 'Ellington', 'Manchester',
          'South Windsor', 'Broad Brook', 'East Windsor', 'Suffield',
          'Windsor Locks', 'Windsor', 'Bloomfield', 'Somers', 'Bolton',
          'East Granby', 'Simsbury', 'Granby', 'Stafford', 'Stafford Springs'
        ]),
        serviceCounties: JSON.stringify(['Hartford', 'Tolland']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        seniorDiscount: false,
        notes: 'Since 1980. Online ordering 24/7. Next-day delivery on weekdays.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Homestead Comfort',
        slug: 'homestead-comfort',
        phone: '(860) 791-3166',
        website: 'https://www.homesteadcomfort.com',
        addressLine1: '100 West Road, #2',
        city: 'Ellington',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06029', // Ellington
          '06066', // Vernon Rockville
          '06084', // Tolland
          '06040', '06042', // Manchester
          '06074', // South Windsor
          '06095', // Windsor
          '06248', // Hebron
          '06043', // Bolton
          '06238', // Coventry
          '06071', // Somers
          '06279', // Willington
          '06232'  // Andover
        ]),
        serviceCities: JSON.stringify([
          'Ellington', 'Vernon', 'Tolland', 'Manchester', 'South Windsor',
          'Windsor', 'Hebron', 'Bolton', 'Coventry', 'Somers', 'Willington',
          'Andover', 'Columbia', 'Wethersfield'
        ]),
        serviceCounties: JSON.stringify(['Tolland', 'Hartford', 'Windham']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'bioheat', 'propane', 'diesel']),
        minimumGallons: null,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Over 30 years in business. 24/7 emergency service. Bioheat fuel available. 10c off with auto delivery.',
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
          phone: supplier.phone || null,
          addressLine1: supplier.addressLine1 || null,
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

      console.log(`[Migration 028] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }

    // Update existing suppliers to include 06066

    // Roberts Discount Fuel - verified serves Vernon Rockville
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = postal_codes_served || '["06066"]'::jsonb,
          service_cities = service_cities || '["Vernon Rockville", "Vernon"]'::jsonb,
          updated_at = NOW()
      WHERE name ILIKE '%roberts discount%'
        AND NOT (postal_codes_served ? '06066')
    `);
    console.log('[Migration 028] Updated Roberts Discount Fuel to serve Vernon 06066');

    // E-Z Oil Company - verified serves Vernon
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = postal_codes_served || '["06066"]'::jsonb,
          service_cities = service_cities || '["Vernon Rockville", "Vernon"]'::jsonb,
          updated_at = NOW()
      WHERE name ILIKE '%e-z oil%'
        AND NOT (postal_codes_served ? '06066')
    `);
    console.log('[Migration 028] Updated E-Z Oil Company to serve Vernon 06066');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'gottier-fuel-company',
        'troiano-oil-company',
        'ferguson-oil-ct',
        'connecticut-valley-oil',
        'homestead-comfort'
      )
    `);
  }
};
