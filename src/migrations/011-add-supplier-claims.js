/**
 * Migration 011: Add supplier claims system
 *
 * Enables suppliers to claim their listings and receive magic links
 * to update their own prices.
 *
 * Creates:
 * - supplier_claims table (claim submissions)
 * - Adds supplier_id to magic_link_tokens (link tokens to suppliers)
 * - Adds claimed_by_email and claimed_at to suppliers
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
    console.log('Migration 011: Adding supplier claims system...\n');

    // 1. Create supplier_claims table
    console.log('Step 1: Creating supplier_claims table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS supplier_claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,

        -- Claimant info
        claimant_name VARCHAR(100) NOT NULL,
        claimant_email VARCHAR(255) NOT NULL,
        claimant_phone VARCHAR(20),
        claimant_role VARCHAR(50),  -- 'owner', 'manager', 'employee', 'other'

        -- Status tracking
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        verified_at TIMESTAMP WITH TIME ZONE,
        verified_by VARCHAR(50),
        rejected_at TIMESTAMP WITH TIME ZONE,
        rejection_reason TEXT,

        -- Audit
        ip_address VARCHAR(45),
        user_agent TEXT,

        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('  ✓ Created supplier_claims table');

    // Indexes for supplier_claims
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_supplier_claims_supplier
      ON supplier_claims(supplier_id)
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_supplier_claims_status
      ON supplier_claims(status)
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_supplier_claims_email
      ON supplier_claims(claimant_email)
    `);
    console.log('  ✓ Created indexes');

    // 2. Add supplier_id to magic_link_tokens
    console.log('\nStep 2: Adding supplier_id to magic_link_tokens...');
    try {
      await sequelize.query(`
        ALTER TABLE magic_link_tokens
        ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE
      `);
      console.log('  ✓ Added supplier_id column');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ℹ supplier_id column already exists');
      } else {
        throw e;
      }
    }

    // Index for supplier_id lookups
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_supplier
      ON magic_link_tokens(supplier_id)
      WHERE supplier_id IS NOT NULL
    `);
    console.log('  ✓ Created supplier_id index');

    // 3. Add claimed_by_email and claimed_at to suppliers
    console.log('\nStep 3: Adding claim tracking columns to suppliers...');
    try {
      await sequelize.query(`
        ALTER TABLE suppliers
        ADD COLUMN IF NOT EXISTS claimed_by_email VARCHAR(255)
      `);
      console.log('  ✓ Added claimed_by_email column');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ℹ claimed_by_email column already exists');
      } else {
        throw e;
      }
    }

    try {
      await sequelize.query(`
        ALTER TABLE suppliers
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE
      `);
      console.log('  ✓ Added claimed_at column');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  ℹ claimed_at column already exists');
      } else {
        throw e;
      }
    }

    console.log('\n✅ Migration 011 complete!');
    console.log('\nSupplier claims system ready:');
    console.log('  - supplier_claims table: stores claim submissions');
    console.log('  - magic_link_tokens.supplier_id: links tokens to suppliers');
    console.log('  - suppliers.claimed_by_email: tracks who claimed the listing');
    console.log('  - suppliers.claimed_at: when the listing was claimed');

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
