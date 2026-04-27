/**
 * Known-answer tests for fuel-config.js cost engine.
 * Run: node src/data/fuel-config.test.js
 *
 * No test framework required — plain assertions with clear output.
 */

const {
  FUELS,
  costPerMMBTU,
  annualHeatingCost,
  monthlyHeatingCost,
  paybackYears,
  getFuel,
  fuelKeys,
} = require('./fuel-config');

let passed = 0;
let failed = 0;

function assert(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label} — ${detail}`);
  }
}

function approx(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  assert(
    diff <= tolerance,
    label,
    `expected ~${expected}, got ${actual} (diff ${diff.toFixed(4)}, tolerance ${tolerance})`
  );
}

// --- costPerMMBTU ---

console.log('\ncostPerMMBTU:');

// Heating oil at $3.72/gal
// effective BTU = 138500 * 0.85 = 117725
// cost = 3.72 / (117725 / 1e6) = 3.72 / 0.117725 = ~31.60
approx(costPerMMBTU('heating-oil', 3.72), 31.60, 0.1, 'oil at $3.72 → ~$31.6/MMBTU');

// Heat pump at $0.24/kWh
// effective BTU = 3.0 * 3412 = 10236
// cost = 0.24 / (10236 / 1e6) = 0.24 / 0.010236 = ~23.45
approx(costPerMMBTU('heat-pump', 0.24), 23.45, 0.1, 'heat pump at $0.24 → ~$23.4/MMBTU');

// Natural gas at $1.20/therm
// effective BTU = 100000 * 0.93 = 93000
// cost = 1.20 / (93000 / 1e6) = 1.20 / 0.093 = ~12.90
approx(costPerMMBTU('natural-gas', 1.20), 12.90, 0.1, 'gas at $1.20 → ~$12.9/MMBTU');

// Propane at $2.50/gal
// effective BTU = 91500 * 0.90 = 82350
// cost = 2.50 / (82350 / 1e6) = 2.50 / 0.08235 = ~30.36
approx(costPerMMBTU('propane', 2.50), 30.36, 0.1, 'propane at $2.50 → ~$30.4/MMBTU');

// Electric baseboard at $0.24/kWh (COP = 1.0)
// effective BTU = 1.0 * 3412 = 3412
// cost = 0.24 / (3412 / 1e6) = 0.24 / 0.003412 = ~70.34
approx(costPerMMBTU('electric-baseboard', 0.24), 70.34, 0.1, 'electric at $0.24 → ~$70.3/MMBTU');

// --- annualHeatingCost ---

console.log('\nannualHeatingCost:');

// Westchester, NY: ~5200 HDD, default heatLossFactor 14000
// annual BTU = 5200 * 14000 = 72,800,000
// oil cost = (72800000 / 1e6) * 31.60 = 72.8 * 31.60 = ~2300
const oilAnnual = annualHeatingCost('heating-oil', 3.72, 5200);
approx(oilAnnual, 2300, 50, 'oil annual in Westchester (~5200 HDD) → ~$2300');

// Heat pump same location
// cost = 72.8 * 23.45 = ~1707
const hpAnnual = annualHeatingCost('heat-pump', 0.24, 5200);
approx(hpAnnual, 1707, 50, 'heat pump annual in Westchester → ~$1707');

// Buffalo, NY: ~6500 HDD — should be notably more than Westchester
const oilBuffalo = annualHeatingCost('heating-oil', 3.72, 6500);
assert(oilBuffalo > oilAnnual * 1.2, 'Buffalo costs > 20% more than Westchester', `${oilBuffalo} vs ${oilAnnual}`);

// --- monthlyHeatingCost ---

console.log('\nmonthlyHeatingCost:');

const oilMonthly = monthlyHeatingCost('heating-oil', 3.72, 5200);
approx(oilMonthly, oilAnnual / 6, 1, 'monthly = annual / 6');

// --- paybackYears ---

console.log('\npaybackYears:');

const prices = {
  'heating-oil': 3.72,
  'heat-pump': 0.24,
  'natural-gas': 1.20,
  'electric-baseboard': 0.24,
};

// Oil → heat pump payback
// Savings = oilAnnual - hpAnnual ≈ 2300 - 1707 = ~593
// Install = (7000 + 15000) / 2 = 11000
// Payback = 11000 / 593 ≈ 18.5 years
const pb = paybackYears('heating-oil', 'heat-pump', prices, 5200);
approx(pb, 18.5, 1.5, 'oil→heat pump payback ~18.5 years');

// Oil → natural gas: install cost is 0 → payback = 0
const pbGas = paybackYears('heating-oil', 'natural-gas', prices, 5200);
assert(pbGas === 0, 'oil→gas payback = 0 (no install cost)', `got ${pbGas}`);

// Electric baseboard → heat pump: electric is very expensive, payback should be short
const pbElecHP = paybackYears('electric-baseboard', 'heat-pump', {
  'electric-baseboard': 0.24,
  'heat-pump': 0.24,
}, 5200);
approx(pbElecHP, 3.2, 0.5, 'electric→heat pump payback ~3.2 years (big savings)');

// --- Edge cases ---

console.log('\nEdge cases:');

try {
  costPerMMBTU('unknown-fuel', 3.00);
  assert(false, 'throws on unknown fuel', 'did not throw');
} catch (e) {
  assert(e.message.includes('Unknown fuel'), 'throws on unknown fuel', e.message);
}

try {
  costPerMMBTU('heating-oil', -1);
  assert(false, 'throws on negative price', 'did not throw');
} catch (e) {
  assert(e.message.includes('Invalid price'), 'throws on negative price', e.message);
}

try {
  costPerMMBTU('heating-oil', 0);
  assert(false, 'throws on zero price', 'did not throw');
} catch (e) {
  assert(e.message.includes('Invalid price'), 'throws on zero price', e.message);
}

// getFuel and fuelKeys
assert(getFuel('heating-oil').label === 'Heating Oil', 'getFuel returns correct entry', '');
assert(fuelKeys().length === 6, 'fuelKeys returns 6 fuels', `got ${fuelKeys().length}`);

// --- Summary ---

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
