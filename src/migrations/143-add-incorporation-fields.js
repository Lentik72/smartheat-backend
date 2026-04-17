/**
 * Migration 143: Add incorporation/filing date fields to suppliers table.
 *
 * Purpose: Track when each supplier's legal entity was formed (via NY DOS,
 * CT SOTS, etc.) so we can correlate business age with outreach response rate.
 * This data also helps identify newer businesses that may be hungrier for
 * leads vs. established players who may not respond to outreach.
 *
 * Columns added:
 *   - incorporated_date (DATE, nullable) — date of initial corporate filing
 *   - incorporation_state (VARCHAR(2), nullable) — state where filed ('NY', 'CT', etc.)
 *   - incorporation_dos_id (VARCHAR(50), nullable) — state registry ID (e.g., NY DOS ID)
 *   - incorporation_source (VARCHAR(64), nullable) — how we got the data
 *     (e.g., 'ny_dos_public_inquiry', 'ct_sots', 'manual')
 *
 * Also backfills data for the 12 Westchester/Putnam suppliers researched
 * via NY Department of State Public Inquiry (April 2026 outreach campaign).
 */

const INCORPORATION_DATA = [
  // NY suppliers — data from apps.dos.ny.gov/publicInquiry/
  // Company slug, incorporated_date (YYYY-MM-DD), state, dos_id, source
  { slug: 'emergency-services-fuel-corp', date: '2005-09-08', state: 'NY', dosId: '3253354', source: 'ny_dos_public_inquiry' },
  { slug: 'putnam-energy',                 date: '2009-09-01', state: 'NY', dosId: '3851214', source: 'ny_dos_public_inquiry' },
  { slug: 'euro-fuel-co',                  date: '2011-03-08', state: 'NY', dosId: '4064534', source: 'ny_dos_public_inquiry' },
  { slug: 'castle-fuel',                   date: '2022-04-29', state: 'NY', dosId: '6470680', source: 'ny_dos_public_inquiry' },
  { slug: 'buy-rite-fuel',                 date: '2001-01-08', state: 'NY', dosId: '2591177', source: 'ny_dos_public_inquiry' },
  { slug: 'check-oil-and-propane',         date: '2011-06-08', state: 'NY', dosId: '4104113', source: 'ny_dos_public_inquiry' },
  { slug: 'superior-fuel-oil',             date: '2014-02-14', state: 'NY', dosId: '4529753', source: 'ny_dos_public_inquiry' },
  { slug: 'town-and-country-oil',          date: '1960-08-22', state: 'NY', dosId: '131239',  source: 'ny_dos_public_inquiry' },
  { slug: 'yorktown-fuel',                 date: '2015-06-18', state: 'NY', dosId: '4776629', source: 'ny_dos_public_inquiry' },
  { slug: 'bryn-mawr-fuel',                date: '2022-12-20', state: 'NY', dosId: '6672503', source: 'ny_dos_public_inquiry' },
  { slug: 'jfj-fuel-oil',                  date: '1972-10-24', state: 'NY', dosId: '244993',  source: 'ny_dos_public_inquiry' },
  // Economy Fuel: only matching active NY entity not found; skip until verified

  // CT suppliers — data from service.ct.gov/business/s/onlinebusinesssearch (CT SOTS CONCORD)
  { slug: 'bethany-fuel',             date: '2018-04-05', state: 'CT', dosId: '1269180', source: 'ct_sots' },
  { slug: 'brunelli-energy',          date: '2007-08-13', state: 'CT', dosId: '0909301', source: 'ct_sots' },
  { slug: 'joes-fuel-company',        date: '1991-07-18', state: 'CT', dosId: '0263082', source: 'ct_sots' },
  { slug: 'residential-fuel-systems', date: '2015-09-25', state: 'CT', dosId: '1186706', source: 'ct_sots' },
  { slug: 'santa-energy',             date: '1991-09-30', state: 'CT', dosId: '0265801', source: 'ct_sots' },
  { slug: 'premier-energy',           date: '2009-12-15', state: 'CT', dosId: '0990870', source: 'ct_sots' },
  { slug: 'sisters-oil-service',      date: '2011-10-14', state: 'CT', dosId: '1051072', source: 'ct_sots' },
  { slug: 'easy-oil-llc',             date: '2020-08-10', state: 'CT', dosId: '1355016', source: 'ct_sots' },
  { slug: 'leahys-fuels',             date: '1982-10-28', state: 'CT', dosId: '0135734', source: 'ct_sots' },
  { slug: 'mitchell-oil',             date: '1986-06-24', state: 'CT', dosId: '0185008', source: 'ct_sots' },
  { slug: 'westbrook-oil',            date: '2018-04-17', state: 'CT', dosId: '1270690', source: 'ct_sots' },
  { slug: 'elite-energy-ct',          date: '2014-12-29', state: 'CT', dosId: '1164718', source: 'ct_sots' },
  { slug: 'energy-direct-llc',        date: '2014-10-30', state: 'CT', dosId: '1158994', source: 'ct_sots' },
  { slug: 'jj-sullivan-inc',          date: '1949-06-30', state: 'CT', dosId: '0024265', source: 'ct_sots' },
  { slug: 'first-fuel-oil',           date: '2007-09-13', state: 'CT', dosId: '0912501', source: 'ct_sots' },
  { slug: 'wilcox-oil',               date: '1990-01-04', state: 'CT', dosId: '0242694', source: 'ct_sots' },
  { slug: 'asi-oil',                  date: '2012-05-30', state: 'CT', dosId: '1073763', source: 'ct_sots' },
  { slug: 'baribault-fuel',           date: '1968-02-07', state: 'CT', dosId: '0004290', source: 'ct_sots' },
  { slug: 'eazy-oil-llc',             date: '2015-12-02', state: 'CT', dosId: '1192187', source: 'ct_sots' },
  // Remaining CT companies not dated due to CT SOTS reCAPTCHA block — re-run later:
  //   red-door-oil, belica-fuel, dragon-fuel-llc, incredible-oil,
  //   centsable-oil, westmore-oil-express, general-oil, town-oil-company,
  //   park-city-fuel (dissolved 1979), roberts-discount-fuel (likely sole prop)
];

