// src/utils/subpath-index-redirect.js
//
// Pure decision helper for the subpath /{prefix}/index → /{prefix} 301
// (heatingoil-2e1s). The existing server.js rule handles bare /index → /;
// this generalizes for non-root paths like /prices/ny/index.
//
// Protocol-relative guard: Express 4 does NOT normalize leading slashes.
// A request to //foo/index arrives as reqPath === '//foo/index'. Without the
// guard, the regex below would match with group 1 = '/foo' and the helper
// would return '//foo', and res.redirect(301, '//foo') would emit
// Location: //foo — a protocol-relative URL the browser resolves to
// https://foo/ (open redirect). Verified empirically against Express 4.22.1.
// Same vector trailing-slash-redirect.js (x0ak) guards.

const SUBPATH_INDEX = /^\/(.+)\/index$/;

function subpathIndexRedirectTarget(reqPath) {
  if (reqPath.startsWith('//')) return null;
  const m = reqPath.match(SUBPATH_INDEX);
  if (!m) return null;
  return '/' + m[1];
}

module.exports = { subpathIndexRedirectTarget };
