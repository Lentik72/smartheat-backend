// Migration 115: Reset 2 suppliers whose regexes were updated after site redesigns.
//
// Paul's Services: old regex targeted class="price">$, price moved to <h1>Oil Price: $X.XXX</h1>
// R&R Oil: old regex targeted "Home Heating Oil $", text removed, price now in bare <h1>

async function up(sequelize) {
  const slugs = [
    'pauls-services',
    'r-and-r-oil',
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
  console.log(`[Migration 115] Reset ${count} suppliers (stale regex fixes)`);
}

module.exports = { up };
