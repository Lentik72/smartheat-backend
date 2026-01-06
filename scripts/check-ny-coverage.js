const { Sequelize } = require('sequelize');
const fs = require('fs');
const zipDb = JSON.parse(fs.readFileSync('./src/data/zip-database.json'));

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function checkNY() {
  const [suppliers] = await sequelize.query('SELECT name, postal_codes_served as zips FROM suppliers WHERE active = true');

  const countySuppliers = new Map();
  for (const s of suppliers) {
    const zips = s.zips || [];
    const countiesServed = new Set();
    for (const zip of zips) {
      const info = zipDb[zip];
      if (info && info.county && info.state === 'NY') countiesServed.add(info.county);
    }
    for (const county of countiesServed) {
      if (!countySuppliers.has(county)) countySuppliers.set(county, []);
      countySuppliers.get(county).push(s.name);
    }
  }

  console.log('=== NY COVERAGE BY COUNTY ===\n');
  const priorityNY = ['Westchester', 'Nassau', 'Suffolk', 'Rockland', 'Putnam', 'Dutchess', 'Orange', 'Ulster', 'Albany', 'Schenectady', 'Rensselaer', 'Saratoga'];

  for (const county of priorityNY) {
    const sups = countySuppliers.get(county) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : sups.length === 1 ? 'GAP' : 'NONE';
    console.log('[' + icon + '] ' + county + ': ' + sups.length + ' suppliers');
  }

  await sequelize.close();
}

checkNY().catch(e => console.error(e));
