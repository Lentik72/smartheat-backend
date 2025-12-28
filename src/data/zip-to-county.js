/**
 * ZIP Code to County Mapping
 * V1.0.0: Enables county-based supplier matching
 *
 * Maps ZIP codes to county names for supported service areas.
 * Used by suppliers.js to match suppliers by serviceCounties field.
 */

const ZIP_TO_COUNTY = {
  // ============================================
  // NEW YORK - WESTCHESTER COUNTY
  // ============================================
  "10501": "Westchester", // Amawalk
  "10502": "Westchester", // Ardsley
  "10503": "Westchester", // Ardsley-on-Hudson
  "10504": "Westchester", // Armonk
  "10505": "Westchester", // Baldwin Place
  "10506": "Westchester", // Bedford
  "10507": "Westchester", // Bedford Hills
  "10509": "Westchester", // Brewster (partial)
  "10510": "Westchester", // Briarcliff Manor
  "10511": "Westchester", // Buchanan
  "10514": "Westchester", // Chappaqua
  "10517": "Westchester", // Crompond
  "10518": "Westchester", // Cross River
  "10519": "Westchester", // Croton Falls
  "10520": "Westchester", // Croton-on-Hudson
  "10522": "Westchester", // Dobbs Ferry
  "10523": "Westchester", // Elmsford
  "10526": "Westchester", // Goldens Bridge
  "10527": "Westchester", // Granite Springs
  "10528": "Westchester", // Harrison
  "10530": "Westchester", // Hartsdale
  "10532": "Westchester", // Hawthorne
  "10533": "Westchester", // Irvington
  "10535": "Westchester", // Jefferson Valley
  "10536": "Westchester", // Katonah
  "10538": "Westchester", // Larchmont
  "10541": "Westchester", // Mahopac (partial)
  "10543": "Westchester", // Mamaroneck
  "10545": "Westchester", // Maryknoll
  "10546": "Westchester", // Millwood
  "10547": "Westchester", // Mohegan Lake
  "10548": "Westchester", // Montrose
  "10549": "Westchester", // Mount Kisco
  "10550": "Westchester", // Mount Vernon
  "10551": "Westchester", // Mount Vernon
  "10552": "Westchester", // Mount Vernon
  "10553": "Westchester", // Mount Vernon
  "10560": "Westchester", // North Salem
  "10562": "Westchester", // Ossining
  "10566": "Westchester", // Peekskill
  "10567": "Westchester", // Cortlandt Manor
  "10570": "Westchester", // Pleasantville
  "10573": "Westchester", // Port Chester
  "10576": "Westchester", // Pound Ridge
  "10577": "Westchester", // Purchase
  "10578": "Westchester", // Purdys
  "10580": "Westchester", // Rye
  "10583": "Westchester", // Scarsdale
  "10587": "Westchester", // Shenorock
  "10588": "Westchester", // Shrub Oak
  "10589": "Westchester", // Somers
  "10590": "Westchester", // South Salem
  "10591": "Westchester", // Tarrytown
  "10594": "Westchester", // Thornwood
  "10595": "Westchester", // Valhalla
  "10597": "Westchester", // Waccabuc
  "10598": "Westchester", // Yorktown Heights
  "10601": "Westchester", // White Plains
  "10602": "Westchester", // White Plains
  "10603": "Westchester", // White Plains
  "10604": "Westchester", // West Harrison
  "10605": "Westchester", // White Plains
  "10606": "Westchester", // White Plains
  "10607": "Westchester", // White Plains
  "10608": "Westchester", // White Plains
  "10701": "Westchester", // Yonkers
  "10702": "Westchester", // Yonkers
  "10703": "Westchester", // Yonkers
  "10704": "Westchester", // Yonkers
  "10705": "Westchester", // Yonkers
  "10706": "Westchester", // Hastings-on-Hudson
  "10707": "Westchester", // Tuckahoe
  "10708": "Westchester", // Bronxville
  "10709": "Westchester", // Eastchester
  "10710": "Westchester", // Yonkers

  // ============================================
  // NEW YORK - PUTNAM COUNTY
  // ============================================
  "10512": "Putnam", // Carmel
  "10516": "Putnam", // Cold Spring
  "10524": "Putnam", // Garrison
  "10537": "Putnam", // Lake Peekskill
  "10541": "Putnam", // Mahopac
  "10579": "Putnam", // Putnam Valley
  "10509": "Putnam", // Brewster
  "10542": "Putnam", // Mahopac Falls

  // ============================================
  // NEW YORK - DUTCHESS COUNTY
  // ============================================
  "12501": "Dutchess", // Amenia
  "12504": "Dutchess", // Annandale-on-Hudson
  "12507": "Dutchess", // Bangall
  "12508": "Dutchess", // Beacon
  "12514": "Dutchess", // Clinton Corners
  "12522": "Dutchess", // Dover Plains
  "12524": "Dutchess", // Fishkill
  "12531": "Dutchess", // Holmes
  "12533": "Dutchess", // Hopewell Junction
  "12537": "Dutchess", // Hughsonville
  "12538": "Dutchess", // Hyde Park
  "12540": "Dutchess", // Lagrangeville
  "12545": "Dutchess", // Millbrook
  "12546": "Dutchess", // Millerton
  "12564": "Dutchess", // Pawling
  "12567": "Dutchess", // Pine Plains
  "12569": "Dutchess", // Pleasant Valley
  "12570": "Dutchess", // Poughquag
  "12571": "Dutchess", // Red Hook
  "12572": "Dutchess", // Rhinebeck
  "12574": "Dutchess", // Rhinecliff
  "12578": "Dutchess", // Salt Point
  "12580": "Dutchess", // Staatsburg
  "12581": "Dutchess", // Stanfordville
  "12582": "Dutchess", // Stormville
  "12585": "Dutchess", // Verbank
  "12590": "Dutchess", // Wappingers Falls
  "12592": "Dutchess", // Wassaic
  "12594": "Dutchess", // Wingdale
  "12601": "Dutchess", // Poughkeepsie
  "12602": "Dutchess", // Poughkeepsie
  "12603": "Dutchess", // Poughkeepsie
  "12604": "Dutchess", // Poughkeepsie

  // ============================================
  // NEW YORK - ROCKLAND COUNTY
  // ============================================
  "10901": "Rockland", // Suffern
  "10911": "Rockland", // Bear Mountain
  "10913": "Rockland", // Blauvelt
  "10920": "Rockland", // Congers
  "10923": "Rockland", // Garnerville
  "10927": "Rockland", // Haverstraw
  "10931": "Rockland", // Hillburn
  "10952": "Rockland", // Monsey
  "10954": "Rockland", // Nanuet
  "10956": "Rockland", // New City
  "10960": "Rockland", // Nyack
  "10962": "Rockland", // Orangeburg
  "10964": "Rockland", // Palisades
  "10965": "Rockland", // Pearl River
  "10968": "Rockland", // Piermont
  "10970": "Rockland", // Pomona
  "10974": "Rockland", // Sloatsburg
  "10976": "Rockland", // Sparkill
  "10977": "Rockland", // Spring Valley
  "10980": "Rockland", // Stony Point
  "10982": "Rockland", // Tallman
  "10983": "Rockland", // Tappan
  "10984": "Rockland", // Thiells
  "10986": "Rockland", // Tomkins Cove
  "10989": "Rockland", // Valley Cottage
  "10993": "Rockland", // West Haverstraw
  "10994": "Rockland", // West Nyack

  // ============================================
  // NEW YORK - ORANGE COUNTY
  // ============================================
  "10910": "Orange", // Arden
  "10912": "Orange", // Bellvale
  "10914": "Orange", // Blooming Grove
  "10915": "Orange", // Bullville
  "10916": "Orange", // Campbell Hall
  "10917": "Orange", // Central Valley
  "10918": "Orange", // Chester
  "10919": "Orange", // Circleville
  "10921": "Orange", // Florida
  "10922": "Orange", // Fort Montgomery
  "10924": "Orange", // Goshen
  "10925": "Orange", // Greenwood Lake
  "10926": "Orange", // Harriman
  "10928": "Orange", // Highland Falls
  "10930": "Orange", // Highland Mills
  "10932": "Orange", // Howells
  "10933": "Orange", // Johnson
  "10940": "Orange", // Middletown
  "10941": "Orange", // Middletown
  "10950": "Orange", // Monroe
  "10958": "Orange", // New Hampton
  "10959": "Orange", // New Milford
  "10963": "Orange", // Otisville
  "10969": "Orange", // Pine Island
  "10973": "Orange", // Slate Hill
  "10975": "Orange", // Southfields
  "10979": "Orange", // Sterling Forest
  "10981": "Orange", // Sugar Loaf
  "10985": "Orange", // Thompson Ridge
  "10987": "Orange", // Tuxedo Park
  "10988": "Orange", // Unionville
  "10990": "Orange", // Warwick
  "10992": "Orange", // Washingtonville
  "10996": "Orange", // West Point
  "10997": "Orange", // West Point
  "10998": "Orange", // Westtown
  "12543": "Orange", // Maybrook
  "12549": "Orange", // Montgomery
  "12550": "Orange", // Newburgh
  "12553": "Orange", // New Windsor
  "12566": "Orange", // Pine Bush
  "12575": "Orange", // Rock Tavern
  "12577": "Orange", // Salisbury Mills
  "12586": "Orange", // Walden
  "12589": "Orange", // Wallkill

  // ============================================
  // MASSACHUSETTS - FRANKLIN COUNTY
  // ============================================
  "01301": "Franklin", // Greenfield
  "01302": "Franklin", // Greenfield
  "01330": "Franklin", // Ashfield
  "01331": "Franklin", // Athol
  "01337": "Franklin", // Bernardston
  "01338": "Franklin", // Buckland
  "01339": "Franklin", // Charlemont
  "01340": "Franklin", // Colrain
  "01341": "Franklin", // Conway
  "01342": "Franklin", // Deerfield
  "01343": "Franklin", // Drury
  "01344": "Franklin", // Erving
  "01346": "Franklin", // Heath
  "01347": "Franklin", // Lake Pleasant
  "01349": "Franklin", // Millers Falls
  "01350": "Franklin", // Monroe Bridge
  "01351": "Franklin", // Montague
  "01354": "Franklin", // Gill
  "01355": "Franklin", // New Salem
  "01360": "Franklin", // Northfield
  "01364": "Franklin", // Orange
  "01366": "Franklin", // Petersham
  "01367": "Franklin", // Rowe
  "01368": "Franklin", // Royalston
  "01370": "Franklin", // Shelburne Falls
  "01373": "Franklin", // South Deerfield
  "01375": "Franklin", // Sunderland
  "01376": "Franklin", // Turners Falls
  "01378": "Franklin", // Warwick
  "01379": "Franklin", // Wendell
  "01380": "Franklin", // Wendell Depot

  // ============================================
  // MASSACHUSETTS - HAMPSHIRE COUNTY
  // ============================================
  "01002": "Hampshire", // Amherst
  "01003": "Hampshire", // Amherst
  "01004": "Hampshire", // Amherst
  "01007": "Hampshire", // Belchertown
  "01011": "Hampshire", // Chester
  "01012": "Hampshire", // Chesterfield
  "01026": "Hampshire", // Cummington
  "01027": "Hampshire", // Easthampton
  "01032": "Hampshire", // Goshen
  "01033": "Hampshire", // Granby
  "01035": "Hampshire", // Hadley
  "01036": "Hampshire", // Hampden
  "01038": "Hampshire", // Hatfield
  "01039": "Hampshire", // Haydenville
  "01050": "Hampshire", // Huntington
  "01053": "Hampshire", // Leeds
  "01054": "Hampshire", // Leverett
  "01060": "Hampshire", // Northampton
  "01061": "Hampshire", // Northampton
  "01062": "Hampshire", // Florence
  "01063": "Hampshire", // Northampton
  "01066": "Hampshire", // Pelham
  "01070": "Hampshire", // Plainfield
  "01073": "Hampshire", // Southampton
  "01075": "Hampshire", // South Hadley
  "01080": "Hampshire", // Three Rivers
  "01082": "Hampshire", // Ware
  "01085": "Hampshire", // Westfield
  "01088": "Hampshire", // West Hatfield
  "01093": "Hampshire", // Whately
  "01094": "Hampshire", // Wheelwright
  "01095": "Hampshire", // Wilbraham
  "01096": "Hampshire", // Williamsburg
  "01097": "Hampshire", // Worthington

  // ============================================
  // MASSACHUSETTS - BERKSHIRE COUNTY
  // ============================================
  "01201": "Berkshire", // Pittsfield
  "01202": "Berkshire", // Pittsfield
  "01203": "Berkshire", // Pittsfield
  "01220": "Berkshire", // Adams
  "01222": "Berkshire", // Ashley Falls
  "01223": "Berkshire", // Becket
  "01224": "Berkshire", // Berkshire
  "01225": "Berkshire", // Cheshire
  "01226": "Berkshire", // Dalton
  "01229": "Berkshire", // Glendale
  "01230": "Berkshire", // Great Barrington
  "01235": "Berkshire", // Hinsdale
  "01236": "Berkshire", // Housatonic
  "01237": "Berkshire", // Lanesborough
  "01238": "Berkshire", // Lee
  "01240": "Berkshire", // Lenox
  "01242": "Berkshire", // Lenox Dale
  "01243": "Berkshire", // Middlefield
  "01244": "Berkshire", // Mill River
  "01245": "Berkshire", // Monterey
  "01247": "Berkshire", // North Adams
  "01252": "Berkshire", // North Egremont
  "01253": "Berkshire", // Otis
  "01254": "Berkshire", // Richmond
  "01255": "Berkshire", // Sandisfield
  "01256": "Berkshire", // Savoy
  "01257": "Berkshire", // Sheffield
  "01258": "Berkshire", // South Egremont
  "01259": "Berkshire", // Southfield
  "01260": "Berkshire", // South Lee
  "01262": "Berkshire", // Stockbridge
  "01263": "Berkshire", // Stockbridge
  "01264": "Berkshire", // Tyringham
  "01266": "Berkshire", // West Stockbridge
  "01267": "Berkshire", // Williamstown
  "01270": "Berkshire", // Windsor

  // ============================================
  // MASSACHUSETTS - MIDDLESEX COUNTY (for Chelmsford)
  // ============================================
  "01824": "Middlesex", // Chelmsford
  "01826": "Middlesex", // Dracut
  "01850": "Middlesex", // Lowell
  "01851": "Middlesex", // Lowell
  "01852": "Middlesex", // Lowell
  "01853": "Middlesex", // Lowell
  "01854": "Middlesex", // Lowell
  "01862": "Middlesex", // North Billerica
  "01863": "Middlesex", // North Chelmsford
  "01876": "Middlesex", // Tewksbury
  "01821": "Middlesex", // Billerica
  "01730": "Middlesex", // Bedford
  "01742": "Middlesex", // Concord
  "01720": "Middlesex", // Acton
  "01741": "Middlesex", // Carlisle
  "01775": "Middlesex", // Stow
  "01719": "Middlesex", // Boxborough
  "01754": "Middlesex", // Maynard
  "01778": "Middlesex", // Wayland
  "01776": "Middlesex", // Sudbury
  "01773": "Middlesex", // Lincoln
  "01460": "Middlesex", // Littleton
  "01464": "Middlesex", // Shirley
  "01450": "Middlesex", // Groton
  "01469": "Middlesex", // Townsend
  "01431": "Middlesex", // Ashby
  "01432": "Middlesex", // Ayer
  "01453": "Middlesex", // Leominster (partial)
  "01463": "Middlesex", // Pepperell
  "01471": "Middlesex", // Westford

  // ============================================
  // NEW JERSEY - MORRIS COUNTY
  // ============================================
  "07801": "Morris", // Dover
  "07803": "Morris", // Mine Hill
  "07821": "Morris", // Andover
  "07828": "Morris", // Budd Lake
  "07834": "Morris", // Denville
  "07836": "Morris", // Flanders
  "07840": "Morris", // Hackettstown (partial)
  "07842": "Morris", // Hibernia
  "07845": "Morris", // Ironia
  "07847": "Morris", // Kenvil
  "07849": "Morris", // Lake Hopatcong
  "07850": "Morris", // Landing
  "07852": "Morris", // Ledgewood
  "07853": "Morris", // Long Valley
  "07856": "Morris", // Mount Arlington
  "07857": "Morris", // Netcong
  "07866": "Morris", // Rockaway
  "07869": "Morris", // Randolph
  "07870": "Morris", // Schooleys Mountain
  "07876": "Morris", // Succasunna
  "07878": "Morris", // Mount Tabor
  "07885": "Morris", // Wharton
  "07927": "Morris", // Cedar Knolls
  "07928": "Morris", // Chatham
  "07930": "Morris", // Chester
  "07931": "Morris", // Far Hills (partial)
  "07932": "Morris", // Florham Park
  "07933": "Morris", // Gillette
  "07935": "Morris", // Green Village
  "07936": "Morris", // East Hanover
  "07940": "Morris", // Madison
  "07945": "Morris", // Mendham
  "07946": "Morris", // Millington
  "07950": "Morris", // Morris Plains
  "07960": "Morris", // Morristown
  "07961": "Morris", // Morristown
  "07962": "Morris", // Morristown
  "07963": "Morris", // Morristown
  "07970": "Morris", // Mount Freedom
  "07976": "Morris", // New Vernon
  "07980": "Morris", // Stirling
  "07981": "Morris", // Whippany
  "07983": "Morris", // Brookside
  "07834": "Morris", // Denville
  // Mount Olive Township ZIPs
  "07828": "Morris", // Budd Lake (Mount Olive)
  "07836": "Morris", // Flanders (Mount Olive)

  // ============================================
  // NEW JERSEY - MERCER COUNTY
  // ============================================
  "08512": "Mercer", // Cranbury
  "08520": "Mercer", // Hightstown
  "08525": "Mercer", // Hopewell
  "08530": "Mercer", // Lambertville (partial)
  "08534": "Mercer", // Pennington
  "08536": "Mercer", // Plainsboro
  "08540": "Mercer", // Princeton
  "08541": "Mercer", // Princeton
  "08542": "Mercer", // Princeton
  "08543": "Mercer", // Princeton
  "08544": "Mercer", // Princeton
  "08550": "Mercer", // Princeton Junction
  "08560": "Mercer", // Titusville
  "08601": "Mercer", // Trenton
  "08602": "Mercer", // Trenton
  "08603": "Mercer", // Trenton
  "08604": "Mercer", // Trenton
  "08605": "Mercer", // Trenton
  "08606": "Mercer", // Trenton
  "08607": "Mercer", // Trenton
  "08608": "Mercer", // Trenton
  "08609": "Mercer", // Trenton
  "08610": "Mercer", // Hamilton
  "08611": "Mercer", // Trenton
  "08618": "Mercer", // Trenton
  "08619": "Mercer", // Hamilton
  "08620": "Mercer", // Hamilton
  "08625": "Mercer", // Trenton
  "08628": "Mercer", // Trenton
  "08629": "Mercer", // Trenton
  "08638": "Mercer", // Trenton
  "08640": "Mercer", // Fort Dix (partial)
  "08641": "Mercer", // Trenton
  "08645": "Mercer", // Trenton
  "08646": "Mercer", // Trenton
  "08647": "Mercer", // Trenton
  "08648": "Mercer", // Lawrence Township
  "08650": "Mercer", // Trenton
  "08666": "Mercer", // Trenton
  "08690": "Mercer", // Hamilton
  "08691": "Mercer", // Robbinsville
  "08695": "Mercer", // Trenton

  // ============================================
  // NEW JERSEY - SUSSEX COUNTY
  // ============================================
  "07418": "Sussex", // Hamburg
  "07419": "Sussex", // Hamburg
  "07422": "Sussex", // Highland Lakes
  "07428": "Sussex", // McAfee
  "07435": "Sussex", // Newfoundland (partial)
  "07439": "Sussex", // Ogdensburg
  "07460": "Sussex", // Stockholm
  "07461": "Sussex", // Sussex
  "07462": "Sussex", // Vernon
  "07821": "Sussex", // Andover
  "07822": "Sussex", // Augusta
  "07826": "Sussex", // Branchville
  "07827": "Sussex", // Montague
  "07838": "Sussex", // Great Meadows
  "07839": "Sussex", // Greendell
  "07843": "Sussex", // Hopatcong
  "07846": "Sussex", // Johnsonburg
  "07848": "Sussex", // Lafayette
  "07851": "Sussex", // Layton
  "07855": "Sussex", // Middleville
  "07860": "Sussex", // Newton
  "07871": "Sussex", // Sparta
  "07874": "Sussex", // Stanhope
  "07875": "Sussex", // Stillwater
  "07877": "Sussex", // Swartswood
  "07879": "Sussex", // Tranquility
  "07881": "Sussex", // Wallpack Center
  "07890": "Sussex", // Wantage
};

