/**
 * Migration 093: Fix allow_price_display for suppliers with no scrapable prices
 *
 * 5 suppliers had allow_price_display=true but their scrape configs are disabled
 * (no prices on their websites). This caused them to appear as "stale" in the
 * command center dashboard, creating false positive alerts.
 *
 * Setting allow_price_display=false moves them from "stale" to "listed" (directory-only).
 */

module.exports = {
  name: '093-fix-stale-price-display-flags',

  async up(sequelize) {
    const websites = [
      'aceoilandpropane.com',   // No prices on site
      'jcdiscountoil.com',      // Ordering system offline
      'leblancoil.org',         // Wix JS-rendered, no static prices
      'loveenergyfuel.com',     // "Call for pricing" placeholders
      'thriftyfuel.com',        // JSONP dynamic, no static prices
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
      console.log(`[Migration 093] ${name} (${domain}) — allow_price_display set to false`);
    }
  },

  async down(sequelize) {
    const websites = [
      'aceoilandpropane.com',
      'jcdiscountoil.com',
      'leblancoil.org',
      'loveenergyfuel.com',
      'thriftyfuel.com',
    ];

    for (const domain of websites) {
      await sequelize.query(`
        UPDATE suppliers
        SET allow_price_display = true, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 093] Rolled back');
  }
};
