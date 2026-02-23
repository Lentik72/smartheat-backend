/**
 * Migration 071: Fix remaining stale suppliers
 *
 * Re-enable 4 suppliers now scrapable:
 *   - Brunelli Energy (Bozrah, CT) — Wix SSR, $3.69/gallon
 *   - Thrifty Fuel (Allentown, PA) — JSONP API price $3.899, manual entry needed
 *   - Ace Oil Maine (Scarborough, ME) — $3.299 in Elementor
 *   - Desrochers Oil (Biddeford, ME) — $3.299 cash price
 *
 * Fix SNH Energy regex (price is 3.43 without $ in DudaMobile data-binding)
 *
 * Re-enable Freedom Fuel (price in var price = '3.85')
 *
 * Disable 5 unfixable suppliers (set allow_price_display=false):
 *   - T & M Fuel — no real oil price ($1.50 is a fee)
 *   - Eastern Petroleum — dynamic 0.00 placeholder
 *   - Leo's Fuel — JS redirect, no price
 *   - Hillside Oil — DNS failure, site down
 *   - RA Bair & Son — no price on site
 *
 * Keep as manual-price (allow_price_display=true, on 6am email list):
 *   - LeBlanc Oil — price $3.72 is JS-rendered, manual entry needed
 */

module.exports = {
  name: '071-fix-remaining-stale',

  async up(sequelize) {
    // --- Re-enable 4 scrapable suppliers ---
    const reEnableDomains = [
      'brunellienergy.com',
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
    console.log('[Migration 071] Re-enabled: Brunelli, Ace Oil Maine, Desrochers');

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

    // --- Reset Freedom Fuel cooldown (price in var price = '3.85') ---
    await sequelize.query(`
      UPDATE suppliers SET
        allow_price_display = true,
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        scrape_cooldown_until = NULL,
        updated_at = NOW()
      WHERE website LIKE '%freedomfuelma.com%'
    `);
    console.log('[Migration 071] Freedom Fuel re-enabled');

    // --- Disable unfixable suppliers by name (website LIKE was unreliable) ---
    // LeBlanc Oil + Thrifty Fuel kept enabled for manual price entry via 6am email
    const disableNames = [
      'T & M Fuel',
      'T&M Fuel',
      'Eastern Petroleum',
      "Leo's Fuel",
      'Leos Fuel',
      'Hillside Oil%',
      'RA Bair%',
      'MidKnight Oil%',
      'OnDemand Fuel%',
    ];

    for (const name of disableNames) {
      await sequelize.query(`
        UPDATE suppliers SET
          allow_price_display = false,
          updated_at = NOW()
        WHERE name LIKE :name AND allow_price_display = true
      `, { replacements: { name } });
    }
    console.log('[Migration 071] Disabled unfixable suppliers by name');
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
    const revertNames = ['T & M Fuel','T&M Fuel','Eastern Petroleum',"Leo's Fuel",'Leos Fuel','Hillside Oil%','RA Bair%','MidKnight Oil%','OnDemand Fuel%'];
    for (const name of revertNames) {
      await sequelize.query(`
        UPDATE suppliers SET allow_price_display = true, updated_at = NOW()
        WHERE name LIKE :name
      `, { replacements: { name } });
    }

    console.log('[Migration 071] Reverted');
  }
};
