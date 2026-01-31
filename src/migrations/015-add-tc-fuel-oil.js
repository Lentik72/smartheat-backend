/**
 * Migration: Add Town & Country Fuel (tcfueloil.com)
 *
 * Lower Bucks County, PA supplier
 * Service areas: Levittown, Bensalem, Bristol, Newtown, Falls Township
 */

module.exports = {
  async up(sequelize) {
    console.log('Adding Town & Country Fuel supplier...');

    // Check if supplier already exists
    const [existing] = await sequelize.query(`
      SELECT id FROM suppliers WHERE website LIKE '%tcfueloil.com%'
    `);

    if (existing.length > 0) {
      console.log('Town & Country Fuel already exists, skipping');
      return;
    }

    // Insert supplier with UUID
    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, phone, website, state, city,
        active, allow_price_display, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        'Town & Country Fuel',
        '(215) 240-8795',
        'https://www.tcfueloil.com',
        'PA',
        'Levittown',
        true,
        true,
        NOW(),
        NOW()
      )
    `);

    // Get the new supplier ID
    const [[{ id: supplierId }]] = await sequelize.query(`
      SELECT id FROM suppliers WHERE website LIKE '%tcfueloil.com%'
    `);

    console.log(`Created supplier with ID: ${supplierId}`);

    // Lower Bucks County PA ZIP codes
    const zipCodes = [
      '19007', // Bristol
      '19020', // Bensalem
      '19021', // Croydon
      '19030', // Fairless Hills
      '19047', // Langhorne
      '19053', // Feasterville
      '19054', // Levittown
      '19055', // Levittown
      '19056', // Levittown
      '19057', // Levittown
      '19067', // Yardley
      '18940', // Newtown
      '18966', // Southampton
      '19040', // Hatboro (nearby)
    ];

    // Insert ZIP codes for this supplier
    for (const zip of zipCodes) {
      try {
        await sequelize.query(`
          INSERT INTO supplier_zips (supplier_id, zip_code)
          VALUES (:supplierId, :zip)
          ON CONFLICT DO NOTHING
        `, { replacements: { supplierId, zip } });
      } catch (e) {
        console.log(`ZIP ${zip} skipped: ${e.message}`);
      }
    }

    console.log(`Added ${zipCodes.length} ZIP codes for Town & Country Fuel`);

    // Add initial price (100+ gallons tier: $3.80/gal)
    await sequelize.query(`
      INSERT INTO supplier_prices (id, supplier_id, price_per_gallon, min_gallons, scraped_at, is_valid)
      VALUES (gen_random_uuid(), :supplierId, 3.80, 100, NOW(), true)
    `, { replacements: { supplierId } });

    console.log('Added initial price: $3.80/gal (100+ gallons)');
  },

  async down(sequelize) {
    // Get supplier ID
    const [[supplier]] = await sequelize.query(`
      SELECT id FROM suppliers WHERE website LIKE '%tcfueloil.com%'
    `);

    if (supplier) {
      await sequelize.query(`DELETE FROM supplier_zips WHERE supplier_id = :id`, {
        replacements: { id: supplier.id }
      });
      await sequelize.query(`DELETE FROM suppliers WHERE id = :id`, {
        replacements: { id: supplier.id }
      });
      console.log('Removed Town & Country Fuel');
    }
  }
};
