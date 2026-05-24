/**
 * Shared county data module — used by heating-cost, avg-bill, and price-trend generators
 *
 * Extracts common queries, fuel cost computation, HTML helpers, and constants
 * so all three generators share a single source of truth.
 */

const crypto = require('crypto');
const fsSync = require('fs');
const path = require('path');

const { costPerMMBTU, annualHeatingCost, monthlyHeatingCost, paybackYears, FUELS } = require('../../src/data/fuel-config');
const { getAllRates } = require('../../src/data/energy-rates');

// ── Module-level state ──────────────────────────────────────────

let WEBSITE_DIR = null;

function init(websiteDir) {
  WEBSITE_DIR = websiteDir;
}

// ── Constants ───────────────────────────────────────────────────

const STATES = {
  'NY': { name: 'New York', abbrev: 'ny' },
  'CT': { name: 'Connecticut', abbrev: 'ct' },
  'MA': { name: 'Massachusetts', abbrev: 'ma' },
  'NJ': { name: 'New Jersey', abbrev: 'nj' },
  'PA': { name: 'Pennsylvania', abbrev: 'pa' },
  'RI': { name: 'Rhode Island', abbrev: 'ri' },
  'NH': { name: 'New Hampshire', abbrev: 'nh' },
  'ME': { name: 'Maine', abbrev: 'me' },
  'VA': { name: 'Virginia', abbrev: 'va' },
  'MD': { name: 'Maryland', abbrev: 'md' },
  'DE': { name: 'Delaware', abbrev: 'de' },
};

const BASE_URL = 'https://www.gethomeheat.com';
const MIN_SUPPLIERS_FOR_PAGE = 3;
const MIN_PRICES_FOR_PAGE = 2;
const MIN_VALID_PRICE = 2.00;
const MAX_VALID_PRICE = 6.00;

// ── Data queries ────────────────────────────────────────────────

/**
 * Get county-level price stats from county_current_stats
 * V2.12.0: Parameterized by fuelType (was getCountyOilStats)
 */
async function getCountyOilStats(sequelize, stateCode, fuelType = 'heating_oil') {
  const [results] = await sequelize.query(`
    SELECT
      county_name,
      state_code,
      median_price,
      min_price,
      max_price,
      supplier_count,
      zip_prefixes,
      percent_change_6w,
      data_quality_score,
      last_scrape_at,
      weeks_available
    FROM county_current_stats
    WHERE state_code = :stateCode
      AND fuel_type = :fuelType
      AND median_price IS NOT NULL
    ORDER BY county_name
  `, { replacements: { stateCode, fuelType } });

  return results;
}

/**
 * Get state-level aggregate stats
 * V2.12.0: Parameterized by fuelType (was getStateOilStats)
 */
async function getStateOilStats(sequelize, stateCode, fuelType = 'heating_oil') {
  const [results] = await sequelize.query(`
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_price) as state_median,
      MIN(min_price) as state_min,
      MAX(max_price) as state_max,
      SUM(supplier_count) as total_suppliers,
      COUNT(*) as county_count,
      AVG(percent_change_6w) as avg_trend
    FROM county_current_stats
    WHERE state_code = :stateCode
      AND fuel_type = :fuelType
      AND median_price IS NOT NULL
  `, { replacements: { stateCode, fuelType } });

  return results[0];
}

/**
 * Count active prices within the last 48 hours for given ZIP prefixes.
 * Defaults to heating-oil range ($2–$6). Pass per-fuel min/max for non-oil callers.
 */
async function getRecentPriceCount(
  sequelize,
  zipPrefixes,
  minPrice = MIN_VALID_PRICE,
  maxPrice = MAX_VALID_PRICE,
) {
  if (!zipPrefixes || zipPrefixes.length === 0) return 0;
  const [results] = await sequelize.query(`
    SELECT COUNT(DISTINCT sp.supplier_id) as price_count
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    WHERE sp.is_valid = true
      AND sp.expires_at > NOW()
      AND sp.scraped_at > NOW() - INTERVAL '48 hours'
      AND sp.price_per_gallon BETWEEN $1 AND $2
      AND s.active = true
      AND s.allow_price_display = true
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS z
        WHERE LEFT(z, 3) = ANY($3::text[])
      )
  `, { bind: [minPrice, maxPrice, zipPrefixes] });

  return parseInt(results[0]?.price_count || 0, 10);
}

