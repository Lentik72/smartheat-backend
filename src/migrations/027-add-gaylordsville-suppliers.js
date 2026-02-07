/**
 * Migration 027: Add Gaylordsville area suppliers
 * Jennings Oil & Propane and Marandola Fuel Service - both located IN Gaylordsville
 * Also updates Hometown Fuel to include 06755
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '027-add-gaylordsville-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Jennings Oil & Propane',
        slug: 'jennings-oil-propane',
        phone: '(860) 354-4303',
        website: 'https://jenningsoil.com',
        addressLine1: '10 Allen Drive',
        city: 'Gaylordsville',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06755', // Gaylordsville
          '06776', // New Milford
          '06752', // Bridgewater
          '06757', // Kent
          '06785', // South Kent
          '06793', // Washington
          '06794', // Washington Depot
          '06783', // Roxbury
          '06058', // Norfolk
          '06068', // Salisbury
          '06039', // Lakeville
          '06018', // Canaan
          '06024', // East Canaan
          '06031', // Falls Village
          '06069'  // Sharon
        ]),
        serviceCities: JSON.stringify([
          'Gaylordsville', 'New Milford', 'Bridgewater', 'Kent', 'South Kent',
          'Washington', 'Washington Depot', 'Roxbury', 'Norfolk', 'Salisbury',
          'Lakeville', 'Canaan', 'East Canaan', 'Falls Village', 'Sharon'
        ]),
        serviceCounties: JSON.stringify(['Litchfield']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'kerosene']),
        minimumGallons: 100,
        hoursWeekday: '7:30am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: 'Family owned for 40+ years. Oil terminal in Danbury, propane facility in Gaylordsville. 24/7 emergency service.',
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Marandola Fuel Service',
        slug: 'marandola-fuel-service',
        phone: '(860) 355-4877',
        website: 'https://www.marandolafuel.com',
        addressLine1: '10 Allen Drive',
        city: 'Gaylordsville',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06755', // Gaylordsville
          '06776', // New Milford
          '06752', // Bridgewater
          '06757', // Kent
          '06793', // Washington
          '06783', // Roxbury
          '06804', // Brookfield
          '06801', // Bethel
          '06810', '06811', // Danbury
          '06812'  // New Fairfield
        ]),
        serviceCities: JSON.stringify([
          'Gaylordsville', 'New Milford', 'Bridgewater', 'Kent',
          'Washington', 'Roxbury', 'Brookfield', 'Bethel', 'Danbury', 'New Fairfield'
        ]),
        serviceCounties: JSON.stringify(['Litchfield', 'Fairfield']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'bioheat']),
        minimumGallons: null,
        hoursWeekday: '8:00am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        seniorDiscount: false,
        notes: 'Offers bioheat home heating oil and oil burner service/installation.',
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

      console.log(`[Migration 027] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }

    // Update Hometown Fuel to include 06755 (Gaylordsville)
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = postal_codes_served || '["06755"]'::jsonb,
          service_cities = service_cities || '["Gaylordsville"]'::jsonb,
          updated_at = NOW()
      WHERE slug = 'hometown-fuel-ct'
        AND NOT (postal_codes_served ? '06755')
    `);
    console.log('[Migration 027] Updated Hometown Fuel to serve Gaylordsville');

    // Update Thermanet to include 06755 if not already (they serve New Milford)
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = postal_codes_served || '["06755"]'::jsonb,
          service_cities = service_cities || '["Gaylordsville"]'::jsonb,
          updated_at = NOW()
      WHERE name ILIKE '%thermanet%'
        AND NOT (postal_codes_served ? '06755')
    `);
    console.log('[Migration 027] Updated Thermanet to serve Gaylordsville');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('jennings-oil-propane', 'marandola-fuel-service')
    `);
  }
};
