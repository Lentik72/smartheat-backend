/**
 * Price Scraper Service
 * V1.5.0: Scrapes published prices from supplier websites
 * V2.1.0: Added displayable flag support for aggregator signals
 * V2.12.0: Multi-fuel extraction — scrape kerosene (and future fuels) from same HTML
 *
 * Architecture:
 * - Honest User-Agent (HomeHeatBot)
 * - Target 150+ gallon tier prices
 * - Rate limiting: 2-second delay between requests
 * - Failure alerting: >20% fail rate triggers warning
 * - Aggregator signals: displayable=false -> sourceType='aggregator_signal'
 * - Multi-fuel: config.fuels object per entry, each fuel extracted independently
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const USER_AGENT = 'HomeHeatBot/1.0 (gethomeheat.com; published-price-aggregation)';

// V3.0.0: Browser UA pool for post_form pattern (Droplet integration).
// POST to a check-price form with a bot UA is unnatural — use clean browser UA.
// Chrome version computed from date so UAs stay fresh without manual updates.
// Chrome 132 released ~2025-01-14; new major version every ~5 weeks.
const _chromeBase = 132;
const _chromeBaseDate = new Date('2025-01-14');
const _currentChrome = _chromeBase + Math.floor((Date.now() - _chromeBaseDate.getTime()) / (35 * 24 * 60 * 60 * 1000));
const BROWSER_UA_POOL = [
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_currentChrome}.0.0.0 Safari/537.36`,
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_currentChrome - 1}.0.0.0 Safari/537.36`,
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_currentChrome - 2}.0.0.0 Safari/537.36`,
];

// Agent for sites with SSL certificate issues
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// V2.9.0: Lazy-load got-scraping (ESM) for 403 fallback with browser-like TLS fingerprints
let _gotScraping = null;
async function getGotScraping() {
  if (_gotScraping === false) return null; // previously failed to load
  if (_gotScraping) return _gotScraping;
  try {
    const mod = await import('got-scraping');
    _gotScraping = mod.gotScraping;
    return _gotScraping;
  } catch (e) {
    console.warn('⚠️ got-scraping not available:', e.message);
    _gotScraping = false;
    return null;
  }
}

/**
 * Extract price from HTML using config selectors
 * @param {string} html - Raw HTML content
 * @param {object} config - Scrape config for this supplier
 * @returns {number|null} - Extracted price or null
 */
