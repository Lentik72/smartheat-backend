/**
 * Migration 073: Cleanup ScrapeConfigSync Duplicate Suppliers
 *
 * Removes duplicate supplier records created by a race condition where
 * ScrapeConfigSync ran concurrently with migrations (both fire-and-forget).
 * ScrapeConfigSync would query the DB before migrations finished inserting,
 * find no match, and create a second record without a slug.
 *
 * This finds suppliers where:
 * - A migration-created record exists (has a slug)
 * - A ScrapeConfigSync-created duplicate also exists (no slug, same website domain)
 *
 * For each duplicate: moves any supplier_prices to the canonical record, then deletes.
 */

module.exports = {
  name: '073-cleanup-scrapeconfig-duplicates',

  async up(sequelize) {
    // Find duplicate pairs: records sharing the same website domain
    // where one has a slug (migration-created) and the other doesn't (ScrapeConfigSync-created)
    const [duplicates] = await sequelize.query(`
      SELECT
        keep.id AS keep_id,
        keep.name AS keep_name,
        keep.slug AS keep_slug,
        dupe.id AS dupe_id,
        dupe.name AS dupe_name,
        dupe.source AS dupe_source
      FROM suppliers keep
      JOIN suppliers dupe ON (
        LOWER(REPLACE(REPLACE(keep.website, 'https://', ''), 'http://', ''))
        = LOWER(REPLACE(REPLACE(dupe.website, 'https://', ''), 'http://', ''))
        OR LOWER(REPLACE(REPLACE(REPLACE(keep.website, 'https://', ''), 'http://', ''), 'www.', ''))
        = LOWER(REPLACE(REPLACE(REPLACE(dupe.website, 'https://', ''), 'http://', ''), 'www.', ''))
      )
      WHERE keep.slug IS NOT NULL
        AND dupe.slug IS NULL
        AND keep.id != dupe.id
    `);

    if (duplicates.length === 0) {
      console.log('[Migration 073] No ScrapeConfigSync duplicates found');
      return;
    }

    console.log(`[Migration 073] Found ${duplicates.length} duplicate(s) to clean up`);

    for (const { keep_id, keep_name, keep_slug, dupe_id, dupe_name } of duplicates) {
      // Move any prices from duplicate to canonical record
      await sequelize.query(
        `UPDATE supplier_prices SET supplier_id = $1 WHERE supplier_id = $2`,
        { bind: [keep_id, dupe_id] }
      );

      // Delete the duplicate
      await sequelize.query(
        `DELETE FROM suppliers WHERE id = $1`,
        { bind: [dupe_id] }
      );

      console.log(`[Migration 073] Deleted duplicate "${dupe_name}" → keeping "${keep_name}" (${keep_slug})`);
    }

    console.log('[Migration 073] ✅ ScrapeConfigSync duplicate cleanup complete');
  },

  async down(sequelize) {
    console.log('[Migration 073] Rollback not supported for duplicate cleanup');
  }
};
