/**
 * Migration 094: Add price_alert_subscribers table
 *
 * Stores email-based price alert subscriptions. Users set a threshold price
 * for their ZIP code and get emailed when scraped prices drop below it.
 * Supports the website price alert feature and builds ZIP-level demand data.
 */

async function up(sequelize) {
  // Check if table already exists
  const [existing] = await sequelize.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'price_alert_subscribers'
  `);

  if (existing.length > 0) return;

  await sequelize.query(`
    CREATE TABLE price_alert_subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      zip_code VARCHAR(10) NOT NULL,
      threshold_price DECIMAL(5,3) NOT NULL,
      unsubscribe_token VARCHAR(64) UNIQUE NOT NULL,
      signup_price_at_time DECIMAL(5,3),
      source_page TEXT,
      utm_source TEXT,
      utm_campaign TEXT,
      active BOOLEAN DEFAULT TRUE,
      last_alert_sent_at TIMESTAMPTZ,
      last_price_seen DECIMAL(5,3),
      alert_count INT DEFAULT 0,
      first_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(email, zip_code)
    )
  `);

  await sequelize.query(`
    CREATE INDEX idx_pas_active_zip ON price_alert_subscribers(zip_code) WHERE active = true
  `);

  await sequelize.query(`
    CREATE INDEX idx_pas_token ON price_alert_subscribers(unsubscribe_token)
  `);
}

module.exports = { up };
