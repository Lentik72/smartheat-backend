/**
 * Coverage Intelligence Service
 * V2.3.0: Automated coverage analysis and reporting
 *
 * Runs daily to:
 * - Find new user locations
 * - Analyze coverage quality
 * - Detect expansion patterns
 * - Check supplier health
 * - Generate recommendations
 * - Send reports via email
 */

const { Op } = require('sequelize');
const { getUserLocationModel, getNewLocations, getCoverageGaps } = require('../models/UserLocation');
const { getSupplierModel } = require('../models/Supplier');
const { findSuppliersForZip } = require('./supplierMatcher');

// V2.5.2: Commercial/non-market ZIPs to exclude from gap reporting
// These are downtown business districts with no residential oil heat customers
const EXCLUDED_ZIPS = new Set([
  // Manhattan (NYC) - commercial high-rises, ConEd steam, no oil tanks
  '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10008', '10009',
  '10010', '10011', '10012', '10013', '10014', '10016', '10017', '10018', '10019',
  '10020', '10021', '10022', '10023', '10024', '10025', '10026', '10027', '10028',
  '10029', '10030', '10031', '10032', '10033', '10034', '10035', '10036', '10037',
  '10038', '10039', '10040', '10044', '10065', '10069', '10075', '10128', '10280',
  // Center City Philadelphia - downtown business district
  '19101', '19102', '19103', '19105', '19106', '19107', '19108', '19109'
]);

// V2.7.0: Low heating oil market states - under 5% of homes use heating oil
// Coverage gaps in these states are deprioritized (no COD suppliers exist)
// Source: EIA Residential Energy Consumption Survey
const LOW_OIL_MARKET_STATES = new Set([
  'VA',  // Virginia - ~4% heating oil, mostly full-service only
  'NC',  // North Carolina - <2% heating oil
  'SC',  // South Carolina - <1% heating oil
  'GA',  // Georgia - <1% heating oil
  'FL',  // Florida - <1% heating oil
  'AL',  // Alabama - <1% heating oil
  'MS',  // Mississippi - <1% heating oil
  'LA',  // Louisiana - <1% heating oil
  'TX',  // Texas - <1% heating oil
  'AZ',  // Arizona - <1% heating oil
  'NV',  // Nevada - <1% heating oil
  'CA',  // California - <2% heating oil
  'OR',  // Oregon - <3% heating oil
  'WA',  // Washington - <3% heating oil
]);

class CoverageIntelligenceService {
  constructor(sequelize, mailer = null) {
    this.sequelize = sequelize;
    this.mailer = mailer;
    this.suppliersCache = null;
  }

  /**
   * Load all active suppliers for coverage checking
   */
  async loadSuppliers() {
    if (this.suppliersCache) return this.suppliersCache;

    const Supplier = getSupplierModel();
    if (!Supplier) {
      console.log('[CoverageIntelligence] Supplier model not available');
      return [];
    }

    try {
      const suppliers = await Supplier.findAll({
        where: { active: true },
        raw: true
      });
      this.suppliersCache = suppliers;
      console.log(`[CoverageIntelligence] Loaded ${suppliers.length} active suppliers`);
      return suppliers;
    } catch (error) {
      console.error('[CoverageIntelligence] Failed to load suppliers:', error.message);
      return [];
    }
  }

