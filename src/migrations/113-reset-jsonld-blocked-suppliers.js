// Migration 113: Properly reset blocked suppliers that are still scrapable.
//
// Root cause: monthlyReset() was clearing scrape_status and consecutive failures
// but NOT scrape_failure_dates. So after the March 1 reset, suppliers with
// Feb failure dates still in the 30-day window went straight back to phone_only
// on their first new transient failure. 40 of 80 blocked suppliers currently
// have working, scrapable prices.
//
// This migration does what monthlyReset should have done: full state reset
// including failure dates. The monthlyReset bug is fixed in scrapeBackoff.js.

async function up(sequelize) {
  const slugs = [
    'a1-oil-company',
    'afco-fuel',
    'belica-fuel',
    'blackstone-valley-oil',
    'bob-s-fuel-company',
    'buhrmaster-energy-group',
    'cod-discount-fuel',
    'county-energy-products',
    'daddy-s-oil',
    'dutile-sons-oil-company',
    'eazy-oil-llc',
    'energy-direct-llc',
    'ez-pay-oil',
    'foley-oil-co',
    'forni-brothers-oil',
    'frasco-fuel-oil',
    'go-green-oil',
    'handford-oil',
    'hummelstown-fuel-oil-service',
    'hunter-s-heating-oil',
    'jurassic-fuels-inc',
    'lapuma-fuel',
    'lawmans-oil',
    'liberty-bell-discount-oil',
    'metro-energy',
    'niccoli-energy',
    'nikko-oil',
    'patriot-liquid-energy',
    'patten-energy',
    'polar-energy-ct',
    'presby-energy',
    'richard-s-fuel-heating',
    'save-on-oil',
    'skylands-energy-online',
    'springer-s-oil',
    'surner-heating',
    'tandy-oil',
    'the-oil-peddler',
    'valley-oil',
    'waverly-oil',
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
  console.log(`[Migration 113] Reset ${count} blocked suppliers (full state clear incl. failure dates)`);
}

module.exports = { up };
