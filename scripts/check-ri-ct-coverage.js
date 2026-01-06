const { Sequelize } = require('sequelize');
const fs = require('fs');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const zipDb = JSON.parse(fs.readFileSync('/Users/leo/Desktop/HeatingOil/SmartHeatIOS/backend/src/data/zip-database.json'));

async function checkRICT() {
  const [suppliers] = await sequelize.query(`
    SELECT name, postal_codes_served as zips FROM suppliers WHERE active = true;
  `);

  const countySuppliers = new Map();
  for (const s of suppliers) {
    const zips = s.zips || [];
    for (const zip of zips) {
      const info = zipDb[zip];
      if (info && info.county && (info.state === 'RI' || info.state === 'CT')) {
        const key = info.county + ', ' + info.state;
        if (!countySuppliers.has(key)) countySuppliers.set(key, []);
        if (!countySuppliers.get(key).includes(s.name)) {
          countySuppliers.get(key).push(s.name);
        }
      }
    }
  }

  console.log('=== RI COVERAGE ===\n');
  const riCounties = ['Providence', 'Kent', 'Washington', 'Newport', 'Bristol'];
  for (const county of riCounties) {
    const key = county + ', RI';
    const sups = countySuppliers.get(key) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : sups.length === 1 ? 'GAP' : 'NONE';
    console.log('[' + icon + '] ' + county + ': ' + sups.length + ' suppliers');
    if (sups.length < 3) console.log('      ' + sups.join(', '));
  }

  console.log('\n=== CT COVERAGE ===\n');
  const ctCounties = ['Fairfield', 'New Haven', 'Hartford', 'Middlesex', 'New London', 'Litchfield', 'Windham', 'Tolland'];
  for (const county of ctCounties) {
    const key = county + ', CT';
    const sups = countySuppliers.get(key) || [];
    const icon = sups.length >= 3 ? 'OK' : sups.length >= 2 ? 'THIN' : sups.length === 1 ? 'GAP' : 'NONE';
    console.log('[' + icon + '] ' + county + ': ' + sups.length + ' suppliers');
    if (sups.length < 3) console.log('      ' + sups.join(', '));
  }

  await sequelize.close();
}

checkRICT().catch(e => console.error(e));
