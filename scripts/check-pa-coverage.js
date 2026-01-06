const { Sequelize } = require('sequelize');
const fs = require('fs');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const zipDb = JSON.parse(fs.readFileSync('/Users/leo/Desktop/HeatingOil/SmartHeatIOS/backend/src/data/zip-database.json'));

async function checkPA() {
  const [suppliers] = await sequelize.query(`
    SELECT name, state, postal_codes_served as zips FROM suppliers WHERE active = true;
  `);

  const countySuppliers = new Map();
  for (const s of suppliers) {
    const zips = s.zips || [];
    const countiesServed = new Set();
    for (const zip of zips) {
      const info = zipDb[zip];
      if (info && info.county && info.state === 'PA') countiesServed.add(info.county);
    }
    for (const county of countiesServed) {
      if (!countySuppliers.has(county)) countySuppliers.set(county, []);
      countySuppliers.get(county).push(s.name);
    }
  }

  console.log('=== PA COVERAGE BY COUNTY ===\n');
  const priorityPA = ['Philadelphia', 'Delaware', 'Montgomery', 'Bucks', 'Chester', 'Lehigh', 'Northampton', 'Berks'];

  for (const county of priorityPA) {
    const sups = countySuppliers.get(county) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : sups.length === 1 ? 'GAP' : 'NONE';
    console.log('[' + icon + '] ' + county + ': ' + sups.length + ' suppliers');
    if (sups.length < 3) {
      console.log('      ' + sups.join(', '));
    }
  }

  await sequelize.close();
}

checkPA().catch(e => console.error(e));
