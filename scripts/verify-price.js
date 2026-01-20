#!/usr/bin/env node
/**
 * Verify Price Script
 *
 * Use this after calling a supplier to manually update their price.
 *
 * Usage:
 *   node scripts/verify-price.js "Supplier Name" 2.99
 *   node scripts/verify-price.js "Supplier Name" 2.99 --exclusive
 *   node scripts/verify-price.js "Supplier Name" 2.99 --note "Cash price, mention HomeHeat"
 *   node scripts/verify-price.js --list              # List all suppliers
 *   node scripts/verify-price.js --search "manor"    # Search suppliers
 *
 * Examples:
 *   node scripts/verify-price.js "Manor Fuels" 2.99
 *   node scripts/verify-price.js "Buy Rite Fuel" 2.89 --exclusive --note "HomeHeat deal"
 */

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  }
});

async function listSuppliers() {
  const [suppliers] = await sequelize.query(`
    SELECT s.name, s.city, s.state, s.phone,
           sp.price_per_gallon, sp.source_type, sp.verified_at
    FROM suppliers s
    LEFT JOIN (
      SELECT DISTINCT ON (supplier_id) *
      FROM supplier_prices
      ORDER BY supplier_id, scraped_at DESC
    ) sp ON s.id = sp.supplier_id
    WHERE s.active = true
    ORDER BY s.state, s.name
  `);

  console.log('\n=== ALL ACTIVE SUPPLIERS ===\n');
  let currentState = '';
  suppliers.forEach(s => {
    if (s.state !== currentState) {
      currentState = s.state;
      console.log(`\n--- ${s.state} ---`);
    }
    const price = s.price_per_gallon ? `$${parseFloat(s.price_per_gallon).toFixed(2)}` : 'no price';
    const verified = s.verified_at ? ' ✓' : '';
    console.log(`  ${s.name} (${s.city}) - ${price}${verified}`);
    if (s.phone) console.log(`    Phone: ${s.phone}`);
  });
  console.log(`\nTotal: ${suppliers.length} suppliers`);
}

async function searchSuppliers(term) {
  const [suppliers] = await sequelize.query(`
    SELECT s.name, s.city, s.state, s.phone,
           sp.price_per_gallon, sp.source_type
    FROM suppliers s
    LEFT JOIN (
      SELECT DISTINCT ON (supplier_id) *
      FROM supplier_prices
      ORDER BY supplier_id, scraped_at DESC
    ) sp ON s.id = sp.supplier_id
    WHERE s.active = true
      AND (LOWER(s.name) LIKE LOWER($1) OR LOWER(s.city) LIKE LOWER($1))
    ORDER BY s.name
  `, { bind: [`%${term}%`] });

  console.log(`\n=== SEARCH: "${term}" ===\n`);
  if (suppliers.length === 0) {
    console.log('No suppliers found.');
    return;
  }
  suppliers.forEach(s => {
    const price = s.price_per_gallon ? `$${parseFloat(s.price_per_gallon).toFixed(2)}` : 'no price';
    console.log(`${s.name} (${s.city}, ${s.state}) - ${price}`);
    console.log(`  Phone: ${s.phone || 'N/A'}`);
  });
}

