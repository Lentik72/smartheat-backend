/**
 * Migration 071: Fix remaining stale suppliers
 *
 * Re-enable 4 suppliers now scrapable:
 *   - Brunelli Energy (Bozrah, CT) — Wix SSR, $3.69/gallon
 *   - Thrifty Fuel (Allentown, PA) — $2.039 visible
 *   - Ace Oil Maine (Scarborough, ME) — $3.299 in Elementor
 *   - Desrochers Oil (Biddeford, ME) — $3.299 cash price
 *
 * Fix SNH Energy regex (price is 3.43 without $ in DudaMobile data-binding)
 *
 * Disable 7 unfixable suppliers (set allow_price_display=false):
 *   - T & M Fuel — no real oil price ($1.50 is a fee)
 *   - Eastern Petroleum — dynamic 0.00 placeholder
 *   - Leo's Fuel — JS redirect, no price
 *   - Hillside Oil — DNS failure, site down
 *   - RA Bair & Son — no price on site
 *   - LeBlanc Oil — no price visible
 *   - Freedom Fuel — price is server template (###PRICE_PER_GALLON###)
 */

module.exports = {
  name: '071-fix-remaining-stale',

  async up(sequelize) {
    // --- Re-enable 4 scrapable suppliers ---
    const reEnableDomains = [
      'brunellienergy.com',
      'thriftyfuel.com',
      'aceoilmaine.com',
      'desrochersoil.com',
    ];

    for (const domain of reEnableDomains) {
      await sequelize.query(`
        UPDATE suppliers SET
          allow_price_display = true,
          scrape_status = 'active',
          consecutive_scrape_failures = 0,
          last_scrape_failure_at = NULL,
          scrape_failure_dates = NULL,
          scrape_cooldown_until = NULL,
          updated_at = NOW()
        WHERE website LIKE :domain AND active = true
      `, { replacements: { domain: `%${domain}%` } });
    }
    console.log('[Migration 071] Re-enabled: Brunelli, Thrifty, Ace Oil Maine, Desrochers');

    // --- Reset SNH Energy cooldown (regex fix is in config) ---
    await sequelize.query(`
      UPDATE suppliers SET
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        scrape_cooldown_until = NULL,
        updated_at = NOW()
      WHERE website LIKE '%snhenergy.com%'
    `);
    console.log('[Migration 071] SNH Energy cooldown reset');

    // --- Disable 7 unfixable suppliers ---
    const disableDomains = [
      'tandmfuel.com',
      'easternpetroleumonline.com',
      'leosfuel.com',
      'hillsideoilheat.com',
      'rabairandson.com',
      'leblancheating.com',
      'freedomfuelma.com',
    ];

    for (const domain of disableDomains) {
      const [, meta] = await sequelize.query(`
        UPDATE suppliers SET
          allow_price_display = false,
          updated_at = NOW()
        WHERE website LIKE :domain
      `, { replacements: { domain: `%${domain}%` } });
    }
    console.log('[Migration 071] Disabled 7 unfixable suppliers');
  },

  async down(sequelize) {
    // Revert re-enabled
    const reEnableDomains = ['brunellienergy.com','thriftyfuel.com','aceoilmaine.com','desrochersoil.com'];
    for (const domain of reEnableDomains) {
      await sequelize.query(`
        UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
        WHERE website LIKE :domain
      `, { replacements: { domain: `%${domain}%` } });
    }

    // Revert disabled
    const disableDomains = ['tandmfuel.com','easternpetroleumonline.com','leosfuel.com','hillsideoilheat.com','rabairandson.com','leblancheating.com','freedomfuelma.com'];
    for (const domain of disableDomains) {
      await sequelize.query(`
        UPDATE suppliers SET allow_price_display = true, updated_at = NOW()
        WHERE website LIKE :domain
      `, { replacements: { domain: `%${domain}%` } });
    }

    console.log('[Migration 071] Reverted');
  }
};
