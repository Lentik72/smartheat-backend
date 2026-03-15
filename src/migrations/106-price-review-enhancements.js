/**
 * Migration 106: Price review enhancements
 *
 * 1. Fix 10 suppliers with allow_price_display=true but no scrapable prices
 *    (same pattern as migration 093, these were missed)
 *
 * 2. Add last_scrape_error column to suppliers table for diagnostic classification
 *
 * 3. Create price_review_dismissals table for snooze/dismiss functionality
 */

module.exports = {
  name: '106-price-review-enhancements',

  async up(sequelize) {
    // 1. Fix 10 stale suppliers — set allow_price_display=false
    const websites = [
      'jenningsoil.com',         // CT - No scrapable prices
      'marandolafuel.com',       // CT - No scrapable prices
      'gottierfuel.com',         // CT - No scrapable prices
      'troianooil.com',          // CT - No scrapable prices
      'ferguson-oil.com',        // CT - No scrapable prices
      'ctvalleyoil.com',         // CT - No scrapable prices
      'homesteadcomfort.com',    // CT - No scrapable prices
      'tolinosfuel.com',         // PA - Requires ZIP entry
      'orderaffordablefuel.com', // MA - Behind order form
      'tandmfuel.com',           // MA - Wix JS site
    ];

    for (const domain of websites) {
      const [result] = await sequelize.query(`
        UPDATE suppliers
        SET allow_price_display = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
          AND allow_price_display = true
        RETURNING name
      `, { bind: [`%${domain}%`] });

      const name = result[0]?.name || 'not found';
      console.log(`[Migration 106] ${name} (${domain}) — allow_price_display set to false`);
    }

    // 2. Add last_scrape_error column
    try {
      await sequelize.query(`
        ALTER TABLE suppliers ADD COLUMN last_scrape_error TEXT
      `);
      console.log('[Migration 106] Added last_scrape_error column to suppliers');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('[Migration 106] last_scrape_error column already exists');
      } else {
        throw err;
      }
    }

    // 3. Create price_review_dismissals table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS price_review_dismissals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        dismiss_until TIMESTAMPTZ NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(supplier_id)
      )
    `);
    console.log('[Migration 106] Created price_review_dismissals table');
  },

  async down(sequelize) {
    // 1. Restore allow_price_display for the 10 suppliers
    const websites = [
      'jenningsoil.com', 'marandolafuel.com', 'gottierfuel.com',
      'troianooil.com', 'ferguson-oil.com', 'ctvalleyoil.com',
      'homesteadcomfort.com', 'tolinosfuel.com', 'orderaffordablefuel.com',
      'tandmfuel.com',
    ];

    for (const domain of websites) {
      await sequelize.query(`
        UPDATE suppliers
        SET allow_price_display = true, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }

    // 2. Drop last_scrape_error column
    try {
      await sequelize.query('ALTER TABLE suppliers DROP COLUMN IF EXISTS last_scrape_error');
    } catch (err) {
      console.log('[Migration 106] last_scrape_error column not found');
    }

    // 3. Drop dismissals table
    await sequelize.query('DROP TABLE IF EXISTS price_review_dismissals');

    console.log('[Migration 106] Rolled back');
  }
};
