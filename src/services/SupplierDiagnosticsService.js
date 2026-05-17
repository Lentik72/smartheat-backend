/**
 * Supplier Diagnostics Service
 * V1.0.0: Classifies scrape failures into actionable diagnostic categories
 *
 * Replaces raw error dumps in the 6 AM daily email with grouped,
 * actionable diagnostics. Includes lightweight HTTP HEAD probes for
 * stale suppliers not in recent failure logs.
 *
 * Categories: blocked, page_moved, html_changed, price_range, ssl_error,
 *   dns_dead, connection_refused, timeout, server_error, api_changed,
 *   config_error, unknown
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildLatestHealthPriceCTE } = require('../utils/supplier-health-price-query');

// Diagnostic categories with labels, priority (1=critical), and default actions
const CATEGORIES = {
  dns_dead:           { label: 'Domain not resolving',       icon: '💀', priority: 1, action: 'Domain may have expired. Check if supplier is still in business.' },
  blocked:            { label: 'Blocked by WAF/anti-bot',    icon: '🚫', priority: 1, action: 'Site added anti-bot protection. Try got-scraping fallback or proxy.' },
  ssl_error:          { label: 'SSL/TLS certificate error',  icon: '🔒', priority: 2, action: 'Certificate expired or misconfigured. Add ignoreSSL: true to config.' },
  page_moved:         { label: 'Price page moved/deleted',   icon: '🔗', priority: 2, action: 'Find new price page URL and update pricePath in scrape-config.json.' },
  html_changed:       { label: 'Price not found in HTML',    icon: '🔄', priority: 2, action: 'Website redesigned or price removed. Inspect page and update priceRegex.' },
  api_changed:        { label: 'API response changed',       icon: '📡', priority: 2, action: 'JSON API format changed. Check apiUrl and jsonPath in config.' },
  connection_refused: { label: 'Connection refused',         icon: '🔌', priority: 3, action: 'Server is down or moved hosts. Check if temporary.' },
  price_range:        { label: 'Price outside valid range',  icon: '💲', priority: 3, action: 'Price exists but outside $2–$5. Verify actual price and adjust range.' },
  timeout:            { label: 'Request timeout',            icon: '⏱️', priority: 3, action: 'Server too slow or silently blocking. May resolve on its own.' },
  server_error:       { label: 'Server error (5xx)',         icon: '🖥️', priority: 3, action: 'Supplier server issue. Usually transient — monitor for persistence.' },
  config_error:       { label: 'Configuration issue',        icon: '⚙️', priority: 4, action: 'Check scrape-config.json entry for this supplier.' },
  unknown:            { label: 'Unknown error',              icon: '❓', priority: 4, action: 'Investigate manually.' }
};

/**
 * Classify a raw error string into a diagnostic category
 * @param {string} error - Error string from scrape run
 * @returns {string} Category key
 */
function classifyError(error) {
  if (!error) return 'unknown';
  const e = error.toLowerCase();

  // DNS / domain dead
  if (e.includes('enotfound') || e.includes('getaddrinfo')) return 'dns_dead';

  // HTTP status codes
  if (e.includes('http 403')) return 'blocked';
  if (e.includes('http 404')) return 'page_moved';
  if (e.includes('http 5') || e.includes('http 502') || e.includes('http 503') || e.includes('http 500')) return 'server_error';
  if (e.includes('http 301') || e.includes('http 302')) return 'page_moved';
  if (e.includes('http 4')) return 'page_moved'; // other 4xx

  // Connection errors
  if (e.includes('econnrefused')) return 'connection_refused';
  if (e.includes('econnreset')) return 'blocked'; // often anti-bot behavior

  // SSL/TLS
  if (e.includes('ssl') || e.includes('tls') || e.includes('cert') ||
      e.includes('unable_to_verify') || e.includes('err_tls') ||
      e.includes('self_signed') || e.includes('self-signed')) return 'ssl_error';

  // Timeout
  if (e.includes('timeout') || e.includes('aborterror') || e.includes('etimedout') ||
      e.includes('aborted') || e.includes('socket hang up')) return 'timeout';

  // Price extraction
  if (e.includes('price not found')) return 'html_changed';
  if (e.includes('outside valid range') || e.match(/price \$[\d.]+ invalid/)) return 'price_range';

  // API
  if (e.includes('api price') && e.includes('invalid')) return 'api_changed';
  if (e.includes('api http') || e.includes('api timeout')) return 'server_error';

  // Config
  if (e.includes('not configured') || e.includes('no website') || e.includes('requires apiurl')) return 'config_error';

  return 'unknown';
}

/**
 * Normalize a website URL or a scrape-config key to a bare domain
 * (no protocol, no www., no trailing path). Mirrors the normalization
 * used by ScrapeConfigSync so a row's `website` can be matched against
 * the JSON config's top-level domain keys.
 */
function normalizeDomain(value) {
  if (!value) return null;
  return value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

class SupplierDiagnosticsService {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this._configDisabledCache = null;
    this._configCachedAt = 0;
  }

  /**
   * Build the set of normalized domains marked `enabled: false` in
   * scrape-config.json. Used to filter stale-supplier diagnostics so
   * intentionally-disabled scrapers don't pollute the operator alert view
   * (heatingoil-l0n6). 5-minute cache so a single email generation pass
   * or dashboard request reads disk once.
   */
  _getConfigDisabledDomains() {
    if (this._configDisabledCache && Date.now() - this._configCachedAt < 5 * 60 * 1000) {
      return this._configDisabledCache;
    }
    try {
      const cfgPath = path.join(__dirname, '../data/scrape-config.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const disabled = new Set();
      for (const [domain, entry] of Object.entries(cfg)) {
        if (domain.startsWith('_')) continue;
        if (entry && entry.enabled === false) {
          disabled.add(normalizeDomain(domain));
        }
      }
      this._configDisabledCache = disabled;
      this._configCachedAt = Date.now();
      return disabled;
    } catch (e) {
      // If config can't be read for any reason, fall back to empty set —
      // don't drop suppliers based on missing data.
      return new Set();
    }
  }

  /**
   * Generate comprehensive diagnostics for the daily email.
   * Returns grouped failure categories with supplier lists and action items.
   */
  async generateDiagnostics() {
    const [failures, staleSuppliers, backoffStats] = await Promise.all([
      this._getRecentFailures(),
      this._getStaleSuppliers(),
      this._getBackoffBreakdown()
    ]);

    // Classify each failure from recent scrape runs
    const classifiedFailures = failures.map(f => ({
      ...f,
      category: classifyError(f.error)
    }));

    // Group by category
    const groups = {};
    for (const f of classifiedFailures) {
      if (!groups[f.category]) {
        const cat = CATEGORIES[f.category] || CATEGORIES.unknown;
        groups[f.category] = {
          label: cat.label,
          icon: cat.icon,
          priority: cat.priority,
          action: cat.action,
          suppliers: []
        };
      }
      groups[f.category].suppliers.push({
        name: f.supplier_name,
        error: f.error,
        website: f.website,
        retries: f.retried_attempts || 0
      });
    }

    // Probe stale suppliers not already in failures (lightweight HTTP HEAD)
    const failureNames = new Set(classifiedFailures.map(f => f.supplier_name));
    const undiagnosed = staleSuppliers.filter(s =>
      !failureNames.has(s.name) && s.scrape_status !== 'cooldown' && s.scrape_status !== 'phone_only'
    );

    const probeResults = await this._probeSuppliers(undiagnosed.slice(0, 20));

    for (const probe of probeResults) {
      const category = probe.category;
      if (!groups[category]) {
        const cat = CATEGORIES[category] || CATEGORIES.unknown;
        groups[category] = { label: cat.label, icon: cat.icon, priority: cat.priority, action: cat.action, suppliers: [] };
      }
      groups[category].suppliers.push({
        name: probe.name,
        error: probe.diagnosis,
        website: probe.website,
        stale_days: probe.stale_days,
        probed: true
      });
    }

    // Sort groups by priority (critical first), then by supplier count (most first)
    const sortedGroups = Object.entries(groups)
      .sort((a, b) => {
        const priDiff = a[1].priority - b[1].priority;
        if (priDiff !== 0) return priDiff;
        return b[1].suppliers.length - a[1].suppliers.length;
      })
      .map(([category, group]) => ({ category, ...group }));

    const totalIssues = classifiedFailures.length + probeResults.length;

    return {
      groups: sortedGroups,
      totalIssues,
      backoff: backoffStats,
      staleCount: staleSuppliers.length,
      probedCount: probeResults.length,
      undiagnosedCount: Math.max(0, undiagnosed.length - probeResults.length),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get failures from the most recent scrape runs (last 24h).
   * Deduplicates by supplier name, enriches with website URL.
   */
  async _getRecentFailures() {
    const [runs] = await this.sequelize.query(`
      SELECT failures
      FROM scrape_runs
      WHERE run_at > NOW() - INTERVAL '24 hours'
      ORDER BY run_at DESC
      LIMIT 2
    `);

    // Merge failures from recent runs, dedup by supplier name
    const seen = new Set();
    const allFailures = [];
    for (const run of runs) {
      const failures = run.failures || [];
      for (const f of failures) {
        const name = f.supplierName || f.supplier_name;
        if (name && !seen.has(name)) {
          seen.add(name);
          allFailures.push({
            supplier_name: name,
            supplier_id: f.supplierId || f.supplier_id || null,
            error: f.error,
            retried_attempts: f.retriedAttempts || f.retried_attempts || 0,
            website: f.website || null
          });
        }
      }
    }

    // Enrich with website URLs if not already stored in failures JSONB
    const needsWebsite = allFailures.filter(f => !f.website);
    if (needsWebsite.length > 0) {
      const names = needsWebsite.map(f => f.supplier_name);
      const [suppliers] = await this.sequelize.query(`
        SELECT name, website FROM suppliers WHERE name = ANY($1::text[])
      `, { bind: [names] });

      const websiteMap = {};
      suppliers.forEach(s => { websiteMap[s.name] = s.website; });
      needsWebsite.forEach(f => { f.website = websiteMap[f.supplier_name] || null; });
    }

    return allFailures;
  }

  /**
   * Get suppliers with stale prices (>48h) that are configured for scraping.
   */
  async _getStaleSuppliers() {
    // heatingoil-kjnt: fuel-aware via the canonical builder. CTE carries
    // health_fuel_type so the diagnostic output labels which fuel produced
    // last_price (one of the 8 visible-price sites in bead kjnt). The
    // l0n6 never-touched and disabled-domain filters stay intact below.
    const cte = buildLatestHealthPriceCTE({
      cteName: 'latest_prices',
      includePrice: true,
    });
    const [results] = await this.sequelize.query(`
      ${cte}
      SELECT
        s.name,
        s.website,
        s.scrape_status,
        s.consecutive_scrape_failures,
        lp.price_per_gallon as last_price,
        lp.health_fuel_type as last_price_fuel_type,
        lp.scraped_at as last_scraped,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(lp.scraped_at, s.created_at))) / 86400 as stale_days
      FROM suppliers s
      LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND s.website IS NOT NULL
        AND s.website != ''
        AND (lp.scraped_at IS NULL OR lp.scraped_at < NOW() - INTERVAL '48 hours')
        -- heatingoil-l0n6: drop suppliers that have NEVER been touched
        -- (no successful price AND no recorded failure). These are usually
        -- new rows awaiting their first scrape cycle; flagging them as
        -- "stale" before the scheduler has rotated to them produces false
        -- positives in the diagnostic groups (e.g. Wardwell/No Frills/Brewer
        -- the morning they were added).
        AND (lp.scraped_at IS NOT NULL OR s.last_scrape_failure_at IS NOT NULL)
      ORDER BY lp.scraped_at ASC NULLS FIRST
    `);

    // heatingoil-l0n6: drop suppliers whose scrape-config entry is
    // `enabled: false`. The operator already triaged them (e.g. site
    // redirected, price replaced with "call for pricing", domain dead);
    // re-surfacing them as health alerts every day is noise. Cooldown /
    // phone_only signals are NOT touched here — those come from the
    // backoff system and remain visible as intended.
    const disabledDomains = this._getConfigDisabledDomains();
    const filtered = disabledDomains.size === 0
      ? results
      : results.filter(r => {
          const domain = normalizeDomain(r.website);
          return !domain || !disabledDomains.has(domain);
        });

    return filtered.map(r => ({
      name: r.name,
      website: r.website,
      scrape_status: r.scrape_status,
      consecutive_failures: parseInt(r.consecutive_scrape_failures) || 0,
      last_price: r.last_price ? parseFloat(r.last_price) : null,
      last_price_fuel_type: r.last_price_fuel_type, // heatingoil-kjnt — disambiguates non-oil prices
      last_scraped: r.last_scraped,
      stale_days: Math.round(parseFloat(r.stale_days) * 10) / 10
    }));
  }

  /**
   * Get backoff status breakdown for all scrapable suppliers.
   */
  async _getBackoffBreakdown() {
    const [results] = await this.sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE scrape_status = 'active' OR scrape_status IS NULL) as active,
        COUNT(*) FILTER (WHERE scrape_status = 'cooldown') as cooldown,
        COUNT(*) FILTER (WHERE scrape_status = 'phone_only') as phone_only,
        COUNT(*) FILTER (WHERE consecutive_scrape_failures > 0
                           AND (scrape_status = 'active' OR scrape_status IS NULL)) as at_risk
      FROM suppliers
      WHERE active = true
        AND allow_price_display = true
        AND website IS NOT NULL
        AND website != ''
    `);

    const row = results[0] || {};
    return {
      active: parseInt(row.active) || 0,
      cooldown: parseInt(row.cooldown) || 0,
      phoneOnly: parseInt(row.phone_only) || 0,
      atRisk: parseInt(row.at_risk) || 0
    };
  }

  /**
   * Lightweight HTTP HEAD probe for stale suppliers.
   * Diagnoses: DNS dead, SSL error, blocked, page moved, server down,
   *            or "site up → HTML changed" when site responds 200.
   * @param {Array} suppliers - Stale supplier objects with name, website, stale_days
   * @returns {Array} Probe results with category and diagnosis
   */
  async _probeSuppliers(suppliers) {
    const results = [];

    for (const s of suppliers) {
      if (!s.website) continue;

      try {
        const probe = await this._probeUrl(s.website);
        results.push({
          name: s.name,
          website: s.website,
          stale_days: s.stale_days,
          ...probe
        });
      } catch (err) {
        results.push({
          name: s.name,
          website: s.website,
          stale_days: s.stale_days,
          category: 'unknown',
          diagnosis: err.message
        });
      }
    }

    return results;
  }

  /**
   * Probe a single URL with HTTP HEAD (5s timeout).
   * Returns { category, diagnosis } based on response.
   */
  _probeUrl(website) {
    return new Promise((resolve) => {
      let url = website;
      if (!url.startsWith('http')) url = 'https://' + url;

      const timer = setTimeout(() => {
        resolve({ category: 'timeout', diagnosis: 'Probe timeout (5s)' });
      }, 5000);

      try {
        const parsed = new URL(url);
        const protocol = parsed.protocol === 'https:' ? https : http;

        const req = protocol.request(url, {
          method: 'HEAD',
          timeout: 5000,
          headers: { 'User-Agent': 'HomeHeatBot/1.0 (health-check)' },
          rejectUnauthorized: true
        }, (res) => {
          clearTimeout(timer);

          if (res.statusCode === 200) {
            resolve({ category: 'html_changed', diagnosis: 'Site responds 200 — likely HTML/price format changed' });
          } else if (res.statusCode === 403) {
            resolve({ category: 'blocked', diagnosis: 'HTTP 403 — blocked by WAF' });
          } else if (res.statusCode === 404) {
            resolve({ category: 'page_moved', diagnosis: 'HTTP 404 — page not found' });
          } else if (res.statusCode >= 300 && res.statusCode < 400) {
            const location = res.headers.location || 'unknown';
            resolve({ category: 'page_moved', diagnosis: `HTTP ${res.statusCode} redirect → ${location}` });
          } else if (res.statusCode >= 500) {
            resolve({ category: 'server_error', diagnosis: `HTTP ${res.statusCode}` });
          } else {
            resolve({ category: 'unknown', diagnosis: `HTTP ${res.statusCode}` });
          }
        });

        req.on('error', (err) => {
          clearTimeout(timer);

          if (err.code === 'ENOTFOUND') {
            resolve({ category: 'dns_dead', diagnosis: 'Domain does not resolve — may have expired' });
          } else if (err.code === 'ECONNREFUSED') {
            resolve({ category: 'connection_refused', diagnosis: 'Connection refused — server down' });
          } else if (err.code === 'ECONNRESET') {
            resolve({ category: 'blocked', diagnosis: 'Connection reset — likely anti-bot' });
          } else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
                     err.code === 'CERT_HAS_EXPIRED' ||
                     err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
                     (err.message && (err.message.includes('certificate') || err.message.includes('SSL')))) {
            resolve({ category: 'ssl_error', diagnosis: `SSL error: ${err.code || err.message}` });
          } else {
            resolve({ category: 'unknown', diagnosis: err.message || err.code });
          }
        });

        req.on('timeout', () => {
          req.destroy();
          clearTimeout(timer);
          resolve({ category: 'timeout', diagnosis: 'Probe timeout' });
        });

        req.end();
      } catch (err) {
        clearTimeout(timer);
        resolve({ category: 'unknown', diagnosis: `URL parse error: ${err.message}` });
      }
    });
  }
}

module.exports = { SupplierDiagnosticsService, classifyError, CATEGORIES };
