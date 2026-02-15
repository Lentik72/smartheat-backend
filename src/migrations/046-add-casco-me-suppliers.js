/**
 * Migration 046: Add Casco, ME (Lakes Region) Suppliers
 * Fills coverage gap for ZIP 04015 and surrounding Lakes Region
 *
 * - Jamison Energy (Standish, ME) - Family owned COD since 2001, scrapable
 * - Higgins Energy (Cumberland Center, ME) - Low cash price, same-day delivery
 * - Sea Land Energy (Windham, ME) - Will-call + auto delivery, scrapable
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '046-add-casco-me-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // JAMISON ENERGY - Standish, ME (Lakes Region)
      // ============================================
      {
        id: uuidv4(),
        name: 'Jamison Energy',
        slug: 'jamison-energy',
        phone: '(207) 642-4313',
        email: 'mail@jamisonenergy.com',
        website: 'http://www.jamisonenergy.com',
        addressLine1: '140 Ossipee Trail East',
        city: 'Standish',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Full delivery
          '04091', // Baldwin (West Baldwin)
          '04093', // Buxton
          '04020', // Cornish
          '04038', // Gorham
          '04042', // Hollis Center
          '04049', // Limington
          '04084', // Standish
          '04085', // Steep Falls
          '04062', // Windham
          // Limited delivery (call to confirm)
          '04015', // Casco
          '04039', // Gray
          '04046', // Hiram (partial)
          '04048', // Limerick
          '04055', // Naples
          '04260', // New Gloucester
          '04071', // Raymond
          '04029', // Sebago
          '04074', // Scarborough
          '04087', // Waterboro
          '04092'  // Westbrook
        ]),
        serviceCities: JSON.stringify([
          'Baldwin', 'Buxton', 'Cornish', 'Gorham', 'Hollis', 'Limington',
          'Standish', 'Steep Falls', 'Windham', 'Casco', 'Gray', 'Hiram',
          'Limerick', 'Naples', 'New Gloucester', 'Raymond', 'Sebago',
          'Scarborough', 'Waterboro', 'Westbrook'
        ]),
        serviceCounties: JSON.stringify(['Cumberland', 'York', 'Oxford']),
        serviceAreaRadius: 30,
        lat: 43.7584,
        lng: -70.5662,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'gasoline']),
        minimumGallons: 100,
        hoursWeekday: 'Mon-Thu 7:30 AM - 4:00 PM, Fri 7:30 AM - 3:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: true, // Scrapable
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // HIGGINS ENERGY - Cumberland Center, ME
      // ============================================
      {
        id: uuidv4(),
        name: 'Higgins Energy',
        slug: 'higgins-energy',
        phone: '(207) 829-1842',
        email: 'dhiggins4@maine.rr.com',
        website: 'https://higgins-energy.com',
        addressLine1: '30 Frost Ridge Dr',
        city: 'Cumberland Center',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Cumberland County
          '04021', // Cumberland Center
          '04110', // Cumberland Foreside
          '04015', // Casco
          '04077', // South Casco
          '04071', // Raymond
          '04039', // Gray
          '04105', // Falmouth
          '04032', // Freeport
          '04078', // South Freeport
          '04038', // Gorham
          '04062', // Windham
          '04084', // Standish
          '04074', // Scarborough
          '04092', // Westbrook
          '04096', // Yarmouth
          '04097', // North Yarmouth
          '04260', // New Gloucester
          '04101', // Portland
          '04102', // Portland
          '04103', // Portland
          '04106', // South Portland
          '04107', // Cape Elizabeth
          '04011', // Brunswick
          '04079', // Harpswell
          '04069', // Pownal
          '04108', // Peaks Island
          // Androscoggin County
          '04222', // Durham
          '04223', // Danville
          '04252', // Lisbon Falls
          '04274'  // Poland
        ]),
        serviceCities: JSON.stringify([
          'Bailey Island', 'Brunswick', 'Cape Elizabeth', 'Casco', 'Chebeague Island',
          'Cumberland', 'Cumberland Foreside', 'Danville', 'Durham', 'East Poland',
          'Falmouth', 'Freeport', 'Gorham', 'Gray', 'Harpswell', 'Lisbon',
          'Long Island', 'New Gloucester', 'North Yarmouth', 'Orrs Island',
          'Peaks Island', 'Poland', 'Portland', 'Pownal', 'Raymond', 'Scarborough',
          'South Casco', 'South Freeport', 'South Portland', 'South Windham',
          'Standish', 'Westbrook', 'Windham', 'Yarmouth'
        ]),
        serviceCounties: JSON.stringify(['Cumberland', 'Androscoggin']),
        serviceAreaRadius: 35,
        lat: 43.7962,
        lng: -70.2563,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
        minimumGallons: 100,
        hoursWeekday: 'Mon-Fri 7:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        notes: 'Same-day delivery at no extra cost. Text ordering available.',
        active: true,
        verified: false,
        allowPriceDisplay: false, // Not scrapable
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // SEA LAND ENERGY - Windham, ME
      // ============================================
      {
        id: uuidv4(),
        name: 'Sea Land Energy',
        slug: 'sea-land-energy',
        phone: '(207) 892-3284',
        email: 'sealand-me@outlook.com',
        website: 'https://www.sealandenergymaine.com',
        addressLine1: 'PO Box 277',
        city: 'Windham',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          '04062', // Windham
          '04015', // Casco
          '04071', // Raymond
          '04039', // Gray
          '04105', // Falmouth
          '04032', // Freeport
          '04038', // Gorham
          '04084', // Standish
          '04074', // Scarborough
          '04092', // Westbrook
          '04096', // Yarmouth
          '04097', // North Yarmouth
          '04260', // New Gloucester
          '04101', // Portland
          '04102', // Portland
          '04103', // Portland
          '04106', // South Portland
          '04107', // Cape Elizabeth
          '04021'  // Cumberland
        ]),
        serviceCities: JSON.stringify([
          'Cape Elizabeth', 'Casco', 'Cumberland', 'Falmouth', 'Freeport',
          'Gorham', 'Gray', 'New Gloucester', 'North Yarmouth', 'Portland',
          'Raymond', 'Scarborough', 'South Portland', 'Standish', 'Westbrook',
          'Windham', 'Yarmouth'
        ]),
        serviceCounties: JSON.stringify(['Cumberland']),
        serviceAreaRadius: 25,
        lat: 43.7998,
        lng: -70.4274,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel', 'gasoline']),
        minimumGallons: null,
        hoursWeekday: 'Mon-Fri 8:30 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: 'unknown',
        notes: 'Offers both auto delivery and will-call delivery. Also provides marine fuel.',
        active: true,
        verified: false,
        allowPriceDisplay: true, // Scrapable
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
          notes: supplier.notes || null,
          weekendDelivery: supplier.weekendDelivery === true ? 'yes' : 'no',
          emergencyDelivery: supplier.emergencyDelivery === true ? 'yes' : 'no',
          allowPriceDisplay: supplier.allowPriceDisplay === true
        }
      });
    }

    console.log('✅ Migration 046: Added 3 Casco/Lakes Region ME suppliers (Jamison, Higgins, Sea Land)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (
        'jamison-energy',
        'higgins-energy',
        'sea-land-energy'
      )
    `);
    console.log('✅ Migration 046 rolled back');
  }
};
