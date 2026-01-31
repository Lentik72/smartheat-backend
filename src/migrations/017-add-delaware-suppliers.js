/**
 * Migration: Add Delaware area suppliers
 *
 * 1. Ferro Fuel Oil - Boothwyn PA (Delaware/Chester PA, New Castle DE)
 * 2. Lawman's Oil - Merchantville NJ (NJ/DE/PA tri-state)
 * 3. Hillside Oil - Newark DE (DE/MD/PA)
 * 4. Harley Oil Services - New Castle DE
 */

module.exports = {
  async up(sequelize) {
    console.log('Adding Delaware area suppliers...');

    // ZIP code definitions by county
    const zipsByCounty = {
      // Delaware County, PA
      delawarePA: ['19008', '19010', '19013', '19014', '19015', '19016', '19017', '19018', '19022', '19023', '19026', '19028', '19029', '19032', '19033', '19036', '19039', '19041', '19043', '19050', '19052', '19061', '19063', '19064', '19065', '19066', '19070', '19073', '19074', '19076', '19078', '19079', '19081', '19082', '19083', '19086', '19087', '19094', '19098', '19113', '19342', '19373'],

      // Chester County, PA (eastern portion)
      chesterPA: ['19301', '19310', '19311', '19312', '19317', '19318', '19319', '19320', '19330', '19331', '19333', '19335', '19339', '19340', '19341', '19342', '19343', '19344', '19345', '19346', '19348', '19350', '19352', '19353', '19354', '19355', '19358', '19360', '19362', '19363', '19365', '19366', '19367', '19369', '19372', '19373', '19374', '19375', '19376', '19380', '19381', '19382', '19383', '19390', '19395'],

      // New Castle County, DE
      newCastleDE: ['19701', '19702', '19703', '19706', '19707', '19708', '19709', '19710', '19711', '19712', '19713', '19714', '19715', '19716', '19717', '19718', '19720', '19721', '19725', '19726', '19730', '19731', '19732', '19733', '19734', '19735', '19736', '19801', '19802', '19803', '19804', '19805', '19806', '19807', '19808', '19809', '19810', '19850', '19880', '19884', '19885', '19886', '19890', '19891', '19892', '19893', '19894', '19895', '19896', '19897', '19898', '19899'],

      // Gloucester County, NJ
      gloucesterNJ: ['08012', '08014', '08020', '08021', '08025', '08026', '08027', '08028', '08029', '08030', '08031', '08032', '08033', '08039', '08051', '08056', '08061', '08062', '08063', '08066', '08071', '08074', '08080', '08081', '08083', '08084', '08085', '08086', '08089', '08090', '08091', '08093', '08094', '08096', '08097', '08099'],

      // Camden County, NJ
      camdenNJ: ['08002', '08003', '08004', '08007', '08009', '08010', '08011', '08012', '08018', '08019', '08020', '08021', '08026', '08029', '08030', '08031', '08033', '08034', '08035', '08043', '08045', '08049', '08052', '08053', '08054', '08055', '08057', '08059', '08061', '08062', '08063', '08065', '08066', '08071', '08076', '08077', '08078', '08081', '08083', '08084', '08089', '08091', '08095', '08099', '08101', '08102', '08103', '08104', '08105', '08106', '08107', '08108', '08109', '08110'],

      // Salem County, NJ
      salemNJ: ['08001', '08023', '08038', '08039', '08067', '08069', '08070', '08072', '08079', '08098'],

      // Cecil County, MD
      cecilMD: ['21901', '21902', '21903', '21904', '21911', '21912', '21913', '21914', '21915', '21916', '21917', '21918', '21919', '21920', '21921', '21922', '21930']
    };

    const suppliers = [
      {
        name: 'Ferro Fuel Oil',
        phone: '(610) 485-1356',
        website: 'https://www.ferrofueloil.com',
        state: 'PA',
        city: 'Boothwyn',
        allow_price_display: true,
        price: 3.999,
        // Internal: email not published
        _email: null,
        zips: [...zipsByCounty.delawarePA, ...zipsByCounty.chesterPA, ...zipsByCounty.newCastleDE]
      },
      {
        name: "Lawman's Oil",
        phone: '877-692-4230',
        website: 'https://www.lawmansoil.com',
        state: 'NJ',
        city: 'Merchantville',
        allow_price_display: true,
        price: 3.969,
        _email: null,
        zips: [...zipsByCounty.newCastleDE, ...zipsByCounty.chesterPA, ...zipsByCounty.delawarePA, ...zipsByCounty.gloucesterNJ, ...zipsByCounty.camdenNJ, ...zipsByCounty.salemNJ]
      },
      {
        name: 'Hillside Oil Heating & Cooling',
        phone: '(302) 738-4144',
        website: 'https://www.hillsidehvac.com',
        state: 'DE',
        city: 'Newark',
        allow_price_display: false,
        price: 4.10,
        _email: null,
        zips: [...zipsByCounty.newCastleDE, ...zipsByCounty.cecilMD, ...zipsByCounty.chesterPA]
      },
      {
        name: 'Harley Oil Services',
        phone: '(302) 834-3430',
        website: 'https://harleyoilservices.blogspot.com',
        state: 'DE',
        city: 'New Castle',
        allow_price_display: false,
        price: null,
        _email: 'harley731oil@gmail.com',
        zips: zipsByCounty.newCastleDE
      }
    ];

    for (const supplier of suppliers) {
      // Check if already exists
      const [existing] = await sequelize.query(`
        SELECT id FROM suppliers WHERE website LIKE :website
      `, { replacements: { website: `%${new URL(supplier.website).hostname.replace('www.', '')}%` } });

      if (existing.length > 0) {
        console.log(`${supplier.name} already exists, skipping`);
        continue;
      }

      // Insert supplier with UUID
      await sequelize.query(`
        INSERT INTO suppliers (id, name, phone, website, state, city, active, allow_price_display, created_at, updated_at)
        VALUES (gen_random_uuid(), :name, :phone, :website, :state, :city, true, :allow_price_display, NOW(), NOW())
      `, {
        replacements: {
          name: supplier.name,
          phone: supplier.phone,
          website: supplier.website,
          state: supplier.state,
          city: supplier.city,
          allow_price_display: supplier.allow_price_display
        }
      });

      // Get supplier ID
      const [[{ id: supplierId }]] = await sequelize.query(`
        SELECT id FROM suppliers WHERE website = :website
      `, { replacements: { website: supplier.website } });

      console.log(`Created ${supplier.name} with ID: ${supplierId}`);

      // Add price if available
      if (supplier.price) {
        await sequelize.query(`
          INSERT INTO supplier_prices (supplier_id, price_per_gallon, min_gallons, scraped_at, expires_at, is_valid)
          VALUES (:supplierId, :price, 150, NOW(), NOW() + INTERVAL '7 days', true)
        `, { replacements: { supplierId, price: supplier.price } });
        console.log(`  Added price: $${supplier.price}/gal`);
      }

      // Add ZIP codes (dedupe)
      const uniqueZips = [...new Set(supplier.zips)];
      let added = 0;
      for (const zip of uniqueZips) {
        try {
          await sequelize.query(`
            INSERT INTO supplier_zips (supplier_id, zip_code)
            VALUES (:supplierId, :zip)
            ON CONFLICT DO NOTHING
          `, { replacements: { supplierId, zip } });
          added++;
        } catch (e) {
          // Skip errors
        }
      }
      console.log(`  Added ${added} ZIP codes`);
    }

    console.log('Delaware area suppliers added successfully');
  },

  async down(sequelize) {
    const websites = [
      'ferrofueloil.com',
      'lawmansoil.com',
      'hillsidehvac.com',
      'harleyoilservices.blogspot.com'
    ];

    for (const domain of websites) {
      const [[supplier]] = await sequelize.query(`
        SELECT id FROM suppliers WHERE website LIKE :domain
      `, { replacements: { domain: `%${domain}%` } });

      if (supplier) {
        await sequelize.query(`DELETE FROM supplier_zips WHERE supplier_id = :id`, {
          replacements: { id: supplier.id }
        });
        await sequelize.query(`DELETE FROM supplier_prices WHERE supplier_id = :id`, {
          replacements: { id: supplier.id }
        });
        await sequelize.query(`DELETE FROM suppliers WHERE id = :id`, {
          replacements: { id: supplier.id }
        });
        console.log(`Removed supplier with domain: ${domain}`);
      }
    }
  }
};
