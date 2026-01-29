const { Sequelize } = require("sequelize");
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function list() {
  const [suppliers] = await sequelize.query(`
    SELECT name, city, website, allow_price_display,
           COALESCE(jsonb_array_length(postal_codes_served), 0) as zip_count,
           COALESCE(jsonb_array_length(service_counties), 0) as county_count
    FROM suppliers 
    WHERE state = 'NY' AND active = true
    ORDER BY name
  `);
  
  console.log("=== ALL ACTIVE NY SUPPLIERS (" + suppliers.length + ") ===\n");
  
  let scrapeable = 0, phoneOnly = 0, noWebsite = 0, noCoverage = 0;
  
  suppliers.forEach((s, i) => {
    const type = s.allow_price_display ? "SCRAPE" : "PHONE";
    const site = s.website ? s.website.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0] : "NO SITE";
    const coverage = (s.zip_count > 0 || s.county_count > 0) ? "OK" : "NO COV";
    
    if (s.allow_price_display) scrapeable++;
    else phoneOnly++;
    if (s.website === null) noWebsite++;
    if (s.zip_count == 0 && s.county_count == 0) noCoverage++;
    
    console.log((i+1).toString().padStart(2) + ". " + s.name.substring(0,30).padEnd(32) + " | " + s.city.padEnd(15) + " | " + type.padEnd(6) + " | " + site.substring(0,25).padEnd(25) + " | " + coverage);
  });
  
  console.log("\n=== SUMMARY ===");
  console.log("Total: " + suppliers.length);
  console.log("Scrapeable: " + scrapeable);
  console.log("Phone-only: " + phoneOnly);
  console.log("No website: " + noWebsite);
  console.log("No coverage data: " + noCoverage);
  
  await sequelize.close();
}
list();
