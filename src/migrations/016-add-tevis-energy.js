/**
 * Migration: Add Tevis Energy (tevisenergy.com)
 *
 * Westminster, MD supplier - serves MD & PA
 * Maryland: Carroll, Baltimore, Frederick, Harford, Howard counties
 * Pennsylvania: Adams, York counties
 */

module.exports = {
  async up(sequelize) {
    console.log('Adding Tevis Energy supplier...');

    // Check if supplier already exists
    const [existing] = await sequelize.query(`
      SELECT id FROM suppliers WHERE website LIKE '%tevisenergy.com%'
    `);

    if (existing.length > 0) {
      console.log('Tevis Energy already exists, skipping');
      return;
    }

    // Insert supplier with UUID
    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, phone, website, state, city,
        active, allow_price_display, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        'Tevis Energy',
        '(410) 876-6800',
        'https://www.tevisenergy.com',
        'MD',
        'Westminster',
        true,
        false,
        NOW(),
        NOW()
      )
    `);

    // Get the new supplier ID
    const [[{ id: supplierId }]] = await sequelize.query(`
      SELECT id FROM suppliers WHERE website LIKE '%tevisenergy.com%'
    `);

    console.log(`Created supplier with ID: ${supplierId}`);

    // ZIP codes for service area
    // Carroll County MD
    const carrollMD = ['21048', '21074', '21102', '21104', '21136', '21155', '21157', '21158', '21771', '21776', '21784', '21787', '21791', '21797'];

    // Baltimore County MD (partial - northern areas)
    const baltimoreMD = ['21030', '21031', '21052', '21057', '21071', '21082', '21087', '21093', '21111', '21117', '21120', '21128', '21131', '21133', '21136', '21152', '21153', '21155', '21156', '21161', '21162', '21204', '21208', '21234', '21236', '21237', '21244', '21252', '21286'];

    // Frederick County MD (partial - eastern areas)
    const frederickMD = ['21701', '21702', '21703', '21704', '21705', '21710', '21714', '21716', '21717', '21718', '21754', '21755', '21757', '21758', '21762', '21769', '21770', '21771', '21773', '21774', '21775', '21776', '21777', '21778', '21780', '21783', '21787', '21788', '21790', '21791', '21792', '21793', '21798'];

    // Harford County MD
    const harfordMD = ['21001', '21009', '21010', '21014', '21015', '21017', '21018', '21028', '21034', '21040', '21047', '21050', '21078', '21084', '21085', '21111', '21130', '21132', '21154', '21160', '21161'];

    // Howard County MD
    const howardMD = ['20701', '20723', '20759', '20763', '20777', '20794', '21029', '21036', '21042', '21043', '21044', '21045', '21046', '21075', '21076', '21104', '21163', '21723', '21737', '21738', '21765', '21771', '21784', '21794', '21797'];

    // Adams County PA
    const adamsPA = ['17301', '17302', '17303', '17304', '17306', '17307', '17309', '17310', '17311', '17313', '17314', '17315', '17316', '17317', '17318', '17319', '17320', '17321', '17322', '17323', '17324', '17325', '17326', '17327', '17329', '17331', '17332', '17333', '17334', '17335', '17337', '17339', '17340', '17342', '17343', '17344', '17345', '17347', '17349', '17350', '17352', '17353', '17355', '17356', '17358', '17360', '17361', '17362', '17363', '17364', '17365', '17366', '17368', '17370', '17371', '17372'];

    // York County PA
    const yorkPA = ['17301', '17302', '17304', '17306', '17307', '17309', '17311', '17313', '17314', '17315', '17316', '17317', '17318', '17319', '17320', '17321', '17322', '17324', '17325', '17327', '17329', '17331', '17339', '17340', '17342', '17344', '17345', '17347', '17349', '17350', '17352', '17353', '17355', '17356', '17358', '17360', '17361', '17362', '17363', '17364', '17365', '17366', '17368', '17370', '17371', '17372', '17401', '17402', '17403', '17404', '17405', '17406', '17407', '17408'];

    // Combine all ZIPs and dedupe
    const allZips = [...new Set([
      ...carrollMD, ...baltimoreMD, ...frederickMD, ...harfordMD, ...howardMD,
      ...adamsPA, ...yorkPA
    ])];

    // Insert ZIP codes for this supplier
    let added = 0;
    for (const zip of allZips) {
      try {
        await sequelize.query(`
          INSERT INTO supplier_zips (supplier_id, zip_code)
          VALUES (:supplierId, :zip)
          ON CONFLICT DO NOTHING
        `, { replacements: { supplierId, zip } });
        added++;
      } catch (e) {
        // Skip duplicates or errors
      }
    }

    console.log(`Added ${added} ZIP codes for Tevis Energy`);
  },

  async down(sequelize) {
    const [[supplier]] = await sequelize.query(`
      SELECT id FROM suppliers WHERE website LIKE '%tevisenergy.com%'
    `);

    if (supplier) {
      await sequelize.query(`DELETE FROM supplier_zips WHERE supplier_id = :id`, {
        replacements: { id: supplier.id }
      });
      await sequelize.query(`DELETE FROM suppliers WHERE id = :id`, {
        replacements: { id: supplier.id }
      });
      console.log('Removed Tevis Energy');
    }
  }
};
