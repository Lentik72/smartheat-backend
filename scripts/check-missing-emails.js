const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function check() {
  const [missing] = await sequelize.query(`
    SELECT name, city, state, website, phone
    FROM suppliers
    WHERE active = true
    AND (email IS NULL OR email = '')
    ORDER BY state, name
  `);

  console.log("=== SUPPLIERS MISSING EMAILS (" + missing.length + ") ===\n");

  const byState = {};
  missing.forEach(s => {
    if (!byState[s.state]) byState[s.state] = [];
    byState[s.state].push(s);
  });

  for (const [state, suppliers] of Object.entries(byState).sort()) {
    console.log("\n--- " + state + " (" + suppliers.length + ") ---");
    suppliers.forEach(s => {
      const site = s.website ? s.website.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0] : "NO WEBSITE";
      console.log(s.name + " | " + s.city + " | " + site);
    });
  }

  const withWebsite = missing.filter(s => s.website).length;
  console.log("\n=== SUMMARY ===");
  console.log("Total missing email: " + missing.length);
  console.log("Have website (can check): " + withWebsite);
  console.log("No website (phone only): " + (missing.length - withWebsite));

  await sequelize.close();
}
check();
