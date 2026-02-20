/**
 * Migration 065: Add Metro Energy (Boston, MA)
 *
 * COD confirmed: "one-time delivery" option, accepts cash/check/credit/debit.
 * Website was 403-blocked, recovered via got-scraping TLS fallback.
 * In business since 1929 (M & T Oil Co.).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '065-add-metro-energy-boston',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Metro Energy',
      slug: 'metro-energy',
      phone: '(617) 207-7255',
      email: 'info@metroenergyboston.com',
      website: 'https://www.metroenergyboston.com',
      addressLine1: '641 E Broadway',
      city: 'South Boston',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        // Suffolk County
        '02127', // South Boston (HQ)
        '02128', // East Boston
        '02129', // Charlestown
        '02108', // Boston (Beacon Hill)
        '02109', // Boston (Downtown)
        '02110', // Boston (Financial)
        '02111', // Boston (Chinatown)
        '02113', // Boston (North End)
        '02114', // Boston (West End)
        '02115', // Boston (Longwood)
        '02116', // Boston (Back Bay)
        '02118', // Boston (South End)
        '02119', // Boston (Roxbury)
        '02120', // Boston (Mission Hill)
        '02121', // Boston (Dorchester)
        '02122', // Boston (Dorchester)
        '02124', // Boston (Dorchester)
        '02125', // Boston (Dorchester)
        '02126', // Boston (Mattapan)
        '02130', // Boston (Jamaica Plain)
        '02131', // Boston (Roslindale)
        '02132', // Boston (West Roxbury)
        '02134', // Boston (Allston)
        '02135', // Boston (Brighton)
        '02136', // Boston (Hyde Park)
        '02150', // Chelsea
        '02151', // Revere
        '02152', // Winthrop
        '02149', // Everett
        // Norfolk County
        '02169', // Quincy
        '02170', // Quincy
        '02171', // Quincy
        '02186', // Milton
        '02026', // Dedham
        '02062', // Norwood
        '02184', // Braintree
        '02188', // Weymouth
        '02189', // Weymouth
        '02043', // Hingham
        '02021', // Canton
        '02368', // Randolph
        // Middlesex County
        '02138', // Cambridge
        '02139', // Cambridge
        '02140', // Cambridge
        '02141', // Cambridge
        '02143', // Somerville
        '02144', // Somerville
        '02145', // Somerville
        '02148', // Malden
        '02155', // Medford
        '02474', // Arlington
        '02472', // Watertown
        '02453', // Waltham
        '02478', // Belmont
        '02176', // Melrose
        '02180', // Stoneham
        '01801', // Woburn
        '01880', // Wakefield
        '01890', // Winchester
        '01906', // Saugus
      ]),
      serviceCities: JSON.stringify([
        'Boston', 'South Boston', 'Dorchester', 'East Boston', 'Roxbury',
        'Quincy', 'Cambridge', 'Charlestown', 'Somerville', 'Chelsea',
        'Winthrop', 'Jamaica Plain', 'Milton', 'Everett', 'Mattapan',
        'Roslindale', 'Brighton', 'Revere', 'Watertown', 'Malden',
        'Medford', 'Arlington', 'Hyde Park', 'West Roxbury',
        'Braintree', 'Dedham', 'Melrose', 'Saugus', 'Winchester',
        'Weymouth', 'Randolph', 'Stoneham', 'Waltham', 'Hingham',
        'Canton', 'Wakefield', 'Woburn', 'Norwood', 'Belmont',
        'Allston',
      ]),
      serviceCounties: JSON.stringify(['Suffolk', 'Norfolk', 'Middlesex']),
      serviceAreaRadius: 20,
      lat: 42.3375,
      lng: -71.0409,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: true,
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

    console.log('[Migration 065] Added Metro Energy (South Boston, MA)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'metro-energy'`);
    console.log('[Migration 065] Rolled back Metro Energy');
  }
};
