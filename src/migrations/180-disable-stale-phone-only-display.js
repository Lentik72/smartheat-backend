/**
 * Migration 180: Stop displaying stale prices from 6 stuck phone_only suppliers.
 *
 * These 6 had allow_price_display=true with stale (April–May) prices and failing
 * scrapes (5–9 consecutive), so they recurred daily in the 6 AM price-review queue
 * (blocked: apd=true + phone_only + no fresh in-band price). ScrapeConfigSync only
 * ever turns allow_price_display ON (re-enables), never OFF — so a migration is the
 * mechanism. Re-tested 2026-06-14: corporal-heating (dead site, conn refused);
 * sea-land / absolute-oil / county-line / s-s-fuel (no online price, genuinely
 * phone-only); libra-fuels (Droplet, off-season "price unavailable" — re-enable
 * Oct–Apr by flipping its scrape-config entry back to enabled:true).
 *
 * Companion (scrape-config.json): sealandenergymaine.com enabled:true→false — it
 * was the only one still enabled, so the sync was re-flipping its apd each boot.
 */
module.exports = {
  name: '180-disable-stale-phone-only-display',

  async up(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug IN (
        'libra-fuels','sea-land-energy','absolute-oil-company',
        'corporal-heating-llc','county-line-fuel','s-s-fuel'
      ) AND allow_price_display = true
    `);
    console.log('[Migration 180] Disabled price display for 6 stale phone_only suppliers');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = true, updated_at = NOW()
      WHERE slug IN (
        'libra-fuels','sea-land-energy','absolute-oil-company',
        'corporal-heating-llc','county-line-fuel','s-s-fuel'
      )
    `);
  }
};
