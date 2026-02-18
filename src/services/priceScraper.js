/**
 * Price Scraper Service
 * V1.5.0: Scrapes published prices from supplier websites
 * V2.1.0: Added displayable flag support for aggregator signals
 *
 * Architecture:
 * - Honest User-Agent (HomeHeatBot)
 * - Target 150+ gallon tier prices
 * - Filter to #2 heating oil only
 * - Rate limiting: 2-second delay between requests
 * - Failure alerting: >20% fail rate triggers warning
 * - Aggregator signals: displayable=false -> sourceType='aggregator_signal'
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const USER_AGENT = 'HomeHeatBot/1.0 (gethomeheat.com; published-price-aggregation)';

// Agent for sites with SSL certificate issues
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Extract price from HTML using config selectors
 * @param {string} html - Raw HTML content
 * @param {object} config - Scrape config for this supplier
 * @returns {number|null} - Extracted price or null
 */
function extractPrice(html, config) {
  if (!html || !config) return null;

  // V2.8.0: Handle "split" pattern where price is split across elements (e.g., "$ 3" + "199" = $3.199)
  if (config.pattern === 'split' && config.priceRegex) {
    const splitRegex = new RegExp(config.priceRegex, 'gi');
    const match = splitRegex.exec(html);
    if (match && match[1] && match[2]) {
      // Combine: match[1] = whole dollars, match[2] = cents/thousandths
      const price = parseFloat(match[1] + '.' + match[2]);
      if (price >= 2.00 && price <= 5.00) {
        return price;
      }
    }
    return null;
  }

  // Try regex patterns
  const priceRegex = config.priceRegex
    ? new RegExp(config.priceRegex, 'gi')
    : /\$\s*([0-9]+\.[0-9]{2,3})/gi;

  const matches = [];
  let match;
  while ((match = priceRegex.exec(html)) !== null) {
    const price = parseFloat(match[1]);
    if (price >= 2.00 && price <= 5.00) {
      matches.push(price);
    }
  }

  if (matches.length === 0) return null;

  // If pattern is "table" (tiered pricing), get the appropriate tier price
  // If pattern is "direct", get the first match
  if (config.pattern === 'table') {
    // Sort prices ascending (lowest first = highest quantity tier)
    const sorted = [...matches].sort((a, b) => a - b);

    // If targetTier is specified, use that tier (1 = lowest, 2 = second-lowest, etc.)
    // This handles suppliers with 200+ gallon tiers when we want 150 gallon tier
    if (config.targetTier && config.targetTier <= sorted.length) {
      return sorted[config.targetTier - 1];
    }

    // Default: return the lowest price (150+ gallon tier)
    return sorted[0];
  }

  // Default: return first match
  return matches[0];
}

/**
 * Fetch and scrape price from a supplier website (single attempt)
 * @param {object} supplier - Supplier record with id, name, website
 * @param {object} config - Scrape config for this supplier
 * @returns {object} - Result with price data or error
 */