module.exports = {
  name: '143-add-incorporation-fields',

  async up(sequelize) {
    // 1. Add columns
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS incorporated_date DATE,
      ADD COLUMN IF NOT EXISTS incorporation_state VARCHAR(2),
      ADD COLUMN IF NOT EXISTS incorporation_dos_id VARCHAR(50),
      ADD COLUMN IF NOT EXISTS incorporation_source VARCHAR(64)
    `);

    // 2. Backfill researched NY + CT suppliers
    let matched = 0;
    let unmatched = [];
    for (const rec of INCORPORATION_DATA) {
      const [, meta] = await sequelize.query(`
        UPDATE suppliers SET
          incorporated_date = :date,
          incorporation_state = :state,
          incorporation_dos_id = :dosId,
          incorporation_source = :source,
          updated_at = NOW()
        WHERE slug = :slug
      `, {
        replacements: {
          slug: rec.slug,
          date: rec.date,
          state: rec.state,
          dosId: rec.dosId,
          source: rec.source,
        },
      });
      const rowCount = (meta && meta.rowCount) || 0;
      if (rowCount > 0) {
        matched += 1;
      } else {
        unmatched.push(rec.slug);
      }
    }

    console.log(`[Migration 143] Added incorporation fields; matched ${matched}/${INCORPORATION_DATA.length} suppliers`);
    if (unmatched.length) {
      console.log(`[Migration 143] Slugs not found in DB (check naming): ${unmatched.join(', ')}`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      ALTER TABLE suppliers
      DROP COLUMN IF EXISTS incorporation_source,
      DROP COLUMN IF EXISTS incorporation_dos_id,
      DROP COLUMN IF EXISTS incorporation_state,
      DROP COLUMN IF EXISTS incorporated_date
    `);
  },
};
