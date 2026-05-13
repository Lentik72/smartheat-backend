/**
 * Migration 167: Delete the cn-brown-energy orphan row (cleanup for 165).
 *
 * Mig 165 renamed the original `cn-brown-energy` row → `cn-brown-brewer`
 * and repointed its website from `cnbrown.com` to `cnbrownenergy.com`.
 * That should have been the end of it, but on a subsequent deploy
 * (2026-05-13T14:32:17 UTC) a fresh `cn-brown-energy` row appeared with
 * website `https://www.cnbrown.com` and 49 stale ZIPs spanning Penobscot
 * + NH Coos.
 *
 * Root cause: mig 045's idempotency check
 *   SELECT id, slug FROM suppliers
 *   WHERE slug = 'cn-brown-energy' OR name ILIKE '%cn brown%'
 * is *supposed* to catch the sister-branch rows (Augusta/Brewer/Lancaster
 * all match the ILIKE) and short-circuit. It logs the expected
 * "⚠️ CN Brown Energy already exists" line on most boots — but somehow
 * misfired on the 14:32 boot. Forensic investigation tracked separately;
 * this migration is the cleanup backstop.
 *
 * Strategy:
 *   1. This migration DELETEs any row whose slug is 'cn-brown-energy' AND
 *      whose website matches the legacy cnbrown.com domain. It runs every
 *      boot AFTER mig 045 in numeric order — so if 045 ever resurrects
 *      the orphan, 167 silently removes it on the same boot before
 *      ScrapeConfigSync gets a chance to repopulate ZIPs.
 *   2. Companion change in scrape-config.json moves the `cnbrown.com`
 *      entry to `_ignore_list`, which prevents ScrapeConfigSync from
 *      ever syncing against it (its filter skips keys starting with `_`).
 *
 * Idempotent and safe to re-run.
 */

module.exports = {
  name: '167-delete-cn-brown-energy-orphan',

  async up(sequelize) {
    const [result] = await sequelize.query(
      `DELETE FROM suppliers
       WHERE slug = 'cn-brown-energy'
         AND LOWER(website) LIKE '%cnbrown.com%'
       RETURNING id`
    );

    const deleted = Array.isArray(result) ? result.length : 0;
    if (deleted > 0) {
      console.log(`[Migration 167] ✅ Deleted ${deleted} orphan cn-brown-energy row(s)`);
    } else {
      console.log('[Migration 167] No orphan cn-brown-energy row found — nothing to clean up');
    }
  },

  async down() {
    // No-op rollback: we can't reconstruct the orphan and we don't want to.
    console.log('[Migration 167] down: no-op (orphan deletion is one-way)');
  },
};
