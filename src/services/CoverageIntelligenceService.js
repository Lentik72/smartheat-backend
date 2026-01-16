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
      recommendations: []
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
      enriched.push({
        zipCode: loc.zipCode,
        city: loc.city,
        county: loc.county,
        state: loc.state,
        firstSeenAt: loc.firstSeenAt,
        supplierCount: result?.suppliers?.length || 0
      });
    }

    return enriched;
  }

  /**
   * Analyze coverage for all tracked locations
   * Updates coverage quality in database
   * V2.5.2: Skips excluded commercial ZIPs
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
          firstSeenAt: loc.firstSeenAt
        });
      }
    }

    // Sort by request count (most active users first)
    return gaps.sort((a, b) => b.requestCount - a.requestCount);
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
   */
  generateRecommendations(report) {
    const recs = [];

    // Priority gaps (users with no coverage)
    const criticalGaps = report.coverageGaps.filter(g => g.supplierCount === 0);
    if (criticalGaps.length > 0) {
      recs.push({
        priority: 'HIGH',
        type: 'coverage_gap',
        message: `${criticalGaps.length} ZIP code${criticalGaps.length > 1 ? 's have' : ' has'} NO supplier coverage`,
        details: criticalGaps.slice(0, 5).map(g => `${g.city || 'Unknown'}, ${g.state} (${g.zipCode}) - ${g.requestCount} requests`)
      });
    }

    // Poor coverage
    const poorGaps = report.coverageGaps.filter(g => g.supplierCount > 0 && g.supplierCount < 3);
    if (poorGaps.length > 0) {
      recs.push({
        priority: 'MEDIUM',
        type: 'poor_coverage',
        message: `${poorGaps.length} ZIP code${poorGaps.length > 1 ? 's have' : ' has'} limited coverage (1-2 suppliers)`,
        details: poorGaps.slice(0, 5).map(g => `${g.city || 'Unknown'}, ${g.state} (${g.zipCode}) - ${g.supplierCount} supplier${g.supplierCount > 1 ? 's' : ''}`)
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
}

module.exports = CoverageIntelligenceService;
