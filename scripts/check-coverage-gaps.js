const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function checkGaps() {
  // Check all ZIP codes searched in supplier lookups
  const [searchedZips] = await sequelize.query(`
    SELECT DISTINCT zip_code, state, COUNT(*) as searches
    FROM api_activity
    WHERE zip_code IS NOT NULL
      AND endpoint LIKE '%suppliers%'
    GROUP BY zip_code, state
    ORDER BY searches DESC
  `);

  console.log('=== ZIP Codes Searched for Suppliers ===');
  console.log('Total unique ZIPs:', searchedZips.length);
  searchedZips.slice(0, 20).forEach(z => {
    console.log('  ' + z.zip_code + ' (' + (z.state || '?') + ') - ' + z.searches + ' searches');
  });

  // Get supplier coverage - postal_codes_served is JSONB array
  const [coverage] = await sequelize.query(`
    SELECT
      jsonb_array_elements_text(postal_codes_served) as zip_code
    FROM suppliers
    WHERE active = true
      AND postal_codes_served IS NOT NULL
  `);

  const coveredZips = new Set(coverage.map(c => c.zip_code));
  console.log('\nTotal ZIPs covered by suppliers:', coveredZips.size);

  // Find gaps - searched but not covered
  const gaps = searchedZips.filter(z => !coveredZips.has(z.zip_code));
  console.log('\n=== COVERAGE GAPS (Searched but not covered) ===');
  if (gaps.length === 0) {
    console.log('All searched ZIP codes have supplier coverage!');
  } else {
    console.log('Found ' + gaps.length + ' gaps:');
    gaps.forEach(g => {
      console.log('  ' + g.zip_code + ' (' + (g.state || 'unknown') + ') - ' + g.searches + ' searches');
    });
  }

  // Also check user_locations for ZIPs people are using the app from
  const [userLocations] = await sequelize.query(`
    SELECT zip_code, state, COUNT(*) as users
    FROM user_locations
    WHERE zip_code IS NOT NULL
    GROUP BY zip_code, state
    ORDER BY users DESC
  `);

  console.log('\n=== User ZIP Codes (from user_locations) ===');
  console.log('Total unique user ZIPs:', userLocations.length);

  const userGaps = userLocations.filter(u => !coveredZips.has(u.zip_code));
  console.log('\n=== USER LOCATION GAPS (User ZIPs without coverage) ===');
  if (userGaps.length === 0) {
    console.log('All user ZIP codes have supplier coverage!');
  } else {
    console.log('Found ' + userGaps.length + ' user location gaps:');
    userGaps.forEach(g => {
      console.log('  ' + g.zip_code + ' (' + (g.state || 'unknown') + ') - ' + g.users + ' users');
    });
  }

  // Check which suppliers cover these gaps' nearby areas
  if (userGaps.length > 0) {
    console.log('\n=== Nearby Suppliers for Gap ZIPs ===');
    for (const gap of userGaps.slice(0, 5)) {
      // Get the state for this ZIP
      const state = gap.state || 'NY';
      const [nearby] = await sequelize.query(`
        SELECT name, city, state, postal_codes_served
        FROM suppliers
        WHERE active = true
          AND state = :state
        LIMIT 5
      `, { replacements: { state } });

      console.log('\n  ' + gap.zip_code + ' (' + state + '):');
      if (nearby.length === 0) {
        console.log('    No suppliers in ' + state);
      } else {
        nearby.forEach(s => {
          const zips = s.postal_codes_served || [];
          console.log('    - ' + s.name + ' (' + s.city + ') - covers ' + zips.length + ' ZIPs');
        });
      }
    }
  }

  await sequelize.close();
}

checkGaps().catch(e => console.error(e));
