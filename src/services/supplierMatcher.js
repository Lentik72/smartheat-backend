/**
 * Unified Supplier Matching Service
 * V1.0.0: ZIP → City → County → Radius matching with ranking
 *
 * Same matching logic used by backend API and iOS offline (minus radius)
 */

const zipDatabase = require('../data/zip-database.json');

// Matching scores (used for ranking)
const SCORE = {
  ZIP: 100,
  CITY: 80,
  COUNTY: 60,
  RADIUS: 40
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {Object} point1 - { lat, lng }
 * @param {Object} point2 - { lat, lng }
 * @returns {number} Distance in miles
 */
function calculateDistance(point1, point2) {
  if (!point1.lat || !point1.lng || !point2.lat || !point2.lng) {
    return Infinity;
  }

  const R = 3959; // Earth's radius in miles
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalize city name for matching
 * Handles common abbreviations and case
 */
function normalizeCity(city) {
  if (!city) return '';
  return city
    .trim()
    .toLowerCase()
    .replace(/\bmt\.?\b/gi, 'mount')
    .replace(/\bst\.?\b/gi, 'saint')
    .replace(/\bn\.?\b/gi, 'north')
    .replace(/\bs\.?\b/gi, 'south')
    .replace(/\be\.?\b/gi, 'east')
    .replace(/\bw\.?\b/gi, 'west');
}

/**
 * Check if two city names match (case-insensitive, normalized)
 */
function citiesMatch(city1, city2) {
  return normalizeCity(city1) === normalizeCity(city2);
}

/**
 * Detect gap type based on results
 * @param {Array} results - Matched suppliers with scores
 * @returns {string|null} Gap type or null if coverage is good
 */
function detectGap(results) {
  if (results.length === 0) return 'hard_gap';
  if (results.length < 3) return 'coverage_gap';
  if (results.every(r => r.matchType === 'county')) return 'soft_gap';
  return null;
}

/**
 * Find suppliers for a ZIP code with ranking
 *
 * @param {string} userZip - User's ZIP code
 * @param {Array} suppliers - Array of supplier objects
 * @param {Object} options - Matching options
 * @param {boolean} options.includeRadius - Include radius matching (backend only)
 * @returns {Object} { suppliers: Array, gapType: string|null, userInfo: Object|null }
 */
function findSuppliersForZip(userZip, suppliers, options = {}) {
  const normalizedZip = userZip?.trim()?.substring(0, 5);
  const userInfo = zipDatabase[normalizedZip];

  if (!userInfo) {
    return {
      suppliers: [],
      gapType: 'unknown_zip',
      userInfo: null
    };
  }

  const scored = suppliers.map(supplier => {
    let score = 0;
    let matchType = null;

    // Priority 1: Exact ZIP match (100 points)
    const postalCodes = supplier.postalCodesServed || supplier.postal_codes_served || [];
    if (postalCodes.includes(normalizedZip)) {
      score = SCORE.ZIP;
      matchType = 'zip';
    }
    // Priority 2: City match (80 points)
    else {
      const serviceCities = supplier.serviceCities || supplier.service_cities || [];
      const supplierCity = supplier.city;

      // Check serviceCities array
      const cityMatch = serviceCities.some(city => citiesMatch(city, userInfo.city));
      // Also check if supplier's home city matches user's city
      const homeCityMatch = supplierCity && citiesMatch(supplierCity, userInfo.city);

      if (cityMatch || homeCityMatch) {
        score = SCORE.CITY;
        matchType = 'city';
      }
    }
    // Priority 3: County match (60 points) - EXPLICIT ONLY
    if (score === 0) {
      const serviceCounties = supplier.serviceCounties || supplier.service_counties || [];
      if (serviceCounties.includes(userInfo.county)) {
        score = SCORE.COUNTY;
        matchType = 'county';
      }
    }
    // Priority 4: Radius match (40 points) - BACKEND ONLY
    if (score === 0 && options.includeRadius) {
      const supplierLat = supplier.lat || supplier.latitude;
      const supplierLng = supplier.lng || supplier.longitude;
      const radius = supplier.serviceAreaRadius || supplier.service_area_radius;

      if (radius && supplierLat && supplierLng && userInfo.lat && userInfo.lng) {
        const distance = calculateDistance(
          { lat: userInfo.lat, lng: userInfo.lng },
          { lat: supplierLat, lng: supplierLng }
        );
        if (distance <= radius) {
          score = SCORE.RADIUS;
          matchType = 'radius';
        }
      }
    }

    if (score === 0) return null;

    // Add verified bonus
    if (supplier.verified) {
      score += 20;
    }

    return {
      ...supplier,
      score,
      matchType
    };
  }).filter(Boolean);

  // Sort by score descending, then by name
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || '').localeCompare(b.name || '');
  });

  const gapType = detectGap(scored);

  return {
    suppliers: scored,
    gapType,
    userInfo
  };
}

/**
 * Get ZIP info from database
 * @param {string} zip - ZIP code
 * @returns {Object|null} ZIP info or null
 */
function getZipInfo(zip) {
  const normalizedZip = zip?.trim()?.substring(0, 5);
  return zipDatabase[normalizedZip] || null;
}

/**
 * Check if a ZIP is in our database
 * @param {string} zip - ZIP code
 * @returns {boolean}
 */
function isZipSupported(zip) {
  return getZipInfo(zip) !== null;
}

module.exports = {
  findSuppliersForZip,
  getZipInfo,
  isZipSupported,
  calculateDistance,
  normalizeCity,
  citiesMatch,
  detectGap,
  SCORE,
  zipDatabase
};
// Build: 1768302183
