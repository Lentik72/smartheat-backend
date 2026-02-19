/**
 * Migration 059: Cleanup Duplicate Suppliers
 *
 * Removes 5 duplicate supplier entries:
 * - t-m-fuel (dupe of t-and-m-fuel, created via dashboard)
 * - bob-s-fuel-company (dupe of bobs-fuel-company, apostrophe slug variant)
 * - best-discount-oil-1 (dupe of best-discount-oil, auto-created -1 suffix)
 * - domino-fuel-1 (dupe of domino-fuel, auto-created -1 suffix)
 * - express-cod-1 (dupe of express-cod, auto-created -1 suffix)
 *
 * For each: moves any supplier_prices to the canonical entry, then deletes.
 */

module.exports = {
  name: '059-cleanup-duplicate-suppliers',

  async up(sequelize) {
    const duplicates = [
      { remove: 't-m-fuel', keep: 't-and-m-fuel' },
      { remove: 'bob-s-fuel-company', keep: 'bobs-fuel-company' },
      { remove: 'best-discount-oil-1', keep: 'best-discount-oil' },
      { remove: 'domino-fuel-1', keep: 'domino-fuel' },
      { remove: 'express-cod-1', keep: 'express-cod' },
    ];

    for (const { remove, keep } of duplicates) {
      // Get IDs
      const [keepRows] = await sequelize.query(
        `SELECT id FROM suppliers WHERE slug = $1`,
        { bind: [keep] }
      );
      const [removeRows] = await sequelize.query(
        `SELECT id FROM suppliers WHERE slug = $1`,
        { bind: [remove] }
      );

      if (removeRows.length === 0) {
        console.log(`[Migration 059] Skipping ${remove} (not found)`);
        continue;
      }

      const removeId = removeRows[0].id;

      if (keepRows.length > 0) {
        const keepId = keepRows[0].id;

        // Move any prices from duplicate to canonical
        const [moved] = await sequelize.query(
          `UPDATE supplier_prices SET supplier_id = $1 WHERE supplier_id = $2`,
          { bind: [keepId, removeId] }
        );
        console.log(`[Migration 059] Moved prices from ${remove} → ${keep}`);
      }

      // Delete the duplicate supplier
      await sequelize.query(
        `DELETE FROM suppliers WHERE id = $1`,
        { bind: [removeId] }
      );
      console.log(`[Migration 059] Deleted duplicate: ${remove}`);
    }

    console.log('[Migration 059] ✅ Duplicate supplier cleanup complete');
  },

  async down(sequelize) {
    // Cannot undo — duplicates were data quality issues
    console.log('[Migration 059] Rollback not supported for duplicate cleanup');
  }
};
