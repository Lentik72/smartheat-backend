/**
 * Migration 100: scrape-config.json is now authoritative for postal_codes_served
 *
 * After this migration, new supplier migrations should NOT include postalCodesServed.
 * Coverage changes must be made in scrape-config.json, synced via ScrapeConfigSync.
 *
 * To shrink coverage: add postalCodesOverride: true to the config entry.
 * Emergency kill switch: set SCRAPECONFIG_SKIP_COVERAGE=true env var.
 */

module.exports = {
  name: '100-scrapeconfig-coverage-authority',
  async up() {
    console.log('[Migration 100] postal_codes_served now managed by scrape-config.json');
    console.log('[Migration 100] New supplier migrations should NOT include postalCodesServed');
  },
  async down() {}
};
