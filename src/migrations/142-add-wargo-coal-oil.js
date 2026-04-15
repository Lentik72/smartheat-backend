/**
 * Migration 142: Add Wargo Coal & Oil Inc (McAdoo, PA)
 *
 * COD accepted by user judgment — site has no explicit "COD/will-call" wording,
 * but offers same-day/next-day delivery, no contract/budget/auto-delivery language,
 * per-order form-based ordering, public per-gallon promotion, drive-thru payment
 * window. Classic COD/will-call operation pattern.
 *
 * Serves Greater Hazleton area: Luzerne, Schuylkill, and Carbon counties PA.
 * Fuel types include COAL (site emphasizes it prominently).
 *
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '142-add-wargo-coal-oil',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Wargo Coal & Oil Inc',
      slug: 'wargo-coal-and-oil',
      phone: '(570) 929-2843',
      email: null,
      website: 'https://www.wargocoalandoil.com',
      addressLine1: '209 N Kennedy Dr',
      city: 'McAdoo',
      state: 'PA',
      postalCodesServed: JSON.stringify([]),
      serviceCities: JSON.stringify([
        'McAdoo', 'Hazleton', 'West Hazleton', 'Freeland', 'Drums',
        'Sugarloaf', 'Hazle Township', 'Conyngham', 'Weatherly',
        'Tamaqua', 'Hometown', 'Coaldale', 'Lansford', 'Summit Hill',
        'Nesquehoning', 'Jim Thorpe', 'Lehighton', 'Palmerton',
        'Tresckow', 'Quakake', 'Mahanoy City', 'Shenandoah',
        'Frackville', 'Pottsville', 'Saint Clair', 'Ashland',
        'Minersville', 'Tower City', 'Schuylkill Haven'
      ]),
      serviceCounties: JSON.stringify(['Luzerne', 'Schuylkill', 'Carbon']),
      serviceAreaRadius: 25,
      lat: 40.90696,
      lng: -75.99137,
      hoursWeekday: '7:30 AM - 5:30 PM (Winter) / 8:00 AM - 4:00 PM (Summer)',
      hoursSaturday: '8:00 AM - 2:00 PM (Winter) / Closed (Summer)',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
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
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        service_area_radius = EXCLUDED.service_area_radius,
        hours_weekday = EXCLUDED.hours_weekday,
        hours_saturday = EXCLUDED.hours_saturday,
        emergency_delivery = EXCLUDED.emergency_delivery,
        weekend_delivery = EXCLUDED.weekend_delivery,
        payment_methods = EXCLUDED.payment_methods,
        fuel_types = EXCLUDED.fuel_types,
        minimum_gallons = EXCLUDED.minimum_gallons,
        allow_price_display = EXCLUDED.allow_price_display,
        updated_at = NOW()
    `, { replacements: supplier });

    console.log('[Migration 142] ✅ Added Wargo Coal & Oil Inc (McAdoo, PA)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'wargo-coal-and-oil'`);
    console.log('[Migration 142] Rolled back Wargo Coal & Oil');
  }
};
