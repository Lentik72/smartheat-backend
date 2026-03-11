/**
 * Shared supplier upsert utility for migrations.
 *
 * Matches existing records by website domain. If found, updates all fields.
 * If not found, inserts with ON CONFLICT (slug) DO UPDATE for idempotency.
 *
 * postal_codes_served is managed by scrape-config.json via ScrapeConfigSync.
 * If supplier.postalCodesServed is null/undefined, it is skipped in both
 * UPDATE and INSERT — preserving whatever ScrapeConfigSync has set.
 * Old migrations that still pass it are harmless (ScrapeConfigSync union-merges after).
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

  const hasCoverage = supplier.postalCodesServed != null;

  if (existing) {
    // Build SET clause dynamically — skip postal_codes_served if not provided
    const setClauses = [
      'name = $1', 'slug = $2', 'phone = $3', 'email = $4', 'website = $5',
      'address_line1 = $6', 'city = $7', 'state = $8',
    ];
    const bindValues = [
      supplier.name, supplier.slug, supplier.phone, supplier.email || null,
      supplier.website, supplier.addressLine1 || null, supplier.city, supplier.state,
    ];

    let paramIndex = 9;

    if (hasCoverage) {
      setClauses.push(`postal_codes_served = $${paramIndex++}`);
      bindValues.push(supplier.postalCodesServed);
    }

    setClauses.push(`service_cities = $${paramIndex++}`);
    bindValues.push(supplier.serviceCities);
    setClauses.push(`service_counties = $${paramIndex++}`);
    bindValues.push(supplier.serviceCounties);
    setClauses.push(`service_area_radius = $${paramIndex++}`);
    bindValues.push(supplier.serviceAreaRadius);
    setClauses.push(`lat = $${paramIndex++}`);
    bindValues.push(supplier.lat);
    setClauses.push(`lng = $${paramIndex++}`);
    bindValues.push(supplier.lng);
    setClauses.push(`hours_weekday = $${paramIndex++}`);
    bindValues.push(supplier.hoursWeekday || null);
    setClauses.push(`hours_saturday = $${paramIndex++}`);
    bindValues.push(supplier.hoursSaturday || null);
    setClauses.push(`hours_sunday = $${paramIndex++}`);
    bindValues.push(supplier.hoursSunday || null);
    setClauses.push(`emergency_delivery = $${paramIndex++}`);
    bindValues.push(supplier.emergencyDelivery === true);
    setClauses.push(`weekend_delivery = $${paramIndex++}`);
    bindValues.push(supplier.weekendDelivery === true);
    setClauses.push(`payment_methods = $${paramIndex++}`);
    bindValues.push(supplier.paymentMethods);
    setClauses.push(`fuel_types = $${paramIndex++}`);
    bindValues.push(supplier.fuelTypes);
    setClauses.push(`minimum_gallons = $${paramIndex++}`);
    bindValues.push(supplier.minimumGallons || null);
    setClauses.push(`senior_discount = $${paramIndex++}`);
    bindValues.push(supplier.seniorDiscount === true);
    setClauses.push(`allow_price_display = $${paramIndex++}`);
    bindValues.push(supplier.allowPriceDisplay === true);
    setClauses.push(`notes = $${paramIndex++}`);
    bindValues.push(supplier.notes || null);
    setClauses.push(`active = $${paramIndex++}`);
    bindValues.push(supplier.active === true);

    setClauses.push('updated_at = NOW()');

    bindValues.push(existing.id);

    await sequelize.query(`
      UPDATE suppliers SET
        ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `, {
      bind: bindValues
    });
  } else {
    // Build INSERT dynamically — skip postal_codes_served if not provided
    const columns = [
      'id', 'name', 'slug', 'phone', 'email', 'website', 'address_line1', 'city', 'state',
    ];
    const bindValues = [
      supplier.id, supplier.name, supplier.slug, supplier.phone, supplier.email || null,
      supplier.website, supplier.addressLine1 || null, supplier.city, supplier.state,
    ];

    if (hasCoverage) {
      columns.push('postal_codes_served');
      bindValues.push(supplier.postalCodesServed);
    }

    columns.push(
      'service_cities', 'service_counties', 'service_area_radius',
      'lat', 'lng', 'hours_weekday', 'hours_saturday', 'hours_sunday',
      'emergency_delivery', 'weekend_delivery', 'payment_methods', 'fuel_types',
      'minimum_gallons', 'senior_discount', 'allow_price_display', 'notes', 'active'
    );
    bindValues.push(
      supplier.serviceCities, supplier.serviceCounties,
      supplier.serviceAreaRadius, supplier.lat, supplier.lng,
      supplier.hoursWeekday || null, supplier.hoursSaturday || null, supplier.hoursSunday || null,
      supplier.emergencyDelivery === true, supplier.weekendDelivery === true,
      supplier.paymentMethods, supplier.fuelTypes,
      supplier.minimumGallons || null, supplier.seniorDiscount === true,
      supplier.allowPriceDisplay === true, supplier.notes || null, supplier.active === true,
    );

    const paramPlaceholders = bindValues.map((_, i) => `$${i + 1}`);

    // Build ON CONFLICT SET — skip postal_codes_served if not provided
    const conflictSets = [
      'name = EXCLUDED.name',
      'phone = EXCLUDED.phone',
      'email = EXCLUDED.email',
      'website = EXCLUDED.website',
      'address_line1 = EXCLUDED.address_line1',
      'city = EXCLUDED.city',
      'state = EXCLUDED.state',
    ];
    if (hasCoverage) {
      conflictSets.push('postal_codes_served = EXCLUDED.postal_codes_served');
    }
    conflictSets.push(
      'service_cities = EXCLUDED.service_cities',
      'service_counties = EXCLUDED.service_counties',
      'service_area_radius = EXCLUDED.service_area_radius',
      'lat = EXCLUDED.lat',
      'lng = EXCLUDED.lng',
      'hours_weekday = EXCLUDED.hours_weekday',
      'hours_saturday = EXCLUDED.hours_saturday',
      'hours_sunday = EXCLUDED.hours_sunday',
      'emergency_delivery = EXCLUDED.emergency_delivery',
      'weekend_delivery = EXCLUDED.weekend_delivery',
      'payment_methods = EXCLUDED.payment_methods',
      'fuel_types = EXCLUDED.fuel_types',
      'minimum_gallons = EXCLUDED.minimum_gallons',
      'senior_discount = EXCLUDED.senior_discount',
      'allow_price_display = EXCLUDED.allow_price_display',
      'notes = EXCLUDED.notes',
      'active = EXCLUDED.active',
      'updated_at = NOW()'
    );

    await sequelize.query(`
      INSERT INTO suppliers (
        ${columns.join(', ')},
        created_at, updated_at
      ) VALUES (
        ${paramPlaceholders.join(', ')},
        NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        ${conflictSets.join(',\n        ')}
    `, {
      bind: bindValues
    });
  }
}

module.exports = { upsertSupplier };