/**
 * Compute multi-fuel cost estimates for a location
 */
function computeFuelCosts(oilPrice, stateCode, county) {
  const rates = getAllRates({ state: stateCode, county });
  const hdd = rates.hdd.hdd;
  const electricRate = rates.electric.rate;
  const gasRate = rates.gas.rate;

  const fuels = {};

  // Heating oil (always present if we have price data)
  if (oilPrice) {
    const mmbtu = costPerMMBTU('heating-oil', oilPrice);
    fuels['heating-oil'] = {
      price: oilPrice,
      unit: 'gallon',
      costPerMMBTU: Math.round(mmbtu * 100) / 100,
      annualCost: Math.round(annualHeatingCost('heating-oil', oilPrice, hdd)),
      monthlyCost: Math.round(monthlyHeatingCost('heating-oil', oilPrice, hdd)),
    };
  }

  // Natural gas
  if (gasRate) {
    const mmbtu = costPerMMBTU('natural-gas', gasRate);
    fuels['natural-gas'] = {
      price: gasRate,
      unit: 'therm',
      costPerMMBTU: Math.round(mmbtu * 100) / 100,
      annualCost: Math.round(annualHeatingCost('natural-gas', gasRate, hdd)),
      monthlyCost: Math.round(monthlyHeatingCost('natural-gas', gasRate, hdd)),
    };
  }

  // Heat pump
  if (electricRate) {
    const mmbtu = costPerMMBTU('heat-pump', electricRate);
    fuels['heat-pump'] = {
      price: electricRate,
      unit: 'kWh',
      costPerMMBTU: Math.round(mmbtu * 100) / 100,
      annualCost: Math.round(annualHeatingCost('heat-pump', electricRate, hdd)),
      monthlyCost: Math.round(monthlyHeatingCost('heat-pump', electricRate, hdd)),
    };
  }

  // Electric baseboard
  if (electricRate) {
    const mmbtu = costPerMMBTU('electric-baseboard', electricRate);
    fuels['electric-baseboard'] = {
      price: electricRate,
      unit: 'kWh',
      costPerMMBTU: Math.round(mmbtu * 100) / 100,
      annualCost: Math.round(annualHeatingCost('electric-baseboard', electricRate, hdd)),
      monthlyCost: Math.round(monthlyHeatingCost('electric-baseboard', electricRate, hdd)),
    };
  }

  // Find cheapest
  const entries = Object.entries(fuels);
  entries.sort((a, b) => a[1].annualCost - b[1].annualCost);
  const cheapest = entries.length > 0 ? entries[0][0] : null;

  // Payback vs oil if we have oil data
  let payback = null;
  if (oilPrice && fuels['heat-pump']) {
    const prices = { 'heating-oil': oilPrice, 'heat-pump': electricRate };
    const years = paybackYears('heating-oil', 'heat-pump', prices, hdd);
    if (years !== null) {
      payback = { from: 'heating-oil', to: 'heat-pump', years: Math.round(years * 10) / 10 };
    }
  }

  return { fuels, cheapest, payback, hdd, electricRate, gasRate };
}

/**
 * Get county weekly price history from county_price_stats
 * V2.12.0: Parameterized by fuelType
 */
async function getCountyWeeklyHistory(sequelize, countyName, stateCode, limit = 12, fuelType = 'heating_oil') {
  const [results] = await sequelize.query(`
    SELECT week_start, median_price, min_price, max_price, supplier_count, data_points
    FROM county_price_stats
    WHERE county_name = :county AND state_code = :state AND fuel_type = :fuelType
    ORDER BY week_start DESC LIMIT :limit
  `, { replacements: { county: countyName, state: stateCode, limit, fuelType } });

  return results;
}

// ── Eligibility ─────────────────────────────────────────────────

/**
 * Single source of truth for page generation thresholds.
 * Each generator calls this to decide which pages to create.
 * Cross-link generators use the same function to conditionally render links.
 */
function getCountyEligibility(county, recentPriceCount) {
  const base = parseInt(county.supplier_count, 10) >= MIN_SUPPLIERS_FOR_PAGE
            && recentPriceCount >= MIN_PRICES_FOR_PAGE;
  return {
    heatingCost: base,
    avgBill: base,
    priceTrend: base && (parseInt(county.weeks_available, 10) || 0) >= 3,
  };
}

