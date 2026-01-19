/**
 * Migration 004: Add scrape_runs table
 *
 * Tracks results of each price scrape run for monitoring and reporting.
 * Stores failure details for inclusion in daily email reports.
 */

const { Sequelize } = require('sequelize');

async function migrate() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    console.log('[Migration 004] Creating scrape_runs table...');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS scrape_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_at TIMESTAMP NOT NULL DEFAULT NOW(),
        success_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        duration_ms INT,
        failures JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create index for querying recent runs
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_scrape_runs_run_at
      ON scrape_runs(run_at DESC)
    `);

    console.log('[Migration 004] scrape_runs table created');

    // Verify table exists
    const [tables] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'scrape_runs'
    `);

    if (tables.length > 0) {
      console.log('[Migration 004] ✅ Migration complete');
    } else {
      console.error('[Migration 004] ❌ Table not found after creation');
    }

    await sequelize.close();
    return true;

  } catch (error) {
    console.error('[Migration 004] ❌ Migration failed:', error.message);
    await sequelize.close();
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };
