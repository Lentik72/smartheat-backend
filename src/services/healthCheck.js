/**
 * Health-check helpers — extracted from server.js for testability.
 *
 * The DB-authenticate race is the load-bearing piece: an unbounded
 * sequelize.authenticate() previously caused Railway to roll back deploys
 * (heatingoil-jsxj). The race bounds /health latency so UptimeRobot doesn't
 * false-alert on transient DB slowness, and an exception during the race
 * is classified as 'down' vs 'timeout' so operators can distinguish a
 * Postgres blip from an outage.
 */

/**
 * Race a DB authenticate against a timeout.
 *
 * @param {object} sequelize — instance with .authenticate() returning a Promise; may be null
 * @param {number} timeoutMs — race deadline in ms
 * @returns {Promise<{state: 'up' | 'down' | 'timeout'}>} — resolves; never rejects
 */
async function raceDbAuthenticate(sequelize, timeoutMs) {
  if (!sequelize) return { state: 'down' };
  let raceTimer;
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => {
        raceTimer = setTimeout(() => reject(new Error('health-db-timeout')), timeoutMs);
      })
    ]);
    return { state: 'up' };
  } catch (error) {
    if (error && error.message === 'health-db-timeout') {
      return { state: 'timeout' };
    }
    return { state: 'down' };
  } finally {
    clearTimeout(raceTimer);
  }
}

/**
 * Truncate an error message for /health body.
 * Matches the 200-char cap in server.js to avoid leaking long stack traces
 * via a publicly-cacheable endpoint.
 */
function truncateMigrationError(err) {
  return String(err && err.message ? err.message : err).slice(0, 200);
}

module.exports = { raceDbAuthenticate, truncateMigrationError };
