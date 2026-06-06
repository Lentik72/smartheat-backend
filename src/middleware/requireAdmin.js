/**
 * Shared admin authentication middleware.
 *
 * Guards admin-only API routes. A request is authorized if it presents a
 * token matching ADMIN_REVIEW_TOKEN (the admin master token, same one used by
 * price-review and admin-supplier-claims) or DASHBOARD_PASSWORD.
 *
 * Token is read from, in order: X-Admin-Token header, Authorization: Bearer
 * <token>, or ?token= query param.
 *
 * Fail-closed by design:
 *  - If NEITHER ADMIN_REVIEW_TOKEN nor DASHBOARD_PASSWORD is configured, every
 *    request is denied (503). There is deliberately NO hardcoded default token
 *    — a missing env var must never silently open the door. (heatingoil-jqw7;
 *    cf. the price-review `|| 'smartheat-...'` default-token hole.)
 *  - A missing or non-matching token is denied (401).
 */
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers && req.headers.authorization;
  const token =
    (req.headers && req.headers['x-admin-token']) ||
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
    (req.query && req.query.token) ||
    null;

  const adminToken = process.env.ADMIN_REVIEW_TOKEN;
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;

  // Fail-closed: no credential configured at all -> deny everything.
  if (!adminToken && !dashboardPassword) {
    return res.status(503).json({ error: 'Admin auth not configured' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if ((adminToken && token === adminToken) || (dashboardPassword && token === dashboardPassword)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
};

module.exports = requireAdmin;
