// Migration 111: Reset last_price_seen for subscribers who never received an alert.
// Bug: signup was setting last_price_seen = current min price, causing the daily
// dedup check to skip the first alert (price hadn't changed since signup).
// Fix: NULL out last_price_seen so dedup check is bypassed for first alert.

async function up(sequelize) {
  const [, meta] = await sequelize.query(`
    UPDATE price_alert_subscribers
    SET last_price_seen = NULL
    WHERE first_sent_at IS NULL
      AND last_price_seen IS NOT NULL
      AND active = true
  `);
  const count = meta?.rowCount || 0;
  console.log(`[Migration 111] Reset last_price_seen for ${count} subscribers who never received an alert`);
}

module.exports = { up };
