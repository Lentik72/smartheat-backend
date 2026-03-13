/**
 * Migration 103: Create user_events table
 * Lightweight event tracking for website interactions
 * (price status banner impressions, insight card clicks, nav clicks, supplier engagement)
 */

async function up(sequelize) {
  const [tables] = await sequelize.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_events'
  `);

  if (tables.length > 0) {
    console.log('[Migration 103] user_events table already exists, skipping');
    return;
  }

  await sequelize.query(`
    CREATE TABLE user_events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(50) NOT NULL,
      zip_prefix VARCHAR(5),
      supplier_id INTEGER,
      page_type VARCHAR(30),
      referrer_type VARCHAR(20),
      county VARCHAR(50),
      state_code VARCHAR(2),
      meta JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_events_type_week ON user_events (event_type, date_trunc('week', created_at));
    CREATE INDEX idx_events_supplier ON user_events (supplier_id, event_type);
    CREATE INDEX idx_events_zip ON user_events (zip_prefix, event_type);
  `);

  console.log('[Migration 103] Created user_events table with indexes');
}

module.exports = { up };
