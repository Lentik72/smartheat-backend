const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function check() {
  const [suppliers] = await sequelize.query(
    "SELECT name, city, phone, website, allow_price_display FROM suppliers WHERE active = true AND postal_codes_served::text LIKE '%06790%' ORDER BY allow_price_display DESC, name"
  );

  console.log('=== TORRINGTON (06790) FINAL COVERAGE ===\n');

  const scrapable = suppliers.filter(s => s.allow_price_display);
  const phoneOnly = suppliers.filter(s => !s.allow_price_display);

  console.log('SCRAPABLE SUPPLIERS (' + scrapable.length + '):');
  scrapable.forEach(s => {
    const site = s.website ? s.website.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0] : 'NO SITE';
    console.log('  ✓ ' + s.name + ' | ' + s.phone + ' | ' + site);
  });

  console.log('\nPHONE-ONLY SUPPLIERS (' + phoneOnly.length + '):');
  phoneOnly.forEach(s => {
    const site = s.website ? s.website.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0] : 'NO SITE';
    console.log('  ☎ ' + s.name + ' | ' + s.phone + ' | ' + site);
  });

  console.log('\n=== SUMMARY ===');
  console.log('Total: ' + suppliers.length + ' suppliers');
  console.log('Scrapable: ' + scrapable.length);
  console.log('Phone-only: ' + phoneOnly.length);

  await sequelize.close();
}
check();
