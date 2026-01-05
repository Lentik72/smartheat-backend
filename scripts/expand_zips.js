const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function expandZips() {
  // ZIP expansions based on original data before removal
  const expansions = [
    {
      name: 'Town & Country Oil',
      addZips: ['10549', '10507', '10506', '10514', '10536', '10504', '10570', '10510', '10591', '10601', '10541', '10512']
    },
    {
      name: 'Palisades Fuel',
      addZips: ['10549', '10562', '10510', '10520', '10570', '10591', '10567', '10566', '10541']
    },
    {
      name: 'Economy Fuel (Peekskill)',
      addZips: ['10549', '10579', '10589', '10598', '10541']
    },
    {
      name: 'JFJ Fuel Oil',
      addZips: ['10549', '10562', '10591', '10541', '10566']
    },
    {
      name: 'On Site Oil Corp',
      addZips: ['10549', '10507', '10506', '10514', '10536', '10598', '10562', '10570']
    },
    {
      name: "Hunter's Heating Oil",
      addZips: ['10549', '10541', '10512', '10509', '10579', '10516', '10598', '10567', '10536']
    }
  ];

  for (const exp of expansions) {
    // Get current ZIPs
    const [result] = await sequelize.query(
      'SELECT postal_codes_served FROM suppliers WHERE name = $1 AND active = true',
      { bind: [exp.name] }
    );

    if (result.length === 0) {
      console.log('NOT FOUND:', exp.name);
      continue;
    }

    const currentZips = result[0].postal_codes_served || [];
    const newZips = [...new Set([...currentZips, ...exp.addZips])].sort();

    await sequelize.query(
      'UPDATE suppliers SET postal_codes_served = $1::jsonb, updated_at = NOW() WHERE name = $2',
      { bind: [JSON.stringify(newZips), exp.name] }
    );

    const added = exp.addZips.filter(z => !currentZips.includes(z));
    console.log(exp.name + ':');
    console.log('  Before:', currentZips.length, 'ZIPs');
    console.log('  After:', newZips.length, 'ZIPs');
    console.log('  Added:', added.length, 'new ZIPs -', added.join(', '));
    console.log();
  }

  await sequelize.close();
}

expandZips().catch(e => console.error(e));
