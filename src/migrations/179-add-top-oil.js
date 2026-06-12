/**
 * Migration 179: Add Top Oil Company (Norvelt PA) — scrapable COD/will-call.
 * Operator-cleared 2026-06-12 (posts tiered cash prices; "Order Today" / office pickup).
 * Identity only (post-100 rule); coverage in scrape-config.json (Westmoreland PA).
 */
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '179-add-top-oil',

  async up(sequelize) {
    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, slug, phone, website, city, state,
        fuel_types, delivery_model, allow_price_display, active, source,
        created_at, updated_at
      ) VALUES (
        :id, 'Top Oil Company', 'top-oil', '(724) 423-5300', 'https://www.topoilco.com',
        'Norvelt', 'PA',
        :fuelTypes, 'cod', true, true, 'web_research', NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, phone = EXCLUDED.phone, website = EXCLUDED.website,
        city = EXCLUDED.city, state = EXCLUDED.state,
        fuel_types = EXCLUDED.fuel_types, delivery_model = EXCLUDED.delivery_model,
        allow_price_display = true, active = true, updated_at = NOW()
    `, {
      replacements: { id: uuidv4(), fuelTypes: JSON.stringify(['heating_oil', 'kerosene']) },
      type: sequelize.QueryTypes.INSERT
    });
    console.log('[Migration 179] Top Oil Company (Norvelt, PA) added — scrapable COD');
  },

  async down(sequelize) {
    await sequelize.query(`UPDATE suppliers SET active = false, allow_price_display = false, updated_at = NOW() WHERE slug = 'top-oil'`);
  }
};
