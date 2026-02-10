/**
 * Migration 037: Add/Update Alaska suppliers
 * - Homerun Oil (Homer) - NEW
 * - Ike's Fuel (Juneau/Douglas) - NEW
 * - Sourdough Fuel (Fairbanks) - UPDATE existing with enriched data
 * All verified COD/will-call suppliers via web research
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '037-add-alaska-suppliers',

  async up(sequelize) {
    const newSuppliers = [
      {
        id: uuidv4(),
        name: 'Homerun Oil',
        slug: 'homerun-oil',
        phone: '(907) 235-1393',
        email: null, // Not found on website
        website: 'https://homerunoil.com',
        addressLine1: '60998 East End Road',
        city: 'Homer',
        state: 'AK',
        postalCodesServed: JSON.stringify([
          // Southern Kenai Peninsula
          '99603', // Homer
          '99556', // Anchor Point
          '99610', // Kasilof
          '99669', // Soldotna (may serve)
          '99631'  // Moose Pass (may serve)
        ]),
        serviceCities: JSON.stringify([
          'Homer', 'Anchor Point', 'Kasilof', 'Soldotna', 'Ninilchik', 'Fritz Creek', 'Halibut Cove'
        ]),
        serviceCounties: JSON.stringify(['Kenai Peninsula']),
        serviceAreaRadius: 50,
        lat: 59.643,
        lng: -151.548,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'propane']),
        minimumGallons: null, // Not specified
        hoursWeekday: '8:00 AM - 5:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(907) 299-6633',
        seniorDiscount: 'unknown',
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: "Ike's Fuel",
        slug: 'ikes-fuel',
        phone: '(907) 364-3420',
        email: 'ikesfuelinc@gmail.com',
        website: 'https://www.ikesfuelinc.net',
        addressLine1: '409 5th Street',
        city: 'Douglas',
        state: 'AK',
        postalCodesServed: JSON.stringify([
          // Juneau area
          '99801', // Juneau
          '99824'  // Douglas
        ]),
        serviceCities: JSON.stringify([
          'Juneau', 'Douglas'
        ]),
        serviceCounties: JSON.stringify(['Juneau']),
        serviceAreaRadius: 20,
        lat: 58.276,
        lng: -134.394,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null, // Not specified
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true, // Has after-hours call-out service
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Insert new suppliers
    for (const supplier of newSuppliers) {
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
          weekendDelivery: supplier.weekendDelivery === true ? 'yes' : 'no',
          emergencyDelivery: supplier.emergencyDelivery === true ? 'yes' : 'no',
          allowPriceDisplay: supplier.allowPriceDisplay === true
        }
      });
    }

    // Update existing Sourdough Fuel with enriched data
    await sequelize.query(`
      UPDATE suppliers SET
        address_line1 = '418 Illinois Street',
        postal_codes_served = :postalCodesServed,
        service_cities = :serviceCities,
        service_counties = :serviceCounties,
        service_area_radius = 30,
        lat = 64.644,
        lng = -147.522,
        payment_methods = :paymentMethods,
        fuel_types = :fuelTypes,
        hours_weekday = '8:00 AM - 5:00 PM',
        hours_saturday = '9:00 AM - 3:00 PM',
        hours_sunday = NULL,
        weekend_delivery = 'no',
        emergency_delivery = 'unknown',
        updated_at = NOW()
      WHERE slug = 'sourdough-fuel'
    `, {
      replacements: {
        postalCodesServed: JSON.stringify([
          '99701', // Fairbanks
          '99705', // North Pole
          '99709', // Fairbanks (west)
          '99712', // Fairbanks (north)
          '99714'  // Salcha
        ]),
        serviceCities: JSON.stringify([
          'Fairbanks', 'North Pole', 'Salcha', 'Ester', 'Two Rivers'
        ]),
        serviceCounties: JSON.stringify(['Fairbanks North Star']),
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel'])
      }
    });

    // Safety: ensure allowPriceDisplay is false for new suppliers
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN ('homerun-oil', 'ikes-fuel') AND allow_price_display = true
    `);

    console.log('✅ Migration 037: Added Homerun Oil, Ike\'s Fuel, updated Sourdough Fuel');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN ('homerun-oil', 'ikes-fuel')
    `);
    console.log('✅ Migration 037 rolled back');
  }
};
