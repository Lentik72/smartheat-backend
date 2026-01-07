/**
 * Price Scraper Service
 * V1.5.0: Scrapes published prices from supplier websites
 *
 * Architecture:
 * - Honest User-Agent (HomeHeatBot)
 * - Target 150+ gallon tier prices
 * - Filter to #2 heating oil only
 * - Rate limiting: 2-second delay between requests
 * - Failure alerting: >20% fail rate triggers warning
 */

const fs = require('fs');
const path = require('path');

const USER_AGENT = 'HomeHeatBot/1.0 (gethomeheat.com; published-price-aggregation)';

/**
 * Extract price from HTML using config selectors
 * @param {string} html - Raw HTML content
 * @param {object} config - Scrape config for this supplier
 * @returns {number|null} - Extracted price or null
 */
function extractPrice(html, config) {
  if (!html || !config) return null;

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

  // If pattern is "table" (tiered pricing), get the lowest valid price (150+ tier is usually lowest)
  // If pattern is "direct", get the first match
  if (config.pattern === 'table') {
    // For tiered tables, typically the larger quantity = lower price
    // Return the lowest price found (likely 150+ gallon tier)
    return Math.min(...matches);
  }

  // Default: return first match
  return matches[0];
}

/**
 * Fetch and scrape price from a supplier website
 * @param {object} supplier - Supplier record with id, name, website
 * @param {object} config - Scrape config for this supplier
 * @returns {object} - Result with price data or error
 */
async function scrapeSupplierPrice(supplier, config) {
  const startTime = Date.now();

  try {
    // Skip if no website
    if (!supplier.website) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'No website configured',
        duration: Date.now() - startTime
      };
    }

    // Skip if not enabled in config
    if (!config || !config.enabled) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'Not configured for scraping',
        duration: Date.now() - startTime
      };
    }

    // Normalize URL
    let url = supplier.website;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: `HTTP ${response.status}`,
        duration: Date.now() - startTime
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
        duration: Date.now() - startTime
      };
    }

    // Validate range
    if (price < 2.00 || price > 5.00) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: `Price $${price} outside valid range`,
        duration: Date.now() - startTime
      };
    }

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      success: true,
      pricePerGallon: price,
      minGallons: 150,
      fuelType: 'heating_oil',
      sourceType: 'scraped',
      sourceUrl: url,
      scrapedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      duration: Date.now() - startTime
    };

  } catch (error) {
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      success: false,
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      duration: Date.now() - startTime
    };
  }
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

module.exports = {
  USER_AGENT,
  extractPrice,
  scrapeSupplierPrice,
  loadScrapeConfig,
  getConfigForSupplier,
  sleep
};
