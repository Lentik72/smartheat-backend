/**
 * Migration 012: Add supplier_clicks table for tracking user interactions
 * Used for "Sniper" outreach - email suppliers when users click their listing
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  // Create supplier_clicks table
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS supplier_clicks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
      action_type VARCHAR(20) NOT NULL, -- 'call' or 'website'
      zip_code VARCHAR(10),
      user_agent TEXT,
      ip_address VARCHAR(45), -- Supports IPv6
      processed_for_email BOOLEAN DEFAULT FALSE,
      email_sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Create indexes for efficient queries
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_clicks_supplier
    ON supplier_clicks(supplier_id);
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_clicks_processed
    ON supplier_clicks(processed_for_email)
    WHERE processed_for_email = FALSE;
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_clicks_created
    ON supplier_clicks(created_at);
  `);

  console.log('[Migration 012] Created supplier_clicks table with indexes');
}

async function down(sequelize) {
  await sequelize.query('DROP TABLE IF EXISTS supplier_clicks CASCADE;');
  console.log('[Migration 012] Dropped supplier_clicks table');
}

// Auto-run when called directly
if (require.main === module) {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  up(sequelize)
    .then(() => {
      console.log('[Migration 012] Complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Migration 012] Failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
