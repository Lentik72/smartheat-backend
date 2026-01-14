const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function fixCapeMayCoverage() {
  // Cape May County ZIPs (South Jersey shore)
  const capeMayZips = [
    '08202', // Avalon
    '08204', // Cape May
    '08210', // Cape May Court House
    '08212', // Cape May Point
    '08223', // Sea Isle City
    '08226', // Ocean City
    '08230', // Ocean View
    '08242', // Rio Grande
    '08243', // Sea Isle City (part)
    '08246', // Woodbine
    '08247', // Stone Harbor
    '08248', // Strathmere
    '08250', // Tuckahoe
    '08251', // Villas
    '08252', // West Cape May
    '08260', // Wildwood
    '08270'  // Woodbine (part)
  ];

  // Get Globe Petroleum
  const [globe] = await sequelize.query(`
    SELECT id, name, postal_codes_served
    FROM suppliers
    WHERE name LIKE '%Globe Petroleum%'
  `);

  if (globe.length === 0) {
    console.log('Globe Petroleum not found!');
    await sequelize.close();
    return;
  }

  const supplier = globe[0];
  const currentZips = supplier.postal_codes_served || [];
  console.log('Globe Petroleum current coverage:', currentZips.length, 'ZIPs');

  // Check which Cape May ZIPs are missing
  const missingZips = capeMayZips.filter(z => !currentZips.includes(z));
  console.log('Missing Cape May ZIPs:', missingZips.length > 0 ? missingZips.join(', ') : 'None');

  if (missingZips.length === 0) {
    console.log('All Cape May ZIPs already covered!');
    await sequelize.close();
    return;
  }

  // Add missing ZIPs
  const updatedZips = [...currentZips, ...missingZips];

  await sequelize.query(`
    UPDATE suppliers
    SET postal_codes_served = :zips::jsonb,
        updated_at = NOW()
    WHERE id = :id
  `, { replacements: { zips: JSON.stringify(updatedZips), id: supplier.id } });

  console.log('Added', missingZips.length, 'Cape May ZIPs to Globe Petroleum');
  console.log('New total coverage:', updatedZips.length, 'ZIPs');

  // Verify Cape May coverage now
  const [verify] = await sequelize.query(`
    SELECT name FROM suppliers
    WHERE active = true
      AND postal_codes_served::text LIKE '%08210%'
  `);

  console.log('\n08210 (Cape May Court House) now covered by:');
  verify.forEach(s => console.log('  -', s.name));

  await sequelize.close();
}

fixCapeMayCoverage().catch(e => console.error(e));
