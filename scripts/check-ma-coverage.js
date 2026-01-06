const { Sequelize } = require('sequelize');
const fs = require('fs');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const zipDb = JSON.parse(fs.readFileSync('/Users/leo/Desktop/HeatingOil/SmartHeatIOS/backend/src/data/zip-database.json'));

async function checkMA() {
  const [suppliers] = await sequelize.query(`
    SELECT name, postal_codes_served as zips FROM suppliers WHERE active = true;
  `);

  const countySuppliers = new Map();
  for (const s of suppliers) {
    const zips = s.zips || [];
    const countiesServed = new Set();
    for (const zip of zips) {
      const info = zipDb[zip];
      if (info && info.county && info.state === 'MA') countiesServed.add(info.county);
    }
    for (const county of countiesServed) {
      if (!countySuppliers.has(county)) countySuppliers.set(county, []);
      countySuppliers.get(county).push(s.name);
    }
  }

  console.log('=== MA COVERAGE BY COUNTY ===\n');
  const priorityMA = ['Suffolk', 'Middlesex', 'Norfolk', 'Essex', 'Worcester', 'Bristol', 'Plymouth', 'Barnstable', 'Berkshire', 'Hampshire', 'Franklin'];

  for (const county of priorityMA) {
    const sups = countySuppliers.get(county) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : sups.length === 1 ? 'GAP' : 'NONE';
    console.log('[' + icon + '] ' + county + ': ' + sups.length + ' suppliers');
    if (sups.length < 3) {
      console.log('      ' + sups.join(', '));
    }
  }

  await sequelize.close();
}

checkMA().catch(e => console.error(e));
