/**
 * Terminal Proximity Service
 * V1.5.2: Silent ranking factor based on distance to wholesale fuel terminals
 *
 * Used internally to boost suppliers closer to terminals (better logistics = competitive pricing)
 * This data is NOT exposed to users - it's a backend ranking signal only.
 */

// Major wholesale heating oil terminals in our coverage area
// Coordinates are approximate city centers where terminals are located
const TERMINALS = [
  // Long Island, NY
  { name: 'Northville Holtsville', lat: 40.8154, lng: -73.0451, region: 'long_island' },
  { name: 'Northville Port Jefferson', lat: 40.9465, lng: -73.0691, region: 'long_island' },
  { name: 'Shell Lawrence', lat: 40.6157, lng: -73.7296, region: 'long_island' },

  // Westchester / Hudson Valley
  { name: 'Westmore Mt Vernon', lat: 40.9126, lng: -73.8371, region: 'westchester' },
  { name: 'Global Newburgh', lat: 41.5034, lng: -74.0104, region: 'hudson_valley' },

  // Connecticut
  { name: 'Global Bridgeport', lat: 41.1865, lng: -73.1952, region: 'connecticut' },
  { name: 'Sprague Bridgeport', lat: 41.1792, lng: -73.1894, region: 'connecticut' },
  { name: 'Buckeye New Haven', lat: 41.2982, lng: -72.9265, region: 'connecticut' },

  // New Jersey
  { name: 'United Metro Newark', lat: 40.7357, lng: -74.1724, region: 'new_jersey' },
  { name: 'Buckeye Newark', lat: 40.7282, lng: -74.1725, region: 'new_jersey' },
  { name: 'Sunoco Linden', lat: 40.6220, lng: -74.2446, region: 'new_jersey' },

  // Massachusetts
  { name: 'Global Chelsea', lat: 42.3918, lng: -71.0328, region: 'massachusetts' },
  { name: 'Sprague Springfield', lat: 42.1015, lng: -72.5898, region: 'massachusetts' },
];

