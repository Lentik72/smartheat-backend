// Migration 114: Reset 5 suppliers blocked due to config bugs or slug mismatches.
//
// Joel's Oil: regex {2,3} didn't match "4.7" (1 decimal). Fixed to {1,3}.
// Edris Oil: pricePath #PRICING URL-encoded to %23PRICING → 404. Fixed to /home-heating.
// Fuel NRG: regex expected "(cash" but site changed to "(credit card)". Fixed regex.
// Bob's Fuel Company: migration 113 used wrong slug (bob-s-fuel-company).
// Dutile & Sons Oil: migration 113 used wrong slug (dutile-sons-oil-company).

async function up(sequelize) {
  const slugs = [
    'joels-oil',
    'edris-oil-service',
    'fuel-nrg',
    'bobs-fuel-company',
    'dutile-sons-oil',
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
  console.log(`[Migration 114] Reset ${count} suppliers (config fixes + slug corrections)`);
}

module.exports = { up };