  /**
   * Run daily analysis job
   */
  async runDailyAnalysis() {
    console.log('[CoverageIntelligence] Starting daily analysis...');

    const report = {
      date: new Date(),
      newLocations: [],
      coverageGaps: [],
      expansionPatterns: [],
      supplierHealth: [],
      recommendations: [],
      scrapeResults: null,  // V1.7.0: Include scrape results for email report
      scrapeHealth: null    // V2.6.0: Track blocked/stale sites for trend monitoring
    };

    try {
      // 1. Find new ZIPs (first seen in last 24h)
      report.newLocations = await this.findNewLocations();
      console.log(`[CoverageIntelligence] Found ${report.newLocations.length} new locations`);

      // 2. Check coverage for all tracked ZIPs
      report.coverageGaps = await this.analyzeCoverage();
      console.log(`[CoverageIntelligence] Found ${report.coverageGaps.length} coverage gaps`);

      // 3. Detect expansion patterns
      report.expansionPatterns = await this.detectExpansionPatterns();
      console.log(`[CoverageIntelligence] Found ${report.expansionPatterns.length} expansion patterns`);

      // 4. Check supplier health
      report.supplierHealth = await this.checkSupplierHealth();
      console.log(`[CoverageIntelligence] Found ${report.supplierHealth.length} potentially stale suppliers`);

      // 5. Generate recommendations
      report.recommendations = this.generateRecommendations(report);
      console.log(`[CoverageIntelligence] Generated ${report.recommendations.length} recommendations`);

      // 6. V1.7.0: Get recent scrape results (from yesterday's 10 AM run)
      report.scrapeResults = await this.getRecentScrapeFailures();
      if (report.scrapeResults) {
        console.log(`[CoverageIntelligence] Scrape results: ${report.scrapeResults.successCount} success, ${report.scrapeResults.failedCount} failed`);
      }

      // 7. V2.6.0: Get scrape health (blocked/stale sites trend)
      report.scrapeHealth = await this.getScrapeHealth();
      if (report.scrapeHealth) {
        console.log(`[CoverageIntelligence] Scrape health: ${report.scrapeHealth.scrapedToday}/${report.scrapeHealth.totalScrapable} scraped today, ${report.scrapeHealth.blockedCount} blocked`);
      }

      // V2.5.2: No longer sends email directly - server.js combines with activity report
      // Email is sent by server.js via mailer.sendCombinedDailyReport()

      console.log('[CoverageIntelligence] Daily analysis completed');
      return report;

    } catch (error) {
      console.error('[CoverageIntelligence] Error during analysis:', error);
      throw error;
    }
  }

  /**
   * Find locations first seen in last 24 hours
   * V2.5.2: Skips excluded commercial ZIPs
   * V2.7.0: Tags locations with marketType (high_oil, low_oil, excluded)
   */
  async findNewLocations() {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) return [];

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const locations = await UserLocation.findAll({
      where: { firstSeenAt: { [Op.gte]: yesterday } },
      order: [['firstSeenAt', 'DESC']]
    });

    // Load suppliers for coverage checking
    const allSuppliers = await this.loadSuppliers();

    // Enrich with coverage info (skip excluded ZIPs)
    const enriched = [];
    for (const loc of locations) {
      // V2.5.2: Skip excluded commercial ZIPs
      if (EXCLUDED_ZIPS.has(loc.zipCode)) continue;

      const result = findSuppliersForZip(loc.zipCode, allSuppliers, { includeRadius: false });

      // V2.7.0: Determine market type
      const marketType = LOW_OIL_MARKET_STATES.has(loc.state) ? 'low_oil' : 'high_oil';

      enriched.push({
        zipCode: loc.zipCode,
        city: loc.city,
        county: loc.county,
        state: loc.state,
        firstSeenAt: loc.firstSeenAt,
        supplierCount: result?.suppliers?.length || 0,
        marketType
      });
    }

