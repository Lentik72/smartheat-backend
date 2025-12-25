// V18.6: ZIP Code Centroid Data for Distance-Based Community
// Contains 3-digit ZIP prefix centroids for Northeast US (heating oil region)
// Data approximations based on USPS ZIP code geographic centers

// Haversine formula for distance between two lat/lng points
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 3-digit ZIP prefix centroids for Northeast US
// Format: { prefix: [latitude, longitude] }
const ZIP_PREFIX_CENTROIDS = {
  // Connecticut (060-069)
  '060': [41.31, -72.92], // New Haven area
  '061': [41.55, -72.65], // Middletown area
  '062': [41.76, -72.68], // Hartford area
  '063': [41.27, -73.20], // Bridgeport area
  '064': [41.05, -73.54], // Stamford area
  '065': [41.35, -73.08], // Waterbury area
  '066': [41.16, -73.25], // Norwalk area
  '067': [41.75, -73.42], // Waterbury north
  '068': [41.68, -72.77], // New Britain area
  '069': [41.90, -72.50], // Hartford north

  // Massachusetts (010-027)
  '010': [42.10, -72.59], // Springfield area
  '011': [42.27, -72.50], // Springfield north
  '012': [42.45, -73.25], // Pittsfield area
  '013': [42.38, -72.52], // Greenfield area
  '014': [42.27, -71.80], // Worcester west
  '015': [42.10, -71.85], // Worcester area
  '016': [42.27, -71.80], // Worcester east
  '017': [42.35, -71.60], // Framingham area
  '018': [42.52, -71.55], // Lowell area
  '019': [42.37, -71.03], // Lynn area
  '020': [42.28, -71.42], // Brockton area
  '021': [42.36, -71.06], // Boston
  '022': [42.34, -71.10], // Boston downtown
  '023': [42.25, -71.00], // Brockton/Quincy
  '024': [42.40, -71.08], // Chelsea/Everett
  '025': [41.70, -70.30], // Cape Cod
  '026': [41.65, -70.90], // Buzzards Bay
  '027': [41.52, -71.05], // New Bedford

  // Rhode Island (028-029)
  '028': [41.82, -71.42], // Providence area
  '029': [41.52, -71.45], // Warwick area

  // New Hampshire (030-038)
  '030': [42.99, -71.45], // Manchester area
  '031': [42.87, -71.35], // Manchester south
  '032': [43.21, -71.53], // Concord area
  '033': [43.20, -71.55], // Concord
  '034': [43.10, -70.83], // Dover area
  '035': [44.27, -71.30], // Littleton area
  '036': [43.65, -72.32], // Lebanon area
  '037': [42.75, -71.47], // Nashua area
  '038': [42.95, -70.82], // Portsmouth area

  // Vermont (050-059)
  '050': [43.62, -72.98], // Rutland area
  '051': [42.87, -72.55], // Bellows Falls
  '052': [42.88, -72.57], // Brattleboro area
  '053': [43.61, -72.97], // Rutland
  '054': [44.48, -73.21], // Burlington area
  '055': [43.35, -72.52], // Windsor area
  '056': [44.47, -73.15], // Burlington
  '057': [44.26, -72.58], // Montpelier area
  '058': [44.92, -72.20], // St. Johnsbury area
  '059': [44.42, -72.02], // White River Junction

  // Maine (039-049)
  '039': [43.10, -70.75], // Kittery area
  '040': [43.66, -70.25], // Portland area
  '041': [43.65, -70.26], // Portland
  '042': [43.91, -69.97], // Brunswick area
  '043': [44.10, -70.22], // Lewiston area
  '044': [44.80, -68.77], // Bangor area
  '045': [44.32, -69.78], // Augusta area
  '046': [44.53, -67.92], // Ellsworth area
  '047': [46.68, -68.02], // Houlton area
  '048': [44.82, -68.80], // Bangor
  '049': [44.48, -69.00], // Waterville area

  // New York (100-149)
  '100': [40.78, -73.97], // New York City
  '101': [40.75, -73.98], // Manhattan
  '102': [40.81, -73.95], // Bronx
  '103': [40.65, -73.95], // Brooklyn
  '104': [40.65, -73.97], // Brooklyn south
  '105': [40.92, -73.85], // Westchester south
  '106': [41.03, -73.76], // White Plains
  '107': [40.95, -73.83], // Yonkers area
  '108': [41.15, -73.80], // New Rochelle area
  '109': [41.35, -74.05], // Suffern area
  '110': [40.75, -73.47], // Long Island
  '111': [40.72, -73.85], // Queens
  '112': [40.65, -73.77], // Jamaica
  '113': [40.65, -73.75], // Flushing area
  '114': [40.75, -73.65], // Jamaica east
  '115': [40.77, -73.45], // Mineola area
  '116': [40.75, -73.55], // Great Neck
  '117': [40.77, -73.42], // Hicksville area
  '118': [40.78, -73.30], // Huntington area
  '119': [40.93, -72.66], // Riverhead area
  '120': [40.65, -73.95], // Albany - error fix
  '121': [42.65, -73.75], // Albany area
  '122': [42.85, -73.95], // Schenectady area
  '123': [42.70, -73.85], // Albany
  '124': [41.95, -73.70], // Kingston area
  '125': [41.50, -74.00], // Poughkeepsie area
  '126': [41.70, -73.92], // Poughkeepsie
  '127': [41.58, -73.87], // Newburgh area
  '128': [42.20, -75.00], // Binghamton area
  '129': [42.88, -78.88], // Buffalo area
  '130': [43.05, -76.15], // Syracuse area
  '131': [43.05, -76.15], // Syracuse
  '132': [43.10, -76.10], // Syracuse east
  '133': [43.10, -75.25], // Utica area
  '134': [43.10, -75.22], // Utica
  '135': [44.70, -73.45], // Plattsburgh area
  '136': [43.97, -75.92], // Watertown area
  '137': [42.12, -79.00], // Jamestown area
  '140': [42.88, -78.88], // Buffalo
  '141': [42.95, -78.85], // Buffalo north
  '142': [42.90, -78.70], // Buffalo east
  '143': [43.16, -77.62], // Rochester area
  '144': [43.15, -77.60], // Rochester
  '145': [43.08, -77.65], // Rochester south
  '146': [43.16, -77.62], // Rochester
  '147': [42.09, -76.80], // Elmira area
  '148': [42.12, -76.80], // Elmira
  '149': [42.44, -76.50], // Ithaca area

  // New Jersey (070-089)
  '070': [40.73, -74.17], // Newark area
  '071': [40.72, -74.07], // Jersey City area
  '072': [40.52, -74.25], // Elizabeth area
  '073': [40.85, -74.22], // Paterson area
  '074': [40.90, -74.15], // Paterson
  '075': [40.87, -74.05], // Hackensack area
  '076': [40.78, -74.00], // Hoboken area
  '077': [40.55, -74.55], // Red Bank area
  '078': [40.65, -74.90], // Somerville area
  '079': [40.87, -74.55], // Dover area
  '080': [39.95, -74.88], // Cherry Hill area
  '081': [39.88, -75.03], // Camden area
  '082': [39.45, -75.23], // Salem area
  '083': [39.38, -74.50], // Atlantic City area
  '084': [39.47, -75.02], // Vineland area
  '085': [40.22, -74.77], // Trenton area
  '086': [40.22, -74.75], // Trenton
  '087': [40.00, -74.80], // Burlington area
  '088': [40.48, -74.45], // New Brunswick area
  '089': [40.33, -74.07], // Freehold area

  // Pennsylvania (150-196)
  '150': [40.44, -79.99], // Pittsburgh area
  '151': [40.44, -79.99], // Pittsburgh
  '152': [40.45, -79.95], // Pittsburgh east
  '153': [40.32, -79.65], // Greensburg area
  '154': [40.50, -78.40], // Altoona area
  '155': [40.01, -78.50], // Johnstown area
  '156': [40.43, -78.00], // Altoona east
  '157': [40.16, -77.70], // Chambersburg area
  '158': [40.85, -79.95], // Butler area
  '159': [41.12, -80.08], // Sharon area
  '160': [41.40, -79.82], // Oil City area
  '161': [41.24, -78.64], // DuBois area
  '162': [41.85, -80.10], // Erie area
  '163': [42.13, -80.08], // Erie
  '164': [41.98, -79.32], // Warren area
  '165': [41.25, -77.00], // Williamsport area
  '166': [40.92, -77.77], // State College area
  '167': [40.68, -77.18], // Harrisburg area
  '168': [40.80, -76.55], // Pottsville area
  '169': [40.57, -76.98], // Middletown area
  '170': [40.27, -76.88], // Harrisburg
  '171': [40.27, -76.88], // Harrisburg
  '172': [40.04, -76.31], // Lancaster area
  '173': [39.96, -76.73], // York area
  '174': [39.73, -75.95], // York south
  '175': [39.97, -76.35], // Lancaster
  '176': [40.35, -76.00], // Reading area
  '177': [40.32, -75.95], // Reading
  '178': [40.55, -75.45], // Allentown area
  '179': [40.60, -75.37], // Allentown
  '180': [40.72, -75.40], // Bethlehem area
  '181': [40.63, -75.38], // Bethlehem
  '182': [41.33, -75.85], // Hazleton area
  '183': [41.25, -75.88], // Scranton area
  '184': [41.41, -75.66], // Scranton
  '185': [41.45, -75.65], // Scranton north
  '186': [41.55, -75.50], // Wilkes-Barre area
  '187': [41.24, -75.88], // Wilkes-Barre
  '188': [41.03, -75.52], // Stroudsburg area
  '189': [41.07, -74.88], // East Stroudsburg
  '190': [40.00, -75.14], // Philadelphia area
  '191': [39.95, -75.17], // Philadelphia
  '192': [40.02, -75.12], // Philadelphia north
  '193': [40.10, -75.30], // Norristown area
  '194': [40.13, -75.52], // Chester area
  '195': [40.22, -75.13], // Lansdale area
  '196': [39.85, -75.35], // Media area

  // Delaware (197-199)
  '197': [39.74, -75.55], // Wilmington area
  '198': [39.74, -75.55], // Wilmington
  '199': [39.16, -75.52], // Dover area

  // Maryland (206-219)
  '206': [38.98, -76.95], // Waldorf area
  '207': [39.10, -76.65], // Annapolis area
  '208': [39.30, -76.62], // Baltimore area
  '209': [39.48, -76.64], // Silver Spring area
  '210': [39.30, -76.62], // Baltimore
  '211': [39.32, -76.60], // Baltimore
  '212': [39.28, -76.61], // Baltimore
  '214': [38.98, -76.49], // Annapolis
  '215': [39.43, -76.62], // Towson area
  '216': [39.48, -76.32], // Bel Air area
  '217': [39.64, -77.72], // Hagerstown area
  '218': [39.65, -78.76], // Cumberland area
  '219': [39.40, -79.42], // Oakland area

  // DC (200-205)
  '200': [38.90, -77.03], // Washington DC
  '201': [38.90, -77.03], // Washington DC
  '202': [38.90, -77.03], // Washington DC
  '203': [38.90, -77.03], // Washington DC
  '204': [38.90, -77.03], // Washington DC
  '205': [38.90, -77.03], // Washington DC

  // Virginia (220-246) - Northern VA heating oil region
  '220': [38.85, -77.30], // Arlington area
  '221': [38.86, -77.09], // Alexandria area
  '222': [38.88, -77.17], // Arlington
  '223': [38.77, -77.18], // Alexandria
  '224': [39.00, -77.42], // Fairfax area
  '225': [38.80, -77.55], // Manassas area
  '226': [38.72, -77.80], // Fredericksburg area
  '227': [38.30, -77.47], // Fredericksburg
};