/**
 * V3.1.0: Check if a cross-linked page actually exists on disk.
 * Resolves /path → website/path.html, website/path/index.html, or website/path
 * Call AFTER init() so WEBSITE_DIR is set.
 */
function crossLinkExists(urlPath) {
  if (!WEBSITE_DIR) return false;
  const clean = urlPath.replace(/^\//, '').replace(/\/$/, '');
  return fsSync.existsSync(path.join(WEBSITE_DIR, clean + '.html'))
      || fsSync.existsSync(path.join(WEBSITE_DIR, clean, 'index.html'))
      || fsSync.existsSync(path.join(WEBSITE_DIR, clean));
}

// ── HTML helpers ────────────────────────────────────────────────

const _fileHashCache = {};
function getFileHash(relativePath) {
  if (_fileHashCache[relativePath]) return _fileHashCache[relativePath];
  if (!WEBSITE_DIR) throw new Error('county-data module not initialized — call init(websiteDir) first');
  const fullPath = path.join(WEBSITE_DIR, relativePath);
  if (fsSync.existsSync(fullPath)) {
    _fileHashCache[relativePath] = crypto.createHash('md5').update(fsSync.readFileSync(fullPath)).digest('hex').slice(0, 8);
  } else {
    _fileHashCache[relativePath] = Date.now().toString(36);
  }
  return _fileHashCache[relativePath];
}

function getCssPath(depth) {
  const prefix = '../'.repeat(depth);
  return `${prefix}style.min.css?v=${getFileHash('style.min.css')}`;
}

function getNavHTML(depth, activeLink = null) {
  const prefix = '../'.repeat(depth);
  const active = (link) => activeLink === link ? ' class="active"' : '';
  return `
    <nav class="nav">
        <div class="nav-container">
            <a href="/" class="nav-logo">
                <img src="${prefix}images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon" width="40" height="40">
                HomeHeat
            </a>
            <button class="nav-toggle" aria-label="Toggle navigation">
                <span></span>
                <span></span>
                <span></span>
            </button>
            <ul class="nav-links">
                <li><a href="/"${active('/')}>Home</a></li>
                <li class="nav-dropdown-parent">
                    <button class="nav-dropdown-toggle" aria-expanded="false" aria-haspopup="true">Prices</button>
                    <ul class="nav-dropdown" role="menu">
                        <li role="menuitem"><a href="/prices" data-track="nav-oil-prices" data-referrer="nav">Heating Oil Prices</a></li>
                        <li role="menuitem"><a href="/prices/kerosene/" data-track="nav-kero-prices" data-referrer="nav">K-1 Kerosene Prices</a></li>
                        <li role="menuitem"><a href="/prices/propane/" data-track="nav-propane-prices" data-referrer="nav">Propane Prices</a></li>
                    </ul>
                </li>
                <li class="nav-dropdown-parent">
                    <button class="nav-dropdown-toggle" aria-expanded="false" aria-haspopup="true">Heating Costs</button>
                    <ul class="nav-dropdown" role="menu">
                        <li role="menuitem"><a href="/tools/heating-cost-calculator" data-track="nav-calculator" data-referrer="nav">Cost Calculator</a></li>
                        <li role="menuitem"><a href="/tools/blend-calculator" data-track="nav-blend-calc" data-referrer="nav">Blend Calculator</a></li>
                        <li role="menuitem"><a href="/heating-cost/" data-track="nav-fuel-compare" data-referrer="nav">Fuel Comparison</a></li>
                        <li role="menuitem"><a href="/average-heating-bill/" data-track="nav-avg-bill" data-referrer="nav">Average Bills</a></li>
                        <li role="menuitem"><a href="/price-trend/" data-track="nav-price-trend" data-referrer="nav">Price Trends</a></li>
                        <li role="menuitem"><a href="/learn/" data-track="nav-guides" data-referrer="nav">All Guides</a></li>
                    </ul>
                </li>
                <li><a href="/for-suppliers"${active('/for-suppliers')}>For Suppliers</a></li>
                <li><a href="/support"${active('/support')}>Support</a></li>
            </ul>
        </div>
    </nav>`;
}

function getFooterHTML(depth) {
  const prefix = '../'.repeat(depth);
  return `
    <footer class="footer">
        <div class="footer-links">
            <a href="/for-suppliers">For Suppliers</a>
            <a href="/how-prices-work">How Prices Work</a>
            <a href="/learn/">Learn</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/support">Support</a>
        </div>
        <p class="footer-audience">Built for homeowners who rely on heating oil or propane.</p>
        <p>&copy; 2026 HomeHeat by Tsoir Advisors LLC. All rights reserved.</p>
    </footer>

    <script src="${prefix}js/nav.js"></script>
    <script src="${prefix}js/platform-detection.js?v=${getFileHash('js/platform-detection.js')}"></script>
    <script src="${prefix}js/widgets.js?v=1"></script>
    <script src="${prefix}js/pwa.js"></script>`;
}

function getFuelComparisonTable(costs, highlightCheapest = true) {
  const fuelOrder = ['natural-gas', 'heat-pump', 'heating-oil', 'electric-baseboard'];
  const labels = {
    'heating-oil': 'Heating Oil',
    'natural-gas': 'Natural Gas',
    'heat-pump': 'Heat Pump',
    'electric-baseboard': 'Electric Baseboard',
  };

  let rows = '';
  for (const key of fuelOrder) {
    if (!costs.fuels[key]) continue;
    const f = costs.fuels[key];
    const isCheapest = highlightCheapest && key === costs.cheapest;
    const rowStyle = isCheapest ? ' style="background: #f0fdf4;"' : '';
    const badge = isCheapest ? ' <span class="calc-badge">Cheapest</span>' : '';
    rows += `
                <tr${rowStyle}>
                    <td class="calc-fuel-name">${labels[key]}${badge}</td>
                    <td>${formatPerUnit(f.price, f.unit)}</td>
                    <td><strong>${formatCurrency(f.costPerMMBTU)}</strong></td>
                    <td><strong>${formatCurrency(f.annualCost)}</strong></td>
                    <td>${formatCurrency(f.monthlyCost)}</td>
                </tr>`;
  }

  return `
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>Fuel</th>
                        <th>Local Price</th>
                        <th>Cost/MMBTU</th>
                        <th>Annual Cost</th>
                        <th>Monthly (Heating)</th>
                    </tr>
                </thead>
                <tbody>${rows}
                </tbody>
            </table>`;
}

function getVerdictHTML(costs) {
  const labels = {
    'heating-oil': 'Heating Oil',
    'natural-gas': 'Natural Gas',
    'heat-pump': 'Heat Pump',
    'electric-baseboard': 'Electric Baseboard',
  };

  if (!costs.cheapest || !costs.fuels[costs.cheapest]) return '';

  const cheapestLabel = labels[costs.cheapest] || costs.cheapest;
  const cheapestCost = costs.fuels[costs.cheapest];

  // Compare to oil if oil isn't cheapest
  let savingsNote = '';
  if (costs.cheapest !== 'heating-oil' && costs.fuels['heating-oil']) {
    const oilCost = costs.fuels['heating-oil'].annualCost;
    const savings = oilCost - cheapestCost.annualCost;
    if (savings > 0) {
      savingsNote = ` — saving ${formatCurrency(savings)}/year vs heating oil`;
    }
  }

  return `
        <div class="calc-verdict">
            <p class="calc-verdict-label">Cheapest option for this area</p>
            <p class="calc-verdict-fuel">${cheapestLabel}</p>
            <p class="calc-verdict-cost">${formatCurrency(cheapestCost.annualCost)}/year estimated${savingsNote}</p>
        </div>`;
}

// ── Formatting helpers ──────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatCurrency(amount) {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPrice(price) {
  return '$' + Number(price).toFixed(2);
}

function formatPerUnit(price, unit) {
  return `${formatPrice(price)}/${unit}`;
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  // Init
  init,
  // Constants
  STATES,
  BASE_URL,
  MIN_SUPPLIERS_FOR_PAGE,
  MIN_PRICES_FOR_PAGE,
  MIN_VALID_PRICE,
  MAX_VALID_PRICE,
  // Data queries
  getCountyOilStats,
  getStateOilStats,
  getRecentPriceCount,
  computeFuelCosts,
  getCountyWeeklyHistory,
  // Eligibility
  getCountyEligibility,
  crossLinkExists,
  // HTML helpers
  getFileHash,
  getCssPath,
  getNavHTML,
  getFooterHTML,
  getFuelComparisonTable,
  getVerdictHTML,
  // Formatting
  slugify,
  formatCurrency,
  formatPrice,
  formatPerUnit,
};