// Approximate coordinates for supplier cities (expandable)
// Format: 'city,state' -> { lat, lng }
const CITY_COORDINATES = {
  // Westchester, NY
  'dobbs ferry,ny': { lat: 41.0145, lng: -73.8726 },
  'yonkers,ny': { lat: 40.9312, lng: -73.8987 },
  'white plains,ny': { lat: 41.0340, lng: -73.7629 },
  'mount kisco,ny': { lat: 41.2045, lng: -73.7271 },
  'katonah,ny': { lat: 41.2590, lng: -73.6854 },
  'peekskill,ny': { lat: 41.2901, lng: -73.9204 },
  'ossining,ny': { lat: 41.1626, lng: -73.8615 },
  'tarrytown,ny': { lat: 41.0762, lng: -73.8587 },
  'briarcliff manor,ny': { lat: 41.1457, lng: -73.8237 },
  'thornwood,ny': { lat: 41.1237, lng: -73.7793 },
  'montrose,ny': { lat: 41.2526, lng: -73.9421 },
  'shrub oak,ny': { lat: 41.3276, lng: -73.8193 },
  'croton on hudson,ny': { lat: 41.2084, lng: -73.8912 },

  // Putnam, NY
  'mahopac,ny': { lat: 41.3723, lng: -73.7329 },
  'carmel,ny': { lat: 41.4301, lng: -73.6804 },
  'cold spring,ny': { lat: 41.4201, lng: -73.9546 },
  'brewster,ny': { lat: 41.3984, lng: -73.6168 },
  'pawling,ny': { lat: 41.5623, lng: -73.6032 },

  // Dutchess, NY
  'fishkill,ny': { lat: 41.5357, lng: -73.8990 },
  'stormville,ny': { lat: 41.5548, lng: -73.7329 },
  'hopewell junction,ny': { lat: 41.5776, lng: -73.8054 },

  // Rockland, NY
  'new city,ny': { lat: 41.1476, lng: -73.9893 },
  'tappan,ny': { lat: 41.0226, lng: -73.9471 },

  // Orange, NY
  'newburgh,ny': { lat: 41.5034, lng: -74.0104 },
  'tuxedo park,ny': { lat: 41.1962, lng: -74.1988 },
  'new windsor,ny': { lat: 41.4737, lng: -74.0238 },

  // Long Island, NY
  'deer park,ny': { lat: 40.7629, lng: -73.3293 },
  'ronkonkoma,ny': { lat: 40.8154, lng: -73.1151 },
  'mineola,ny': { lat: 40.7493, lng: -73.6407 },
  'medford,ny': { lat: 40.8176, lng: -72.9851 },
  'miller place,ny': { lat: 40.9601, lng: -72.9962 },
  'huntington,ny': { lat: 40.8682, lng: -73.4257 },

  // New Jersey
  'budd lake,nj': { lat: 40.8712, lng: -74.7340 },
  'robbinsville,nj': { lat: 40.2165, lng: -74.6138 },
  'princeton,nj': { lat: 40.3573, lng: -74.6672 },
  'paramus,nj': { lat: 40.9445, lng: -74.0754 },
  'paterson,nj': { lat: 40.9168, lng: -74.1718 },

  // Massachusetts
  'chelmsford,ma': { lat: 42.5998, lng: -71.3673 },
  'north adams,ma': { lat: 42.7009, lng: -73.1087 },
  'greenfield,ma': { lat: 42.5876, lng: -72.5995 },
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in miles
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get coordinates for a supplier's city
 * @param {string} city
 * @param {string} state
 * @returns {{ lat: number, lng: number } | null}
 */
function getSupplierCoordinates(city, state) {
  if (!city || !state) return null;
  const key = `${city.toLowerCase().trim()},${state.toLowerCase().trim()}`;
  return CITY_COORDINATES[key] || null;
}

/**
 * Find distance to nearest terminal for a supplier
 * @param {string} city - Supplier's city
 * @param {string} state - Supplier's state
 * @returns {{ distance: number, terminal: string } | null}
 */
function getNearestTerminalDistance(city, state) {
  const coords = getSupplierCoordinates(city, state);
  if (!coords) return null;

  let nearest = null;
  let minDistance = Infinity;

  for (const terminal of TERMINALS) {
    const distance = calculateDistance(coords.lat, coords.lng, terminal.lat, terminal.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = terminal.name;
    }
  }

  return nearest ? { distance: minDistance, terminal: nearest } : null;
}

/**
 * Calculate terminal proximity score (0-100, higher = closer to terminal)
 * Used as a silent ranking boost
 *
 * Scoring:
 * - < 10 miles: 100 points (excellent)
 * - 10-20 miles: 80 points (good)
 * - 20-30 miles: 60 points (moderate)
 * - 30-50 miles: 40 points (fair)
 * - > 50 miles: 20 points (distant)
 * - Unknown: 50 points (neutral)
 *
 * @param {string} city
 * @param {string} state
 * @returns {number} Score 0-100
 */
function getTerminalProximityScore(city, state) {
  const result = getNearestTerminalDistance(city, state);

  if (!result) {
    return 50; // Neutral score for unknown locations
  }

  const distance = result.distance;

  if (distance < 10) return 100;
  if (distance < 20) return 80;
  if (distance < 30) return 60;
  if (distance < 50) return 40;
  return 20;
}

/**
 * Get terminal proximity bucket for a supplier
 * @param {string} city
 * @param {string} state
 * @returns {'close' | 'moderate' | 'far' | 'unknown'}
 */
function getTerminalProximityBucket(city, state) {
  const result = getNearestTerminalDistance(city, state);

  if (!result) return 'unknown';

  if (result.distance < 15) return 'close';
  if (result.distance < 35) return 'moderate';
  return 'far';
}

module.exports = {
  getTerminalProximityScore,
  getTerminalProximityBucket,
  getNearestTerminalDistance,
  TERMINALS,
};
