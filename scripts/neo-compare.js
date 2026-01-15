const https = require('https');
const { Sequelize } = require('sequelize');

// Our database suppliers
let ourSuppliers = {};

const zones = {
  'MA': [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
  'CT': [1,2,3,4,5,6],
  'RI': [1,2],
  'NH': [1,2,3,4,5,6]
};

const stateUrls = {
  'MA': 'massachusetts',
  'CT': 'connecticut',
  'RI': 'rhodeisland',
  'NH': 'newhampshire'
};

async function fetchZone(state, zone) {
  const stateUrl = stateUrls[state];
  const url = 'https://www.newenglandoil.com/' + stateUrl + '/zone' + zone + '.asp?x=0';

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const html = data.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        const suppliers = [];

        const companyRegex = /data-label='Company'[^>]*>(?:<a[^>]*>)?([^<]+)/g;
        const townRegex = /data-label='Town'[^>]*>([^<]+)/g;
        const priceRegex = /data-label='Price'[^>]*>\$([0-9.]+)/g;

        const companies = [];
        const towns = [];
        const prices = [];

        let match;
        while ((match = companyRegex.exec(html)) !== null) {
          companies.push(match[1].trim());
        }
        while ((match = townRegex.exec(html)) !== null) {
          towns.push(match[1].trim());
        }
        while ((match = priceRegex.exec(html)) !== null) {
          prices.push(match[1]);
        }

        for (let i = 0; i < Math.min(companies.length, towns.length, prices.length); i++) {
          suppliers.push({
            name: companies[i],
            town: towns[i],
            price: prices[i]
          });
        }

        resolve(suppliers);
      });
    }).on('error', () => resolve([]));
  });
}

function normalizeForMatch(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/inc$/, '')
    .replace(/llc$/, '')
    .replace(/co$/, '')
    .replace(/oil$/, '')
    .replace(/fuel$/, '')
    .replace(/energy$/, '');
}

function findMatch(neoName, ourList) {
  const normalized = normalizeForMatch(neoName);
  for (const our of ourList) {
    if (normalizeForMatch(our).includes(normalized) || normalized.includes(normalizeForMatch(our))) {
      return our;
    }
  }
  // Check specific words
  const words = neoName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const our of ourList) {
    const ourWords = our.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const common = words.filter(w => ourWords.includes(w));
    if (common.length >= 1 && (common[0] !== 'oil' && common[0] !== 'fuel' && common[0] !== 'energy')) {
      return our;
    }
  }
  return null;
}

async function main() {
  // Get our suppliers from database
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
  });

  const [suppliers] = await sequelize.query(
    "SELECT name, city, state FROM suppliers WHERE active = true"
  );

  // Group by state
  for (const s of suppliers) {
    if (!ourSuppliers[s.state]) ourSuppliers[s.state] = [];
    ourSuppliers[s.state].push(s.name);
  }

  await sequelize.close();

  // Fetch all NEO zones
  const allNeoSuppliers = {};
  for (const [state, zoneList] of Object.entries(zones)) {
    allNeoSuppliers[state] = [];
    console.error('Fetching ' + state + '...');
    for (const zone of zoneList) {
      const suppliers = await fetchZone(state, zone);
      suppliers.forEach(s => {
        if (!allNeoSuppliers[state].find(x => x.name === s.name)) {
          allNeoSuppliers[state].push(s);
        }
      });
    }
  }

  // Compare and report
  console.log('\n============================================================');
  console.log('NEWENGLANDOIL.COM vs OUR DATABASE - COMPARISON REPORT');
  console.log('============================================================\n');

  let totalMissing = 0;
  let topMissing = [];

  for (const [state, neoList] of Object.entries(allNeoSuppliers)) {
    const ourList = ourSuppliers[state] || [];

    // Categorize
    const matched = [];
    const missing = [];

    neoList.sort((a,b) => parseFloat(a.price) - parseFloat(b.price));

    for (const neo of neoList) {
      if (parseFloat(neo.price) === 0) continue; // Skip $0 entries

      const match = findMatch(neo.name, ourList);
      if (match) {
        matched.push({ neo: neo.name, ours: match, price: neo.price });
      } else {
        missing.push(neo);
      }
    }

    console.log('=== ' + state + ' ===');
    console.log('NEO Total: ' + neoList.filter(n => parseFloat(n.price) > 0).length);
    console.log('We Have: ' + ourList.length);
    console.log('Matched: ' + matched.length);
    console.log('MISSING: ' + missing.length);
    console.log('');

    if (matched.length > 0) {
      console.log('MATCHED (ours ↔ NEO):');
      matched.forEach(m => console.log('  ✓ ' + m.ours + ' ↔ ' + m.neo + ' ($' + m.price + ')'));
      console.log('');
    }

    if (missing.length > 0) {
      console.log('MISSING FROM OUR DATABASE (sorted by price):');
      missing.slice(0, 30).forEach(m => {
        console.log('  ✗ $' + m.price + ' | ' + m.name + ' | ' + m.town);
      });
      if (missing.length > 30) {
        console.log('  ... and ' + (missing.length - 30) + ' more');
      }
      console.log('');

      // Track top missing
      missing.slice(0, 10).forEach(m => {
        topMissing.push({ ...m, state });
      });
    }

    totalMissing += missing.length;
    console.log('---\n');
  }

  // Summary
  console.log('\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================');
  console.log('Total suppliers on NEO: ' + Object.values(allNeoSuppliers).flat().filter(n => parseFloat(n.price) > 0).length);
  console.log('Total in our database: ' + Object.values(ourSuppliers).flat().length);
  console.log('Total MISSING: ' + totalMissing);
  console.log('');
  console.log('TOP 20 MISSING (by price - best deals we don\'t have):');
  topMissing.sort((a,b) => parseFloat(a.price) - parseFloat(b.price));
  topMissing.slice(0, 20).forEach((m, i) => {
    console.log((i+1) + '. $' + m.price + ' | ' + m.name + ' | ' + m.town + ', ' + m.state);
  });
}

main().catch(e => console.error(e));
