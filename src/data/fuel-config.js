/**
 * Fuel Configuration & Cost Engine
 * V1.0.0: Foundation for multi-fuel cost comparisons
 *
 * All cost calculations flow through this module. A wrong constant
 * here silently corrupts every page, calculator, and API response.
 *
 * Formulas:
 *   Combustion fuels: costPerMMBTU = price / (efficiency × btuPerUnit / 1e6)
 *   Electric (COP):   costPerMMBTU = price / (cop × btuPerUnit / 1e6)
 *   Annual cost:      HDD × heatLossFactor × costPerBTU
 *
 * Default heatLossFactor: 7 BTU/sq-ft/HDD for a typical 2,000 sq-ft home
 * = 14,000 BTU/HDD. Not user-configurable in Phase A.
 */

const DEFAULT_HEAT_LOSS_FACTOR = 14000; // BTU per HDD (2,000 sq-ft × 7 BTU/sq-ft/HDD)
const HEATING_MONTHS = 6; // Oct–Mar for monthly cost estimate

// Per-fuel filter ranges (minPrice/maxPrice) live in scripts/generate-seo-pages.js#FUEL_CONFIGS; this module owns cost-engine constants only.
const FUELS = {
  'heating-oil': {
    label: 'Heating Oil',
    slug: 'oil',
    unit: 'gallon',
    btuPerUnit: 138500,
    efficiency: 0.85,
    installCost: 0,
    category: 'liquid',
  },
  'kerosene': {
    label: 'K-1 Kerosene',
    slug: 'kerosene',
    unit: 'gallon',
    btuPerUnit: 135000,
    efficiency: 0.87,
    installCost: 0,
    category: 'liquid',
  },
  'propane': {
    label: 'Propane',
    slug: 'propane',
    unit: 'gallon',
    btuPerUnit: 91500,
    efficiency: 0.90,
    installCost: 0,
    category: 'liquid',
  },
  'heat-pump': {
    label: 'Heat Pump (Mini-Split)',
    slug: 'heat-pump',
    unit: 'kWh',
    btuPerUnit: 3412,
    cop: 3.0,
    installCost: [7000, 15000],
    category: 'electric',
  },
  'natural-gas': {
    label: 'Natural Gas',
    slug: 'gas',
    unit: 'therm',
    btuPerUnit: 100000,
    efficiency: 0.93,
    installCost: 0,
    category: 'gas',
  },
  'electric-baseboard': {
    label: 'Electric Baseboard',
    slug: 'electric',
    unit: 'kWh',
    btuPerUnit: 3412,
    cop: 1.0,
    installCost: [1000, 3000],
    category: 'electric',
  },
};

/**
 * Cost per million BTU for a given fuel at a given price.
 * This is the universal comparison metric across fuel types.
 *
 * @param {string} fuelKey - Key in FUELS (e.g., 'heating-oil')
 * @param {number} pricePerUnit - Price per unit of fuel ($/gal, $/kWh, $/therm)
 * @returns {number} Cost in dollars per million BTU
 */
function costPerMMBTU(fuelKey, pricePerUnit) {
  const fuel = FUELS[fuelKey];
  if (!fuel) throw new Error(`Unknown fuel: ${fuelKey}`);
  if (typeof pricePerUnit !== 'number' || pricePerUnit <= 0) {
    throw new Error(`Invalid price: ${pricePerUnit}`);
  }

  // Electric fuels use COP (coefficient of performance)
  // Combustion fuels use thermal efficiency
  const effectiveBTU = fuel.cop
    ? fuel.cop * fuel.btuPerUnit
    : fuel.efficiency * fuel.btuPerUnit;

  return pricePerUnit / (effectiveBTU / 1e6);
}

/**
 * Estimated annual heating cost using HDD-based demand model.
 *
 * Annual heat demand (BTU) = HDD × heatLossFactor
 * Annual cost = demand × costPerBTU
 *
 * @param {string} fuelKey - Key in FUELS
 * @param {number} pricePerUnit - Price per unit
 * @param {number} hdd - Heating degree days for the location
 * @param {number} [heatLossFactor=14000] - BTU per HDD (home-dependent)
 * @returns {number} Estimated annual heating cost in dollars
 */
function annualHeatingCost(fuelKey, pricePerUnit, hdd, heatLossFactor = DEFAULT_HEAT_LOSS_FACTOR) {
  const costPerMM = costPerMMBTU(fuelKey, pricePerUnit);
  const annualBTU = hdd * heatLossFactor;
  return (annualBTU / 1e6) * costPerMM;
}

/**
 * Estimated monthly heating cost (annual / heating months).
 *
 * @param {string} fuelKey - Key in FUELS
 * @param {number} pricePerUnit - Price per unit
 * @param {number} hdd - Heating degree days for the location
 * @param {number} [heatLossFactor=14000] - BTU per HDD
 * @returns {number} Estimated monthly cost during heating season
 */
function monthlyHeatingCost(fuelKey, pricePerUnit, hdd, heatLossFactor = DEFAULT_HEAT_LOSS_FACTOR) {
  return annualHeatingCost(fuelKey, pricePerUnit, hdd, heatLossFactor) / HEATING_MONTHS;
}

/**
 * Payback period in years for switching from one fuel to another.
 * Only meaningful when newFuel has an install cost.
 *
 * @param {string} currentFuelKey - Current fuel key
 * @param {string} newFuelKey - Fuel to switch to
 * @param {object} prices - { [fuelKey]: pricePerUnit }
 * @param {number} hdd - Heating degree days
 * @param {number} [heatLossFactor=14000] - BTU per HDD
 * @returns {number|null} Years to break even, or null if switching costs more annually
 */
function paybackYears(currentFuelKey, newFuelKey, prices, hdd, heatLossFactor = DEFAULT_HEAT_LOSS_FACTOR) {
  const newFuel = FUELS[newFuelKey];
  if (!newFuel) throw new Error(`Unknown fuel: ${newFuelKey}`);

  const installCost = Array.isArray(newFuel.installCost)
    ? (newFuel.installCost[0] + newFuel.installCost[1]) / 2
    : newFuel.installCost;

  if (installCost === 0) return 0;

  const currentAnnual = annualHeatingCost(currentFuelKey, prices[currentFuelKey], hdd, heatLossFactor);
  const newAnnual = annualHeatingCost(newFuelKey, prices[newFuelKey], hdd, heatLossFactor);
  const annualSavings = currentAnnual - newAnnual;

  if (annualSavings <= 0) return null; // No savings — switching costs more
  return installCost / annualSavings;
}

/**
 * Get a fuel entry by key.
 * @param {string} fuelKey
 * @returns {object} Fuel configuration object
 */
function getFuel(fuelKey) {
  const fuel = FUELS[fuelKey];
  if (!fuel) throw new Error(`Unknown fuel: ${fuelKey}`);
  return fuel;
}

/**
 * Get all fuel keys.
 * @returns {string[]}
 */
function fuelKeys() {
  return Object.keys(FUELS);
}

module.exports = {
  FUELS,
  DEFAULT_HEAT_LOSS_FACTOR,
  HEATING_MONTHS,
  costPerMMBTU,
  annualHeatingCost,
  monthlyHeatingCost,
  paybackYears,
  getFuel,
  fuelKeys,
};
