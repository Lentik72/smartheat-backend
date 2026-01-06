const { Sequelize } = require('sequelize');
const fs = require('fs');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const zipDb = JSON.parse(fs.readFileSync('/Users/leo/Desktop/HeatingOil/SmartHeatIOS/backend/src/data/zip-database.json'));

async function checkNJ() {
  const [suppliers] = await sequelize.query(`
    SELECT name, postal_codes_served as zips FROM suppliers WHERE state = 'NJ' AND active = true;
  `);

  const countySuppliers = new Map();
  for (const s of suppliers) {
    const zips = s.zips || [];
    const countiesServed = new Set();
    for (const zip of zips) {
      const info = zipDb[zip];
      if (info && info.county && info.state === 'NJ') countiesServed.add(info.county);
    }
    for (const county of countiesServed) {
      if (!countySuppliers.has(county)) countySuppliers.set(county, []);
      countySuppliers.get(county).push(s.name);
    }
  }

  console.log('=== NJ COVERAGE AFTER EXPANSION ===\n');
  const allNJ = ['Bergen', 'Essex', 'Hudson', 'Passaic', 'Middlesex', 'Monmouth', 'Ocean', 'Union', 'Somerset', 'Morris', 'Sussex', 'Mercer', 'Burlington', 'Camden'];

  for (const county of allNJ) {
    const sups = countySuppliers.get(county) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : 'GAP';
    console.log('[' + icon + '] ' + county + ': ' + sups.length + ' suppliers');
  }

  await sequelize.close();
}

checkNJ().catch(e => console.error(e));