    return enriched;
  }

  /**
   * Analyze coverage for all tracked locations
   * Updates coverage quality in database
   * V2.5.2: Skips excluded commercial ZIPs
   * V2.7.0: Tags gaps with marketType for prioritization
   */
  async analyzeCoverage() {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) return [];

    // Load suppliers for coverage checking
    const allSuppliers = await this.loadSuppliers();

    const locations = await UserLocation.findAll();
    const gaps = [];

    for (const loc of locations) {
      // V2.5.2: Skip excluded commercial ZIPs
      if (EXCLUDED_ZIPS.has(loc.zipCode)) {
        // Update as "excluded" but don't report as gap
        await loc.update({
          supplierCount: 0,
          coverageQuality: 'excluded',
          lastCoverageCheck: new Date()
        });
        continue;
      }

      // Get supplier count for this ZIP
      const result = findSuppliersForZip(loc.zipCode, allSuppliers, { includeRadius: false });
      const supplierCount = result?.suppliers?.length || 0;
      const quality = this.scoreCoverageQuality(supplierCount);

      // V2.7.0: Determine market type
      const marketType = LOW_OIL_MARKET_STATES.has(loc.state) ? 'low_oil' : 'high_oil';

      // Update location record
      await loc.update({
        supplierCount,
        coverageQuality: quality,
        lastCoverageCheck: new Date()
      });

      if (quality === 'none' || quality === 'poor') {
        gaps.push({
          zipCode: loc.zipCode,
          city: loc.city,
          county: loc.county,
          state: loc.state,
          supplierCount,
          requestCount: loc.requestCount,
          firstSeenAt: loc.firstSeenAt,
          marketType
        });
      }
    }

    // Sort by market type (high_oil first) then by request count
    return gaps.sort((a, b) => {
      if (a.marketType !== b.marketType) {
        return a.marketType === 'high_oil' ? -1 : 1;
      }
      return b.requestCount - a.requestCount;
    });
  }

  /**
   * Score coverage quality
   */
  scoreCoverageQuality(supplierCount) {
    if (supplierCount === 0) return 'none';
    if (supplierCount < 3) return 'poor';
    if (supplierCount < 5) return 'adequate';
    return 'good';
  }

  /**
   * Detect geographic expansion patterns
   * Finds regions with multiple new ZIPs in last 7 days
   */
  async detectExpansionPatterns() {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) return [];

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentLocations = await UserLocation.findAll({
      where: { firstSeenAt: { [Op.gte]: weekAgo } }
    });

    // Group by state and county
    const byRegion = {};
    for (const loc of recentLocations) {
      if (!loc.state || !loc.county) continue;
      const key = `${loc.state}-${loc.county}`;
      byRegion[key] = byRegion[key] || [];
      byRegion[key].push(loc);
    }

    // Return regions with 3+ new ZIPs (expansion signal)
    return Object.entries(byRegion)
      .filter(([_, locs]) => locs.length >= 3)
      .map(([region, locs]) => ({
        region,
        state: locs[0].state,
        county: locs[0].county,
        newZipCount: locs.length,
        zips: locs.map(l => l.zipCode)
      }));
  }

  /**
   * Check supplier health
   * Only checks suppliers that have scraping enabled - no point reporting on non-scrapable ones
   */
  async checkSupplierHealth() {
    const Supplier = getSupplierModel();
    if (!Supplier || !this.sequelize) return [];

    const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      // Load scrape config to know which suppliers are scrapable
      const scrapeConfig = require('../data/scrape-config.json');
      const scrapableDomains = new Set(
        Object.entries(scrapeConfig)
          .filter(([key, val]) => typeof val === 'object' && val.enabled === true)
          .map(([key]) => key.toLowerCase())
      );

      // Find active suppliers with websites
      const [allSuppliers] = await this.sequelize.query(`
        SELECT s.id, s.name, s.state, s.city, s.website,
               MAX(sp.scraped_at) as last_price_update
        FROM suppliers s
        LEFT JOIN supplier_prices sp ON s.id = sp.supplier_id
        WHERE s.active = true AND s.website IS NOT NULL
        GROUP BY s.id, s.name, s.state, s.city, s.website
        ORDER BY s.name
      `);

      // Filter to only scrapable suppliers with stale/no data
      const staleSuppliers = allSuppliers.filter(s => {
        // Extract domain from website
        try {
          const url = new URL(s.website);
          const domain = url.hostname.replace(/^www\./, '').toLowerCase();

          // Only include if this supplier is configured for scraping
          if (!scrapableDomains.has(domain)) return false;

          // Check if stale or never scraped
          if (!s.last_price_update) return true;
          return new Date(s.last_price_update) < staleThreshold;
        } catch {
          return false;
        }
      });

      return staleSuppliers.map(r => ({
        id: r.id,
        name: r.name,
        state: r.state,
        city: r.city,
        lastPriceUpdate: r.last_price_update || 'never'
      }));
    } catch (error) {
      console.error('[CoverageIntelligence] Error checking supplier health:', error.message);
      return [];
    }
  }

  /**
   * Generate recommendations based on analysis
   * V2.7.0: Separates high-oil vs low-oil market gaps
   */
  generateRecommendations(report) {
    const recs = [];

    // V2.7.0: Separate gaps by market type
    const highOilGaps = report.coverageGaps.filter(g => g.marketType === 'high_oil');
    const lowOilGaps = report.coverageGaps.filter(g => g.marketType === 'low_oil');

    // Priority gaps in HIGH OIL markets (users with no coverage) - actionable
    const criticalHighOil = highOilGaps.filter(g => g.supplierCount === 0);
    if (criticalHighOil.length > 0) {
      recs.push({
        priority: 'HIGH',
        type: 'coverage_gap',
        message: `${criticalHighOil.length} ZIP code${criticalHighOil.length > 1 ? 's have' : ' has'} NO coverage in high-oil markets`,
        details: criticalHighOil.slice(0, 5).map(g => `${g.city || 'Unknown'}, ${g.state} (${g.zipCode}) - ${g.requestCount} requests`)
      });
    }

    // Poor coverage in high-oil markets
    const poorHighOil = highOilGaps.filter(g => g.supplierCount > 0 && g.supplierCount < 3);
    if (poorHighOil.length > 0) {
      recs.push({
        priority: 'MEDIUM',
        type: 'poor_coverage',
        message: `${poorHighOil.length} ZIP code${poorHighOil.length > 1 ? 's have' : ' has'} limited coverage (1-2 suppliers)`,
        details: poorHighOil.slice(0, 5).map(g => `${g.city || 'Unknown'}, ${g.state} (${g.zipCode}) - ${g.supplierCount} supplier${g.supplierCount > 1 ? 's' : ''}`)
      });
    }

    // LOW OIL market gaps - track for propane/future expansion, lower priority
    if (lowOilGaps.length > 0) {
      recs.push({
        priority: 'LOW',
        type: 'low_oil_market',
        message: `${lowOilGaps.length} searches in low-oil markets (potential propane users)`,
        details: lowOilGaps.slice(0, 5).map(g => `${g.city || 'Unknown'}, ${g.state} (${g.zipCode}) - ${g.requestCount} requests`)
      });
    }

    // Expansion opportunities
    for (const pattern of report.expansionPatterns) {
      recs.push({
        priority: 'MEDIUM',
        type: 'expansion',
        message: `Growing interest in ${pattern.county}, ${pattern.state}`,
        details: [`${pattern.newZipCount} new ZIPs in last 7 days: ${pattern.zips.join(', ')}`]
      });
    }

    // Supplier health issues
    if (report.supplierHealth.length > 5) {
      recs.push({
        priority: 'LOW',
        type: 'supplier_health',
        message: `${report.supplierHealth.length} suppliers may be inactive (no price updates in 7+ days)`,
        details: report.supplierHealth.slice(0, 5).map(s => `${s.name} (${s.city}, ${s.state})`)
      });
    }

    return recs;
  }

  /**
   * Check if report has actionable items
   */
  hasActionableItems(report) {
    // Always send if there are new locations (even if covered)
    if (report.newLocations.length > 0) return true;

    // Send if there are HIGH priority recommendations
    if (report.recommendations.some(r => r.priority === 'HIGH')) return true;

    // Send if there are expansion patterns
    if (report.expansionPatterns.length > 0) return true;

    return false;
  }

  /**
   * Get current coverage statistics
   */
  async getCoverageStats() {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) return null;

    const [stats] = await UserLocation.sequelize.query(`
      SELECT
        COUNT(*) as total_locations,
        COUNT(CASE WHEN coverage_quality = 'none' THEN 1 END) as no_coverage,
        COUNT(CASE WHEN coverage_quality = 'poor' THEN 1 END) as poor_coverage,
        COUNT(CASE WHEN coverage_quality = 'adequate' THEN 1 END) as adequate_coverage,
        COUNT(CASE WHEN coverage_quality = 'good' THEN 1 END) as good_coverage,
        SUM(request_count) as total_requests,
        COUNT(CASE WHEN first_seen_at > NOW() - INTERVAL '24 hours' THEN 1 END) as new_last_24h,
        COUNT(CASE WHEN first_seen_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_last_7d
      FROM user_locations
    `);

    return stats[0];
  }

  /**
   * V1.7.0: Get most recent scrape run results for daily report
   * Returns failures from the last 24 hours
   */
  async getRecentScrapeFailures() {
    try {
      const [runs] = await this.sequelize.query(`
        SELECT
          run_at,
          success_count,
          failed_count,
          skipped_count,
          duration_ms,
          failures
        FROM scrape_runs
        WHERE run_at > NOW() - INTERVAL '24 hours'
        ORDER BY run_at DESC
        LIMIT 1
      `);

      if (runs.length === 0) {
        return null;
      }

      const run = runs[0];
      return {
        runAt: run.run_at,
        successCount: run.success_count,
        failedCount: run.failed_count,
        skippedCount: run.skipped_count,
        durationMs: run.duration_ms,
        failures: run.failures || []
      };
    } catch (error) {
      console.error('[CoverageIntelligence] Error getting scrape failures:', error.message);
      return null;
    }
  }

  /**
   * V2.6.0: Get scrape health metrics for daily report
   * Tracks blocked/stale sites and trend over time
   */
  async getScrapeHealth() {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const weekAgoStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get all suppliers with scrape history (exclude phone-only and non-price-display)
      const [suppliers] = await this.sequelize.query(`
        SELECT
          s.id, s.name, s.website,
          sp.scraped_at, sp.price_per_gallon, sp.expires_at
        FROM suppliers s
        LEFT JOIN (
          SELECT DISTINCT ON (supplier_id) *
          FROM supplier_prices
          ORDER BY supplier_id, scraped_at DESC
        ) sp ON s.id = sp.supplier_id
        WHERE s.active = true
          AND s.website IS NOT NULL
          AND s.website != ''
          AND s.allow_price_display = true
          AND (s.scrape_status IS NULL OR s.scrape_status NOT IN ('phone_only', 'disabled'))
        ORDER BY sp.scraped_at DESC NULLS LAST
      `);

      // Categorize suppliers
      let scrapedToday = 0;
      let scrapedYesterday = 0;
      let staleCount = 0;  // 2+ days old
      let neverScraped = 0;
      let blockedSites = [];

      for (const s of suppliers) {
        if (!s.scraped_at) {
          neverScraped++;
        } else {
          const scrapeDate = new Date(s.scraped_at);
          const expiresAt = s.expires_at ? new Date(s.expires_at) : null;

          if (scrapeDate >= todayStart) {
            scrapedToday++;
          } else if (scrapeDate >= yesterdayStart) {
            scrapedYesterday++;
          } else {
            staleCount++;
            // Track as blocked if it was working before (has price) but now stale
            if (s.price_per_gallon) {
              const daysSinceUpdate = Math.floor((now - scrapeDate) / (24 * 60 * 60 * 1000));
              blockedSites.push({
                name: s.name,
                website: s.website,
                lastPrice: parseFloat(s.price_per_gallon),
                lastScrape: s.scraped_at,
                daysSinceUpdate
              });
            }
          }
        }
      }

      const totalScrapable = suppliers.length - neverScraped;
      const successRate = totalScrapable > 0
        ? Math.round((scrapedToday / totalScrapable) * 100)
        : 0;

      // Get historical data for trend (from scrape_runs)
      const [historicalRuns] = await this.sequelize.query(`
        SELECT
          DATE(run_at) as run_date,
          success_count,
          failed_count,
          skipped_count
        FROM scrape_runs
        WHERE run_at > NOW() - INTERVAL '7 days'
        ORDER BY run_at DESC
      `);

      // Calculate 7-day trend
      let weeklyTrend = null;
      if (historicalRuns.length >= 2) {
        const recentFailures = historicalRuns.slice(0, 3).reduce((sum, r) => sum + (r.failed_count || 0), 0);
        const olderFailures = historicalRuns.slice(-3).reduce((sum, r) => sum + (r.failed_count || 0), 0);
        weeklyTrend = recentFailures > olderFailures ? 'increasing' :
                      recentFailures < olderFailures ? 'decreasing' : 'stable';
      }

      return {
        scrapedToday,
        scrapedYesterday,
        staleCount,
        neverScraped,
        blockedCount: blockedSites.length,
        totalScrapable,
        successRate,
        blockedSites: blockedSites.slice(0, 15),  // Top 15 for report
        weeklyTrend,
        historicalRuns: historicalRuns.slice(0, 7)  // Last 7 days
      };
    } catch (error) {
      console.error('[CoverageIntelligence] Error getting scrape health:', error.message);
      return null;
    }
  }
}

module.exports = CoverageIntelligenceService;
