/**
 * Migration 095: Merge duplicate supplier records across all states
 *
 * Root cause: Migrations used different slugs/names than existing records, so
 * ON CONFLICT (slug) didn't fire and new rows were created. ScrapeConfigSync
 * then kept both alive because LIMIT 1 without ORDER BY picked arbitrarily.
 *
 * For each pair, we:
 * 1. Keep the record with more price history / better coverage (the "primary")
 * 2. Merge coverage data (ZIPs, cities, counties) from the duplicate
 * 3. Re-assign orphaned prices from the duplicate to the primary
 * 4. Deactivate (not delete) the duplicate so slugs/URLs don't 404
 *
 * 21 duplicates across CT, DE, MA, ME, NY.
 *
 * NOT merged (intentionally separate):
 *   - Economy Fuel NY (New City, different phone) — separate from Economy Fuel (Peekskill)
 *   - Terroco Oil MD — separate state coverage from Terroco Oil DE
 */

module.exports = {
  name: '095-merge-duplicate-suppliers',

  async up(sequelize) {
    // keepId = record with more prices or better coverage data
    const merges = [
      // === CT ===
      {
        keepId: '8381d613-62f7-4796-aead-4424e4219a09',   // Brazos Oil (67 ZIPs)
        removeId: 'dd78b13c-1283-4a81-9a84-7b99781695c5', // Brazos Oil LLC (34 ZIPs)
        reason: 'CT: Brazos Oil vs Brazos Oil LLC — same phone/website, keep record with 67 ZIPs',
      },
      {
        keepId: 'b9b0f12e-4973-4503-ba7f-4c0d7ff74bca',   // Coastal Energy LLC (72 ZIPs)
        removeId: '3eac8b73-3b28-4abb-af53-1b4b20f16d3b', // Coastal Energy CT (28 ZIPs)
        reason: 'CT: Coastal Energy LLC vs Coastal Energy CT — same phone/website, keep record with 72 ZIPs',
      },
      {
        keepId: '86b8e3d0-1cf6-4cf5-a05e-3b90dbdd94c7',   // Piro Petroleum (32 ZIPs)
        removeId: '7987f73b-b2c6-4de0-8a30-33ee3340b89d', // Piro Paving & Petroleum (15 ZIPs)
        reason: 'CT: Piro Petroleum vs Piro Paving & Petroleum — same phone/website, keep record with 32 ZIPs',
      },

      // === DE ===
      {
        keepId: '96d337e3-ec48-4d78-883c-e3b907577971',   // Terroco Oil (54 ZIPs, 7 prices, display=true)
        removeId: 'be6699b8-77b6-422a-9cf7-16317cf992ab', // Terroco Oil DE (37 ZIPs, 0 prices)
        reason: 'DE: Terroco Oil — exact dupe, keep record with 7 prices and display enabled',
      },

      // === MA ===
      {
        keepId: '90cbf67a-7c0a-40be-84cc-00636adcbe6e',   // Affordable Fuel (54 ZIPs, 4 prices)
        removeId: '545caf14-30ba-4477-9afd-ba0d56a56cc8', // Affordable Fuel Inc (80 ZIPs, 0 prices)
        reason: 'MA: Affordable Fuel vs Affordable Fuel Inc — same phone/website, keep record with prices',
      },
      {
        keepId: 'b1d27e8f-1fef-4e07-9060-27194d9f714f',   // John\'s Oil Service (34 prices)
        removeId: '1d3f6582-95c2-49ee-972e-803657376ac1', // John\'s Oil Service (31 prices)
        reason: 'MA: John\'s Oil Service — exact dupe, keep record with 34 prices',
      },
      {
        keepId: '0e6fae96-27eb-4254-8e8d-080f7f552f4a',   // Kelley\'s Oil (10 prices)
        removeId: '49dab45b-9cd5-4ddb-8cec-332c0d2a4536', // Kelley\'s Oil (2 prices)
        reason: 'MA: Kelley\'s Oil — exact dupe, keep record with 10 prices',
      },
      {
        keepId: 'f5c75335-7cd9-4142-bd8d-aa49cfb363e4',   // Springer\'s Oil (34 ZIPs, 167 prices)
        removeId: '3f516e05-bc95-4290-bd05-6ccdcdad6f1d', // Springers Oil Service (7 ZIPs, 164 prices)
        reason: 'MA: Springer\'s Oil vs Springers Oil Service — same website, keep record with more ZIPs/prices',
      },

      // === ME ===
      {
        keepId: '56acc7a5-7002-4c2e-bb7f-563afb91ed5d',   // AJ\'s Discount Oil (25 ZIPs, 29 prices, display=true)
        removeId: '3cc35a1d-646b-4df7-b8f4-1243499f995b', // AJ\'s Discount Oil (26 ZIPs, 0 prices, display=false)
        reason: 'ME: AJ\'s Discount Oil — exact dupe, keep record with 29 prices and display enabled',
      },

      // === NY (original 6) ===
      {
        keepId: '37686b5c-e9cb-4a75-8f14-c86cba5d5211',   // Euro Fuel Co (92 prices)
        removeId: '192729a4-2f53-4363-94e0-a0dbacbc70a0', // Euro Fuel Co (17 prices)
        reason: 'NY: Euro Fuel Co — exact dupe, keep record with 92 prices',
      },
      {
        keepId: '3b2df87f-bd65-489a-92aa-b9a1b3ae0f77',   // Family Fuel (50 prices)
        removeId: '933b04ca-5fa3-4c15-8759-38cd1bc8a62e', // Family Fuel (36 prices)
        reason: 'NY: Family Fuel & Heating Service — exact dupe, keep record with 50 prices',
      },
      {
        keepId: 'c6615844-06fd-4a6a-be62-01854ed4b428',   // Chrysalis Fuel (188 prices)
        removeId: '3234eaf6-1521-447f-a566-dd0ffedaa513', // Chrysalis Fuel Inc (7 prices)
        reason: 'NY: Chrysalis Fuel vs Chrysalis Fuel Inc — same phone/website, keep record with 188 prices',
      },
      {
        keepId: '5330524b-8457-440f-98f5-8e79aadee4ae',   // Jurassic Fuels Inc (171 prices)
        removeId: 'cb590e0a-2973-4e64-b6fb-4826d29a709b', // Jurassic Fuels (6 prices)
        reason: 'NY: Jurassic Fuels Inc vs Jurassic Fuels — same website, keep record with 171 prices',
      },
      {
        keepId: '218893ea-921d-436e-bfc8-74bf2ce9d7a4',   // Superior Fuel Oil Inc (191 prices)
        removeId: 'ad611878-298f-405f-b404-e96286e71c66', // Superior Fuel Oil (7 prices)
        reason: 'NY: Superior Fuel Oil Inc vs Superior Fuel Oil — same phone/website, keep record with 191 prices',
      },
      {
        keepId: 'b49ca370-4166-4c7a-8f12-e7949e4ae0ba',   // State Fuel Company (66 ZIPs)
        removeId: 'e5925105-6059-4b04-8e44-84f770971c5d', // State Fuel Inc (0 ZIPs)
        reason: 'NY: State Fuel Company vs State Fuel Inc — same phone/website, keep record with 66 ZIPs',
      },

      // === NY (new finds) ===
      {
        keepId: 'd230197b-4161-480b-a3a4-ce8a599144cc',   // Bee\'s Oil (23 ZIPs)
        removeId: 'a04f2281-63c4-4f9b-9f40-001f669a0c1b', // Bee\'s Fuel Oil (21 ZIPs)
        reason: 'NY: Bee\'s Oil vs Bee\'s Fuel Oil — same phone/website, keep record with 23 ZIPs',
      },
      {
        keepId: '53ec33c2-1a05-4c77-a26f-6ffb532b60ee',   // Check Oil & Propane (45 ZIPs)
        removeId: '3f6e610e-52d0-4fa9-b36e-ec074e00bcd3', // Check Oil (0 ZIPs)
        reason: 'NY: Check Oil & Propane vs Check Oil — same phone/website, keep record with 45 ZIPs',
      },
      {
        keepId: '7ec16881-5433-429d-b134-20196b870b4c',   // Direct Oil North (57 ZIPs)
        removeId: '02765fb9-934d-474d-b960-de689738c6ce', // Direct Oil (22 ZIPs)
        reason: 'NY: Direct Oil North vs Direct Oil — same phone/website, keep record with 57 ZIPs',
      },
      {
        keepId: '4542e02c-a5eb-4320-ab2f-1e38a843d90b',   // Economy Fuel Peekskill (119 ZIPs)
        removeId: '6832c57b-3714-4e85-bfa7-1aa6ed099863', // Economy Fuel (26 ZIPs)
        reason: 'NY: Economy Fuel (Peekskill) vs Economy Fuel — same phone/city, keep record with 119 ZIPs',
      },
      {
        keepId: 'c776d8ee-bb46-4370-80e1-60edca96ada3',   // Hunter\'s Heating Oil (171 prices)
        removeId: 'd09f7d46-0667-455f-a494-4d2a29c5e971', // Hunter\'s Oil (5 prices)
        reason: 'NY: Hunter\'s Heating Oil vs Hunter\'s Oil — same website, keep record with 171 prices',
      },
      {
        keepId: '470241ce-48ae-4ea6-8815-b4289b3c3500',   // Oilex Heating (214 ZIPs, 152 prices)
        removeId: 'f3e85ac1-8bc6-4a80-913c-1c3c85e15991', // Oilex Fuel (56 ZIPs, 134 prices)
        reason: 'NY: Oilex Heating vs Oilex Fuel — same phone/website, keep record with 214 ZIPs and 152 prices',
      },
    ];

    for (const { keepId, removeId, reason } of merges) {
      console.log(`[Migration 095] ${reason}`);

      // 1. Get both records
      const [[keep]] = await sequelize.query(
        `SELECT id, name, postal_codes_served, service_cities, service_counties,
                city, phone, website
         FROM suppliers WHERE id = :id`,
        { replacements: { id: keepId } }
      );
      const [[remove]] = await sequelize.query(
        `SELECT id, name, postal_codes_served, service_cities, service_counties,
                city, phone, website
         FROM suppliers WHERE id = :id`,
        { replacements: { id: removeId } }
      );

      if (!keep || !remove) {
        console.log(`  SKIP — one or both records not found`);
        continue;
      }

      // 2. Merge ZIP coverage (union of both arrays)
      const keepZips = keep.postal_codes_served || [];
      const removeZips = remove.postal_codes_served || [];
      const mergedZips = [...new Set([...keepZips, ...removeZips])].sort();

      // 3. Merge service_cities (union)
      const keepCities = keep.service_cities || [];
      const removeCities = remove.service_cities || [];
      const mergedCities = [...new Set([...keepCities, ...removeCities])].sort();

      // 4. Merge service_counties (union)
      const keepCounties = keep.service_counties || [];
      const removeCounties = remove.service_counties || [];
      const mergedCounties = [...new Set([...keepCounties, ...removeCounties])].sort();

      // 5. Update the keeper with merged coverage
      await sequelize.query(`
        UPDATE suppliers SET
          postal_codes_served = :zips,
          service_cities = :cities,
          service_counties = :counties,
          updated_at = NOW()
        WHERE id = :id
      `, {
        replacements: {
          zips: JSON.stringify(mergedZips),
          cities: JSON.stringify(mergedCities),
          counties: JSON.stringify(mergedCounties),
          id: keepId,
        },
      });

      console.log(`  Merged coverage: ${mergedZips.length} ZIPs, ${mergedCities.length} cities, ${mergedCounties.length} counties`);

      // 6. Re-assign prices from the duplicate to the keeper
      const [, priceResult] = await sequelize.query(`
        UPDATE supplier_prices SET supplier_id = :keepId
        WHERE supplier_id = :removeId
      `, {
        replacements: { keepId, removeId },
      });
      console.log(`  Re-assigned ${priceResult?.rowCount || 0} prices`);

      // 7. Deactivate the duplicate (don't delete — keeps slug/URL from 404)
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE id = :id
      `, {
        replacements: { id: removeId },
      });

      console.log(`  Deactivated duplicate: ${remove.name} (${removeId.slice(0, 8)})`);
    }

    console.log('[Migration 095] Duplicate merge complete — 21 duplicates resolved');
  },

  async down(sequelize) {
    // Re-activate the deactivated records (price reassignment is not reversed)
    const removeIds = [
      // CT
      'dd78b13c-1283-4a81-9a84-7b99781695c5', // Brazos Oil LLC
      '3eac8b73-3b28-4abb-af53-1b4b20f16d3b', // Coastal Energy CT
      '7987f73b-b2c6-4de0-8a30-33ee3340b89d', // Piro Paving & Petroleum
      // DE
      'be6699b8-77b6-422a-9cf7-16317cf992ab', // Terroco Oil DE
      // MA
      '545caf14-30ba-4477-9afd-ba0d56a56cc8', // Affordable Fuel Inc
      '1d3f6582-95c2-49ee-972e-803657376ac1', // John's Oil Service
      '49dab45b-9cd5-4ddb-8cec-332c0d2a4536', // Kelley's Oil
      '3f516e05-bc95-4290-bd05-6ccdcdad6f1d', // Springers Oil Service
      // ME
      '3cc35a1d-646b-4df7-b8f4-1243499f995b', // AJ's Discount Oil
      // NY
      '192729a4-2f53-4363-94e0-a0dbacbc70a0', // Euro Fuel Co
      '933b04ca-5fa3-4c15-8759-38cd1bc8a62e', // Family Fuel
      '3234eaf6-1521-447f-a566-dd0ffedaa513', // Chrysalis Fuel Inc
      'cb590e0a-2973-4e64-b6fb-4826d29a709b', // Jurassic Fuels
      'ad611878-298f-405f-b404-e96286e71c66', // Superior Fuel Oil
      'e5925105-6059-4b04-8e44-84f770971c5d', // State Fuel Inc
      'a04f2281-63c4-4f9b-9f40-001f669a0c1b', // Bee's Fuel Oil
      '3f6e610e-52d0-4fa9-b36e-ec074e00bcd3', // Check Oil
      '02765fb9-934d-474d-b960-de689738c6ce', // Direct Oil
      '6832c57b-3714-4e85-bfa7-1aa6ed099863', // Economy Fuel
      'd09f7d46-0667-455f-a494-4d2a29c5e971', // Hunter's Oil
      'f3e85ac1-8bc6-4a80-913c-1c3c85e15991', // Oilex Fuel
    ];

    await sequelize.query(`
      UPDATE suppliers SET active = true, updated_at = NOW()
      WHERE id IN (:ids)
    `, {
      replacements: { ids: removeIds },
    });

    console.log('[Migration 095 DOWN] Re-activated 21 deactivated duplicates (prices NOT un-reassigned)');
  },
};
