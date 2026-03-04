/**
 * Migration 086: Claim Funnel Hardening
 *
 * Adds:
 * - contact_name, contact_source, contact_updated_at columns to suppliers
 * - email_unsubscribed column to suppliers
 * - Audit log indexes with COALESCE slug bridge
 * - cron_locks table for outreach sequence concurrency control
 * - Populates contact_source='migration' for existing suppliers with email/phone
 */

async function up(sequelize) {
  // 1. Add contact metadata columns to suppliers
  const contactColumns = [
    { name: 'contact_name', type: 'VARCHAR(255)' },
    { name: 'contact_source', type: 'VARCHAR(50)' },
    { name: 'contact_updated_at', type: 'TIMESTAMPTZ' },
    { name: 'email_unsubscribed', type: 'BOOLEAN DEFAULT false' },
  ];

  for (const col of contactColumns) {
    const [existing] = await sequelize.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'suppliers' AND column_name = '${col.name}'
    `);
    if (existing.length === 0) {
      await sequelize.query(`ALTER TABLE suppliers ADD COLUMN ${col.name} ${col.type}`);
      console.log(`[Migration 086] Added suppliers.${col.name}`);
    }
  }

  // 2. Populate contact_source='migration' for existing suppliers with email or phone
  const [updated] = await sequelize.query(`
    UPDATE suppliers
    SET contact_source = 'migration',
        contact_updated_at = NOW()
    WHERE (email IS NOT NULL OR phone IS NOT NULL)
      AND contact_source IS NULL
    RETURNING id
  `);
  console.log(`[Migration 086] Set contact_source='migration' for ${updated.length} suppliers`);

  // 3. Create COALESCE audit_logs indexes for slug bridge
  const indexes = [
    {
      name: 'idx_audit_action_supplier_slug',
      sql: `CREATE INDEX IF NOT EXISTS idx_audit_action_supplier_slug
            ON audit_logs (action, (COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')))`
    },
    {
      name: 'idx_audit_created',
      sql: `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at)`
    }
  ];

  for (const idx of indexes) {
    try {
      await sequelize.query(idx.sql);
      console.log(`[Migration 086] Created index ${idx.name}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`[Migration 086] Index ${idx.name} already exists`);
      } else {
        throw err;
      }
    }
  }

  // 4. Create cron_locks table
  const [cronTable] = await sequelize.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'cron_locks'
  `);

  if (cronTable.length === 0) {
    await sequelize.query(`
      CREATE TABLE cron_locks (
        job_name VARCHAR(100) PRIMARY KEY,
        locked_until TIMESTAMPTZ NOT NULL,
        locked_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[Migration 086] Created cron_locks table');
  } else {
    console.log('[Migration 086] cron_locks table already exists');
  }
}

module.exports = { up };
