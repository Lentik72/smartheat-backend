const { Sequelize } = require('sequelize');
const fs = require('fs');
const zipDb = JSON.parse(fs.readFileSync('./src/data/zip-database.json'));

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function verify() {
  const [suppliers] = await sequelize.query(`
    SELECT name, postal_codes_served as zips FROM suppliers WHERE active = true;
  `);

  const countySuppliers = new Map();
  for (const s of suppliers) {
    const zips = s.zips || [];
    const countiesServed = new Set();
    for (const zip of zips) {
      const info = zipDb[zip];
      if (info && info.county) {
        const key = info.county + ', ' + info.state;
        countiesServed.add(key);
      }
    }
    for (const county of countiesServed) {
      if (!countySuppliers.has(county)) countySuppliers.set(county, []);
      countySuppliers.get(county).push(s.name);
    }
  }

  console.log('=== PREVIOUSLY GAP AREAS - NOW FIXED ===\n');

  const checkAreas = [
    'Ulster, NY',
    'Albany, NY',
    'Rensselaer, NY',
    'Schenectady, NY',
    'Saratoga, NY',
    'Washington, RI'
  ];

  for (const area of checkAreas) {
    const sups = countySuppliers.get(area) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : sups.length === 1 ? 'GAP' : 'NONE';
    console.log('[' + icon + '] ' + area + ': ' + sups.length + ' suppliers');
    sups.forEach(s => console.log('      - ' + s));
  }

  await sequelize.close();
}

verify().catch(e => console.error(e));
