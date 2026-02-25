/**
 * Shared supplier upsert utility for migrations.
 *
 * Matches existing records by website domain. If found, updates all fields.
 * If not found, inserts with ON CONFLICT (slug) DO UPDATE for idempotency.
 *
 * Used by migrations 075, 076, 077+.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * @param {object} sequelize - Sequelize instance
 * @param {object} supplier - Supplier data with camelCase field names
 */
async function upsertSupplier(sequelize, supplier) {
  // Ensure an ID exists
  if (!supplier.id) {
    supplier.id = uuidv4();
  }

  const normalizedDomain = supplier.website
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();

  const [existing] = await sequelize.query(`
    SELECT id FROM suppliers
    WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
    LIMIT 1
  `, {
    bind: [`%${normalizedDomain}%`],
    type: sequelize.QueryTypes.SELECT
  });

  if (existing) {
    await sequelize.query(`
      UPDATE suppliers SET
        name = $1, slug = $2, phone = $3, email = $4, website = $5,
        address_line1 = $6, city = $7, state = $8,
        postal_codes_served = $9, service_cities = $10, service_counties = $11,
        service_area_radius = $12, lat = $13, lng = $14,
        hours_weekday = $15, hours_saturday = $16, hours_sunday = $17,
        emergency_delivery = $18, weekend_delivery = $19,
        payment_methods = $20, fuel_types = $21,
        minimum_gallons = $22, senior_discount = $23,
        allow_price_display = $24, notes = $25, active = $26,
        updated_at = NOW()
      WHERE id = $27
    `, {
      bind: [
        supplier.name, supplier.slug, supplier.phone, supplier.email || null,
        supplier.website, supplier.addressLine1 || null, supplier.city, supplier.state,
        supplier.postalCodesServed, supplier.serviceCities, supplier.serviceCounties,
        supplier.serviceAreaRadius, supplier.lat, supplier.lng,
        supplier.hoursWeekday || null, supplier.hoursSaturday || null, supplier.hoursSunday || null,
        supplier.emergencyDelivery === true, supplier.weekendDelivery === true,
        supplier.paymentMethods, supplier.fuelTypes,
        supplier.minimumGallons || null, supplier.seniorDiscount === true,
        supplier.allowPriceDisplay === true, supplier.notes || null, supplier.active === true,
        existing.id
      ]
    });
  } else {
    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, slug, phone, email, website, address_line1, city, state,
        postal_codes_served, service_cities, service_counties, service_area_radius,
        lat, lng, hours_weekday, hours_saturday, hours_sunday,
        emergency_delivery, weekend_delivery, payment_methods, fuel_types,
        minimum_gallons, senior_discount, allow_price_display, notes, active,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27,
        NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        address_line1 = EXCLUDED.address_line1,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        postal_codes_served = EXCLUDED.postal_codes_served,
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        service_area_radius = EXCLUDED.service_area_radius,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        hours_weekday = EXCLUDED.hours_weekday,
        hours_saturday = EXCLUDED.hours_saturday,
        hours_sunday = EXCLUDED.hours_sunday,
        emergency_delivery = EXCLUDED.emergency_delivery,
        weekend_delivery = EXCLUDED.weekend_delivery,
        payment_methods = EXCLUDED.payment_methods,
        fuel_types = EXCLUDED.fuel_types,
        minimum_gallons = EXCLUDED.minimum_gallons,
        senior_discount = EXCLUDED.senior_discount,
        allow_price_display = EXCLUDED.allow_price_display,
        notes = EXCLUDED.notes,
        active = EXCLUDED.active,
        updated_at = NOW()
    `, {
      bind: [
        supplier.id, supplier.name, supplier.slug, supplier.phone, supplier.email || null,
        supplier.website, supplier.addressLine1 || null, supplier.city, supplier.state,
        supplier.postalCodesServed, supplier.serviceCities, supplier.serviceCounties,
        supplier.serviceAreaRadius, supplier.lat, supplier.lng,
        supplier.hoursWeekday || null, supplier.hoursSaturday || null, supplier.hoursSunday || null,
        supplier.emergencyDelivery === true, supplier.weekendDelivery === true,
        supplier.paymentMethods, supplier.fuelTypes,
        supplier.minimumGallons || null, supplier.seniorDiscount === true,
        supplier.allowPriceDisplay === true, supplier.notes || null, supplier.active === true,
      ]
    });
  }
}

module.exports = { upsertSupplier };
