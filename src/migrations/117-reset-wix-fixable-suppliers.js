// Migration 117: Reset 3 suppliers previously thought to be JS-rendered.
// Prices were in static HTML but regexes missed them due to:
//
// Higgins Energy: HTML entity &#039; for apostrophe, no $ sign
// Red Star Oil: HTML entity &#39; for apostrophe, no $ sign
// Kelley's Oil: price in span.w-oil-price-150, old regex targeted "Per" text

async function up(sequelize) {
  const slugs = [
    'higgins-energy',
    'red-star-oil',
    'kelley-s-oil',
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
  console.log(`[Migration 117] Reset ${count} suppliers (regex fixes for HTML entities / no $ sign)`);
}

module.exports = { up };