function extractPrice(html, config) {
  if (!html || !config) return null;

  // V2.13.0: Strip JSON-LD schema.org blocks before price extraction.
  // Website owners frequently forget to update JSON-LD when changing prices,
  // causing the generic regex to match stale metadata before the displayed price.
  // Suppliers that intentionally read from JSON-LD (e.g., Wix product pages)
  // can opt out with useJsonLd: true in their scrape config.
  if (!config.useJsonLd) {
    html = html.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  }

  // V2.11.0: Normalize <sup> digit tags — some sites render the last price digit
  // in a <sup> tag (e.g., "$4.85<sup style="...">9</sup>" = $4.859).
  // Strip the tag, keep the digit, so standard regexes match the full price.
  html = html.replace(/<sup[^>]*>(\d)<\/sup>/gi, '$1');

  // V2.8.0: Handle "split" pattern where price is split across elements (e.g., "$ 3" + "199" = $3.199)
  if (config.pattern === 'split' && config.priceRegex) {
    const splitRegex = new RegExp(config.priceRegex, 'gi');
    const match = splitRegex.exec(html);
    if (match && match[1] && match[2]) {
      // Combine: match[1] = whole dollars, match[2] = cents/thousandths
      const price = parseFloat(match[1] + '.' + match[2]);
      const splitRange = FUEL_PRICE_RANGES.heating_oil || [2.00, 5.50];
      if (price >= splitRange[0] && price <= splitRange[1]) {
        return price;
      }
    }
    return null;
  }

  // Try regex patterns
  const priceRegex = config.priceRegex
    ? new RegExp(config.priceRegex, 'gi')
    : /\$\s*([0-9]+\.[0-9]{2,3})/gi;

  // V2.12.0: Use FUEL_PRICE_RANGES for oil validation (was hardcoded $2-$5)
  const oilRange = FUEL_PRICE_RANGES.heating_oil || [2.00, 5.50];
  const matches = [];
  let match;
  while ((match = priceRegex.exec(html)) !== null) {
    const price = parseFloat(match[1]);
    if (price >= oilRange[0] && price <= oilRange[1]) {
      matches.push(price);
    }
  }

  if (matches.length === 0) return null;

  // If pattern is "table" (tiered pricing), get the appropriate tier price
  // If pattern is "direct", get the first match
  if (config.pattern === 'table' || config.pattern === 'post_form') {
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

// V2.12.0: Fuel-specific validation ranges
const FUEL_PRICE_RANGES = {
  heating_oil: [2.00, 6.00],
  kerosene: [2.50, 7.00],
};

/**
 * V2.12.0: Extract additional fuel prices from HTML using config.fuels
 * Each fuel is extracted independently — one failure doesn't block others.
 * @param {string} html - Raw HTML (already sup-normalized)
 * @param {object} config - Full scrape config for this supplier
 * @returns {Array<{fuelType: string, price: number}>} - Extracted fuel prices
 */
function extractFuelPrices(html, config) {
  if (!html || !config || !config.fuels) return [];

  const results = [];

  for (const [fuelType, fuelConfig] of Object.entries(config.fuels)) {
    if (!fuelConfig.enabled || !fuelConfig.priceRegex) continue;

    const range = FUEL_PRICE_RANGES[fuelType] || [2.00, 8.00];

    try {
      const regex = new RegExp(fuelConfig.priceRegex, 'gi');
      const match = regex.exec(html);
      if (match && match[1]) {
        const price = parseFloat(match[1]);
        if (price >= range[0] && price <= range[1]) {
          results.push({ fuelType, price });
        }
      }
    } catch (err) {
      // Bad regex in config — log but don't crash
      console.warn(`⚠️ Bad regex for fuel ${fuelType}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Fetch and scrape price from a supplier website (single attempt)
 * @param {object} supplier - Supplier record with id, name, website
 * @param {object} config - Scrape config for this supplier
 * @returns {object} - Result with price data or error. V2.12.0: includes fuelPrices array.
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

    // V3.0.0: Kill switch for Droplet-hosted suppliers
    if (config.hostGroup === 'droplet' && process.env.SCRAPE_SKIP_DROPLET === 'true') {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'Droplet scraping disabled (SCRAPE_SKIP_DROPLET)',
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

    // V2.14.0: lookupUrl — fetch price from a different URL (e.g., third-party checkout portal).
    // Supports {zip} placeholder interpolated from config.lookupZip.
    if (config.lookupUrl && config.lookupZip) {
      url = config.lookupUrl.replace('{zip}', config.lookupZip);
    }

    // V2.10.0: json_api pattern — call a JSON API with custom method/headers,
    // extract price from a dot-notation path in the response.
    // Config fields: apiUrl, apiMethod (default POST), apiHeaders, jsonPath
    if (config.pattern === 'json_api') {
      const apiUrl = config.apiUrl;
      if (!apiUrl) {
        return { supplierId: supplier.id, supplierName: supplier.name, success: false,
          error: 'json_api pattern requires apiUrl', duration: Date.now() - startTime, retryable: false };
      }
      const apiController = new AbortController();
      const apiTimeout = setTimeout(() => apiController.abort(), 10000);
      try {
        const apiResp = await fetch(apiUrl, {
          method: config.apiMethod || 'POST',
          headers: { 'Content-Type': 'application/json', ...config.apiHeaders },
          body: config.apiMethod === 'GET' ? undefined : JSON.stringify(config.apiBody || {}),
          signal: apiController.signal,
        });
        clearTimeout(apiTimeout);
        if (!apiResp.ok) {
          return { supplierId: supplier.id, supplierName: supplier.name, success: false,
            error: `API HTTP ${apiResp.status}`, duration: Date.now() - startTime, retryable: apiResp.status >= 500 };
        }
        const json = await apiResp.json();
        // Walk jsonPath like "datalist.0.TodaysOilPrice1"
        const parts = (config.jsonPath || '').split('.');
        let val = json;
        for (const p of parts) {
          if (val == null) break;
          val = val[p];
        }
        let price = parseFloat(val);
        // If the JSON field is a text string (e.g., banner content), extract price via regex
        if (isNaN(price) && typeof val === 'string' && config.priceRegex) {
          const re = new RegExp(config.priceRegex);
          const m = re.exec(val);
          if (m && m[1]) price = parseFloat(m[1]);
        }
        const apiRange = FUEL_PRICE_RANGES.heating_oil || [2.00, 5.50];
        if (isNaN(price) || price < apiRange[0] || price > apiRange[1]) {
          return { supplierId: supplier.id, supplierName: supplier.name, success: false,
            error: `API price ${val} invalid`, duration: Date.now() - startTime, retryable: false };
        }
        const sourceType = config.displayable === false ? 'aggregator_signal' : 'scraped';
        // Extract additional fuel prices from text-based API responses
        const fuelPrices = typeof val === 'string' ? extractFuelPrices(val, config) : [];
        return {
          supplierId: supplier.id, supplierName: supplier.name, success: true,
          pricePerGallon: price, minGallons: 100, fuelType: 'heating_oil', sourceType,
          sourceUrl: apiUrl, scrapedAt: new Date(),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          duration: Date.now() - startTime, isAggregator: config.displayable === false,
          fuelPrices,
        };
      } catch (e) {
        clearTimeout(apiTimeout);
        return { supplierId: supplier.id, supplierName: supplier.name, success: false,
          error: e.name === 'AbortError' ? 'API timeout' : e.message,
          duration: Date.now() - startTime, retryable: true };
      }
    }

    // V3.0.0: post_form pattern — POST form-encoded data to supplier's price endpoint.
    // Used for Droplet Fuel-powered suppliers where prices are behind a ZIP code form.
    if (config.pattern === 'post_form' && config.formBody) {
      // Determine POST target URL
      const postUrl = config.lookupUrl || url;

      // ZIP rotation: pick random ZIP from service area to reduce fingerprinting
      const zip = config.postalCodesServed?.length
        ? config.postalCodesServed[Math.floor(Math.random() * config.postalCodesServed.length)]
        : config.formBody.zip_code;
      const formParams = new URLSearchParams({ ...config.formBody, zip_code: zip });
      const browserUA = BROWSER_UA_POOL[Math.floor(Math.random() * BROWSER_UA_POOL.length)];

      // Referer = supplier homepage (not the endpoint) — matches real browser behavior
      let referer = supplier.website;
      if (referer && !referer.startsWith('http')) referer = 'https://' + referer;

      const postController = new AbortController();
      const postTimeout = setTimeout(() => postController.abort(), 10000);

      try {
        const resp = await fetch(postUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': browserUA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referer || '',
          },
          body: formParams.toString(),
          signal: postController.signal,
        });
        clearTimeout(postTimeout);

        if (!resp.ok) {
          // Classify failure for circuit breaker
          const isBlock = resp.status === 403;
          return {
            supplierId: supplier.id, supplierName: supplier.name, success: false,
            error: `POST HTTP ${resp.status}`,
            duration: Date.now() - startTime,
            retryable: resp.status >= 500,
            dropletFailureType: isBlock ? 'block' : 'network',
          };
        }

        const postHtml = await resp.text();

        // Droplet-specific block detection in 200 responses
        if (/captcha|blocked|rate.limit/i.test(postHtml)) {
          return {
            supplierId: supplier.id, supplierName: supplier.name, success: false,
            error: 'Block text detected in POST response',
            duration: Date.now() - startTime,
            retryable: false,
            dropletFailureType: 'block',
          };
        }

        // Extract price using existing extractPrice() with config's priceRegex
        const postPrice = extractPrice(postHtml, config);
        const postFuelPrices = extractFuelPrices(postHtml, config);

        if (postPrice === null) {
          return {
            supplierId: supplier.id, supplierName: supplier.name, success: false,
            error: 'Price not found in POST response',
            duration: Date.now() - startTime,
            retryable: false,
            fuelPrices: postFuelPrices,
            dropletFailureType: 'parse',
          };
        }

        const postRange = FUEL_PRICE_RANGES.heating_oil || [2.00, 5.50];
        if (postPrice < postRange[0] || postPrice > postRange[1]) {
          return {
            supplierId: supplier.id, supplierName: supplier.name, success: false,
            error: `POST price $${postPrice} outside valid range`,
            duration: Date.now() - startTime,
            retryable: false,
            fuelPrices: postFuelPrices,
            dropletFailureType: 'parse',
          };
        }

        const postSourceType = config.displayable === false ? 'aggregator_signal' : 'scraped';
        return {
          supplierId: supplier.id, supplierName: supplier.name, success: true,
          pricePerGallon: postPrice, minGallons: 150, fuelType: 'heating_oil',
          sourceType: postSourceType, sourceUrl: postUrl,
          scrapedAt: new Date(),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          duration: Date.now() - startTime,
          isAggregator: config.displayable === false,
          fuelPrices: postFuelPrices,
        };
      } catch (postErr) {
        clearTimeout(postTimeout);
        const isTimeout = postErr.name === 'AbortError';
        return {
          supplierId: supplier.id, supplierName: supplier.name, success: false,
          error: isTimeout ? 'POST timeout' : postErr.message,
          duration: Date.now() - startTime,
          retryable: isTimeout || postErr.code === 'ECONNRESET' || postErr.code === 'ETIMEDOUT',
          dropletFailureType: 'network',
        };
      }
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
      // V2.9.0: For 403 blocks, try got-scraping with browser-like TLS fingerprint
      // V3.0.0: Skip for post_form — got-scraping does GET, would be wrong for POST endpoints
      if (response.status === 403 && config.pattern !== 'post_form') {
        const gotScraping = await getGotScraping();
        if (gotScraping) {
          try {
            const gotResponse = await gotScraping({
              url,
              timeout: { request: 10000 },
              headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            });

            if (gotResponse.statusCode === 200) {
              const gotHtml = gotResponse.body;
              const gotPrice = extractPrice(gotHtml, config);
              const gotFuelPrices = extractFuelPrices(gotHtml, config); // V2.12.0

              if (gotPrice !== null && gotPrice >= 2.00 && gotPrice <= 5.50) {
                const sourceType = config.displayable === false ? 'aggregator_signal' : 'scraped';
                return {
                  supplierId: supplier.id,
                  supplierName: supplier.name,
                  success: true,
                  pricePerGallon: gotPrice,
                  minGallons: 150,
                  fuelType: 'heating_oil',
                  sourceType,
                  sourceUrl: url,
                  scrapedAt: new Date(),
                  expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                  duration: Date.now() - startTime,
                  isAggregator: config.displayable === false,
                  fallbackUsed: 'got-scraping',
                  fuelPrices: gotFuelPrices, // V2.12.0
                };
              }
            }
          } catch (gotError) {
            // got-scraping also failed — fall through to original 403 error
          }
        }
      }

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

    // V2.12.0: Extract additional fuel prices from same HTML (independent of oil)
    const fuelPrices = extractFuelPrices(html, config);

    // Extract oil price
    const price = extractPrice(html, config);

    if (price === null) {
      // Oil failed — but fuel prices may have succeeded
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: 'Price not found in HTML',
        duration: Date.now() - startTime,
        retryable: false,
        fuelPrices, // V2.12.0: may contain kerosene even if oil failed
      };
    }

    // Validate range (uses centralized FUEL_PRICE_RANGES)
    const validRange = FUEL_PRICE_RANGES.heating_oil || [2.00, 5.50];
    if (price < validRange[0] || price > validRange[1]) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        success: false,
        error: `Price $${price} outside valid range`,
        duration: Date.now() - startTime,
        retryable: false,
        fuelPrices, // V2.12.0
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
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours - survives one missed scrape cycle
      duration: Date.now() - startTime,
      // V2.1.0: Include displayable flag for logging/debugging
      isAggregator: config.displayable === false,
      fuelPrices, // V2.12.0: additional fuel prices from same HTML
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
  extractFuelPrices, // V2.12.0: Multi-fuel extraction
  FUEL_PRICE_RANGES, // V2.12.0: Per-fuel validation ranges
  scrapeSupplierPrice,
  loadScrapeConfig,
  getConfigForSupplier,
  sleep,
  // V2.1.0: Aggregator helpers
  isAggregatorConfig,
  getSourceType
};
