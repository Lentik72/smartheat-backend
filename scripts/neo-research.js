const https = require('https');

const zones = {
  'MA': [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
  'CT': [1,2,3,4,5,6],
  'RI': [1,2],
  'NH': [1,2,3,4,5,6],
  'ME': [1,2,3,4,5,6,7,8]
};

const stateUrls = {
  'MA': 'massachusetts',
  'CT': 'connecticut',
  'RI': 'rhodeisland',
  'NH': 'newhampshire',
  'ME': 'maine'
};

async function fetchZone(state, zone) {
  const stateUrl = stateUrls[state];
  const url = 'https://www.newenglandoil.com/' + stateUrl + '/zone' + zone + '.asp?x=0';

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Normalize HTML - remove newlines for easier parsing
        const html = data.replace(/\n/g, ' ').replace(/\s+/g, ' ');

        const suppliers = [];

        // Match company name (may have link or not)
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

        // Combine - they should be in order
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

async function main() {
  const allSuppliers = {};

  for (const [state, zoneList] of Object.entries(zones)) {
    allSuppliers[state] = [];
    console.error('Fetching ' + state + '...');
    for (const zone of zoneList) {
      const suppliers = await fetchZone(state, zone);
      suppliers.forEach(s => {
        // Avoid duplicates
        if (!allSuppliers[state].find(x => x.name === s.name)) {
          allSuppliers[state].push(s);
        }
      });
    }
  }

  // Output results
  for (const [state, suppliers] of Object.entries(allSuppliers)) {
    console.log('\n=== ' + state + ' (' + suppliers.length + ' suppliers) ===');
    suppliers.sort((a,b) => parseFloat(a.price) - parseFloat(b.price));
    suppliers.forEach(s => {
      console.log(s.price + ' | ' + s.name + ' | ' + s.town);
    });
  }
}

main();
