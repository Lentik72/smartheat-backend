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
const BACKUP_DIR = '/tmp/supplier-backups';

// Key ZIPs to validate coverage (high-value areas)
const KEY_ZIPS_TO_VALIDATE = ['10549', '10601', '10701', '11701', '11550'];
const MIN_SUPPLIERS_THRESHOLD = 20; // Warn if supplier count drops below this

// Load ZIP database from backend
const zipDatabase = require('../src/data/zip-database.json');

/**
 * Decrypt data for comparison (matching iOS CryptoKit)
 */
function decryptData(encryptedBuffer) {
  const key = crypto.createHash('sha256').update(ENCRYPTION_PASSPHRASE).digest();
  const iv = encryptedBuffer.subarray(0, 12);
  const tag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const encrypted = encryptedBuffer.subarray(12, encryptedBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

/**
 * Create timestamped backup of current files
 */
function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const backups = [];

  if (fs.existsSync(IOS_RESOURCES_PATH)) {
    const backupPath = path.join(BACKUP_DIR, `SuppliersDirectory_${timestamp}.enc`);
    fs.copyFileSync(IOS_RESOURCES_PATH, backupPath);
    backups.push(backupPath);
  }

  if (fs.existsSync(IOS_ZIPDB_PATH)) {
    const backupPath = path.join(BACKUP_DIR, `ZipDatabase_${timestamp}.enc`);
    fs.copyFileSync(IOS_ZIPDB_PATH, backupPath);
    backups.push(backupPath);
  }

  return backups;
}

/**
 * Load previous suppliers for comparison
 */
function loadPreviousSuppliers() {
  if (!fs.existsSync(IOS_RESOURCES_PATH)) {
    return null;
  }
  try {
    const data = fs.readFileSync(IOS_RESOURCES_PATH);
    return decryptData(data);
  } catch (e) {
    console.warn('Warning: Could not decrypt previous suppliers file');
    return null;
  }
}

/**
 * Validate new data against safeguards
 */
function validateData(newSuppliers, previousSuppliers) {
  const warnings = [];
  const errors = [];

  // Check minimum supplier count
  if (newSuppliers.length < MIN_SUPPLIERS_THRESHOLD) {
    errors.push(`Supplier count (${newSuppliers.length}) is below minimum threshold (${MIN_SUPPLIERS_THRESHOLD})`);
  }

  // Check key ZIP coverage
  for (const zip of KEY_ZIPS_TO_VALIDATE) {
    const serving = newSuppliers.filter(s => s.postalCodesServed && s.postalCodesServed.includes(zip));
    if (serving.length === 0) {
      warnings.push(`No suppliers serving key ZIP ${zip}`);
    } else if (serving.length < 3) {
      warnings.push(`Only ${serving.length} supplier(s) serving key ZIP ${zip}`);
    }
  }

  // Compare with previous if available
  if (previousSuppliers) {
    const prevNames = new Set(previousSuppliers.map(s => s.name));
    const newNames = new Set(newSuppliers.map(s => s.name));

    const removed = [...prevNames].filter(n => !newNames.has(n));
    if (removed.length > 0) {
      warnings.push(`${removed.length} supplier(s) removed: ${removed.slice(0, 5).join(', ')}${removed.length > 5 ? '...' : ''}`);
    }

    // Check for significant ZIP coverage drops
    for (const zip of KEY_ZIPS_TO_VALIDATE) {
      const prevServing = previousSuppliers.filter(s => s.postalCodesServed && s.postalCodesServed.includes(zip));
      const newServing = newSuppliers.filter(s => s.postalCodesServed && s.postalCodesServed.includes(zip));

      if (prevServing.length > 0 && newServing.length < prevServing.length * 0.5) {
        errors.push(`ZIP ${zip} coverage dropped from ${prevServing.length} to ${newServing.length} suppliers (>50% loss)`);
      }
    }
  }

  return { warnings, errors };
}

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

  // Check for --force flag to skip validation errors
  const forceMode = process.argv.includes('--force');

  // Create backup of existing files
  console.log('Creating backup of existing files...');
  const backups = createBackup();
  if (backups.length > 0) {
    console.log(`Backed up ${backups.length} file(s) to ${BACKUP_DIR}`);
  } else {
    console.log('No existing files to backup');
  }

  // Load previous suppliers for comparison
  const previousSuppliers = loadPreviousSuppliers();
  if (previousSuppliers) {
    console.log(`Previous bundle: ${previousSuppliers.length} suppliers`);
  }
  console.log();

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
    // NOTE: Validation happens AFTER transformation below
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
    // SAFEGUARD VALIDATION
    // =====================
    console.log('=== Validating Data ===');
    const { warnings, errors } = validateData(formatted, previousSuppliers);

    if (warnings.length > 0) {
      console.log('\nWARNINGS:');
      warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (errors.length > 0) {
      console.log('\nERRORS:');
      errors.forEach(e => console.log(`  - ${e}`));

      if (!forceMode) {
        console.log('\nABORTED: Validation errors detected.');
        console.log('Use --force flag to override and proceed anyway.');
        console.log(`Backups available at: ${BACKUP_DIR}`);
        process.exit(1);
      } else {
        console.log('\nWARNING: Proceeding despite errors (--force flag used)');
      }
    }

    if (warnings.length === 0 && errors.length === 0) {
      console.log('All validations passed');
    }
    console.log();

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
