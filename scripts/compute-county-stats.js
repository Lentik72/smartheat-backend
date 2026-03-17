#!/usr/bin/env node
/**
 * Compute County Stats
 * Manual trigger for county-level price stats computation
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/compute-county-stats.js
 *   DATABASE_URL="..." node scripts/compute-county-stats.js --validate
 *
 * The --validate flag runs sanity checks comparing ZIP vs County aggregates
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const CountyStatsComputer = require('../src/services/CountyStatsComputer');

const args = process.argv.slice(2);
const validate = args.includes('--validate');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  County Stats Computer');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

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

    // Run migration if needed
    const { up: runMigration } = require('../src/migrations/059-add-county-price-stats-tables');
    await runMigration(sequelize);

    const computer = new CountyStatsComputer(sequelize, console);
    const result = await computer.compute();

    console.log('');
    if (result.success) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  ✅ Complete: ${result.updated}/${result.total} counties updated`);
      console.log(`  ⏱️  Duration: ${result.durationMs}ms`);
      console.log('═══════════════════════════════════════════════════════════');

      // Show top counties by quality (oil)
      console.log('\n📊 Top 10 Counties by Quality (Heating Oil):');
      const [topCounties] = await sequelize.query(`
        SELECT county_name, state_code, median_price, supplier_count,
               data_quality_score, percent_change_6w
        FROM county_current_stats
        WHERE fuel_type = 'heating_oil'
        ORDER BY data_quality_score DESC
        LIMIT 10
      `);

      topCounties.forEach((c, i) => {
        const trend = c.percent_change_6w ? `${c.percent_change_6w > 0 ? '+' : ''}${c.percent_change_6w}%` : 'N/A';
        console.log(`  ${i + 1}. ${c.county_name}, ${c.state_code}: $${c.median_price}/gal (${c.supplier_count} suppliers, quality: ${c.data_quality_score}, trend: ${trend})`);
      });

      // V2.12.0: Show kerosene county stats if any exist
      const [keroCounties] = await sequelize.query(`
        SELECT county_name, state_code, median_price, supplier_count
        FROM county_current_stats
        WHERE fuel_type = 'kerosene'
        ORDER BY supplier_count DESC
        LIMIT 10
      `);
      if (keroCounties.length > 0) {
        console.log(`\n🔥 Kerosene Counties (${keroCounties.length} with stats):`);
        keroCounties.forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.county_name}, ${c.state_code}: $${c.median_price}/gal (${c.supplier_count} suppliers)`);
        });
      }

      // Validation mode
      if (validate) {
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  VALIDATION: ZIP Sum vs County Aggregate');
        console.log('═══════════════════════════════════════════════════════════');

        await runValidation(sequelize);
      }
    } else {
      console.log('❌ Failed:', result.error);
    }

    await sequelize.close();
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

/**
 * Validate county aggregates against ZIP-level data
 */
async function runValidation(sequelize) {
  console.log('\n🔍 Checking Westchester County, NY...\n');

  // 1. Get county stats
  const [countyStats] = await sequelize.query(`
    SELECT median_price, supplier_count, zip_count, data_quality_score, zip_prefixes
    FROM county_current_stats
    WHERE county_name = 'Westchester' AND state_code = 'NY' AND fuel_type = 'heating_oil'
  `);

  if (countyStats.length === 0) {
    console.log('  ❌ No Westchester county stats found');
    return;
  }

  const county = countyStats[0];
  console.log('  County Stats:');
  console.log(`    Median Price: $${county.median_price}`);
  console.log(`    Suppliers: ${county.supplier_count}`);
  console.log(`    ZIP Count: ${county.zip_count}`);
  console.log(`    Quality: ${county.data_quality_score}`);
  console.log(`    ZIP Prefixes: ${JSON.stringify(county.zip_prefixes)}`);

  // 2. Get ZIP-level stats for comparison
  const [zipStats] = await sequelize.query(`
    SELECT zip_prefix, median_price, supplier_count
    FROM zip_current_stats
    WHERE zip_prefix IN (
      SELECT DISTINCT SUBSTRING(zip_code, 1, 3)
      FROM zip_to_county
      WHERE county_name = 'Westchester' AND state_code = 'NY'
    )
    ORDER BY zip_prefix
  `);

  console.log('\n  ZIP-Level Stats:');
  let totalZipSuppliers = 0;
  zipStats.forEach(z => {
    console.log(`    ${z.zip_prefix}xx: $${z.median_price}/gal (${z.supplier_count} suppliers)`);
    totalZipSuppliers += parseInt(z.supplier_count);
  });

  // 3. Sanity check: Direct query vs stored stats
  // Uses CTE to prevent row explosion (same pattern as CountyStatsComputer)
  console.log('\n  🧪 Direct Query Sanity Check:');

  const [directQuery] = await sequelize.query(`
    WITH county_suppliers AS (
      SELECT DISTINCT s.id as supplier_id
      FROM suppliers s
      JOIN jsonb_array_elements_text(s.postal_codes_served) AS zip ON true
      JOIN zip_to_county ztc ON ztc.zip_code = zip
      WHERE ztc.county_name = 'Westchester'
        AND ztc.state_code = 'NY'
        AND s.active = true
    )
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_per_gallon::numeric)::numeric(5,3) as direct_median,
      COUNT(DISTINCT cs.supplier_id) as direct_supplier_count,
      COUNT(*) as direct_data_points
    FROM supplier_prices sp
    JOIN county_suppliers cs ON cs.supplier_id = sp.supplier_id
    WHERE sp.is_valid = true
      AND sp.created_at >= DATE_TRUNC('week', NOW())
  `);

  const direct = directQuery[0];
  console.log(`    Direct median (this week): $${direct.direct_median}`);
  console.log(`    Direct suppliers: ${direct.direct_supplier_count}`);
  console.log(`    Direct data points: ${direct.direct_data_points}`);

  // 4. Compare
  console.log('\n  📊 Comparison:');
  const priceDiff = Math.abs(parseFloat(county.median_price) - parseFloat(direct.direct_median || 0));
  const supplierMatch = parseInt(county.supplier_count) === parseInt(direct.direct_supplier_count);

  console.log(`    Median price stored vs direct: $${county.median_price} vs $${direct.direct_median} (diff: $${priceDiff.toFixed(3)})`);
  console.log(`    Supplier count match: ${supplierMatch ? '✅' : '❌'} (${county.supplier_count} vs ${direct.direct_supplier_count})`);

  // 5. Important insight
  console.log('\n  ⚠️  Note on supplier counts:');
  console.log(`    ZIP-level sum: ${totalZipSuppliers} (may include duplicates across ZIP prefixes)`);
  console.log(`    County aggregate: ${county.supplier_count} (unique suppliers)`);
  console.log('    County count should be LESS than or EQUAL to ZIP sum (correct behavior)');

  if (parseInt(county.supplier_count) <= totalZipSuppliers) {
    console.log('    ✅ This is mathematically correct');
  } else {
    console.log('    ❌ ERROR: County count should not exceed ZIP sum');
  }
}

main();
