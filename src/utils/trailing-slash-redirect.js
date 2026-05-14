// src/utils/trailing-slash-redirect.js
//
// Pure decision helper for the trailing-slash → no-slash 301.
// Returns the no-slash target path if a redirect is needed, else null.
//
// Logic: when reqPath ends in '/' and is not '/', strip the slash IFF
//   {websiteDir}{noSlash}.html exists AND
//   {websiteDir}{reqPath}index.html does NOT exist.
// This recovers /prices/ → /prices when prices.html exists but
// prices/index.html doesn't, without disturbing paths that have a
// directory index (e.g. /prices/ny/ where prices/ny/index.html exists).
//
// Protocol-relative guard: Express 4 does NOT normalize leading slashes.
// A request to //prices/ arrives as reqPath === '//prices/'. Stripping the
// trailing slash yields '//prices', and res.redirect(301, '//prices') emits
// Location: //prices — a protocol-relative URL the browser resolves to
// https://prices/ (an open redirect). Verified empirically against Express
// 4.22.1. The helper rejects any reqPath starting with '//'.
//
// fileExists is injected so the unit test can run without touching the
// real filesystem. In server.js the caller passes fs.existsSync.

const path = require('path');

function trailingSlashRedirectTarget(reqPath, websiteDir, fileExists) {
  if (reqPath === '/' || !reqPath.endsWith('/')) return null;
  // Reject protocol-relative inputs before they can become an open redirect.
  if (reqPath.startsWith('//')) return null;
  const noSlash = reqPath.slice(0, -1);
  const htmlPath = path.join(websiteDir, noSlash + '.html');
  const indexPath = path.join(websiteDir, reqPath, 'index.html');
  if (fileExists(htmlPath) && !fileExists(indexPath)) return noSlash;
  return null;
}

module.exports = { trailingSlashRedirectTarget };