async function scrapeSupplierPriceOnce(supplier, config) {
  const startTime = Date.now();

  try {
    // Skip if no website
    if (!supplier.website) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'No website configured',
        duration: Date.now() - startTime,
        retryable: false
      };
    }

    // Skip if not enabled in config
    if (!config || !config.enabled) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'Not configured for scraping',
        duration: Date.now() - startTime,
        retryable: false
      };
    }

    // Normalize URL
    let url = supplier.website;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    // V1.6.0: Support custom price page path from config
    if (config.pricePath) {
      const urlObj = new URL(url);
      urlObj.pathname = config.pricePath;
      url = urlObj.toString();
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Build fetch options
    const fetchOptions = {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    };

    // V2.2.0: Support for sites with SSL certificate issues
    let savedTLSReject;
    if (config.ignoreSSL) {
      savedTLSReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } finally {
      // Restore SSL verification
      if (config.ignoreSSL) {
        if (savedTLSReject !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = savedTLSReject;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }
      }
    }

    clearTimeout(timeout);

    if (!response.ok) {
      // 5xx errors are retryable, 4xx usually are not
      const retryable = response.status >= 500;
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: `HTTP ${response.status}`,
        duration: Date.now() - startTime,
        retryable
      };
    }

    const html = await response.text();

    // Extract price
    const price = extractPrice(html, config);

    if (price === null) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'Price not found in HTML',
        duration: Date.now() - startTime,
        retryable: false // HTML structure issue, retry won't help
      };
    }

    // Validate range
    if (price < 2.00 || price > 5.00) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: `Price $${price} outside valid range`,
        duration: Date.now() - startTime,
        retryable: false
      };
    }

    // V2.1.0: Determine source type based on displayable flag
    // Aggregator prices (displayable=false) are for market signals only, never shown to users
    const sourceType = config.displayable === false ? 'aggregator_signal' : 'scraped';

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      success: true,
      pricePerGallon: price,
      minGallons: 150,
      fuelType: 'heating_oil',
      sourceType,
      sourceUrl: url,
      scrapedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      duration: Date.now() - startTime,
      // V2.1.0: Include displayable flag for logging/debugging
      isAggregator: config.displayable === false
    };

  } catch (error) {
    // Timeouts and network errors are retryable
    const retryable = error.name === 'AbortError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      success: false,
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      duration: Date.now() - startTime,
      retryable
    };
  }
}

/**
 * Fetch and scrape price from a supplier website with retries
 * V2.2.0: Added retry logic to handle transient network errors
 * @param {object} supplier - Supplier record with id, name, website
 * @param {object} config - Scrape config for this supplier
 * @param {object} options - Retry options
 * @param {number} options.maxRetries - Max retry attempts (default: 2)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 3000)
 * @returns {object} - Result with price data or error
 */
async function scrapeSupplierPrice(supplier, config, options = {}) {
  const maxRetries = options.maxRetries ?? 2;
  const retryDelay = options.retryDelay ?? 3000;

  let lastResult;
  let attempts = 0;

  while (attempts <= maxRetries) {
    lastResult = await scrapeSupplierPriceOnce(supplier, config);
    attempts++;

    // Success or non-retryable error - return immediately
    if (lastResult.success || !lastResult.retryable) {
      if (attempts > 1 && lastResult.success) {
        lastResult.retriedAttempts = attempts - 1;
      }
      return lastResult;
    }

    // Retryable failure - wait and try again (unless we've exhausted retries)
    if (attempts <= maxRetries) {
      await sleep(retryDelay);
    }
  }

  // All retries exhausted
  lastResult.retriedAttempts = maxRetries;
  return lastResult;
}

/**
 * Load scrape config from JSON file
 * @returns {object} - Config keyed by domain
 */
function loadScrapeConfig() {
  const configPath = path.join(__dirname, '../data/scrape-config.json');

  if (!fs.existsSync(configPath)) {
    console.warn('⚠️  scrape-config.json not found, using empty config');
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ Error loading scrape-config.json:', error.message);
    return {};
  }
}

/**
 * Get config for a supplier based on their website domain
 * @param {string} website - Supplier website URL
 * @param {object} config - Full scrape config
 * @returns {object|null} - Config for this supplier or null
 */
function getConfigForSupplier(website, config) {
  if (!website || !config) return null;

  // Extract domain from URL
  let domain;
  try {
    const url = website.startsWith('http') ? website : 'https://' + website;
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }

  return config[domain] || null;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * V2.1.0: Check if a config represents an aggregator (signal-only, not displayed)
 * @param {object} config - Scrape config for a supplier
 * @returns {boolean} - True if this is an aggregator (displayable=false)
 */
function isAggregatorConfig(config) {
  return config && config.displayable === false;
}

/**
 * V2.1.0: Get source type for a config
 * @param {object} config - Scrape config for a supplier
 * @returns {string} - 'aggregator_signal' or 'scraped'
 */
function getSourceType(config) {
  return isAggregatorConfig(config) ? 'aggregator_signal' : 'scraped';
}

module.exports = {
  USER_AGENT,
  extractPrice,
  scrapeSupplierPrice,
  loadScrapeConfig,
  getConfigForSupplier,
  sleep,
  // V2.1.0: Aggregator helpers
  isAggregatorConfig,
  getSourceType
};
