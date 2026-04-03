/**
 * Migration 137: Add Atlas Oil + activate Clayton Discount Fuel
 *
 * 1. Atlas Oil (New Berlinville, PA) — NEW
 *    Will-call COD. "Choose between automatic or will-call delivery status"
 *    Serves Berks/Montgomery/Chester/Bucks/Lehigh. Tiered pricing in inline JS.
 *
 * 2. Clayton Discount Fuel (Langhorne, PA) — ACTIVATE
 *    Already in DB (via ScrapeConfigSync) but active=false. Re-enabling now
 *    that scrapable prices confirmed on location pages. COD + Will Call.
 *
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '137-add-atlas-oil-new-berlinville',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Atlas Oil',
      slug: 'atlas-oil',
      phone: '(610) 327-0046',
      email: 'info@atlasoil.net',
      website: 'https://www.atlasoil.net',
      addressLine1: '865 N Reading Ave',
      city: 'New Berlinville',
      state: 'PA',
      postalCodesServed: JSON.stringify([]),
      serviceCities: JSON.stringify([
        'New Berlinville', 'Boyertown', 'Pottstown', 'Phoenixville', 'Collegeville',
        'Royersford', 'Spring City', 'Schwenksville', 'Skippack', 'Lansdale',
        'Souderton', 'Telford', 'Harleysville', 'Hatfield', 'North Wales',
        'Blue Bell', 'King of Prussia', 'Norristown', 'Plymouth Meeting',
        'Conshohocken', 'Ambler', 'Doylestown', 'Quakertown', 'Sellersville',
        'Perkasie', 'East Greenville', 'Pennsburg', 'Red Hill', 'Green Lane',
        'Reading', 'Kutztown', 'Hamburg', 'Fleetwood', 'Birdsboro',
        'Douglassville', 'Morgantown', 'Elverson', 'Chester Springs',
        'Macungie', 'Alburtis'
      ]),
      serviceCounties: JSON.stringify(['Berks', 'Montgomery', 'Chester', 'Bucks', 'Lehigh', 'Lancaster']),
      serviceAreaRadius: 35,
      lat: 40.3485,
      lng: -75.6375,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'debit_card', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

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

    console.log('[Migration 137] ✅ Added Atlas Oil (New Berlinville, PA)');

    // Activate Clayton Discount Fuel (already exists from ScrapeConfigSync, but active=false)
    // ScrapeConfigSync creates records without slug — match by website domain
    await sequelize.query(`
      UPDATE suppliers
      SET active = true,
          allow_price_display = true,
          slug = 'clayton-discount-fuel',
          phone = '(215) 750-1600',
          address_line1 = '554 Parkvale Ave',
          city = 'Langhorne',
          state = 'PA',
          hours_weekday = 'Mon-Fri',
          payment_methods = '["cash","check","credit_card","debit_card"]',
          fuel_types = '["heating_oil"]',
          minimum_gallons = 150,
          service_counties = '["Bucks","Montgomery","Philadelphia"]',
          updated_at = NOW()
      WHERE website LIKE '%claytondiscountfuel.com%'
    `);
    console.log('[Migration 137] ✅ Activated Clayton Discount Fuel (Langhorne, PA)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'atlas-oil'`);
    await sequelize.query(`UPDATE suppliers SET active = false, allow_price_display = false WHERE website LIKE '%claytondiscountfuel.com%'`);
    console.log('[Migration 137] Rolled back Atlas Oil + Clayton Discount Fuel');
  }
};