/**
 * Get county name for a ZIP code
 * @param {string} zip - 5-digit ZIP code
 * @returns {string|null} - County name or null if not found
 */
function getCountyForZip(zip) {
  if (!zip || typeof zip !== 'string') return null;
  const normalizedZip = zip.trim().substring(0, 5);
  return ZIP_TO_COUNTY[normalizedZip] || null;
}

/**
 * Get all ZIP codes for a county
 * @param {string} county - County name (case-insensitive)
 * @returns {string[]} - Array of ZIP codes
 */
function getZipsForCounty(county) {
  if (!county) return [];
  const normalizedCounty = county.trim();
  return Object.entries(ZIP_TO_COUNTY)
    .filter(([_, c]) => c.toLowerCase() === normalizedCounty.toLowerCase())
    .map(([zip, _]) => zip);
}

/**
 * Check if a ZIP code is in our supported service area
 * @param {string} zip - 5-digit ZIP code
 * @returns {boolean}
 */
function isZipSupported(zip) {
  return getCountyForZip(zip) !== null;
}

/**
 * Get state for a county
 * @param {string} county - County name
 * @returns {string|null} - State abbreviation
 */
function getStateForCounty(county) {
  const countyToState = {
    "Westchester": "NY",
    "Putnam": "NY",
    "Dutchess": "NY",
    "Rockland": "NY",
    "Orange": "NY",
    "Franklin": "MA",
    "Hampshire": "MA",
    "Berkshire": "MA",
    "Middlesex": "MA",
    "Morris": "NJ",
    "Mercer": "NJ",
    "Sussex": "NJ",
    "Passaic": "NJ",
    "Bergen": "NJ"
  };
  return countyToState[county] || null;
}

module.exports = {
  ZIP_TO_COUNTY,
  getCountyForZip,
  getZipsForCounty,
  isZipSupported,
  getStateForCounty
};
