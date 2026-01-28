const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const https = require('https');

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http') ? res.headers.location : 'https://' + url.split('/')[2] + res.headers.location;
        fetch(newUrl).then(resolve);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode === 200, text: data, status: res.statusCode }));
    }).on('error', e => resolve({ ok: false, error: e.message }))
      .on('timeout', function() { this.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

const suppliers = [
  // Hartford new
  { domain: 'curleysfuel.com', regex: /\$([0-9]+\.[0-9]{2,3})/ },
  { domain: 'snsoil.com', regex: /\$([0-9]+\.[0-9]{2,3})/ },
  // MA new
  { domain: 'johnsoil.com', regex: /\$([0-9]+\.[0-9]{2,3})/ },
  { domain: 'kelleysoil.com', regex: /\$([0-9]+\.[0-9]{2,3})/ },
  { domain: 'scottwilliamsoil.com', regex: /\$([0-9]+\.[0-9]{2,3})/ },
];

async function scrape() {
  const results = [];

  for (const s of suppliers) {
    console.log('Scraping:', s.domain);

    const resp = await fetch('https://' + s.domain);
    if (!resp.ok) {
      console.log('  FAILED:', resp.error || resp.status);
      continue;
    }

    const match = resp.text.match(s.regex);
    if (match) {
      const price = parseFloat(match[1]);
      console.log('  Price found:', '$' + price);

      // Get supplier ID
      const [supplier] = await sequelize.query(
        "SELECT id, name FROM suppliers WHERE website LIKE '%" + s.domain + "%' AND active = true"
      );

      if (supplier.length > 0) {
        // Insert price
        await sequelize.query(
          "INSERT INTO supplier_prices (id, supplier_id, price_per_gallon, min_gallons, source_type, scraped_at, expires_at) VALUES (gen_random_uuid(), '" + supplier[0].id + "', " + price + ", 100, 'scraped', NOW(), NOW() + INTERVAL '7 days')"
        );
        console.log('  Saved for:', supplier[0].name);
        results.push({ name: supplier[0].name, price });
      } else {
        console.log('  Supplier not found in DB');
      }
    } else {
      console.log('  No price match');
      // Show what prices exist on page
      const allPrices = resp.text.match(/\$[0-9]+\.[0-9]{2,3}/g);
      if (allPrices) {
        console.log('  Prices on page:', allPrices.slice(0, 5).join(', '));
      }
    }
  }

  console.log('\n=== SCRAPE RESULTS ===');
  if (results.length === 0) {
    console.log('No prices scraped');
  } else {
    results.forEach(r => console.log(r.name + ': $' + r.price.toFixed(2)));
  }

  await sequelize.close();
}

scrape().catch(e => console.error(e));
