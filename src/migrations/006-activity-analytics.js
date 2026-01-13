/**
 * Migration 006: Activity Analytics Tables
 *
 * Adds comprehensive activity tracking:
 * - api_activity: All API requests for performance/usage analysis
 * - supplier_engagements: Track supplier interactions (views, calls, saves)
 * - user_added_suppliers: Manually added suppliers for directory expansion insights
 * - daily_active_users: DAU aggregation table
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  console.log('[Migration 006] Creating activity analytics tables...');

  // 1. API Activity Table - tracks all API requests
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS api_activity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Request info
      endpoint VARCHAR(255) NOT NULL,
      method VARCHAR(10) NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,

      -- User context (anonymized)
      zip_code VARCHAR(5),
      state VARCHAR(2),
      ip_hash VARCHAR(64),  -- SHA256 of IP for unique user estimation
      user_agent_hash VARCHAR(64),  -- For device type analysis

      -- Timestamps
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_api_activity_endpoint ON api_activity(endpoint);
    CREATE INDEX IF NOT EXISTS idx_api_activity_created_at ON api_activity(created_at);
    CREATE INDEX IF NOT EXISTS idx_api_activity_zip ON api_activity(zip_code);
    CREATE INDEX IF NOT EXISTS idx_api_activity_state ON api_activity(state);
  `);
  console.log('  ✓ api_activity table created');

  // 2. Supplier Engagements Table - tracks interactions with suppliers
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS supplier_engagements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Supplier reference
      supplier_id UUID REFERENCES suppliers(id),
      supplier_name VARCHAR(255) NOT NULL,

      -- Engagement type
      engagement_type VARCHAR(50) NOT NULL,  -- 'view', 'call', 'text', 'email', 'save', 'request_quote'

      -- User context (anonymized)
      user_zip VARCHAR(5),
      user_state VARCHAR(2),
      ip_hash VARCHAR(64),

      -- Source tracking
      source VARCHAR(50),  -- 'directory', 'search', 'recommendation'

      -- Timestamps
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_supplier_engagements_supplier ON supplier_engagements(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_engagements_type ON supplier_engagements(engagement_type);
    CREATE INDEX IF NOT EXISTS idx_supplier_engagements_created ON supplier_engagements(created_at);
    CREATE INDEX IF NOT EXISTS idx_supplier_engagements_zip ON supplier_engagements(user_zip);
  `);
  console.log('  ✓ supplier_engagements table created');

  // 3. User Added Suppliers - track manually added suppliers for directory expansion
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS user_added_suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Supplier info (as entered by user)
      company_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      city VARCHAR(100),
      state VARCHAR(2),
      zip_code VARCHAR(10),

      -- User context
      user_zip VARCHAR(5),
      user_state VARCHAR(2),
      ip_hash VARCHAR(64),

      -- Tracking
      report_count INTEGER DEFAULT 1,
      first_reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_reported_at TIMESTAMP NOT NULL DEFAULT NOW(),

      -- Admin workflow
      reviewed BOOLEAN DEFAULT FALSE,
      added_to_directory BOOLEAN DEFAULT FALSE,
      reviewed_at TIMESTAMP,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_user_added_suppliers_state ON user_added_suppliers(state);
    CREATE INDEX IF NOT EXISTS idx_user_added_suppliers_reviewed ON user_added_suppliers(reviewed);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_added_suppliers_name_state ON user_added_suppliers(LOWER(company_name), state);
  `);
  console.log('  ✓ user_added_suppliers table created');

  // 4. Daily Active Users - aggregated DAU metrics
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS daily_active_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Date (one row per day)
      date DATE NOT NULL UNIQUE,

      -- User counts
      unique_users INTEGER DEFAULT 0,  -- Unique IP hashes
      unique_zips INTEGER DEFAULT 0,   -- Unique ZIP codes

      -- Activity breakdown
      supplier_lookups INTEGER DEFAULT 0,
      price_checks INTEGER DEFAULT 0,
      directory_views INTEGER DEFAULT 0,
      supplier_contacts INTEGER DEFAULT 0,

      -- Geographic breakdown (JSONB)
      users_by_state JSONB DEFAULT '{}',

      -- API health
      total_requests INTEGER DEFAULT 0,
      avg_response_time_ms INTEGER,
      error_count INTEGER DEFAULT 0,

      -- Timestamps
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_dau_date ON daily_active_users(date);
  `);
  console.log('  ✓ daily_active_users table created');

  // 5. Add price history tracking columns to supplier_prices if not exists
  await sequelize.query(`
    ALTER TABLE supplier_prices
    ADD COLUMN IF NOT EXISTS price_change DECIMAL(10,3),
    ADD COLUMN IF NOT EXISTS previous_price DECIMAL(10,3);
  `).catch(() => {
    console.log('  ⚠ supplier_prices columns may already exist');
  });
  console.log('  ✓ supplier_prices price tracking columns added');

  console.log('[Migration 006] ✅ All activity analytics tables created');
}

async function down(sequelize) {
  console.log('[Migration 006] Rolling back...');

  await sequelize.query('DROP TABLE IF EXISTS daily_active_users CASCADE');
  await sequelize.query('DROP TABLE IF EXISTS user_added_suppliers CASCADE');
  await sequelize.query('DROP TABLE IF EXISTS supplier_engagements CASCADE');
  await sequelize.query('DROP TABLE IF EXISTS api_activity CASCADE');

  console.log('[Migration 006] ✅ Rollback complete');
}

// Run migration if called directly
if (require.main === module) {
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  up(sequelize)
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
