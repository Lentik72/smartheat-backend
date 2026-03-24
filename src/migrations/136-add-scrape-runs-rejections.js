/**
 * Migration 136: Add rejections column to scrape_runs
 *
 * Stores outlier/drop rejections from the scraper so the 6 AM daily report
 * can surface them without relying on in-memory state.
 */

async function up(sequelize) {
  await sequelize.query(`
    ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS rejections JSONB NOT NULL DEFAULT '[]'
  `);
}

module.exports = { up };
