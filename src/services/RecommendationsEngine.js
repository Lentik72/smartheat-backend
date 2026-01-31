/**
 * RecommendationsEngine Service
 *
 * Generates smart, actionable recommendations based on unified analytics data.
 * Focuses on three key areas:
 * 1. Retention - How to keep users coming back
 * 2. Acquisition - How to get more users
 * 3. Growth - Android app decision and expansion
 */

class RecommendationsEngine {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;
  }

  /**
   * Generate all recommendations based on current data
   * @param {Object} unifiedData - Data from UnifiedAnalytics.getUnifiedOverview()
   * @returns {Array} Prioritized list of recommendations
   */
  async generateRecommendations(unifiedData) {
    const recommendations = [];

    // Analyze each area
    await Promise.all([
      this.analyzeRetention(unifiedData, recommendations),
      this.analyzeAcquisition(unifiedData, recommendations),
      this.analyzeCoverage(recommendations),
      this.analyzeDataQuality(recommendations),
      this.analyzeGrowth(unifiedData, recommendations)
    ]);

    // Sort by priority
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3, 'OPPORTUNITY': 4 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Analyze retention metrics and generate recommendations
   */
  async analyzeRetention(data, recommendations) {
    const retention = data?.retention;
    const app = data?.app;

    // Check week 1 retention
    if (retention?.summary?.week1RetentionRate) {
      const week1Rate = parseFloat(retention.summary.week1RetentionRate);

      if (week1Rate < 20) {
        recommendations.push({
          id: 'retention-critical',
          priority: 'CRITICAL',
          category: 'retention',
          title: `Critical: Only ${week1Rate}% of users return after week 1`,
          insight: '85% of users churn within the first week. This is the #1 priority to fix.',
          impact: 'HIGH',
          actions: [
            { type: 'feature', text: 'Add push notifications for price drops in user\'s area' },
            { type: 'feature', text: 'Implement delivery reminder alerts' },
            { type: 'feature', text: 'Create weekly market update emails for opted-in users' },
            { type: 'feature', text: 'Add "price watch" feature to track specific suppliers' }
          ],
          metrics: {
            currentRate: week1Rate,
            targetRate: 30,
            potentialGain: `${Math.round((30 - week1Rate) / 100 * (retention.summary.totalCohortSize || 100))} more retained users`
          }
        });
      } else if (week1Rate < 40) {
        recommendations.push({
          id: 'retention-improve',
          priority: 'HIGH',
          category: 'retention',
          title: `Improve week 1 retention from ${week1Rate}% to 40%`,
          insight: 'Retention is below industry benchmarks for utility apps.',
          impact: 'HIGH',
          actions: [
            { type: 'feature', text: 'Add onboarding flow highlighting key features' },
            { type: 'engagement', text: 'Send re-engagement email to users who haven\'t returned in 3 days' }
          ],
          metrics: { currentRate: week1Rate, targetRate: 40 }
        });
      }
    }

    // Check behavior-based retention
    if (retention?.behaviorRetention?.length > 0) {
      const callRetention = retention.behaviorRetention.find(b => b.behavior === 'made_call');
      const browseRetention = retention.behaviorRetention.find(b => b.behavior === 'browsed_only');

      if (callRetention && browseRetention) {
        const callDays = callRetention.avgActiveDays;
        const browseDays = browseRetention.avgActiveDays;

        if (callDays > browseDays * 2) {
          recommendations.push({
            id: 'retention-push-calls',
            priority: 'MEDIUM',
            category: 'retention',
            title: 'Users who call suppliers stay 2x longer',
            insight: `Users who make calls average ${callDays} active days vs ${browseDays} for browsers.`,
            impact: 'MEDIUM',
            actions: [
              { type: 'ux', text: 'Make "Call" button more prominent in search results' },
              { type: 'feature', text: 'Add call outcome tracking ("Did you order?")' },
              { type: 'engagement', text: 'Send nudge to users who view but don\'t call' }
            ]
          });
        }
      }
    }
  }

  /**
   * Analyze acquisition metrics and generate recommendations
   */
  async analyzeAcquisition(data, recommendations) {
    const website = data?.website;
    const backend = data?.backend;

    // Check organic traffic percentage
    if (website?.organicPercent !== undefined) {
      const organicPercent = parseFloat(website.organicPercent);

      if (organicPercent < 15) {
        recommendations.push({
          id: 'acquisition-seo',
          priority: 'MEDIUM',
          category: 'acquisition',
          title: `SEO driving only ${organicPercent}% of traffic`,
          insight: 'Most traffic is direct - users already know you. SEO can expand reach to new users.',
          impact: 'MEDIUM',
          actions: [
            { type: 'content', text: 'Create more local SEO pages for top cities' },
            { type: 'content', text: 'Target "heating oil prices [city]" long-tail keywords' },
            { type: 'technical', text: 'Build backlinks from local business directories' },
            { type: 'technical', text: 'Add structured data for local business schema' }
          ],
          metrics: {
            currentOrganic: organicPercent,
            targetOrganic: 30,
            note: 'Organic users typically convert better'
          }
        });
      }
    }

    // Check search to click conversion
    if (backend?.searches?.total > 0 && backend?.clicks?.total !== undefined) {
      const conversionRate = (backend.clicks.total / backend.searches.total * 100).toFixed(1);

      if (parseFloat(conversionRate) < 5) {
        recommendations.push({
          id: 'acquisition-conversion',
          priority: 'HIGH',
          category: 'acquisition',
          title: `Low search-to-click conversion: ${conversionRate}%`,
          insight: 'Many users search but don\'t click any suppliers. They may not find what they need.',
          impact: 'HIGH',
          actions: [
            { type: 'ux', text: 'Show prices more prominently in search results' },
            { type: 'ux', text: 'Add filters for price range, minimum gallons, etc.' },
            { type: 'feature', text: 'Show "Best Value" or "Lowest Price" badges' },
            { type: 'data', text: 'Investigate ZIPs with high searches but low clicks' }
          ],
          metrics: {
            searches: backend.searches.total,
            clicks: backend.clicks.total,
            missedOpportunity: backend.searches.total - backend.clicks.total
          }
        });
      }
    }
  }

  /**
   * Analyze coverage gaps
   */
  async analyzeCoverage(recommendations) {
    try {
      // Get coverage gaps from database
      const [noSuppliers, lowEngagement] = await Promise.all([
        this.sequelize.query(`
          SELECT COUNT(DISTINCT ul.zip_code) as count
          FROM user_locations ul
          WHERE ul.created_at > NOW() - INTERVAL '30 days'
            AND NOT EXISTS (
              SELECT 1 FROM suppliers s
              WHERE s.active = true
                AND s.postal_codes_served IS NOT NULL
                AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
            )
        `, { type: this.sequelize.QueryTypes.SELECT }),

        this.sequelize.query(`
          SELECT COUNT(DISTINCT ul.zip_code) as count
          FROM user_locations ul
          WHERE ul.created_at > NOW() - INTERVAL '30 days'
            AND EXISTS (
              SELECT 1 FROM suppliers s
              WHERE s.active = true
                AND s.postal_codes_served IS NOT NULL
                AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
            )
            AND NOT EXISTS (
              SELECT 1 FROM supplier_clicks sc
              WHERE sc.zip_code = ul.zip_code
                AND sc.created_at > NOW() - INTERVAL '30 days'
            )
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const noSuppliersCount = parseInt(noSuppliers[0]?.count) || 0;
      const lowEngagementCount = parseInt(lowEngagement[0]?.count) || 0;

      if (noSuppliersCount > 5) {
        // Get top uncovered ZIPs
        const topUncovered = await this.sequelize.query(`
          SELECT ul.zip_code, COUNT(*) as searches
          FROM user_locations ul
          WHERE ul.created_at > NOW() - INTERVAL '30 days'
            AND NOT EXISTS (
              SELECT 1 FROM suppliers s
              WHERE s.active = true
                AND s.postal_codes_served IS NOT NULL
                AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
            )
          GROUP BY ul.zip_code
          ORDER BY searches DESC
          LIMIT 5
        `, { type: this.sequelize.QueryTypes.SELECT });

        recommendations.push({
          id: 'coverage-gaps',
          priority: 'HIGH',
          category: 'coverage',
          title: `${noSuppliersCount} ZIPs searched with no suppliers`,
          insight: 'Users are searching areas you don\'t cover - these are potential lost customers.',
          impact: 'HIGH',
          actions: [
            { type: 'business', text: `Add suppliers for: ${topUncovered.map(z => z.zip_code).join(', ')}` },
            { type: 'ux', text: 'Show "Coming Soon" with waitlist for uncovered areas' },
            { type: 'business', text: 'Research heating oil suppliers in these markets' }
          ],
          metrics: {
            uncoveredZips: noSuppliersCount,
            topZips: topUncovered.map(z => ({ zip: z.zip_code, searches: parseInt(z.searches) }))
          }
        });
      }

      if (lowEngagementCount > 20) {
        recommendations.push({
          id: 'coverage-engagement',
          priority: 'MEDIUM',
          category: 'coverage',
          title: `${lowEngagementCount} ZIPs have suppliers but no clicks`,
          insight: 'You have coverage but users aren\'t engaging. May be a display or pricing issue.',
          impact: 'MEDIUM',
          actions: [
            { type: 'data', text: 'Investigate why users search but don\'t click' },
            { type: 'ux', text: 'Check if supplier info is displaying correctly for these ZIPs' },
            { type: 'pricing', text: 'Compare prices in these ZIPs to market average' }
          ],
          metrics: { lowEngagementZips: lowEngagementCount }
        });
      }
    } catch (error) {
      this.logger.error('[RecommendationsEngine] Coverage analysis error:', error.message);
    }
  }

  /**
   * Analyze data quality and scraping health
   */
  async analyzeDataQuality(recommendations) {
    try {
      const [priceStats, staleSuppliers, highClicksNoPrice] = await Promise.all([
        // Overall price coverage
        this.sequelize.query(`
          WITH latest_prices AS (
            SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
            FROM supplier_prices
            WHERE is_valid = true
            ORDER BY supplier_id, scraped_at DESC
          )
          SELECT
            COUNT(DISTINCT s.id) as total_suppliers,
            COUNT(DISTINCT lp.supplier_id) as with_prices,
            COUNT(DISTINCT CASE WHEN lp.scraped_at < NOW() - INTERVAL '48 hours' THEN s.id END) as stale
          FROM suppliers s
          LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
          WHERE s.active = true
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // Stale suppliers (prioritize by clicks)
        this.sequelize.query(`
          WITH latest_prices AS (
            SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
            FROM supplier_prices
            WHERE is_valid = true
            ORDER BY supplier_id, scraped_at DESC
          ),
          recent_clicks AS (
            SELECT supplier_id, COUNT(*) as clicks
            FROM supplier_clicks
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY supplier_id
          )
          SELECT s.name, COALESCE(rc.clicks, 0) as clicks
          FROM suppliers s
          LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
          LEFT JOIN recent_clicks rc ON s.id = rc.supplier_id
          WHERE s.active = true
            AND lp.scraped_at < NOW() - INTERVAL '48 hours'
          ORDER BY COALESCE(rc.clicks, 0) DESC
          LIMIT 5
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // High-click suppliers with no price
        this.sequelize.query(`
          WITH recent_clicks AS (
            SELECT supplier_id, supplier_name, COUNT(*) as clicks
            FROM supplier_clicks
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY supplier_id, supplier_name
          ),
          latest_prices AS (
            SELECT DISTINCT ON (supplier_id) supplier_id
            FROM supplier_prices
            WHERE is_valid = true
            ORDER BY supplier_id, scraped_at DESC
          )
          SELECT rc.supplier_name, rc.clicks
          FROM recent_clicks rc
          LEFT JOIN latest_prices lp ON rc.supplier_id = lp.supplier_id
          WHERE lp.supplier_id IS NULL
          ORDER BY rc.clicks DESC
          LIMIT 5
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const stats = priceStats[0] || {};
      const total = parseInt(stats.total_suppliers) || 0;
      const withPrices = parseInt(stats.with_prices) || 0;
      const stale = parseInt(stats.stale) || 0;
      const coverage = total > 0 ? (withPrices / total * 100).toFixed(0) : 0;

      if (parseInt(coverage) < 50) {
        recommendations.push({
          id: 'data-quality-coverage',
          priority: 'HIGH',
          category: 'data-quality',
          title: `Only ${coverage}% of suppliers have prices`,
          insight: 'Price transparency is key to user trust. More prices = more authority.',
          impact: 'HIGH',
          actions: [
            { type: 'technical', text: 'Prioritize scraping suppliers with high click counts' },
            { type: 'business', text: 'Contact suppliers directly for price feeds' },
            { type: 'ux', text: 'Show "Call for Price" instead of nothing for priceless suppliers' }
          ],
          metrics: {
            coverage: `${withPrices}/${total}`,
            percentage: coverage
          }
        });
      }

      if (stale > 3) {
        recommendations.push({
          id: 'data-quality-stale',
          priority: 'MEDIUM',
          category: 'data-quality',
          title: `${stale} suppliers have stale prices (>48h)`,
          insight: 'Outdated prices reduce trust. Users may see different prices when they call.',
          impact: 'MEDIUM',
          actions: [
            { type: 'technical', text: 'Check scraper failures for these suppliers' },
            { type: 'technical', text: 'Update scraping patterns if websites changed' }
          ],
          metrics: {
            staleCount: stale,
            topStale: staleSuppliers.map(s => s.name)
          }
        });
      }

      if (highClicksNoPrice.length > 0) {
        recommendations.push({
          id: 'data-quality-priority',
          priority: 'HIGH',
          category: 'data-quality',
          title: 'High-traffic suppliers missing prices',
          insight: 'Users are clicking these suppliers but we don\'t show prices. Scraping priority!',
          impact: 'HIGH',
          actions: highClicksNoPrice.map(s => ({
            type: 'technical',
            text: `Scrape ${s.supplier_name} (${s.clicks} clicks/week)`
          })),
          metrics: {
            suppliers: highClicksNoPrice.map(s => ({ name: s.supplier_name, clicks: parseInt(s.clicks) }))
          }
        });
      }
    } catch (error) {
      this.logger.error('[RecommendationsEngine] Data quality analysis error:', error.message);
    }
  }

  /**
   * Analyze growth signals (Android decision)
   */
  async analyzeGrowth(data, recommendations) {
    const android = data?.android;

    if (!android?.data) return;

    const { thresholds, recommendation, waitlist } = android.data;

    if (recommendation?.status === 'GO') {
      recommendations.push({
        id: 'growth-android-go',
        priority: 'OPPORTUNITY',
        category: 'growth',
        title: 'Android demand signals are strong',
        insight: recommendation.message,
        impact: 'HIGH',
        actions: [
          { type: 'business', text: 'Consider starting Android development' },
          { type: 'business', text: `Expected launch users: ${android.data.projection.expectedConversion}` },
          { type: 'business', text: 'Use React Native to share code with iOS' }
        ],
        metrics: {
          waitlist: waitlist.total,
          growthRate: `${waitlist.growthRate}%/week`,
          thresholdsMet: Object.values(thresholds).filter(t => t.met).length
        }
      });
    } else if (waitlist.total > 100) {
      recommendations.push({
        id: 'growth-android-monitor',
        priority: 'LOW',
        category: 'growth',
        title: `Android waitlist at ${waitlist.total} (target: 200)`,
        insight: recommendation.message,
        impact: 'LOW',
        actions: [
          { type: 'monitoring', text: 'Continue monitoring waitlist growth' },
          { type: 'business', text: 'PWA serves Android users adequately for now' }
        ],
        metrics: {
          waitlist: waitlist.total,
          weeksToThreshold: android.data.projection.weeksTo200
        }
      });
    }
  }

  /**
   * Get summary of recommendations by category
   */
  summarize(recommendations) {
    const summary = {
      total: recommendations.length,
      byPriority: {},
      byCategory: {},
      topPriority: null
    };

    recommendations.forEach(r => {
      summary.byPriority[r.priority] = (summary.byPriority[r.priority] || 0) + 1;
      summary.byCategory[r.category] = (summary.byCategory[r.category] || 0) + 1;
    });

    if (recommendations.length > 0) {
      summary.topPriority = {
        id: recommendations[0].id,
        title: recommendations[0].title,
        category: recommendations[0].category
      };
    }

    return summary;
  }
}

module.exports = RecommendationsEngine;
