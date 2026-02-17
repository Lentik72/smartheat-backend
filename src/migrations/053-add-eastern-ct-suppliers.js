/**
 * Migration 053: Add Eastern CT Suppliers (Windham, Tolland, New London)
 *
 * Fills CT's biggest coverage gaps with 4 verified COD/will-call suppliers.
 *
 * All suppliers verified from their OWN websites:
 * - Williams Fuel Oil: "Paid COD Cash or Credit Card" with tiered pricing on williamsfueloil.com
 * - Bender's Oil Service: "COD (cash on delivery) discounts" on bendersoil.com/heating-oil-delivery
 * - Ed's Garage: "will-call delivery programs" on edsgarage.com
 * - American Fuel Oil: "will-call oil delivery" on americanfueloilct.com
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '053-add-eastern-ct-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // WILLIAMS FUEL OIL CO. - Stafford Springs, CT (Tolland County)
      // "Paid COD Cash or Credit Card" — tiered pricing on homepage
      // ============================================
      {
        id: uuidv4(),
        name: 'Williams Fuel Oil',
        slug: 'williams-fuel-oil',
        phone: '(860) 684-9123',
        email: null,
        website: 'https://williamsfueloil.com',
        addressLine1: '162 East St',
        city: 'Stafford Springs',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Tolland County CT
          '06076', // Stafford Springs / Stafford
          '06075', // Stafford
          '06084', // Tolland
          '06279', // Willington
          '06278', // Ashford
          '06250', // Mansfield Center
          '06268', // Storrs / Mansfield
          '06076', // Union (shares with Stafford area)
          '06066', // Vernon / Vernon Rockville
          '06029', // Ellington
          '06040', // Manchester
          '06071', // Somers
          '06238', // Coventry
          // Hartford County CT
          '06082', // Enfield
          '06088', // East Windsor
          '06016', // Broad Brook
          // Hampden County MA
          '01057', // Monson
          '01081', // Wales
          '01521', // Holland
          '01069', // Palmer
          '01028', // East Longmeadow
          '01106', // Longmeadow
        ]),
        serviceCities: JSON.stringify([
          'Stafford', 'Stafford Springs', 'Tolland', 'Willington', 'Ashford',
          'Mansfield', 'Union', 'Vernon', 'Ellington', 'Manchester', 'Somers',
          'Coventry', 'Enfield', 'East Windsor', 'Broad Brook',
          'Monson', 'Wales', 'Holland', 'Palmer', 'East Longmeadow', 'Longmeadow'
        ]),
        serviceCounties: JSON.stringify(['Tolland', 'Hartford', 'Windham', 'Hampden']),
        serviceAreaRadius: 25,
        lat: 41.9548,
        lng: -72.3065,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: '8:00 AM - 12:00 PM',
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour service
        weekendDelivery: true, // Saturday hours
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: 100,
        seniorDiscount: null,
        allowPriceDisplay: true, // Tiered COD prices on homepage
        notes: null,
        active: true,
      },

      // ============================================
      // BENDER'S OIL SERVICE - Lebanon, CT (New London County)
      // "COD (cash on delivery) discounts" on bendersoil.com
      // ============================================
      {
        id: uuidv4(),
        name: "Bender's Oil Service",
        slug: 'benders-oil-service',
        phone: '(860) 423-6859',
        email: null,
        website: 'https://www.bendersoil.com',
        addressLine1: '266 Beaumont Hwy',
        city: 'Lebanon',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // New London County
          '06249', // Lebanon
          '06254', // North Franklin
          '06330', // Baltic
          '06334', // Bozrah
          '06351', // Jewett City / Griswold
          '06353', // Montville
          '06360', // Norwich
          '06365', // Preston
          '06370', // Oakdale
          '06380', // Taftville
          '06382', // Uncasville
          '06383', // Versailles
          '06389', // Yantic
          '06415', // Colchester
          '06420', // Salem
          // Windham County
          '06226', // Willimantic / Windham
          '06234', // Brooklyn
          '06235', // Chaplin
          '06242', // Eastford
          '06247', // Hampton
          '06256', // North Windham
          '06264', // Scotland
          '06266', // South Windham
          '06278', // Ashford
          '06331', // Canterbury
          '06332', // Central Village
          '06374', // Plainfield
          // Tolland County
          '06232', // Andover
          '06237', // Columbia
          '06238', // Coventry
          '06248', // Hebron
          '06250', // Mansfield Center
          '06251', // Mansfield Depot
          '06268', // Storrs
          '06279', // Willington
          '06084', // Tolland
          '06043', // Bolton
          '06066', // Vernon
          // Hartford County
          '06033', // Glastonbury
          '06073', // South Glastonbury
          '06040', // Manchester
          '06423', // East Haddam (Middlesex)
          '06424', // East Hampton (Middlesex)
          '06469', // Moodus (Middlesex)
        ]),
        serviceCities: JSON.stringify([
          'Lebanon', 'North Franklin', 'Baltic', 'Bozrah', 'Jewett City', 'Montville',
          'Norwich', 'Preston', 'Oakdale', 'Taftville', 'Uncasville', 'Versailles',
          'Yantic', 'Colchester', 'Salem', 'Willimantic', 'Brooklyn', 'Chaplin',
          'Eastford', 'Hampton', 'North Windham', 'Scotland', 'South Windham', 'Ashford',
          'Canterbury', 'Central Village', 'Plainfield', 'Windham', 'Andover', 'Columbia',
          'Coventry', 'Hebron', 'Mansfield Center', 'Storrs', 'Willington', 'Tolland',
          'Bolton', 'Vernon', 'Glastonbury', 'Manchester', 'East Hampton', 'Moodus'
        ]),
        serviceCounties: JSON.stringify(['New London', 'Windham', 'Tolland', 'Hartford', 'Middlesex']),
        serviceAreaRadius: 30,
        lat: 41.6340,
        lng: -72.2268,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true, // 24/7 for oil customers
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // No public prices
        notes: null,
        active: true,
      },

      // ============================================
      // ED'S GARAGE, INC. - Canterbury, CT (Windham County)
      // "will-call delivery programs" on edsgarage.com
      // ============================================
      {
        id: uuidv4(),
        name: "Ed's Garage",
        slug: 'eds-garage',
        phone: '(860) 546-9492',
        email: null,
        website: 'https://www.edsgarage.com',
        addressLine1: '20 Westminster Rd',
        city: 'Canterbury',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Windham County
          '06226', // Willimantic / Windham
          '06234', // Brooklyn
          '06235', // Chaplin
          '06239', // Danielson / Killingly
          '06241', // Dayville
          '06242', // Eastford
          '06247', // Hampton
          '06256', // North Windham
          '06258', // Pomfret
          '06259', // Pomfret Center
          '06260', // Putnam
          '06263', // Rogers
          '06264', // Scotland
          '06266', // South Windham
          '06331', // Canterbury
          '06332', // Central Village
          '06354', // Moosup
          '06373', // Oneco
          '06374', // Plainfield
          '06377', // Sterling
          '06387', // Wauregan
          // New London County
          '06249', // Lebanon
          '06254', // North Franklin
          '06330', // Baltic
          '06334', // Bozrah
          '06351', // Jewett City / Griswold
          '06360', // Norwich
          '06365', // Preston
          '06380', // Taftville
          '06383', // Versailles
          '06384', // Voluntown
          '06389', // Yantic
          // Tolland County
          '06250', // Mansfield Center
          '06268', // Storrs
        ]),
        serviceCities: JSON.stringify([
          'Canterbury', 'Willimantic', 'Brooklyn', 'Chaplin', 'Danielson', 'Dayville',
          'Eastford', 'Hampton', 'North Windham', 'Pomfret', 'Pomfret Center', 'Putnam',
          'Rogers', 'Scotland', 'South Windham', 'Windham', 'Central Village', 'Moosup',
          'Oneco', 'Plainfield', 'Sterling', 'Wauregan', 'Lebanon', 'North Franklin',
          'Baltic', 'Bozrah', 'Jewett City', 'Norwich', 'Preston', 'Taftville',
          'Versailles', 'Voluntown', 'Yantic', 'Mansfield Center', 'Storrs'
        ]),
        serviceCounties: JSON.stringify(['Windham', 'New London', 'Tolland']),
        serviceAreaRadius: 25,
        lat: 41.6950,
        lng: -71.9703,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: '8:00 AM - 12:00 PM',
        hoursSunday: null,
        emergencyDelivery: true, // 24-hour emergency service
        weekendDelivery: true, // Saturday hours in winter
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false, // No public prices
        notes: null,
        active: true,
      },

      // ============================================
      // AMERICAN FUEL OIL - Coventry, CT (Tolland County)
      // "will-call oil delivery" on americanfueloilct.com
      // ============================================
      {
        id: uuidv4(),
        name: 'American Fuel Oil',
        slug: 'american-fuel-oil',
        phone: '(860) 742-1297',
        email: null,
        website: 'https://www.afoctinc.com',
        addressLine1: '1747 Boston Tpke',
        city: 'Coventry',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Tolland County
          '06238', // Coventry
          '06232', // Andover
          '06043', // Bolton
          '06237', // Columbia
          '06029', // Ellington
          '06033', // Glastonbury (Hartford)
          '06248', // Hebron
          '06040', // Manchester (Hartford)
          '06250', // Mansfield Center
          '06074', // South Windsor (Hartford)
          '06084', // Tolland
          '06066', // Vernon
          '06226', // Willimantic / Windham (Windham)
          '06278', // Ashford (Windham)
          '06235', // Chaplin (Windham)
          '06242', // Eastford (Windham)
          '06247', // Hampton (Windham)
          '06256', // North Windham (Windham)
          '06264', // Scotland (Windham)
          '06266', // South Windham (Windham)
          '06424', // East Hampton (Middlesex)
          '06108', // East Hartford (Hartford)
        ]),
        serviceCities: JSON.stringify([
          'Coventry', 'Andover', 'Ashford', 'Bolton', 'Chaplin', 'Columbia',
          'East Hampton', 'East Hartford', 'Ellington', 'Glastonbury', 'Hebron',
          'Manchester', 'Mansfield', 'South Windsor', 'Tolland', 'Vernon',
          'Willimantic', 'Windham'
        ]),
        serviceCounties: JSON.stringify(['Tolland', 'Hartford', 'Windham', 'Middlesex']),
        serviceAreaRadius: 20,
        lat: 41.7709,
        lng: -72.3319,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: null,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
        minimumGallons: 150, // Diesel min is 150; oil min not specified
        seniorDiscount: null,
        allowPriceDisplay: false, // Prices use placeholder "$X.XX"
        notes: null,
        active: true,
      },
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, email, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          lat, lng, hours_weekday, hours_saturday, hours_sunday,
          emergency_delivery, weekend_delivery, payment_methods, fuel_types,
          minimum_gallons, senior_discount, allow_price_display, notes, active,
          created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :lat, :lng, :hoursWeekday, :hoursSaturday, :hoursSunday,
          :emergencyDelivery, :weekendDelivery, :paymentMethods, :fuelTypes,
          :minimumGallons, :seniorDiscount, :allowPriceDisplay, :notes, :active,
          NOW(), NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          postal_codes_served = EXCLUDED.postal_codes_served,
          service_cities = EXCLUDED.service_cities,
          service_counties = EXCLUDED.service_counties,
          service_area_radius = EXCLUDED.service_area_radius,
          hours_weekday = EXCLUDED.hours_weekday,
          hours_saturday = EXCLUDED.hours_saturday,
          hours_sunday = EXCLUDED.hours_sunday,
          emergency_delivery = EXCLUDED.emergency_delivery,
          weekend_delivery = EXCLUDED.weekend_delivery,
          payment_methods = EXCLUDED.payment_methods,
          minimum_gallons = EXCLUDED.minimum_gallons,
          senior_discount = EXCLUDED.senior_discount,
          allow_price_display = EXCLUDED.allow_price_display,
          updated_at = NOW()
      `, {
        replacements: {
          ...supplier,
          emergencyDelivery: supplier.emergencyDelivery === true,
          weekendDelivery: supplier.weekendDelivery === true,
          seniorDiscount: supplier.seniorDiscount === true,
          allowPriceDisplay: supplier.allowPriceDisplay === true,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null,
          email: supplier.email || null,
        }
      });
    }

    console.log('[Migration 053] Added 4 Eastern CT suppliers (Windham + Tolland + New London)');

    // Safety: Ensure allowPriceDisplay is correctly set
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN ('benders-oil-service', 'eds-garage', 'american-fuel-oil')
      AND allow_price_display = true
    `);

    console.log('[Migration 053] ✅ Eastern CT coverage expansion complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('williams-fuel-oil', 'benders-oil-service', 'eds-garage', 'american-fuel-oil')
    `);
    console.log('[Migration 053] Rolled back Eastern CT suppliers');
  }
};