// Get centroid for a ZIP code (uses 3-digit prefix)
const getCentroid = (zipCode) => {
  if (!zipCode || zipCode.length < 3) return null;
  const prefix = zipCode.substring(0, 3);
  const coords = ZIP_PREFIX_CENTROIDS[prefix];
  return coords ? { lat: coords[0], lng: coords[1], prefix } : null;
};

// Find all ZIP prefixes within a given radius of a ZIP code
const findNearbyPrefixes = (zipCode, radiusMiles) => {
  const origin = getCentroid(zipCode);
  if (!origin) return [];

  const nearby = [];
  for (const [prefix, coords] of Object.entries(ZIP_PREFIX_CENTROIDS)) {
    const distance = calculateDistance(origin.lat, origin.lng, coords[0], coords[1]);
    if (distance <= radiusMiles) {
      nearby.push({ prefix, distance: Math.round(distance * 10) / 10 });
    }
  }

  // Sort by distance
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby;
};

// Find nearby prefixes with progressive expansion (10 -> 15 -> 20 miles)
const findNearbyPrefixesProgressive = (zipCode, minDeliveries = 3, minContributors = 2, getDeliveryCountFn) => {
  const radiusTiers = [10, 15, 20, 30, 50]; // Progressive expansion

  for (const radius of radiusTiers) {
    const nearby = findNearbyPrefixes(zipCode, radius);
    const prefixes = nearby.map(n => n.prefix);

    // If we have a function to check delivery counts, use it
    if (getDeliveryCountFn) {
      const { deliveryCount, contributorCount } = getDeliveryCountFn(prefixes);
      if (deliveryCount >= minDeliveries && contributorCount >= minContributors) {
        return { prefixes, radius, deliveryCount, contributorCount };
      }
    } else {
      // Without count function, just return prefixes at this tier
      if (nearby.length >= 3) { // At least 3 nearby areas
        return { prefixes, radius };
      }
    }
  }

  // Return maximum radius if thresholds not met
  const nearby = findNearbyPrefixes(zipCode, 50);
  return { prefixes: nearby.map(n => n.prefix), radius: 50, insufficient: true };
};

