/**
 * Migration 144: Add Fegley Oil Company & Mini Marts Inc. (Tamaqua, PA)
 *
 * Family-owned since 1949. Serves Carbon, Schuylkill, Luzerne counties PA
 * (plus western Lehigh spillover). 62 towns per their /service-areas page.
 *
 * COD/will-call confirmed via Terms & Conditions page (fegleyoil.com/terms-and-conditions):
 *   - "Payment is due upon delivery unless credit terms have been established."
 *   - "WILL-CALL DELIVERY: Customers on will-call must monitor their tank levels
 *      and place orders with adequate time for delivery."
 *   - Public volume-tiered pricing + "Order online 24/7".
 *
 * Prices scraped via public Supabase REST API (pattern=json_api with fuels.kerosene
 * using the V2.15.0 secondary-fuel apiUrl + jsonPath mechanism).
 *
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here per
 * post-migration-100 rule).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '144-add-fegley-oil',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Fegley Oil Company & Mini Marts Inc.',
      slug: 'fegley-oil',
      phone: '(800) 572-4925',
      email: 'contact@fegleyoil.com',
      website: 'https://www.fegleyoil.com',
      addressLine1: '551 West Penn Pike',
      city: 'Tamaqua',
      state: 'PA',
      postalCodesServed: JSON.stringify([]),
      serviceCities: JSON.stringify([
        'Tamaqua', 'Andreas', 'Ashfield', 'Barnesville', 'Beaver Meadows',
        'Bowmanstown', 'Brockton', 'Coaldale', 'Conyngham', 'Cumbola',
        'Delano', 'Drifton', 'Drums', 'Ebervale', 'Fogelsville',
        'Frackville', 'Freeland', 'Germansville', 'Gilberton', 'Girardville',
        'Harleigh', 'Hazleton', 'Jim Thorpe', 'Junedale', 'Kelayres',
        'Kempton', 'Lansford', 'Lattimer Mines', 'Lehighton', 'Lenhartsville',
        'Mahanoy City', 'Mahanoy Plane', 'Mary D', 'McAdoo', 'Middleport',
        'Milnesville', 'Nesquehoning', 'New Philadelphia', 'New Ringgold',
        'New Tripoli', 'Oneida', 'Palmerton', 'Parryville', 'Port Carbon',
        'Quakake', 'Ringtown', 'Rock Glen', 'Saint Johns', 'Shenandoah',
        'Sheppton', 'Slatedale', 'Slatington', 'Sugarloaf', 'Summit Hill',
        'Sybertsville', 'Tresckow', 'Tuscarora', 'Walnutport', 'Weatherly'
      ]),
      serviceCounties: JSON.stringify(['Schuylkill', 'Carbon', 'Luzerne', 'Lehigh']),
      serviceAreaRadius: 30,
      lat: 40.7945,
      lng: -75.9755,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      minimumGallons: null,
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
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        address_line1 = EXCLUDED.address_line1,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        service_area_radius = EXCLUDED.service_area_radius,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        hours_weekday = EXCLUDED.hours_weekday,
        emergency_delivery = EXCLUDED.emergency_delivery,
        weekend_delivery = EXCLUDED.weekend_delivery,
        payment_methods = EXCLUDED.payment_methods,
        fuel_types = EXCLUDED.fuel_types,
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
      },
    });

    console.log('[Migration 144] ✅ Added Fegley Oil Company (Tamaqua, PA)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'fegley-oil'`);
    console.log('[Migration 144] Rolled back Fegley Oil');
  },
};
