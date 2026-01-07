#!/usr/bin/env node
/**
 * Admin CLI: Bulk import prices from JSON file
 *
 * Usage:
 *   node scripts/import-prices.js prices.json
 *
 * JSON format:
 *   [
 *     { "supplier": "Domino Fuel", "price": 2.79, "source": "fuelsnap" },
 *     { "supplier": "Suffolk Oil", "price": 2.85, "source": "facebook" }
 *   ]
 *
 * Run with DATABASE_URL environment variable:
 *   DATABASE_URL="postgresql://..." node scripts/import-prices.js prices.json
 */

const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const [,, jsonFile] = process.argv;

async function importPrices() {
  // Validate arguments
  if (!jsonFile) {
    console.log('Usage: node scripts/import-prices.js <prices.json>');
    console.log('');
    console.log('JSON format:');
    console.log('  [');
    console.log('    { "supplier": "Domino Fuel", "price": 2.79, "source": "fuelsnap" },');
    console.log('    { "supplier": "Suffolk Oil", "price": 2.85, "source": "facebook" }');
    console.log('  ]');
    process.exit(1);
  }

  // Read and parse JSON file
  const filePath = path.resolve(jsonFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  let prices;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    prices = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Invalid JSON: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(prices) || prices.length === 0) {
    console.error('❌ JSON must be a non-empty array of price objects');
    process.exit(1);
  }

  console.log(`📄 Loaded ${prices.length} prices from ${path.basename(filePath)}`);

  // Validate each entry
  const errors = [];
  prices.forEach((p, i) => {
    if (!p.supplier) errors.push(`Row ${i + 1}: missing "supplier"`);
    if (!p.price || isNaN(p.price)) errors.push(`Row ${i + 1}: missing or invalid "price"`);
    if (!p.source) errors.push(`Row ${i + 1}: missing "source"`);
    if (p.price < 2.00 || p.price > 5.00) errors.push(`Row ${i + 1}: price $${p.price} outside range ($2.00-$5.00)`);
  });

  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach(e => console.error(`   ${e}`));
    process.exit(1);
  }

  // Connect to database
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    console.log('');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let added = 0;
    let skipped = 0;
    const notFound = [];

    for (const entry of prices) {
      // Find supplier by name (fuzzy match)
      const [suppliers] = await sequelize.query(`
        SELECT id, name, city, state
        FROM suppliers
        WHERE active = true
        AND allow_price_display = true
        AND name ILIKE $1
        ORDER BY name
        LIMIT 2
      `, {
        bind: [`%${entry.supplier}%`]
      });

      if (suppliers.length === 0) {
        notFound.push(entry.supplier);
        skipped++;
        continue;
      }

      if (suppliers.length > 1) {
        console.log(`⚠️  Multiple matches for "${entry.supplier}" - skipping`);
        skipped++;
        continue;
      }

      const supplier = suppliers[0];

      // Insert price
      await sequelize.query(`
        INSERT INTO supplier_prices (
          id, supplier_id, price_per_gallon, min_gallons, fuel_type,
          source_type, source_url, scraped_at, expires_at, is_valid, notes,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, 150, 'heating_oil',
          'manual', $3, $4, $5, true, $6,
          NOW(), NOW()
        )
      `, {
        bind: [
          supplier.id,
          entry.price,
          entry.source,
          now.toISOString(),
          expiresAt.toISOString(),
          `Bulk import from ${entry.source}`
        ]
      });

      console.log(`✅ ${supplier.name}: $${entry.price.toFixed(2)}/gal`);
      added++;
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`📊 Import complete: ${added} added, ${skipped} skipped`);

    if (notFound.length > 0) {
      console.log('');
      console.log('⚠️  Suppliers not found:');
      notFound.forEach(s => console.log(`   - ${s}`));
    }

    // Show summary
    const [count] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source_type = 'scraped' THEN 1 END) as scraped,
        COUNT(CASE WHEN source_type = 'manual' THEN 1 END) as manual
      FROM supplier_prices
      WHERE is_valid = true
      AND expires_at > NOW()
    `);
    console.log('');
    console.log(`📊 Active prices: ${count[0].total} total (${count[0].scraped} scraped, ${count[0].manual} manual)`);

    await sequelize.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

importPrices();