async function verifyPrice(supplierName, price, options = {}) {
  const { exclusive = false, note = null } = options;

  // Find supplier
  const [suppliers] = await sequelize.query(`
    SELECT id, name, city, state, phone
    FROM suppliers
    WHERE LOWER(name) = LOWER($1) AND active = true
  `, { bind: [supplierName] });

  if (suppliers.length === 0) {
    // Try partial match
    const [partialMatch] = await sequelize.query(`
      SELECT id, name, city, state, phone
      FROM suppliers
      WHERE LOWER(name) LIKE LOWER($1) AND active = true
    `, { bind: [`%${supplierName}%`] });

    if (partialMatch.length === 0) {
      console.error(`\n❌ Supplier not found: "${supplierName}"`);
      console.log('\nTry: node scripts/verify-price.js --search "' + supplierName.split(' ')[0] + '"');
      return false;
    }

    if (partialMatch.length > 1) {
      console.error(`\n⚠️  Multiple matches for "${supplierName}":`);
      partialMatch.forEach(s => console.log(`  - ${s.name} (${s.city}, ${s.state})`));
      console.log('\nPlease use the exact name.');
      return false;
    }

    suppliers[0] = partialMatch[0];
  }

  const supplier = suppliers[0];
  const priceNum = parseFloat(price);

  // Validate price
  if (isNaN(priceNum) || priceNum < 1.50 || priceNum > 8.00) {
    console.error(`\n❌ Invalid price: ${price}`);
    console.log('Price must be between $1.50 and $8.00');
    return false;
  }

  // Get current price for comparison
  const [currentPrices] = await sequelize.query(`
    SELECT price_per_gallon, source_type, scraped_at
    FROM supplier_prices
    WHERE supplier_id = $1
    ORDER BY scraped_at DESC
    LIMIT 1
  `, { bind: [supplier.id] });

  const currentPrice = currentPrices[0]?.price_per_gallon
    ? parseFloat(currentPrices[0].price_per_gallon)
    : null;

  // Insert new verified price
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  await sequelize.query(`
    INSERT INTO supplier_prices (
      id, supplier_id, price_per_gallon, min_gallons,
      source_type, scraped_at, expires_at, is_valid,
      verified_at, verification_method, verified_by,
      exclusive_price, notes, price_change, previous_price
    ) VALUES (
      gen_random_uuid(), $1, $2, 150,
      'manual', $3, $4, true,
      $3, 'phone', 'Leo',
      $5, $6, $7, $8
    )
  `, {
    bind: [
      supplier.id,
      priceNum,
      now,
      expiresAt,
      exclusive,
      note,
      currentPrice ? (priceNum - currentPrice) : null,
      currentPrice
    ]
  });

  // Output
  console.log('\n✅ PRICE VERIFIED\n');
  console.log(`Supplier:    ${supplier.name}`);
  console.log(`Location:    ${supplier.city}, ${supplier.state}`);
  console.log(`Phone:       ${supplier.phone || 'N/A'}`);
  console.log(`New Price:   $${priceNum.toFixed(2)}/gal`);
  if (currentPrice) {
    const diff = priceNum - currentPrice;
    const diffStr = diff > 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
    console.log(`Previous:    $${currentPrice.toFixed(2)}/gal (${diffStr})`);
  }
  console.log(`Exclusive:   ${exclusive ? 'Yes (HomeHeat deal)' : 'No'}`);
  if (note) console.log(`Note:        ${note}`);
  console.log(`Verified:    ${now.toLocaleString()}`);
  console.log(`Expires:     ${expiresAt.toLocaleString()}`);

  return true;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node scripts/verify-price.js "Supplier Name" PRICE [options]

Options:
  --exclusive    Mark as HomeHeat-exclusive deal
  --note "..."   Add a note (e.g., "mention HomeHeat for this price")
  --list         List all active suppliers
  --search TERM  Search suppliers by name or city

Examples:
  node scripts/verify-price.js "Manor Fuels" 2.99
  node scripts/verify-price.js "Buy Rite Fuel" 2.89 --exclusive
  node scripts/verify-price.js "Superior Fuel" 3.15 --note "Cash only"
  node scripts/verify-price.js --list
  node scripts/verify-price.js --search "westchester"
    `);
    process.exit(0);
  }

  try {
    if (args.includes('--list')) {
      await listSuppliers();
    } else if (args.includes('--search')) {
      const searchIdx = args.indexOf('--search');
      const term = args[searchIdx + 1];
      if (!term) {
        console.error('Please provide a search term');
        process.exit(1);
      }
      await searchSuppliers(term);
    } else {
      const supplierName = args[0];
      const price = args[1];

      if (!supplierName || !price) {
        console.error('Please provide supplier name and price');
        console.log('Usage: node scripts/verify-price.js "Supplier Name" 2.99');
        process.exit(1);
      }

      const options = {
        exclusive: args.includes('--exclusive'),
        note: null
      };

      const noteIdx = args.indexOf('--note');
      if (noteIdx !== -1 && args[noteIdx + 1]) {
        options.note = args[noteIdx + 1];
      }

      const success = await verifyPrice(supplierName, price, options);
      if (!success) process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
