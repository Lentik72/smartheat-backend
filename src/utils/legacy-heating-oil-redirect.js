// src/utils/legacy-heating-oil-redirect.js
//
// Pure decision helper for the legacy /heating-oil[-prices]/{state}/{city}[-county][/]
// → /prices/county/{abbr}/{city} 301 (heatingoil-2e1s).
//
// Covers two domain-era URL formats: /heating-oil-prices/<full-state>/<county>-county
// and /heating-oil/<state-abbr-or-full>/<county>-county[/]. The legacy URL's "city"
// segment is actually a county slug with a "-county" suffix; we strip the suffix
// (non-greedy match + optional `(?:-county)?`) and route to the canonical
// /prices/county/{abbr}/{county} page.
//
// State resolution:
//   - If state is an OWN key in oldStateNames (full name like "pennsylvania"), use the abbr.
//     Uses Object.hasOwn (Node 16.9+) to avoid prototype-property false positives —
//     bracket notation `oldStateNames[state]` would return Object.prototype.constructor
//     for state === 'constructor', emitting a 301 to a stringified-function target.
//   - Else if state is a value in oldStateNames (already a valid 2-letter abbr we serve),
//     use as-is.
//   - Else return null (unknown state — don't 301 to a path we know doesn't exist).
//
// The regex's ^\/heating-oil anchor blocks //-prefixed open-redirect inputs (a path
// starting with // has the 2nd char = "/", not "h"). The [a-z-] char class blocks
// path traversal (".." contains ".").
//
// oldStateNames is injected so the test can run without coupling to server.js's
// constant. In server.js the caller passes OLD_STATE_NAMES.

const LEGACY_PATH = /^\/heating-oil(?:-prices)?\/([a-z-]+)\/([a-z-]+?)(?:-county)?\/?$/;

function legacyHeatingOilRedirectTarget(reqPath, oldStateNames) {
  const m = reqPath.match(LEGACY_PATH);
  if (!m) return null;
  const [, state, city] = m;
  let abbr;
  if (Object.hasOwn(oldStateNames, state)) {
    abbr = oldStateNames[state];
  } else if (Object.values(oldStateNames).includes(state)) {
    abbr = state;
  } else {
    return null;
  }
  return `/prices/county/${abbr}/${city}`;
}

module.exports = { legacyHeatingOilRedirectTarget };
