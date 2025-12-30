#!/usr/bin/env node
/**
 * generate-bundled-suppliers.js
 * V2.0.0: Unified matching - generates both suppliers AND ZIP database
 *
 * Generates encrypted files for iOS app bundling:
 * 1. SuppliersDirectory.enc - suppliers with serviceCities/serviceCounties
 * 2. ZipDatabase.enc - ZIP → city/county/state mapping
 *
 * Usage:
 *   node scripts/generate-bundled-suppliers.js
 *
 * Or with DATABASE_URL:
 *   DATABASE_URL="postgresql://..." node scripts/generate-bundled-suppliers.js
 *
 * Output:
 *   - /tmp/SuppliersDirectory.json (plain JSON for reference)
 *   - /tmp/ZipDatabase.json (plain JSON for reference)
 *   - SmartHeatIOS/Resources/SuppliersDirectory.enc (encrypted for iOS bundle)
 *   - SmartHeatIOS/Resources/ZipDatabase.enc (encrypted for iOS bundle)
 */

const { Sequelize } = require('sequelize');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// iOS app encryption key (must match SupplierDataEncryption.swift)
// Key parts: SmH3at + 10S_ + Sup + pL1er + _D1r + 3ct0ry + v14.4
const ENCRYPTION_PASSPHRASE = 'SmH3at10S_SuppL1er_D1r3ct0ryv14.4';

// Output paths
const IOS_RESOURCES_PATH = path.join(__dirname, '../../SmartHeatIOS/Resources/SuppliersDirectory.enc');
const IOS_ZIPDB_PATH = path.join(__dirname, '../../SmartHeatIOS/Resources/ZipDatabase.enc');
const JSON_REFERENCE_PATH = '/tmp/SuppliersDirectory.json';
const ZIPDB_REFERENCE_PATH = '/tmp/ZipDatabase.json';

// Load ZIP database from backend
const zipDatabase = require('../src/data/zip-database.json');

/**
 * Encrypt data using AES-256-GCM (matching iOS CryptoKit)
 */
function encryptData(jsonData) {
  const key = crypto.createHash('sha256').update(ENCRYPTION_PASSPHRASE).digest();
  const iv = crypto.randomBytes(12); // 12-byte nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(jsonData, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // Combined format: nonce (12) + ciphertext + tag (16)
  // This matches CryptoKit's AES.GCM.SealedBox.combined format
  return Buffer.concat([iv, encrypted, tag]);
}

async function main() {
  console.log('=== Generate Bundled Suppliers ===\n');

  // Connect to database
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable not set');
    console.error('Usage: DATABASE_URL="postgresql://..." node scripts/generate-bundled-suppliers.js');
    process.exit(1);
  }

  const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('Connected to database');

    // Fetch active suppliers (with new fields for unified matching)
    const [suppliers] = await sequelize.query(`
      SELECT
        id,
        name,
        phone,
        email,
        website,
        address_line1 as "addressLine1",
        city,
        state,
        postal_codes_served as "postalCodesServed",
        service_cities as "serviceCities",
        service_counties as "serviceCounties",
        service_area_radius as "serviceAreaRadius",
        notes
      FROM suppliers
      WHERE active = true
      ORDER BY name;
    `);

    console.log(`Found ${suppliers.length} active suppliers\n`);

    if (suppliers.length === 0) {
      console.error('ERROR: No active suppliers found. Aborting.');
      process.exit(1);
    }

    // Transform to DirectorySupplier format (matching iOS model with unified matching fields)
    const formatted = suppliers.map(s => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email || null,
      website: s.website || null,
      addressLine1: s.addressLine1 || null,
      city: s.city,
      state: s.state,
      postalCodesServed: s.postalCodesServed || [],
      serviceCities: s.serviceCities || [],
      serviceCounties: s.serviceCounties || [],
      serviceAreaRadius: s.serviceAreaRadius || 25,
      notes: s.notes || null
    }));

    // =====================
    // 1. SUPPLIERS DIRECTORY
    // =====================
    const jsonData = JSON.stringify(formatted, null, 2);

    // Save plain JSON for reference
    fs.writeFileSync(JSON_REFERENCE_PATH, jsonData);
    console.log(`Saved ${JSON_REFERENCE_PATH} (${jsonData.length} bytes)`);

    // Encrypt suppliers
    const suppliersEncrypted = encryptData(jsonData);

    // Ensure directory exists
    const outputDir = path.dirname(IOS_RESOURCES_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save encrypted suppliers file
    fs.writeFileSync(IOS_RESOURCES_PATH, suppliersEncrypted);
    console.log(`Saved ${IOS_RESOURCES_PATH} (${suppliersEncrypted.length} bytes)`);

    // =====================
    // 2. ZIP DATABASE
    // =====================
    const zipDbJson = JSON.stringify(zipDatabase, null, 2);
    const zipCount = Object.keys(zipDatabase).length;

    // Save plain JSON for reference
    fs.writeFileSync(ZIPDB_REFERENCE_PATH, zipDbJson);
    console.log(`Saved ${ZIPDB_REFERENCE_PATH} (${zipDbJson.length} bytes, ${zipCount} ZIPs)`);

    // Encrypt ZIP database
    const zipDbEncrypted = encryptData(zipDbJson);

    // Save encrypted ZIP database file
    fs.writeFileSync(IOS_ZIPDB_PATH, zipDbEncrypted);
    console.log(`Saved ${IOS_ZIPDB_PATH} (${zipDbEncrypted.length} bytes)`);

    // Print summary
    console.log('\n=== Suppliers in Bundle ===');
    formatted.forEach(s => {
      const zips = s.postalCodesServed.length;
      const cities = s.serviceCities?.length || 0;
      const counties = s.serviceCounties?.length || 0;
      console.log(`  ${s.name} (${s.city}, ${s.state}) - ${zips} ZIPs, ${cities} cities, ${counties} counties`);
    });

    // Count unique counties in ZIP database
    const uniqueCounties = [...new Set(Object.values(zipDatabase).map(z => z.county))];
    const uniqueStates = [...new Set(Object.values(zipDatabase).map(z => z.state))];

    console.log('\n=== ZIP Database ===');
    console.log(`Total ZIPs: ${zipCount}`);
    console.log(`Counties: ${uniqueCounties.length} (${uniqueCounties.slice(0, 5).join(', ')}...)`);
    console.log(`States: ${uniqueStates.join(', ')}`);

    console.log('\n=== Summary ===');
    console.log(`Suppliers: ${formatted.length}`);
    console.log(`ZIP codes: ${zipCount}`);
    console.log(`Suppliers encrypted: ${suppliersEncrypted.length} bytes`);
    console.log(`ZIP DB encrypted: ${zipDbEncrypted.length} bytes`);

    console.log('\n SUCCESS: Bundled files updated');
    console.log('Files generated:');
    console.log(`  - ${IOS_RESOURCES_PATH}`);
    console.log(`  - ${IOS_ZIPDB_PATH}`);
    console.log('\nNext: Rebuild iOS app to include new bundles');

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
