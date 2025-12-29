#!/usr/bin/env node
/**
 * generate-bundled-suppliers.js
 *
 * Generates the encrypted SuppliersDirectory.enc file for iOS app bundling.
 * Run this script whenever suppliers are added/removed/updated in the database.
 *
 * Usage:
 *   node scripts/generate-bundled-suppliers.js
 *
 * Or with DATABASE_URL:
 *   DATABASE_URL="postgresql://..." node scripts/generate-bundled-suppliers.js
 *
 * Output:
 *   - /tmp/SuppliersDirectory.json (plain JSON for reference)
 *   - SmartHeatIOS/Resources/SuppliersDirectory.enc (encrypted for iOS bundle)
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
const JSON_REFERENCE_PATH = '/tmp/SuppliersDirectory.json';

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

    // Fetch active suppliers
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

    // Transform to DirectorySupplier format (matching iOS model)
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
      serviceAreaRadius: s.serviceAreaRadius || 25,
      notes: s.notes || null
    }));

    // Generate JSON
    const jsonData = JSON.stringify(formatted, null, 2);

    // Save plain JSON for reference
    fs.writeFileSync(JSON_REFERENCE_PATH, jsonData);
    console.log(`Saved ${JSON_REFERENCE_PATH} (${jsonData.length} bytes)`);

    // Encrypt using AES-256-GCM (matching iOS CryptoKit implementation)
    const key = crypto.createHash('sha256').update(ENCRYPTION_PASSPHRASE).digest();
    const iv = crypto.randomBytes(12); // 12-byte nonce for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(jsonData, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combined format: nonce (12) + ciphertext + tag (16)
    // This matches CryptoKit's AES.GCM.SealedBox.combined format
    const combined = Buffer.concat([iv, encrypted, tag]);

    // Ensure directory exists
    const outputDir = path.dirname(IOS_RESOURCES_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save encrypted file
    fs.writeFileSync(IOS_RESOURCES_PATH, combined);
    console.log(`Saved ${IOS_RESOURCES_PATH} (${combined.length} bytes)`);

    // Print summary
    console.log('\n=== Suppliers in Bundle ===');
    formatted.forEach(s => {
      const zips = s.postalCodesServed.length;
      console.log(`  ${s.name} (${s.city}, ${s.state}) - ${zips} ZIPs`);
    });

    console.log('\n=== Summary ===');
    console.log(`Total suppliers: ${formatted.length}`);
    console.log(`States: ${[...new Set(formatted.map(s => s.state))].join(', ')}`);
    console.log(`JSON size: ${jsonData.length} bytes`);
    console.log(`Encrypted size: ${combined.length} bytes`);

    console.log('\n SUCCESS: Bundled supplier file updated');
    console.log('Next: Rebuild iOS app to include new bundle');

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
