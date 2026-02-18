/**
 * Migration 061: Add Dragon Fuel LLC (Stratford, CT)
 *
 * COD heating oil supplier serving Stratford and surrounding
 * Fairfield County towns.
 *
 * Source: https://dragonfuelllc.com/
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '061-add-dragon-fuel-llc',

  async up(sequelize) {
    const supplierId = uuidv4();

    // Stratford + surrounding Fairfield County ZIPs
    const postalCodes = [
      '06614', '06615',  // Stratford
      '06601', '06602', '06604', '06605', '06606', '06607', '06608', '06610',  // Bridgeport
      '06460', '06461',  // Milford
      '06484',  // Shelton
      '06611',  // Trumbull
      '06430', '06432',  // Fairfield
      '06468',  // Monroe
      '06612',  // Easton
      '06477',  // Orange
    ];

    const serviceCounties = ['Fairfield'];
    const serviceCities = [
      'Stratford', 'Bridgeport', 'Milford', 'Shelton',
      'Trumbull', 'Fairfield', 'Monroe', 'Easton', 'Orange'
    ];

    // Check if already exists
    const [existing] = await sequelize.query(
      `SELECT id FROM suppliers WHERE LOWER(name) LIKE '%dragon fuel%' AND state = 'CT'`
    );

    if (existing.length > 0) {
      console.log('[Migration 061] Dragon Fuel LLC already exists, skipping');
      return;
    }

    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, phone, email, website,
        address_line1, city, state,
        postal_codes_served, service_counties, service_cities,
        lat, lng,
        active, verified, source,
        delivery_model,
        created_at, updated_at
      ) VALUES (
        :id, :name, :phone, :email, :website,
        :address, :city, :state,
        :postalCodes, :serviceCounties, :serviceCities,
        :lat, :lng,
        true, true, 'web_research',
        'cod',
        NOW(), NOW()
      )
    `, {
      replacements: {
        id: supplierId,
        name: 'Dragon Fuel LLC',
        phone: '(203) 220-2243',
        email: 'dragonfuelllc@gmail.com',
        website: 'https://dragonfuelllc.com',
        address: '29 Minor Ave',
        city: 'Stratford',
        state: 'CT',
        postalCodes: JSON.stringify(postalCodes),
        serviceCounties: JSON.stringify(serviceCounties),
        serviceCities: JSON.stringify(serviceCities),
        lat: 41.1845,  // Stratford, CT coordinates
        lng: -73.1332
      }
    });

    console.log(`[Migration 061] Added Dragon Fuel LLC (${supplierId})`);
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE LOWER(name) LIKE '%dragon fuel%' AND state = 'CT'
    `);
    console.log('[Migration 061] Removed Dragon Fuel LLC');
  }
};
