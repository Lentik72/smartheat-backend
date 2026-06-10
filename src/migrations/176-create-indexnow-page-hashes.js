// src/migrations/176-create-indexnow-page-hashes.js
// Per-URL content-hash store for IndexNow change detection. The nightly
// IndexNow step (server.js, 23:31) compares the current normalized page hash
// against the row here to decide whether to submit the URL to Bing/IndexNow.
// See docs/deployment.md "IndexNow".
async function up(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS indexnow_page_hashes (
      url text PRIMARY KEY,
      content_hash text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}
async function down(sequelize) {
  await sequelize.query(`DROP TABLE IF EXISTS indexnow_page_hashes`);
}
module.exports = { up, down };
