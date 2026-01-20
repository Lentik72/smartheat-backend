/**
 * Migration 006: Add scrape backoff fields
 *
 * Implements cooldown logic for blocked sites:
 * - 2 consecutive failures → 7 day cooldown
 * - 3 failures in 30 days → mark as phone_only
 * - Monthly retry of phone_only sites
 */

const { Sequelize } = require('sequelize');

async function migrate() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  try {
    console.log('Migration 006: Adding scrape backoff fields...');

    // Add scrape_status enum
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE scrape_status AS ENUM ('active', 'cooldown', 'phone_only');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ Created scrape_status enum');

    // Add scrape_status column
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS scrape_status scrape_status DEFAULT 'active'
    `);
    console.log('  ✓ Added scrape_status column');

    // Add consecutive_scrape_failures column
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS consecutive_scrape_failures INTEGER DEFAULT 0
    `);
    console.log('  ✓ Added consecutive_scrape_failures column');

    // Add scrape_cooldown_until column
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS scrape_cooldown_until TIMESTAMP WITH TIME ZONE
    `);
    console.log('  ✓ Added scrape_cooldown_until column');

    // Add last_scrape_failure_at column
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS last_scrape_failure_at TIMESTAMP WITH TIME ZONE
    `);
    console.log('  ✓ Added last_scrape_failure_at column');

    // Add failures_last_30_days column (for tracking 3 failures in 30 days)
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS scrape_failure_dates JSONB DEFAULT '[]'::jsonb
    `);
    console.log('  ✓ Added scrape_failure_dates column');

    console.log('\n✅ Migration 006 complete!');
    console.log('\nNew columns added to suppliers:');
    console.log('  - scrape_status: active | cooldown | phone_only');
    console.log('  - consecutive_scrape_failures: int (resets on success)');
    console.log('  - scrape_cooldown_until: timestamp (7 day cooldown)');
    console.log('  - last_scrape_failure_at: timestamp');
    console.log('  - scrape_failure_dates: jsonb array of failure dates');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  migrate().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrate };
