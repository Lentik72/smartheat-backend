const fs = require('fs');

const zipDbPath = './src/data/zip-database.json';
const zipDb = JSON.parse(fs.readFileSync(zipDbPath));

// Ulster County, NY ZIPs (Kingston area, Hudson Valley)
const ulsterZips = {
  '12401': { city: 'Kingston', county: 'Ulster', state: 'NY' },
  '12402': { city: 'Kingston', county: 'Ulster', state: 'NY' },
  '12404': { city: 'Accord', county: 'Ulster', state: 'NY' },
  '12405': { city: 'Acra', county: 'Ulster', state: 'NY' },
  '12409': { city: 'Bearsville', county: 'Ulster', state: 'NY' },
  '12410': { city: 'Big Indian', county: 'Ulster', state: 'NY' },
  '12411': { city: 'Bloomington', county: 'Ulster', state: 'NY' },
  '12412': { city: 'Boiceville', county: 'Ulster', state: 'NY' },
  '12416': { city: 'Chichester', county: 'Ulster', state: 'NY' },
  '12417': { city: 'Connelly', county: 'Ulster', state: 'NY' },
  '12419': { city: 'Cottekill', county: 'Ulster', state: 'NY' },
  '12420': { city: 'Cragsmoor', county: 'Ulster', state: 'NY' },
  '12428': { city: 'Ellenville', county: 'Ulster', state: 'NY' },
  '12429': { city: 'Esopus', county: 'Ulster', state: 'NY' },
  '12433': { city: 'Glenford', county: 'Ulster', state: 'NY' },
  '12440': { city: 'High Falls', county: 'Ulster', state: 'NY' },
  '12443': { city: 'Hurley', county: 'Ulster', state: 'NY' },
  '12446': { city: 'Kerhonkson', county: 'Ulster', state: 'NY' },
  '12448': { city: 'Lake Hill', county: 'Ulster', state: 'NY' },
  '12449': { city: 'Lake Katrine', county: 'Ulster', state: 'NY' },
  '12457': { city: 'Mount Tremper', county: 'Ulster', state: 'NY' },
  '12458': { city: 'Napanoch', county: 'Ulster', state: 'NY' },
  '12461': { city: 'New Paltz', county: 'Ulster', state: 'NY' },
  '12464': { city: 'Phoenicia', county: 'Ulster', state: 'NY' },
  '12466': { city: 'Port Ewen', county: 'Ulster', state: 'NY' },
  '12471': { city: 'Rifton', county: 'Ulster', state: 'NY' },
  '12472': { city: 'Rosendale', county: 'Ulster', state: 'NY' },
  '12477': { city: 'Saugerties', county: 'Ulster', state: 'NY' },
  '12480': { city: 'Shandaken', county: 'Ulster', state: 'NY' },
  '12481': { city: 'Shokan', county: 'Ulster', state: 'NY' },
  '12484': { city: 'Stone Ridge', county: 'Ulster', state: 'NY' },
  '12486': { city: 'Tillson', county: 'Ulster', state: 'NY' },
  '12487': { city: 'Ulster Park', county: 'Ulster', state: 'NY' },
  '12489': { city: 'Wawarsing', county: 'Ulster', state: 'NY' },
  '12491': { city: 'West Hurley', county: 'Ulster', state: 'NY' },
  '12493': { city: 'West Park', county: 'Ulster', state: 'NY' },
  '12494': { city: 'West Shokan', county: 'Ulster', state: 'NY' },
  '12495': { city: 'Willow', county: 'Ulster', state: 'NY' },
  '12498': { city: 'Woodstock', county: 'Ulster', state: 'NY' },
  '12515': { city: 'Clintondale', county: 'Ulster', state: 'NY' },
  '12528': { city: 'Highland', county: 'Ulster', state: 'NY' },
  '12538': { city: 'Hyde Park', county: 'Ulster', state: 'NY' },
  '12561': { city: 'New Paltz', county: 'Ulster', state: 'NY' },
  '12566': { city: 'Pine Bush', county: 'Ulster', state: 'NY' },
  '12568': { city: 'Plattekill', county: 'Ulster', state: 'NY' },
  '12589': { city: 'Wallkill', county: 'Ulster', state: 'NY' },
};

