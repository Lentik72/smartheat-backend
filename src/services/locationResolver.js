/**
 * locationResolver.js
 * V1.5.0: City and County to ZIP code resolution
 *
 * Builds reverse indexes from zip-database.json for efficient lookups:
 * - cityIndex: city,state -> [zip1, zip2, ...]
 * - countyIndex: county,state -> [zip1, zip2, ...]
 *
 * Normalization: Mt->Mount, St.->Saint, lowercase, trimmed
 */

const zipDatabase = require('../data/zip-database.json');

// Reverse indexes built once on module load
const cityIndex = {};    // "armonk,ny" -> ["10504"]
const countyIndex = {};  // "westchester,ny" -> ["10501", "10502", ...]

/**
 * Normalize location name for consistent matching
 * Handles: Mt->Mount, St.->Saint, lowercase, trim
 */
function normalizeLocation(name) {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\bmt\.?\b/gi, 'mount')
    .replace(/\bst\.?\b/gi, 'saint')
    .replace(/\bn\.?\b/gi, 'north')
    .replace(/\bs\.?\b/gi, 'south')
    .replace(/\be\.?\b/gi, 'east')
    .replace(/\bw\.?\b/gi, 'west')
    .replace(/['']/g, "'")  // Normalize apostrophes
    .replace(/\s+/g, ' ');  // Normalize whitespace
}

/**
 * Build a cache key from location and state
 */
function buildKey(location, state) {
  return `${normalizeLocation(location)},${state.toLowerCase()}`;
}

// Build indexes on module load
function buildIndexes() {
  Object.entries(zipDatabase).forEach(([zip, info]) => {
    if (!info.city || !info.state) return;

    // City index
    const cityKey = buildKey(info.city, info.state);
    if (!cityIndex[cityKey]) {
      cityIndex[cityKey] = [];
    }
    cityIndex[cityKey].push(zip);

    // County index
    if (info.county) {
      const countyKey = buildKey(info.county, info.state);
      if (!countyIndex[countyKey]) {
        countyIndex[countyKey] = [];
      }
      countyIndex[countyKey].push(zip);
    }
  });

  // Sort ZIP codes in each index for consistent ordering
  Object.values(cityIndex).forEach(zips => zips.sort());
  Object.values(countyIndex).forEach(zips => zips.sort());

  console.log(`[locationResolver] Built indexes: ${Object.keys(cityIndex).length} cities, ${Object.keys(countyIndex).length} counties`);
}

// Initialize indexes
buildIndexes();

/**
 * Get all ZIP codes for a city
 * @param {string} city - City name (e.g., "Armonk", "Mt Kisco")
 * @param {string} state - State code (e.g., "NY")
 * @returns {string[]} Array of ZIP codes, empty if not found
 */
function getZipsForCity(city, state) {
  if (!city || !state) return [];
  const key = buildKey(city, state);
  return cityIndex[key] || [];
}

/**
 * Get all ZIP codes for a county
 * @param {string} county - County name (e.g., "Westchester")
 * @param {string} state - State code (e.g., "NY")
 * @returns {string[]} Array of ZIP codes, empty if not found
 */
function getZipsForCounty(county, state) {
  if (!county || !state) return [];
  const key = buildKey(county, state);
  return countyIndex[key] || [];
}

/**
 * Check if a location resolves to any ZIPs
 * @param {string} location - City or county name
 * @param {string} state - State code
 * @returns {boolean}
 */
function isValidLocation(location, state) {
  if (!location || !state) return false;
  const key = buildKey(location, state);
  return !!(cityIndex[key] || countyIndex[key]);
}

/**
 * Get location type (city, county, or unknown)
 * @param {string} location - Location name
 * @param {string} state - State code
 * @returns {'city' | 'county' | 'unknown'}
 */
function getLocationType(location, state) {
  if (!location || !state) return 'unknown';
  const key = buildKey(location, state);
  if (cityIndex[key]) return 'city';
  if (countyIndex[key]) return 'county';
  return 'unknown';
}

/**
 * Get all known cities for a state
 * @param {string} state - State code
 * @returns {string[]} Array of city names
 */
function getCitiesForState(state) {
  if (!state) return [];
  const suffix = `,${state.toLowerCase()}`;
  return Object.keys(cityIndex)
    .filter(key => key.endsWith(suffix))
    .map(key => key.replace(suffix, ''));
}

/**
 * Get all known counties for a state
 * @param {string} state - State code
 * @returns {string[]} Array of county names
 */
function getCountiesForState(state) {
  if (!state) return [];
  const suffix = `,${state.toLowerCase()}`;
  return Object.keys(countyIndex)
    .filter(key => key.endsWith(suffix))
    .map(key => key.replace(suffix, ''));
}

/**
 * Get representative cities for a 3-digit ZIP prefix (e.g., "105" → ["White Plains", "Mount Vernon"]).
 * Ranks by ZIP-count: cities covering more ZIPs in the prefix rank higher (good proxy for city size).
 * Filters out placeholder city names (e.g., "106hh") that match `^\d+[a-z]*$`.
 * @param {string} prefix - 3-digit ZIP prefix (e.g., "105")
 * @param {string} state - Optional state filter (e.g., "NY"). When provided, only cities in that state count.
 * @param {number} limit - Max cities to return. Default 1.
 * @returns {string[]} Top N cities by ZIP count, empty if none found.
 */
function getCitiesForPrefix(prefix, state = null, limit = 1) {
  if (!prefix) return [];
  const stateLower = state ? state.toLowerCase() : null;
  const cityZips = {};
  for (const [zip, info] of Object.entries(zipDatabase)) {
    if (!zip.startsWith(prefix)) continue;
    if (!info || !info.city) continue;
    if (stateLower && info.state && info.state.toLowerCase() !== stateLower) continue;
    // Skip placeholder names like "105hh", "10501a" — anything that's just digits + optional letters.
    if (/^\d+[a-z]*$/i.test(info.city.trim())) continue;
    cityZips[info.city] = (cityZips[info.city] || 0) + 1;
  }
  return Object.entries(cityZips)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([city]) => city);
}

module.exports = {
  getZipsForCity,
  getZipsForCounty,
  getCitiesForPrefix,
  isValidLocation,
  getLocationType,
  getCitiesForState,
  getCountiesForState,
  normalizeLocation,
  // Expose for testing
  _cityIndex: cityIndex,
  _countyIndex: countyIndex
};
