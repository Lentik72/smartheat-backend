// Migration 127: Reset 5 suppliers after stale audit on 2026-03-20.
//
// Stormville Oil: regex fixed (price and "per gallon" in separate divs)
// AFCO Fuel: regex fixed ($ and number split across spans with &nbsp;)
// Action Fuel Oil: regex matches fine, stuck in backoff
// Lapuma Fuel: regex matches fine, stuck in backoff (signal-only)
// Save-On Oil: regex matches fine, stuck in backoff + added postalCodesServed

async function up(sequelize) {
  const slugs = [
    'stormville-oil',
    'afco-fuel',
    'action-fuel-oil',
    'lapuma-fuel',
    'save-on-oil',
  ];

  const [, meta] = await sequelize.query(`
    UPDATE suppliers
    SET scrape_status = 'active',
        consecutive_scrape_failures = 0,
        scrape_failure_dates = '[]'::jsonb,
        scrape_cooldown_until = NULL,
        last_scrape_error = NULL
    WHERE slug IN (:slugs)
      AND scrape_status IN ('cooldown', 'phone_only')
  `, { replacements: { slugs } });

  const count = meta?.rowCount || 0;
  console.log(`[Migration 127] Reset ${count} suppliers (stale audit fixes)`);
}

module.exports = { up };
