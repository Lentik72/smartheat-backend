/**
 * Migration 178: Add Courtesy Oil (Dunbar PA) — scrapable COD/will-call.
 * Operator-cleared 2026-06-12 ("Please call to schedule a delivery" = COD).
 * Identity only (post-100 rule); coverage in scrape-config.json (Fayette/Greene PA).
 */
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '178-add-courtesy-oil',

  async up(sequelize) {
    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, slug, phone, website, address_line1, city, state,
        fuel_types, delivery_model, allow_price_display, active, source,
        created_at, updated_at
      ) VALUES (
        :id, 'Courtesy Oil', 'courtesy-oil', '(724) 438-4328', 'https://courtesyoil.com',
        '429 Pechin Road', 'Dunbar', 'PA',
        :fuelTypes, 'cod', true, true, 'web_research', NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, phone = EXCLUDED.phone, website = EXCLUDED.website,
        address_line1 = EXCLUDED.address_line1, city = EXCLUDED.city, state = EXCLUDED.state,
        fuel_types = EXCLUDED.fuel_types, delivery_model = EXCLUDED.delivery_model,
        allow_price_display = true, active = true, updated_at = NOW()
    `, {
      replacements: { id: uuidv4(), fuelTypes: JSON.stringify(['heating_oil', 'kerosene']) },
      type: sequelize.QueryTypes.INSERT
    });
    console.log('[Migration 178] Courtesy Oil (Dunbar, PA) added — scrapable COD');
  },

  async down(sequelize) {
    await sequelize.query(`UPDATE suppliers SET active = false, allow_price_display = false, updated_at = NOW() WHERE slug = 'courtesy-oil'`);
  }
};
