const fs = require('fs');

const zipDbPath = '/Users/leo/Desktop/HeatingOil/SmartHeatIOS/backend/src/data/zip-database.json';
const zipDb = JSON.parse(fs.readFileSync(zipDbPath));

// ZIP to city mapping for ZIPs missing city names
const zipCityMap = {
  // === NJ - BERGEN COUNTY ===
  '07401': 'Allendale', '07407': 'Elmwood Park', '07410': 'Fair Lawn',
  '07416': 'Franklin', '07417': 'Franklin Lakes', '07418': 'Glenwood',
  '07419': 'Hamburg', '07420': 'Haskell', '07421': 'Hewitt',
  '07422': 'Highland Lakes', '07423': 'Ho Ho Kus', '07424': 'Little Falls',
  '07430': 'Mahwah', '07432': 'Midland Park', '07435': 'Newfoundland',
  '07436': 'Oakland', '07438': 'Oak Ridge', '07439': 'Ogdensburg',
  '07440': 'Pompton Lakes', '07442': 'Pompton Plains', '07444': 'Pompton Plains',
  '07446': 'Ramsey', '07450': 'Ridgewood', '07451': 'Ridgewood',
  '07452': 'Glen Rock', '07456': 'Ringwood', '07457': 'Riverdale',
  '07458': 'Saddle River', '07460': 'Stockholm', '07461': 'Sussex',
  '07462': 'Vernon', '07463': 'Waldwick', '07465': 'Wanaque',
  '07470': 'Wayne', '07474': 'Wayne', '07480': 'West Milford',
  '07481': 'Wyckoff', '07495': 'Mahwah',
  '07601': 'Hackensack', '07602': 'Hackensack', '07603': 'Bogota',
  '07604': 'Hasbrouck Heights', '07605': 'Leonia', '07606': 'South Hackensack',
  '07607': 'Maywood', '07608': 'Teterboro', '07620': 'Alpine',
  '07621': 'Bergenfield', '07624': 'Closter', '07626': 'Cresskill',
  '07627': 'Demarest', '07628': 'Dumont', '07630': 'Emerson',
  '07631': 'Englewood', '07632': 'Englewood Cliffs', '07640': 'Harrington Park',
  '07641': 'Haworth', '07642': 'Hillsdale', '07643': 'Little Ferry',
  '07644': 'Lodi', '07645': 'Montvale', '07646': 'New Milford',
  '07647': 'Northvale', '07648': 'Norwood', '07649': 'Oradell',
  '07650': 'Palisades Park', '07652': 'Paramus', '07653': 'Paramus',
  '07656': 'Park Ridge', '07657': 'Ridgefield', '07660': 'Ridgefield Park',
  '07661': 'River Edge', '07662': 'Rochelle Park', '07663': 'Saddle Brook',
  '07666': 'Teaneck', '07670': 'Tenafly', '07675': 'Westwood',
  '07676': 'Township of Washington', '07677': 'Woodcliff Lake',

  // === NJ - ESSEX COUNTY ===
  '07003': 'Bloomfield', '07004': 'Fairfield', '07006': 'Caldwell',
  '07007': 'Caldwell', '07009': 'Cedar Grove', '07017': 'East Orange',
  '07018': 'East Orange', '07019': 'East Orange', '07021': 'Essex Fells',
  '07028': 'Glen Ridge', '07039': 'Livingston', '07040': 'Maplewood',
  '07041': 'Millburn', '07042': 'Montclair', '07043': 'Montclair',
  '07044': 'Verona', '07050': 'Orange', '07051': 'Orange',
  '07052': 'West Orange', '07068': 'Roseland', '07078': 'Short Hills',
  '07079': 'South Orange', '07101': 'Newark', '07102': 'Newark',
  '07103': 'Newark', '07104': 'Newark', '07105': 'Newark',
  '07106': 'Newark', '07107': 'Newark', '07108': 'Newark',
  '07109': 'Belleville', '07110': 'Nutley', '07111': 'Irvington',
  '07112': 'Newark', '07114': 'Newark',

  // === NJ - HUDSON COUNTY ===
  '07002': 'Bayonne', '07022': 'Fairview', '07029': 'Harrison',
  '07030': 'Hoboken', '07031': 'North Arlington', '07032': 'Kearny',
  '07047': 'North Bergen', '07057': 'Wallington', '07070': 'Rutherford',
  '07071': 'Lyndhurst', '07072': 'Carlstadt', '07073': 'East Rutherford',
  '07074': 'Moonachie', '07075': 'Wood Ridge', '07086': 'Weehawken',
  '07087': 'Union City', '07093': 'West New York', '07094': 'Secaucus',
  '07096': 'Secaucus', '07097': 'Jersey City', '07099': 'Kearny',
  '07302': 'Jersey City', '07303': 'Jersey City', '07304': 'Jersey City',
  '07305': 'Jersey City', '07306': 'Jersey City', '07307': 'Jersey City',
  '07308': 'Jersey City', '07309': 'Jersey City', '07310': 'Jersey City',
  '07311': 'Jersey City', '07395': 'Jersey City', '07399': 'Jersey City',

  // === NJ - PASSAIC COUNTY ===
  '07011': 'Clifton', '07012': 'Clifton', '07013': 'Clifton',
  '07014': 'Clifton', '07015': 'Clifton', '07055': 'Passaic',
  '07501': 'Paterson', '07502': 'Paterson', '07503': 'Paterson',
  '07504': 'Paterson', '07505': 'Paterson', '07506': 'Hawthorne',
  '07507': 'Hawthorne', '07508': 'Haledon', '07509': 'Paterson',
  '07510': 'Paterson', '07511': 'Totowa', '07512': 'Totowa',
  '07513': 'Paterson', '07514': 'Paterson', '07522': 'Paterson',
  '07524': 'Paterson', '07533': 'Paterson', '07538': 'Haledon',
  '07543': 'Paterson', '07544': 'Paterson',

  // === NJ - MIDDLESEX COUNTY ===
  '07001': 'Avenel', '07008': 'Carteret', '07064': 'Port Reading',
  '07067': 'Colonia', '07077': 'Sewaren', '07080': 'South Plainfield',
  '07095': 'Woodbridge', '08810': 'Dayton', '08812': 'Dunellen',
  '08816': 'East Brunswick', '08817': 'Edison', '08818': 'Edison',
  '08820': 'Edison', '08824': 'Kendall Park', '08828': 'Helmetta',
  '08830': 'Iselin', '08831': 'Monroe Township', '08832': 'Keasbey',
  '08837': 'Edison', '08840': 'Metuchen', '08846': 'Middlesex',
  '08850': 'Milltown', '08852': 'Monmouth Junction', '08854': 'Piscataway',
  '08855': 'Piscataway', '08857': 'Old Bridge', '08859': 'Parlin',
  '08861': 'Perth Amboy', '08862': 'Perth Amboy', '08863': 'Fords',
  '08871': 'Sayreville', '08872': 'Sayreville', '08873': 'Somerset',
  '08879': 'South Amboy', '08882': 'South River', '08884': 'Spotswood',
  '08899': 'Edison', '08901': 'New Brunswick', '08902': 'North Brunswick',
  '08903': 'New Brunswick', '08904': 'Highland Park', '08906': 'New Brunswick',

  // === NJ - MONMOUTH COUNTY ===
  '07701': 'Red Bank', '07702': 'Shrewsbury', '07703': 'Fort Monmouth',
  '07704': 'Fair Haven', '07709': 'Red Bank', '07710': 'Adelphia',
  '07711': 'Allenhurst', '07712': 'Asbury Park', '07715': 'Belmar',
  '07716': 'Atlantic Highlands', '07717': 'Avon By The Sea', '07718': 'Belford',
  '07719': 'Belmar', '07720': 'Bradley Beach', '07721': 'Cliffwood',
  '07722': 'Colts Neck', '07723': 'Deal', '07724': 'Eatontown',
  '07726': 'Englishtown', '07727': 'Farmingdale', '07728': 'Freehold',
  '07730': 'Hazlet', '07731': 'Howell', '07732': 'Highlands',
  '07733': 'Holmdel', '07734': 'Keansburg', '07735': 'Keyport',
  '07737': 'Leonardo', '07738': 'Lincroft', '07739': 'Little Silver',
  '07740': 'Long Branch', '07746': 'Marlboro', '07747': 'Matawan',
  '07748': 'Middletown', '07750': 'Monmouth Beach', '07751': 'Morganville',
  '07752': 'Navesink', '07753': 'Neptune', '07754': 'Neptune',
  '07755': 'Oakhurst', '07756': 'Ocean Grove', '07757': 'Oceanport',
  '07758': 'Port Monmouth', '07760': 'Rumson', '07762': 'Spring Lake',
  '07763': 'Manalapan', '07764': 'West Long Branch', '07765': 'Sea Girt',
  '07799': 'Eatontown',

  // === NJ - OCEAN COUNTY ===
  '08005': 'Barnegat', '08006': 'Barnegat Light', '08008': 'Beach Haven',
  '08050': 'Manahawkin', '08087': 'Tuckerton', '08092': 'West Creek',
  '08527': 'Jackson', '08701': 'Lakewood', '08721': 'Bayville',
  '08722': 'Beachwood', '08723': 'Brick', '08724': 'Brick',
  '08730': 'Brielle', '08731': 'Forked River', '08732': 'Island Heights',
  '08733': 'Lakehurst', '08734': 'Lanoka Harbor', '08735': 'Lavallette',
  '08736': 'Manasquan', '08738': 'Mantoloking', '08739': 'Normandy Beach',
  '08740': 'Ocean Gate', '08741': 'Pine Beach', '08742': 'Point Pleasant Beach',
  '08750': 'Sea Girt', '08751': 'Seaside Heights', '08752': 'Seaside Park',
  '08753': 'Toms River', '08754': 'Toms River', '08755': 'Toms River',
  '08756': 'Toms River', '08757': 'Toms River', '08758': 'Waretown',
  '08759': 'Manchester Township',

  // === NJ - UNION COUNTY ===
  '07016': 'Cranford', '07023': 'Fanwood', '07027': 'Garwood',
  '07033': 'Kenilworth', '07036': 'Linden', '07060': 'Plainfield',
  '07061': 'Plainfield', '07062': 'Plainfield', '07063': 'Plainfield',
  '07065': 'Rahway', '07066': 'Clark', '07076': 'Scotch Plains',
  '07081': 'Springfield', '07083': 'Union', '07088': 'Vauxhall',
  '07090': 'Westfield', '07091': 'Westfield', '07092': 'Mountainside',
  '07201': 'Elizabeth', '07202': 'Elizabeth', '07203': 'Roselle',
  '07204': 'Roselle Park', '07205': 'Hillside', '07206': 'Elizabeth',
  '07207': 'Elizabeth', '07208': 'Elizabeth',

  // === NJ - SOMERSET COUNTY ===
  '07059': 'Warren', '07069': 'Watchung', '08502': 'Belle Mead',
  '08504': 'Blawenburg', '08505': 'Bordentown', '08512': 'Cranbury',
  '08525': 'Hopewell', '08528': 'Kingston', '08540': 'Princeton',
  '08542': 'Princeton', '08550': 'Princeton Junction', '08553': 'Rocky Hill',
  '08558': 'Skillman', '08801': 'Annandale', '08802': 'Asbury',
  '08803': 'Baptistown', '08804': 'Bloomsbury', '08805': 'Bound Brook',
  '08807': 'Bridgewater', '08808': 'Broadway', '08809': 'Clinton',
  '08821': 'Flagtown', '08822': 'Flemington', '08823': 'Franklin Park',
  '08825': 'Frenchtown', '08826': 'Glen Gardner', '08827': 'Hampton',
  '08829': 'High Bridge', '08833': 'Lebanon', '08835': 'Manville',
  '08836': 'Martinsville', '08844': 'Hillsborough', '08853': 'Neshanic Station',
  '08869': 'Raritan', '08875': 'Somerset', '08876': 'Somerville',
  '08880': 'South Bound Brook', '08885': 'Stanton', '08886': 'Stewartsville',
  '08887': 'Three Bridges', '08889': 'Whitehouse Station', '08890': 'Zarephath',

  // === MA - ESSEX COUNTY ===
  '01810': 'Andover', '01812': 'Andover', '01830': 'Haverhill',
  '01831': 'Haverhill', '01832': 'Haverhill', '01833': 'Georgetown',
  '01834': 'Groveland', '01835': 'Haverhill', '01840': 'Lawrence',
  '01841': 'Lawrence', '01842': 'Lawrence', '01843': 'Lawrence',
  '01844': 'Methuen', '01845': 'North Andover', '01860': 'Merrimac',
  '01901': 'Lynn', '01902': 'Lynn', '01903': 'Lynn',
  '01904': 'Lynn', '01905': 'Lynn', '01906': 'Saugus',
  '01907': 'Swampscott', '01908': 'Nahant', '01910': 'Lynn',
  '01913': 'Amesbury', '01915': 'Beverly', '01921': 'Boxford',
  '01922': 'Byfield', '01923': 'Danvers', '01929': 'Essex',
  '01930': 'Gloucester', '01931': 'Gloucester', '01936': 'Hamilton',
  '01937': 'Hathorne', '01938': 'Ipswich', '01940': 'Lynnfield',
  '01944': 'Manchester', '01945': 'Marblehead', '01949': 'Middleton',
  '01950': 'Newburyport', '01951': 'Newbury', '01952': 'Salisbury',
  '01960': 'Peabody', '01961': 'Peabody', '01965': 'Prides Crossing',
  '01966': 'Rockport', '01969': 'Rowley', '01970': 'Salem',
  '01982': 'South Hamilton', '01983': 'Topsfield', '01984': 'Wenham',
  '01985': 'West Newbury',

  // === MA - HAMPDEN COUNTY ===
  '01001': 'Agawam', '01010': 'Brimfield', '01011': 'Chester',
  '01013': 'Chicopee', '01014': 'Chicopee', '01020': 'Chicopee',
  '01021': 'Chicopee', '01022': 'Chicopee', '01027': 'Easthampton',
  '01028': 'East Longmeadow', '01030': 'Feeding Hills', '01033': 'Granby',
  '01034': 'Granville', '01036': 'Hampden', '01040': 'Holyoke',
  '01041': 'Holyoke', '01050': 'Huntington', '01056': 'Ludlow',
  '01057': 'Monson', '01069': 'Palmer', '01071': 'Russell',
  '01079': 'Thorndike', '01080': 'Three Rivers', '01081': 'Wales',
  '01085': 'Westfield', '01086': 'Westfield', '01089': 'West Springfield',
  '01090': 'West Springfield', '01095': 'Wilbraham', '01101': 'Springfield',
  '01102': 'Springfield', '01103': 'Springfield', '01104': 'Springfield',
  '01105': 'Springfield', '01106': 'Longmeadow', '01107': 'Springfield',
  '01108': 'Springfield', '01109': 'Springfield', '01111': 'Springfield',
  '01115': 'Springfield', '01116': 'Longmeadow', '01118': 'Springfield',
  '01119': 'Springfield', '01128': 'Springfield', '01129': 'Springfield',
  '01138': 'Springfield', '01139': 'Springfield', '01144': 'Springfield',
  '01151': 'Indian Orchard', '01152': 'Springfield', '01199': 'Springfield',

  // === PA - BERKS COUNTY ===
  '19501': 'Adamstown', '19503': 'Bally', '19504': 'Barto',
  '19505': 'Bechtelsville', '19506': 'Bernville', '19507': 'Bethel',
  '19508': 'Birdsboro', '19510': 'Blandon', '19511': 'Bowers',
  '19512': 'Boyertown', '19516': 'Centerport', '19518': 'Douglassville',
  '19519': 'Earlville', '19520': 'Elverson', '19522': 'Fleetwood',
  '19523': 'Geigertown', '19525': 'Gilbertsville', '19526': 'Hamburg',
  '19529': 'Kempton', '19530': 'Kutztown', '19533': 'Leesport',
  '19534': 'Lenhartsville', '19535': 'Limekiln', '19536': 'Lyon Station',
  '19538': 'Maxatawny', '19539': 'Mertztown', '19540': 'Mohnton',
  '19541': 'Mohrsville', '19543': 'Morgantown', '19544': 'Mount Aetna',
  '19545': 'New Berlinville', '19547': 'Oley', '19549': 'Port Clinton',
  '19550': 'Rehrersburg', '19551': 'Robesonia', '19554': 'Shartlesville',
  '19555': 'Shoemakersville', '19559': 'Strausstown', '19560': 'Temple',
  '19562': 'Topton', '19564': 'Virginville', '19565': 'Wernersville',
  '19567': 'Womelsdorf', '19601': 'Reading', '19602': 'Reading',
  '19603': 'Reading', '19604': 'Reading', '19605': 'Reading',
  '19606': 'Reading', '19607': 'Reading', '19608': 'Reading',
  '19609': 'Reading', '19610': 'Reading', '19611': 'Reading',
  '19612': 'Reading',

  // === RI - BRISTOL COUNTY ===
  '02806': 'Barrington', '02809': 'Bristol', '02814': 'Chepachet',
  '02815': 'Clayville', '02816': 'Coventry', '02825': 'Foster',
  '02827': 'Greene', '02828': 'Greenville', '02885': 'Warren'
};

let updated = 0;
let missing = [];

for (const [zip, info] of Object.entries(zipDb)) {
  if (!info.city && zipCityMap[zip]) {
    zipDb[zip].city = zipCityMap[zip];
    updated++;
  } else if (!info.city) {
    missing.push(zip);
  }
}

fs.writeFileSync(zipDbPath, JSON.stringify(zipDb, null, 2));

console.log('Updated ' + updated + ' ZIPs with city names');
console.log('Still missing: ' + missing.length + ' ZIPs');
if (missing.length > 0) {
  console.log('Missing ZIPs:', missing.slice(0, 20).join(', ') + (missing.length > 20 ? '...' : ''));
}

// Verify
const verify = JSON.parse(fs.readFileSync(zipDbPath));
const withCity = Object.values(verify).filter(z => z.city).length;
console.log('\\nVerification: ' + withCity + ' / ' + Object.keys(verify).length + ' ZIPs have city names');
