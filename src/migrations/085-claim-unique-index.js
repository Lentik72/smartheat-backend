/**
 * Migration 085: Add Partial Unique Index on supplier_claims
 *
 * Prevents race conditions where two people claim the same supplier
 * simultaneously. Only one active claim (pending or verified) per supplier.
 * Rejected claims don't block — suppliers can retry after rejection.
 */

async function up(sequelize) {
  // Check if index already exists
  const [existing] = await sequelize.query(`
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_supplier_claims_active'
  `);

  if (existing.length > 0) return;

  await sequelize.query(`
    CREATE UNIQUE INDEX idx_supplier_claims_active
    ON supplier_claims (supplier_id)
    WHERE status IN ('pending', 'verified')
  `);

  console.log('[Migration 085] Created partial unique index idx_supplier_claims_active');
}

module.exports = { up };
