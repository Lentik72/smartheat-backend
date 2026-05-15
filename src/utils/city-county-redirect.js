// src/utils/city-county-redirect.js
//
// Pure decision helper for the city → -county fuzzy 301.
// Returns the no-slash '-county' target path if a redirect is needed, else null.
//
// Logic: for paths matching /prices/{2-letter-state}/{single-city-segment}
// (no trailing slash), if {path}-county.html exists under websiteDir, return
// {path}-county. This recovers /prices/va/fairfax → /prices/va/fairfax-county
// when the user dropped the -county suffix the filename uses.
//
// One-way only (no reverse -county → no-suffix) — no GSC evidence for the
// reverse. The regex naturally excludes /prices/county/..., fuel-prefixed
// routes (/prices/kerosene/...), trailing-slash paths, and deeper paths:
// 'county'/'kerosene'/'propane' are not 2-letter segments, and the $ anchor
// with no '/' in the char class rejects trailing slashes. It also rejects
// protocol-relative inputs (//prices/...) — the ^\/prices anchor requires
// the 2nd char to be 'p' — so unlike trailing-slash-redirect.js this helper
// needs no explicit '//' open-redirect guard.
//
// fileExists is injected so the unit test can run without touching the
// real filesystem. In server.js the caller passes fs.existsSync. The caller
// only invokes this after the exact-match {path}.html was already found absent.

const path = require('path');

const CITY_PATH = /^\/prices\/[a-z]{2}\/[a-z0-9-]+$/;

function cityCountyRedirectTarget(reqPath, websiteDir, fileExists) {
  if (!CITY_PATH.test(reqPath)) return null;
  // Already -county: don't append another (and one-way means no reverse).
  if (reqPath.endsWith('-county')) return null;
  const countyPath = reqPath + '-county';
  if (fileExists(path.join(websiteDir, countyPath + '.html'))) return countyPath;
  return null;
}

module.exports = { cityCountyRedirectTarget };
