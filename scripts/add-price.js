#!/usr/bin/env node
/**
 * Admin CLI: Add manual price for a supplier
 *
 * Usage:
 *   node scripts/add-price.js "Supplier Name" 2.89 "fuelsnap"
 *   node scripts/add-price.js "Domino Fuel" 2.79 "facebook"
 *   node scripts/add-price.js "Suffolk Oil" 2.85 "cashheatingoil.com"
 *
 * Run with DATABASE_URL environment variable:
 *   DATABASE_URL="postgresql://..." node scripts/add-price.js "Domino Fuel" 2.79 "fuelsnap"
 */

const { Sequelize, Op } = require('sequelize');
require('dotenv').config();

const [,, supplierName, priceArg, source] = process.argv;

async function addPrice() {
  // Validate arguments
  if (!supplierName || !priceArg || !source) {
    console.log('Usage: node scripts/add-price.js "Supplier Name" <price> <source>');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/add-price.js "Domino Fuel" 2.79 "fuelsnap"');
    console.log('  node scripts/add-price.js "Suffolk Oil" 2.85 "facebook"');
    console.log('  node scripts/add-price.js "Cash Oil" 2.89 "cashheatingoil.com"');
    process.exit(1);
  }

  const price = parseFloat(priceArg);
  if (isNaN(price) || price < 2.00 || price > 5.00) {
    console.error(`❌ Invalid price: $${priceArg}`);
    console.error('   Price must be between $2.00 and $5.00');
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

    // Find supplier by name (fuzzy match)
    const [suppliers] = await sequelize.query(`
      SELECT id, name, city, state, website
      FROM suppliers
      WHERE active = true
      AND allow_price_display = true
      AND name ILIKE $1
      ORDER BY name
      LIMIT 5
    `, {
      bind: [`%${supplierName}%`]
    });

    if (suppliers.length === 0) {
      console.error(`❌ No active supplier found matching: "${supplierName}"`);
      console.log('');
      console.log('Try searching with a different name or check spelling.');
      await sequelize.close();
      process.exit(1);
    }

    if (suppliers.length > 1) {
      console.log(`⚠️  Multiple suppliers found matching "${supplierName}":`);
      suppliers.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.name} (${s.city}, ${s.state})`);
      });
      console.log('');
      console.log('Please use a more specific name.');
      await sequelize.close();
      process.exit(1);
    }

    const supplier = suppliers[0];
    console.log(`📍 Found: ${supplier.name} (${supplier.city}, ${supplier.state})`);

    // Check for existing recent price
    const [existing] = await sequelize.query(`
      SELECT id, price_per_gallon, source_type, source_url, scraped_at
      FROM supplier_prices
      WHERE supplier_id = $1
      AND is_valid = true
      AND expires_at > NOW()
      ORDER BY scraped_at DESC
      LIMIT 1
    `, {
      bind: [supplier.id]
    });

    if (existing.length > 0) {
      const oldPrice = existing[0];
      console.log(`⚠️  Existing price: $${oldPrice.price_per_gallon}/gal (${oldPrice.source_type} from ${oldPrice.source_url})`);
      console.log(`   Adding new price will supersede this one.`);
    }

    // Insert new price
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

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
        price,
        source,
        now.toISOString(),
        expiresAt.toISOString(),
        `Manually added by admin from ${source}`
      ]
    });

    console.log('');
    console.log(`✅ Added: ${supplier.name} @ $${price.toFixed(2)}/gal`);
    console.log(`   Source: ${source}`);
    console.log(`   Expires: ${expiresAt.toLocaleString()}`);

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

addPrice();