// Check if a ZIP code is in the supported region (Northeast US)
const isInSupportedRegion = (zipCode) => {
  if (!zipCode || zipCode.length < 3) return false;
  const prefix = zipCode.substring(0, 3);
  return !!ZIP_PREFIX_CENTROIDS[prefix];
};

// Get all supported prefixes
const getAllSupportedPrefixes = () => {
  return Object.keys(ZIP_PREFIX_CENTROIDS);
};

// Get state from ZIP prefix (approximate)
const getStateFromPrefix = (prefix) => {
  const prefixNum = parseInt(prefix);

  // Connecticut
  if (prefixNum >= 60 && prefixNum <= 69) return 'CT';
  // Massachusetts
  if (prefixNum >= 10 && prefixNum <= 27) return 'MA';
  // Rhode Island
  if (prefixNum >= 28 && prefixNum <= 29) return 'RI';
  // New Hampshire
  if (prefixNum >= 30 && prefixNum <= 38) return 'NH';
  // Vermont
  if (prefixNum >= 50 && prefixNum <= 59) return 'VT';
  // Maine
  if (prefixNum >= 39 && prefixNum <= 49) return 'ME';
  // New York
  if (prefixNum >= 100 && prefixNum <= 149) return 'NY';
  // New Jersey
  if (prefixNum >= 70 && prefixNum <= 89) return 'NJ';
  // Pennsylvania
  if (prefixNum >= 150 && prefixNum <= 196) return 'PA';
  // Delaware
  if (prefixNum >= 197 && prefixNum <= 199) return 'DE';
  // Maryland
  if (prefixNum >= 206 && prefixNum <= 219) return 'MD';
  // DC
  if (prefixNum >= 200 && prefixNum <= 205) return 'DC';
  // Virginia
  if (prefixNum >= 220 && prefixNum <= 246) return 'VA';

  return null;
};

module.exports = {
  calculateDistance,
  getCentroid,
  findNearbyPrefixes,
  findNearbyPrefixesProgressive,
  isInSupportedRegion,
  getAllSupportedPrefixes,
  getStateFromPrefix,
  ZIP_PREFIX_CENTROIDS
};