// Rensselaer County, NY ZIPs (Troy area)
const rensselaerZips = {
  '12180': { city: 'Troy', county: 'Rensselaer', state: 'NY' },
  '12181': { city: 'Troy', county: 'Rensselaer', state: 'NY' },
  '12182': { city: 'Troy', county: 'Rensselaer', state: 'NY' },
  '12183': { city: 'Troy', county: 'Rensselaer', state: 'NY' },
  '12144': { city: 'Rensselaer', county: 'Rensselaer', state: 'NY' },
  '12061': { city: 'East Greenbush', county: 'Rensselaer', state: 'NY' },
  '12121': { city: 'Melrose', county: 'Rensselaer', state: 'NY' },
  '12033': { city: 'Castleton On Hudson', county: 'Rensselaer', state: 'NY' },
  '12153': { city: 'Sand Lake', county: 'Rensselaer', state: 'NY' },
  '12196': { city: 'West Sand Lake', county: 'Rensselaer', state: 'NY' },
  '12056': { city: 'Defreestville', county: 'Rensselaer', state: 'NY' },
  '12017': { city: 'Austerlitz', county: 'Rensselaer', state: 'NY' },
  '12023': { city: 'Berlin', county: 'Rensselaer', state: 'NY' },
  '12027': { city: 'Buskirk', county: 'Rensselaer', state: 'NY' },
  '12029': { city: 'Canaan', county: 'Rensselaer', state: 'NY' },
  '12040': { city: 'Cherry Plain', county: 'Rensselaer', state: 'NY' },
  '12052': { city: 'Cropseyville', county: 'Rensselaer', state: 'NY' },
  '12057': { city: 'Eagle Bridge', county: 'Rensselaer', state: 'NY' },
  '12083': { city: 'Grafton', county: 'Rensselaer', state: 'NY' },
  '12090': { city: 'Hoosick', county: 'Rensselaer', state: 'NY' },
  '12092': { city: 'Hoosick Falls', county: 'Rensselaer', state: 'NY' },
  '12123': { city: 'Nassau', county: 'Rensselaer', state: 'NY' },
  '12128': { city: 'North Greenbush', county: 'Rensselaer', state: 'NY' },
  '12138': { city: 'Petersburg', county: 'Rensselaer', state: 'NY' },
  '12140': { city: 'Poestenkill', county: 'Rensselaer', state: 'NY' },
  '12154': { city: 'Schaghticoke', county: 'Rensselaer', state: 'NY' },
  '12158': { city: 'Schodack Landing', county: 'Rensselaer', state: 'NY' },
  '12168': { city: 'Stephentown', county: 'Rensselaer', state: 'NY' },
  '12185': { city: 'Valley Falls', county: 'Rensselaer', state: 'NY' },
  '12198': { city: 'Wynantskill', county: 'Rensselaer', state: 'NY' },
};

let added = 0;

// Add Ulster ZIPs
for (const [zip, info] of Object.entries(ulsterZips)) {
  if (!zipDb[zip]) {
    zipDb[zip] = info;
    added++;
  }
}

// Add Rensselaer ZIPs
for (const [zip, info] of Object.entries(rensselaerZips)) {
  if (!zipDb[zip]) {
    zipDb[zip] = info;
    added++;
  }
}

fs.writeFileSync(zipDbPath, JSON.stringify(zipDb, null, 2));

// Verify
const verify = JSON.parse(fs.readFileSync(zipDbPath));
const ulsterCount = Object.entries(verify).filter(([z, i]) => i.county === 'Ulster' && i.state === 'NY').length;
const rensselaerCount = Object.entries(verify).filter(([z, i]) => i.county === 'Rensselaer' && i.state === 'NY').length;

console.log('Added', added, 'new ZIPs');
console.log('Ulster County, NY:', ulsterCount, 'ZIPs');
console.log('Rensselaer County, NY:', rensselaerCount, 'ZIPs');
console.log('Total ZIPs in database:', Object.keys(verify).length);
