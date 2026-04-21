/**
 * Energy Rate & HDD Lookup with Fallback Hierarchy
 * V1.0.0: Powers cost calculations across calculator, API, and generated pages
 *
 * Electricity fallback: ZIP-level (future) → state average → national average
 * Gas fallback:         ZIP-level (future) → state average → national average
 * HDD fallback:         county-level → state average → national average
 *
 * Data freshness: EIA publishes monthly. Staleness warning if >90 days old.
 */

const electricityData = require('./electricity-rates.json');
const gasData = require('./gas-rates.json');
const hddData = require('./hdd-by-county.json');

const STALENESS_DAYS = 90;

// EIA publishes residential rates monthly with a ~2-month lag. Allow up to ~5 months
// of data-period age before warning — beyond that, the cron is healthy but EIA itself
// has a publish gap, OR the cron keeps re-fetching the same period.
const DATA_PERIOD_MAX_DAYS = 150;

/**
 * Check if a dataset is stale.
 * Measures from `releaseDate` (when EIA published) — EIA publishes with a ~2-month lag,
 * so measuring from data-period `lastUpdated` would overstate staleness by ~60 days.
 * Also flags when `lastUpdated` (data period) hasn't advanced in ~5 months — protects
 * against a healthy cron silently masking an EIA publish gap.
 * Logs a warning — does not fail.
 */
function checkStaleness(datasetName, dataset) {
  const reference = dataset.releaseDate || dataset.lastUpdated;
  const referenceLabel = dataset.releaseDate ? 'released' : 'last updated';
  const refDate = new Date(reference);
  if (!Number.isFinite(refDate.getTime())) {
    console.warn(
      `[energy-rates] ${datasetName} has unparseable date (releaseDate=${dataset.releaseDate}, lastUpdated=${dataset.lastUpdated})`
    );
    return;
  }
  const age = (Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24);
  if (age > STALENESS_DAYS) {
    console.warn(
      `[energy-rates] ${datasetName} data is ${Math.round(age)} days old (${referenceLabel}: ${reference}). ` +
      `Run scripts/refresh-energy-rates.js to update.`
    );
    return;
  }
  if (dataset.lastUpdated) {
    const periodDate = new Date(dataset.lastUpdated);
    if (Number.isFinite(periodDate.getTime())) {
      const periodAge = (Date.now() - periodDate.getTime()) / (1000 * 60 * 60 * 24);
      if (periodAge > DATA_PERIOD_MAX_DAYS) {
        console.warn(
          `[energy-rates] ${datasetName} refresh is healthy (released ${reference}) but EIA data period (${dataset.lastUpdated}) is ${Math.round(periodAge)} days old — possible EIA publish gap or cron is fetching the same period repeatedly.`
        );
      }
    }
  }
}

// Check staleness on module load (logged during page generation)
checkStaleness('Electricity', electricityData);
checkStaleness('Natural gas', gasData);

/**
 * Get electricity rate for a location.
 * Fallback: ZIP (future) → state → national average
 *
 * @param {object} opts
 * @param {string} [opts.zip] - ZIP code (future: ZIP-level rates)
 * @param {string} opts.state - Two-letter state abbreviation
 * @returns {{ rate: number, source: string }}
 */
function getElectricRate({ zip, state }) {
  // Future: ZIP-level rate lookup here

  const stateUpper = state ? state.toUpperCase() : null;
  if (stateUpper && electricityData.rates[stateUpper]) {
    return {
      rate: electricityData.rates[stateUpper],
      source: 'state',
    };
  }

  return {
    rate: electricityData.nationalAverage,
    source: 'national',
  };
}

/**
 * Get natural gas rate for a location.
 * Fallback: ZIP (future) → state → national average
 *
 * @param {object} opts
 * @param {string} [opts.zip] - ZIP code (future)
 * @param {string} opts.state - Two-letter state abbreviation
 * @returns {{ rate: number, source: string }}
 */
function getGasRate({ zip, state }) {
  const stateUpper = state ? state.toUpperCase() : null;
  if (stateUpper && gasData.rates[stateUpper]) {
    return {
      rate: gasData.rates[stateUpper],
      source: 'state',
    };
  }

  return {
    rate: gasData.nationalAverage,
    source: 'national',
  };
}

/**
 * Get heating degree days for a location.
 * Fallback: county → state average → national average
 *
 * @param {object} opts
 * @param {string} opts.state - Two-letter state abbreviation
 * @param {string} [opts.county] - County name (e.g., "Westchester")
 * @returns {{ hdd: number, source: string }}
 */
function getHDD({ state, county }) {
  const stateUpper = state ? state.toUpperCase() : null;

  // County-level lookup
  if (stateUpper && county && hddData.counties[stateUpper]) {
    const countyHDD = hddData.counties[stateUpper][county];
    if (countyHDD) {
      return { hdd: countyHDD, source: 'county' };
    }
  }

  // State average fallback
  if (stateUpper && hddData.stateAverages[stateUpper]) {
    return {
      hdd: hddData.stateAverages[stateUpper],
      source: 'state',
    };
  }

  // National average fallback
  return {
    hdd: hddData.nationalAverage,
    source: 'national',
  };
}

/**
 * Get all energy rates and HDD for a location in one call.
 * Convenience method for the heating cost API endpoint.
 *
 * @param {object} opts
 * @param {string} [opts.zip] - ZIP code
 * @param {string} opts.state - Two-letter state abbreviation
 * @param {string} [opts.county] - County name
 * @returns {{ electric: { rate, source }, gas: { rate, source }, hdd: { hdd, source } }}
 */
function getAllRates({ zip, state, county }) {
  return {
    electric: getElectricRate({ zip, state }),
    gas: getGasRate({ zip, state }),
    hdd: getHDD({ state, county }),
  };
}

module.exports = {
  getElectricRate,
  getGasRate,
  getHDD,
  getAllRates,
  // Expose raw data for generators that need full state lists
  electricityData,
  gasData,
  hddData,
};
