// Migration 116: Reset 2 suppliers after config fixes.
//
// Premier Energy: Wix site shows "Todays Price 4.799" without $ sign. Updated regex.
// Fettinger Fuels: PHD marquee banner API (data-id=1233). Switched to json_api + kerosene.

async function up(sequelize) {
  const slugs = [
    'premier-energy',
    'fettinger-fuels',
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
  console.log(`[Migration 116] Reset ${count} suppliers (unclear category fixes)`);
}

module.exports = { up };
