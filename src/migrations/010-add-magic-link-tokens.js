/**
 * Migration 010: Add magic link tokens table
 *
 * Implements secure, time-limited authentication for admin price review portal.
 * - Tokens valid for 48 hours
 * - Single use (marked when accessed)
 * - Generated fresh for each daily email
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
    console.log('Migration 010: Adding magic link tokens table...');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(64) UNIQUE NOT NULL,
        purpose VARCHAR(50) NOT NULL DEFAULT 'price_review',
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        first_used_at TIMESTAMP WITH TIME ZONE,
        last_used_at TIMESTAMP WITH TIME ZONE,
        use_count INTEGER DEFAULT 0,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        revoked_at TIMESTAMP WITH TIME ZONE
      )
    `);
    console.log('  ✓ Created magic_link_tokens table');

    // Index for fast token lookups
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_token
      ON magic_link_tokens(token)
    `);
    console.log('  ✓ Created token index');

    // Index for cleanup of expired tokens
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires
      ON magic_link_tokens(expires_at)
    `);
    console.log('  ✓ Created expiry index');

    console.log('\n✅ Migration 010 complete!');
    console.log('\nMagic link tokens table created with columns:');
    console.log('  - token: unique 64-char random string');
    console.log('  - purpose: what the token is for (price_review)');
    console.log('  - expires_at: 48 hours from creation');
    console.log('  - first_used_at/last_used_at: usage tracking');
    console.log('  - use_count: how many times used');
    console.log('  - ip_address/user_agent: for audit');

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
