/**
 * Coverage Report Mailer
 * V2.4.0: Uses Resend API (HTTPS) instead of SMTP
 *
 * Sends:
 * - Daily reports (when actionable items exist)
 * - Weekly summaries (every Monday)
 * - Instant alerts (critical gaps)
 *
 * Railway blocks SMTP ports, so we use Resend's HTTP API instead.
 */

class CoverageReportMailer {
  constructor() {
    this.initialized = false;
    this.apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.EMAIL_FROM || 'SmartHeat <onboarding@resend.dev>';

    if (this.apiKey) {
      this.initialized = true;
      console.log('[CoverageReportMailer] Initialized with Resend API');
    } else {
      console.log('[CoverageReportMailer] RESEND_API_KEY not configured');
    }
  }

  /**
   * Get recipient email
   */
  getRecipient() {
    return process.env.ADMIN_EMAIL || 'ltsoir@gmail.com';
  }

  /**
   * Send email via Resend API
   */
  async sendEmail(to, subject, html) {
    if (!this.initialized) {
      console.log('[CoverageReportMailer] Not initialized - skipping email');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [to],
          subject,
          html
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`[CoverageReportMailer] Email sent: ${result.id}`);
        return true;
      } else {
        console.error('[CoverageReportMailer] Resend API error:', result);
        return false;
      }
    } catch (error) {
      console.error('[CoverageReportMailer] Failed to send email:', error.message);
      return false;
    }
  }

  /**
   * Send daily coverage report
   */
  async sendDailyReport(report) {
    const recipient = this.getRecipient();
    if (!recipient) {
      console.log('[CoverageReportMailer] No recipient configured');
      return false;
    }

    const html = this.formatDailyReport(report);
    const subject = this.getDailySubject(report);

    const success = await this.sendEmail(recipient, subject, html);
    if (success) {
      console.log(`[CoverageReportMailer] Daily report sent to ${recipient}`);
    }
    return success;
  }

  /**
   * Generate subject line based on report urgency
   */
  getDailySubject(report) {
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const criticalCount = report.coverageGaps.filter(g => g.supplierCount === 0).length;

    if (criticalCount > 0) {
      return `[ACTION] SmartHeat: ${criticalCount} ZIP${criticalCount > 1 ? 's' : ''} with no coverage - ${date}`;
    }

    if (report.newLocations.length > 0) {
      return `SmartHeat Coverage: ${report.newLocations.length} new location${report.newLocations.length > 1 ? 's' : ''} - ${date}`;
    }

    return `SmartHeat Coverage Report - ${date}`;
  }

  /**
   * Format daily report HTML
   */
  formatDailyReport(report) {
    const styles = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; }
      h2 { color: #1a1a1a; border-bottom: 2px solid #007AFF; padding-bottom: 8px; }
      h3 { color: #444; margin-top: 24px; }
      table { border-collapse: collapse; width: 100%; margin: 16px 0; }
      th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
      .critical { background: #fee; }
      .warning { background: #fff8e1; }
      .success { background: #e8f5e9; }
      .priority-high { background: #ffcdd2; padding: 12px; margin: 8px 0; border-radius: 4px; }
      .priority-medium { background: #fff9c4; padding: 12px; margin: 8px 0; border-radius: 4px; }
      .priority-low { background: #f5f5f5; padding: 12px; margin: 8px 0; border-radius: 4px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
      .badge-critical { background: #f44336; color: white; }
      .badge-warning { background: #ff9800; color: white; }
      .badge-good { background: #4caf50; color: white; }
      ul { margin: 8px 0; padding-left: 20px; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
    `;

    return `
<!DOCTYPE html>
<html>
<head><style>${styles}</style></head>
<body>
  <h2>SmartHeat Coverage Report</h2>
  <p><strong>Date:</strong> ${report.date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <!-- Recommendations (prioritized) -->
  ${report.recommendations.length > 0 ? `
    <h3>Recommendations</h3>
    ${report.recommendations.map(rec => `
      <div class="priority-${rec.priority.toLowerCase()}">
        <strong>[${rec.priority}]</strong> ${rec.message}
        <ul>
          ${rec.details.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
  ` : ''}

  <!-- New Locations -->
  <h3>New User Locations (${report.newLocations.length})</h3>
  ${report.newLocations.length > 0 ? `
    <table>
      <tr>
        <th>City</th>
        <th>State</th>
        <th>ZIP</th>
        <th>Suppliers</th>
        <th>Status</th>
      </tr>
      ${report.newLocations.map(loc => `
        <tr class="${loc.supplierCount === 0 ? 'critical' : loc.supplierCount < 3 ? 'warning' : 'success'}">
          <td>${loc.city || '—'}</td>
          <td>${loc.state || '—'}</td>
          <td>${loc.zipCode}</td>
          <td>${loc.supplierCount}</td>
          <td>
            <span class="badge ${loc.supplierCount === 0 ? 'badge-critical' : loc.supplierCount < 3 ? 'badge-warning' : 'badge-good'}">
              ${loc.supplierCount === 0 ? 'No Coverage' : loc.supplierCount < 3 ? 'Limited' : 'Good'}
            </span>
          </td>
        </tr>
      `).join('')}
    </table>
  ` : '<p>No new locations in the last 24 hours.</p>'}

  <!-- Coverage Gaps -->
  ${report.coverageGaps.length > 0 ? `
    <h3>Coverage Gaps (${report.coverageGaps.length})</h3>
    <table>
      <tr>
        <th>City</th>
        <th>State</th>
        <th>ZIP</th>
        <th>Suppliers</th>
        <th>User Activity</th>
      </tr>
      ${report.coverageGaps.slice(0, 15).map(gap => `
        <tr class="${gap.supplierCount === 0 ? 'critical' : 'warning'}">
          <td>${gap.city || '—'}</td>
          <td>${gap.state || '—'}</td>
          <td>${gap.zipCode}</td>
          <td>${gap.supplierCount}</td>
          <td>${gap.requestCount} request${gap.requestCount !== 1 ? 's' : ''}</td>
        </tr>
      `).join('')}
    </table>
    ${report.coverageGaps.length > 15 ? `<p><em>...and ${report.coverageGaps.length - 15} more</em></p>` : ''}
  ` : '<p>All tracked locations have adequate coverage.</p>'}

  <!-- Expansion Patterns -->
  ${report.expansionPatterns.length > 0 ? `
    <h3>Expansion Patterns</h3>
    <p>Regions with multiple new ZIPs in the last 7 days:</p>
    <ul>
      ${report.expansionPatterns.map(p => `
        <li><strong>${p.county}, ${p.state}</strong>: ${p.newZipCount} new ZIPs (${p.zips.join(', ')})</li>
      `).join('')}
    </ul>
  ` : ''}

  <!-- Supplier Health -->
  ${report.supplierHealth.length > 0 ? `
    <h3>Supplier Health</h3>
    <p>${report.supplierHealth.length} supplier${report.supplierHealth.length !== 1 ? 's have' : ' has'} no price updates in 7+ days:</p>
    <ul>
      ${report.supplierHealth.slice(0, 10).map(s => `
        <li>${s.name} (${s.city}, ${s.state}) - Last update: ${s.lastPriceUpdate === 'never' ? 'Never' : new Date(s.lastPriceUpdate).toLocaleDateString()}</li>
      `).join('')}
    </ul>
    ${report.supplierHealth.length > 10 ? `<p><em>...and ${report.supplierHealth.length - 10} more</em></p>` : ''}
  ` : ''}

  <div class="footer">
    <p>This report is auto-generated by SmartHeat Coverage Intelligence System.</p>
    <p>To adjust report settings, update the backend environment variables.</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send weekly summary
   */
  async sendWeeklySummary(stats) {
    const recipient = this.getRecipient();
    if (!recipient) return false;

    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const subject = `SmartHeat Weekly Summary - ${date}`;

    const html = this.formatWeeklySummary(stats);
    const success = await this.sendEmail(recipient, subject, html);

    if (success) {
      console.log(`[CoverageReportMailer] Weekly summary sent to ${recipient}`);
    }
    return success;
  }

  /**
   * Format weekly summary HTML
   */
  formatWeeklySummary(stats) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; }
    h2 { color: #1a1a1a; border-bottom: 2px solid #007AFF; padding-bottom: 8px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 24px 0; }
    .stat-box { background: #f5f5f5; padding: 16px; border-radius: 8px; }
    .stat-value { font-size: 32px; font-weight: 700; color: #007AFF; }
    .stat-label { font-size: 14px; color: #666; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h2>SmartHeat Weekly Summary</h2>
  <p><strong>Week of:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-value">${stats.total_locations || 0}</div>
      <div class="stat-label">Total Tracked Locations</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${stats.new_last_7d || 0}</div>
      <div class="stat-label">New This Week</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${stats.total_requests || 0}</div>
      <div class="stat-label">Total API Requests</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${(stats.no_coverage || 0) + (stats.poor_coverage || 0)}</div>
      <div class="stat-label">Locations Needing Coverage</div>
    </div>
  </div>

  <h3>Coverage Breakdown</h3>
  <ul>
    <li><strong>Good (5+ suppliers):</strong> ${stats.good_coverage || 0}</li>
    <li><strong>Adequate (3-4 suppliers):</strong> ${stats.adequate_coverage || 0}</li>
    <li><strong>Poor (1-2 suppliers):</strong> ${stats.poor_coverage || 0}</li>
    <li><strong>No coverage:</strong> ${stats.no_coverage || 0}</li>
  </ul>

  <div class="footer">
    <p>This summary is auto-generated by SmartHeat Coverage Intelligence System.</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send instant alert for critical gaps
   */
  async sendCriticalAlert(zipCode, city, state, requestCount) {
    const recipient = this.getRecipient();
    if (!recipient) return false;

    const subject = `[CRITICAL] No suppliers for ${city || zipCode}, ${state}`;
    const html = `
      <h2>Critical Coverage Gap Detected</h2>
      <p>A user in <strong>${city || 'Unknown'}, ${state}</strong> (ZIP: ${zipCode}) has no supplier options.</p>
      <p>This location has received <strong>${requestCount}</strong> API requests.</p>
      <p>Please add suppliers for this area as soon as possible.</p>
    `;

    const success = await this.sendEmail(recipient, subject, html);
    if (success) {
      console.log(`[CoverageReportMailer] Critical alert sent for ${zipCode}`);
    }
    return success;
  }

  /**
   * V2.5.2: Send combined daily report (Coverage + Activity in one email)
   * V2.10.2: Now includes price review magic link
   * V2.12.0: Now includes click tracking stats for "Sniper" outreach
   * Reduces inbox clutter by combining both reports
   */
  async sendCombinedDailyReport(coverageReport, activityReport, priceReviewLink = null, clickStats = null) {
    const recipient = this.getRecipient();
    if (!recipient) {
      console.log('[CoverageReportMailer] No recipient configured');
      return false;
    }

    const html = this.formatCombinedReport(coverageReport, activityReport, priceReviewLink, clickStats);
    const subject = this.getCombinedSubject(coverageReport, activityReport);

    const success = await this.sendEmail(recipient, subject, html);
    if (success) {
      console.log(`[CoverageReportMailer] Combined daily report sent to ${recipient}`);
    }
    return success;
  }

  /**
   * Generate subject line for combined report
   */
  getCombinedSubject(coverageReport, activityReport) {
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const users = activityReport?.summary?.uniqueUsers || 0;
    const newLocs = coverageReport?.newLocations?.length || 0;
    const criticalGaps = coverageReport?.coverageGaps?.filter(g => g.supplierCount === 0).length || 0;

    if (criticalGaps > 0) {
      return `[ACTION] SmartHeat: ${criticalGaps} gap${criticalGaps > 1 ? 's' : ''}, ${users} users - ${date}`;
    }

    if (newLocs > 0) {
      return `SmartHeat: ${newLocs} new location${newLocs > 1 ? 's' : ''}, ${users} users - ${date}`;
    }

    return `SmartHeat Daily Report: ${users} users - ${date}`;
  }

  /**
   * Format combined daily report HTML
   * V2.10.2: Added priceReviewLink parameter for manual price verification
   * V2.12.0: Added clickStats parameter for "Sniper" outreach tracking
   */
  formatCombinedReport(coverageReport, activityReport, priceReviewLink = null, clickStats = null) {
    const styles = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; max-width: 650px; margin: 0 auto; }
      h2 { color: #1a1a1a; border-bottom: 2px solid #007AFF; padding-bottom: 8px; margin-top: 0; }
      h3 { color: #444; margin-top: 28px; margin-bottom: 12px; }
      .section-divider { border-top: 2px solid #e0e0e0; margin: 32px 0; padding-top: 24px; }
      .stat-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
      .stat-box { background: #f5f5f5; padding: 14px; border-radius: 8px; flex: 1; min-width: 100px; text-align: center; }
      .stat-value { font-size: 26px; font-weight: 700; color: #007AFF; }
      .stat-label { font-size: 11px; color: #666; margin-top: 4px; }
      .trend-up { color: #4caf50; }
      .trend-down { color: #f44336; }
      .trend-neutral { color: #666; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; }
      th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
      th { background: #f5f5f5; font-weight: 600; }
      .critical { background: #fee; }
      .warning { background: #fff8e1; }
      .success { background: #e8f5e9; }
      .priority-high { background: #ffcdd2; padding: 12px; margin: 8px 0; border-radius: 4px; }
      .priority-medium { background: #fff9c4; padding: 12px; margin: 8px 0; border-radius: 4px; }
      .priority-low { background: #f5f5f5; padding: 12px; margin: 8px 0; border-radius: 4px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-critical { background: #f44336; color: white; }
      .badge-warning { background: #ff9800; color: white; }
      .badge-good { background: #4caf50; color: white; }
      ul { margin: 8px 0; padding-left: 20px; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      .fuel-section { background: #fafafa; border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
      .fuel-oil { border-left: 4px solid #FF9800; }
      .fuel-propane { border-left: 4px solid #2196F3; }
    `;

    const trendIcon = (change) => {
      if (change > 0) return `<span class="trend-up">↑ +${change}</span>`;
      if (change < 0) return `<span class="trend-down">↓ ${change}</span>`;
      return `<span class="trend-neutral">→ 0</span>`;
    };

    const report = coverageReport || { newLocations: [], coverageGaps: [], expansionPatterns: [], supplierHealth: [], recommendations: [], date: new Date() };
    const activity = activityReport || { summary: { uniqueUsers: 0, totalRequests: 0, uniqueZips: 0, avgResponseTimeMs: 0, errors: 0 }, trend: {}, byState: [], topZips: [], topEndpoints: [], engagements: [], dauHistory: [] };

    return `
<!DOCTYPE html>
<html>
<head><style>${styles}</style></head>
<body>
  <h2>SmartHeat Daily Report</h2>
  <p><strong>Date:</strong> ${report.date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <!-- ===== ACTIVITY SUMMARY ===== -->
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-value">${activity.summary.uniqueUsers}</div>
      <div class="stat-label">Users (24h)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${report.newLocations.length}</div>
      <div class="stat-label">New Locations</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${activity.summary.totalRequests}</div>
      <div class="stat-label">API Requests</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${activity.summary.avgResponseTimeMs}ms</div>
      <div class="stat-label">Avg Response</div>
    </div>
  </div>

  ${activity.trend ? `<p><strong>Week-over-Week:</strong> Users ${trendIcon(activity.trend.usersChange)} | Requests ${trendIcon(activity.trend.requestsChange)}</p>` : ''}

  <!-- ===== PRICE REVIEW LINK (V2.10.2) ===== -->
  ${priceReviewLink ? `
    <div style="background: #e3f2fd; border: 2px solid #2196F3; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 8px 0; color: #1565C0;">🔍 Manual Price Review</h3>
      <p style="margin: 0 0 12px 0;">Sites needing price verification are ready for review.</p>
      <a href="${priceReviewLink}" style="display: inline-block; background: #2196F3; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open Price Review Portal</a>
      <p style="margin: 12px 0 0 0; font-size: 12px; color: #666;">Link expires in 48 hours.</p>
    </div>
  ` : ''}

  <!-- ===== CLICK TRACKING / SNIPER OUTREACH (V2.12.0) ===== -->
  ${clickStats && (parseInt(clickStats.last_24h) > 0 || parseInt(clickStats.pending_outreach) > 0) ? `
    <div style="background: #fff3e0; border: 2px solid #ff9800; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #e65100;">🎯 Supplier Click Tracking</h3>
      <div class="stat-grid">
        <div class="stat-box" style="background: #fff8e1;">
          <div class="stat-value" style="color: #ff9800;">${clickStats.last_24h || 0}</div>
          <div class="stat-label">Clicks (24h)</div>
        </div>
        <div class="stat-box" style="background: #fff8e1;">
          <div class="stat-value" style="color: #ff9800;">${clickStats.last_7d || 0}</div>
          <div class="stat-label">Clicks (7d)</div>
        </div>
        <div class="stat-box" style="background: #fff8e1;">
          <div class="stat-value" style="color: #ff9800;">${clickStats.call_clicks || 0}</div>
          <div class="stat-label">Call Clicks</div>
        </div>
        <div class="stat-box" style="background: #fff8e1;">
          <div class="stat-value" style="color: #ff9800;">${clickStats.website_clicks || 0}</div>
          <div class="stat-label">Website Clicks</div>
        </div>
      </div>
      <p style="margin: 12px 0 0 0;"><strong>${clickStats.unique_suppliers || 0}</strong> unique suppliers clicked | <strong>${clickStats.pending_outreach || 0}</strong> pending outreach | <strong>${clickStats.emails_sent || 0}</strong> emails sent</p>
      ${clickStats.topSuppliers && clickStats.topSuppliers.length > 0 ? `
        <p style="margin: 12px 0 4px 0; font-weight: 600;">Top Clicked Suppliers (7d):</p>
        <ul style="margin: 4px 0;">
          ${clickStats.topSuppliers.map(s => `<li>${s.name} (${s.city}, ${s.state}) - ${s.clicks} clicks</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  ` : ''}

  <!-- ===== HIT LIST - CALL THESE TODAY (V2.12.1) ===== -->
  ${clickStats && clickStats.hitList && clickStats.hitList.length > 0 ? `
    <div style="background: #e8f5e9; border: 2px solid #4caf50; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 16px 0; color: #2e7d32;">📞 Hit List - Call These Today (${clickStats.hitList.length})</h3>
      ${clickStats.hitList.map((s, i) => `
        <div style="background: white; border-radius: 6px; padding: 12px; margin-bottom: 12px; border-left: 4px solid #4caf50;">
          <div style="font-weight: 700; font-size: 16px; color: #1b5e20;">${i + 1}. ${s.name}</div>
          <div style="margin: 8px 0;">
            <span style="font-size: 18px;">📞</span> <a href="tel:${(s.phone || '').replace(/\\D/g, '')}" style="font-weight: 600; color: #333; font-size: 15px;">${s.phone || 'No phone'}</a>
            ${s.email ? `<span style="margin-left: 12px;">✉️ <a href="mailto:${s.email}" style="color: #666;">${s.email}</a></span>` : ''}
          </div>
          <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
            📍 ${s.city}, ${s.state} &nbsp;|&nbsp; 🔥 ${s.click_count} click${parseInt(s.click_count) !== 1 ? 's' : ''} from ZIP${s.zips && s.zips.includes(',') ? 's' : ''}: <strong>${s.zips || 'unknown'}</strong>
          </div>
          <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 13px; color: #333; font-style: italic;">
            🗣️ "Hi, this is Leo from HomeHeat. We saw ${s.click_count} homeowner${parseInt(s.click_count) !== 1 ? 's' : ''} in ${s.zips || 'your area'} click to call you yesterday. Just wanted to make sure your price of <strong>$${s.current_price ? parseFloat(s.current_price).toFixed(2) : 'N/A'}</strong> is current so we don't send you bad leads."
          </div>
        </div>
      `).join('')}
    </div>
  ` : ''}

  <!-- ===== COVERAGE RECOMMENDATIONS ===== -->
  ${report.recommendations.length > 0 ? `
    <h3>🎯 Action Items</h3>
    ${report.recommendations.map(rec => `
      <div class="priority-${rec.priority.toLowerCase()}">
        <strong>[${rec.priority}]</strong> ${rec.message}
        <ul>
          ${rec.details.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
  ` : ''}

  <!-- ===== NEW LOCATIONS ===== -->
  ${report.newLocations.length > 0 ? `
    <h3>📍 New User Locations (${report.newLocations.length})</h3>
    <table>
      <tr>
        <th>City</th>
        <th>State</th>
        <th>ZIP</th>
        <th>Suppliers</th>
        <th>Status</th>
      </tr>
      ${report.newLocations.map(loc => `
        <tr class="${loc.supplierCount === 0 ? 'critical' : loc.supplierCount < 3 ? 'warning' : 'success'}">
          <td>${loc.city || '—'}</td>
          <td>${loc.state || '—'}</td>
          <td>${loc.zipCode}</td>
          <td>${loc.supplierCount}</td>
          <td>
            <span class="badge ${loc.supplierCount === 0 ? 'badge-critical' : loc.supplierCount < 3 ? 'badge-warning' : 'badge-good'}">
              ${loc.supplierCount === 0 ? 'No Coverage' : loc.supplierCount < 3 ? 'Limited' : 'Good'}
            </span>
          </td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <!-- ===== COVERAGE GAPS ===== -->
  ${report.coverageGaps.length > 0 ? `
    <h3>⚠️ Coverage Gaps (${report.coverageGaps.length})</h3>
    <table>
      <tr>
        <th>City</th>
        <th>State</th>
        <th>ZIP</th>
        <th>Suppliers</th>
        <th>User Requests</th>
      </tr>
      ${report.coverageGaps.slice(0, 10).map(gap => `
        <tr class="${gap.supplierCount === 0 ? 'critical' : 'warning'}">
          <td>${gap.city || '—'}</td>
          <td>${gap.state || '—'}</td>
          <td>${gap.zipCode}</td>
          <td>${gap.supplierCount}</td>
          <td>${gap.requestCount}</td>
        </tr>
      `).join('')}
    </table>
    ${report.coverageGaps.length > 10 ? `<p><em>...and ${report.coverageGaps.length - 10} more</em></p>` : ''}
  ` : '<p>✅ All tracked locations have adequate coverage.</p>'}

  <!-- ===== ACTIVITY DETAILS ===== -->
  <div class="section-divider">
    <h3>📊 Activity by State</h3>
    ${activity.byState.length > 0 ? `
      <table>
        <tr><th>State</th><th>Users</th><th>Requests</th></tr>
        ${activity.byState.slice(0, 8).map(s => `
          <tr>
            <td><strong>${s.state}</strong></td>
            <td>${s.users}</td>
            <td>${s.requests}</td>
          </tr>
        `).join('')}
      </table>
    ` : '<p><em>No state data available</em></p>'}
  </div>

  <!-- ===== FUEL TYPE BREAKDOWN ===== -->
  ${activity.byFuelType ? `
    <h3>🛢️ By Fuel Type</h3>
    <div class="fuel-section fuel-oil">
      <strong>Heating Oil:</strong> ${activity.byFuelType.heating_oil?.users || 0} users, ${activity.byFuelType.heating_oil?.requests || 0} requests
    </div>
    <div class="fuel-section fuel-propane">
      <strong>Propane:</strong> ${activity.byFuelType.propane?.users || 0} users, ${activity.byFuelType.propane?.requests || 0} requests
    </div>
  ` : ''}

  <!-- ===== SUPPLIER ENGAGEMENTS ===== -->
  ${activity.engagements.length > 0 ? `
    <h3>👆 Supplier Engagements</h3>
    <table>
      <tr><th>Action</th><th>Count</th></tr>
      ${activity.engagements.map(e => `
        <tr>
          <td>${e.type}</td>
          <td>${e.count}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <!-- ===== EXPANSION PATTERNS ===== -->
  ${report.expansionPatterns.length > 0 ? `
    <h3>🚀 Expansion Patterns</h3>
    <p>Regions with multiple new ZIPs in the last 7 days:</p>
    <ul>
      ${report.expansionPatterns.map(p => `
        <li><strong>${p.county}, ${p.state}</strong>: ${p.newZipCount} new ZIPs (${p.zips.join(', ')})</li>
      `).join('')}
    </ul>
  ` : ''}

  <!-- ===== ERRORS ===== -->
  ${activity.summary.errors > 0 ? `
    <h3>⚠️ Errors</h3>
    <p><strong>${activity.summary.errors}</strong> API errors in the last 24 hours.</p>
  ` : ''}

  <!-- ===== SCRAPE HEALTH (V2.6.0) ===== -->
  ${report.scrapeHealth ? `
    <h3>🔄 Scrape Health</h3>
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-value">${report.scrapeHealth.scrapedToday}</div>
        <div class="stat-label">Scraped Today</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${report.scrapeHealth.blockedCount}</div>
        <div class="stat-label">Blocked/Stale</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${report.scrapeHealth.successRate}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${report.scrapeHealth.weeklyTrend === 'increasing' ? '📈' : report.scrapeHealth.weeklyTrend === 'decreasing' ? '📉' : '➡️'}</div>
        <div class="stat-label">Blocking Trend</div>
      </div>
    </div>
    ${report.scrapeHealth.blockedCount > 0 ? `
      <p><strong>Blocked sites (${report.scrapeHealth.blockedCount}):</strong></p>
      <table>
        <tr>
          <th>Supplier</th>
          <th>Last Price</th>
          <th>Days Stale</th>
        </tr>
        ${report.scrapeHealth.blockedSites.slice(0, 10).map(s => `
          <tr class="warning">
            <td>${s.name}</td>
            <td>$${s.lastPrice.toFixed(2)}</td>
            <td>${s.daysSinceUpdate}d</td>
          </tr>
        `).join('')}
      </table>
      ${report.scrapeHealth.blockedCount > 10 ? `<p><em>...and ${report.scrapeHealth.blockedCount - 10} more</em></p>` : ''}
      ${report.scrapeHealth.weeklyTrend === 'increasing' ? `
        <p class="priority-medium">⚠️ <strong>Blocking trend increasing.</strong> Consider adding rotating proxies if this continues.</p>
      ` : ''}
    ` : '<p>✅ All scrapable sites working.</p>'}
  ` : ''}

  <!-- ===== SCRAPE RESULTS ===== -->
  ${report.scrapeResults ? `
    <h3>📋 Yesterday's Scrape Run</h3>
    <p><strong>${report.scrapeResults.successCount}</strong> successful, <strong>${report.scrapeResults.failedCount}</strong> failed, <strong>${report.scrapeResults.skippedCount}</strong> skipped</p>
    ${report.scrapeResults.failures && report.scrapeResults.failures.length > 0 ? `
      <table>
        <tr>
          <th>Supplier</th>
          <th>Error</th>
        </tr>
        ${report.scrapeResults.failures.slice(0, 15).map(f => `
          <tr class="warning">
            <td>${f.supplierName}</td>
            <td>${f.error}${f.retriedAttempts > 0 ? ` (retried ${f.retriedAttempts}x)` : ''}</td>
          </tr>
        `).join('')}
      </table>
      ${report.scrapeResults.failures.length > 15 ? `<p><em>...and ${report.scrapeResults.failures.length - 15} more</em></p>` : ''}
    ` : '<p>✅ All configured suppliers scraped successfully.</p>'}
  ` : ''}

  <!-- ===== SUPPLIER HEALTH ===== -->
  ${report.supplierHealth.length > 0 ? `
    <h3>🩺 Supplier Health</h3>
    <p>${report.supplierHealth.length} supplier${report.supplierHealth.length !== 1 ? 's have' : ' has'} no price updates in 7+ days.</p>
  ` : ''}

  <div class="footer">
    <p>This report is auto-generated daily at 6 AM EST by SmartHeat.</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send daily activity analytics report
   */
  async sendActivityReport(report) {
    const recipient = this.getRecipient();
    if (!recipient) {
      console.log('[CoverageReportMailer] No recipient configured for activity report');
      return false;
    }

    if (!report) {
      console.log('[CoverageReportMailer] No activity report data');
      return false;
    }

    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const subject = `SmartHeat Activity Report - ${date} | ${report.summary.uniqueUsers} users, ${report.summary.totalRequests} requests`;
    const html = this.formatActivityReport(report);

    const success = await this.sendEmail(recipient, subject, html);
    if (success) {
      console.log(`[CoverageReportMailer] Activity report sent to ${recipient}`);
    }
    return success;
  }

  /**
   * Format activity analytics report HTML
   * V2.5.0: Now includes oil vs propane breakdown
   */
  formatActivityReport(report) {
    const styles = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; }
      h2 { color: #1a1a1a; border-bottom: 2px solid #007AFF; padding-bottom: 8px; }
      h3 { color: #444; margin-top: 24px; margin-bottom: 12px; }
      h4 { color: #555; margin-top: 16px; margin-bottom: 8px; }
      .stat-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
      .stat-box { background: #f5f5f5; padding: 16px; border-radius: 8px; flex: 1; min-width: 120px; text-align: center; }
      .stat-value { font-size: 28px; font-weight: 700; color: #007AFF; }
      .stat-label { font-size: 12px; color: #666; margin-top: 4px; }
      .trend-up { color: #4caf50; }
      .trend-down { color: #f44336; }
      .trend-neutral { color: #666; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; }
      th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 14px; }
      th { background: #f5f5f5; font-weight: 600; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      .section { margin: 24px 0; }
      .fuel-section { background: #fafafa; border-radius: 8px; padding: 16px; margin: 16px 0; }
      .fuel-oil { border-left: 4px solid #FF9800; }
      .fuel-propane { border-left: 4px solid #2196F3; }
      .fuel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .fuel-title { font-weight: 600; font-size: 16px; }
      .fuel-stats { display: flex; gap: 16px; }
      .fuel-stat { text-align: center; }
      .fuel-stat-value { font-size: 20px; font-weight: 700; }
      .fuel-stat-label { font-size: 11px; color: #666; }
    `;

    const trendIcon = (change) => {
      if (change > 0) return `<span class="trend-up">↑ +${change}</span>`;
      if (change < 0) return `<span class="trend-down">↓ ${change}</span>`;
      return `<span class="trend-neutral">→ 0</span>`;
    };

    return `
<!DOCTYPE html>
<html>
<head><style>${styles}</style></head>
<body>
  <h2>📊 SmartHeat Activity Report</h2>
  <p><strong>Date:</strong> ${report.date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <!-- Summary Stats -->
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-value">${report.summary.uniqueUsers}</div>
      <div class="stat-label">Unique Users (24h)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${report.summary.uniqueZips}</div>
      <div class="stat-label">ZIP Codes</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${report.summary.totalRequests}</div>
      <div class="stat-label">API Requests</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${report.summary.avgResponseTimeMs}ms</div>
      <div class="stat-label">Avg Response</div>
    </div>
  </div>

  <!-- Trend -->
  <div class="section">
    <p><strong>Week-over-Week:</strong> Users ${trendIcon(report.trend.usersChange)} | Requests ${trendIcon(report.trend.requestsChange)}</p>
  </div>

  <!-- V2.5.0: Fuel Type Breakdown -->
  ${report.byFuelType ? `
    <h3>🛢️ Activity by Fuel Type</h3>

    <!-- Heating Oil Section -->
    <div class="fuel-section fuel-oil">
      <div class="fuel-header">
        <span class="fuel-title">🔥 Heating Oil</span>
        <div class="fuel-stats">
          <div class="fuel-stat">
            <div class="fuel-stat-value">${report.byFuelType.heating_oil?.users || 0}</div>
            <div class="fuel-stat-label">Users</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-value">${report.byFuelType.heating_oil?.zips || 0}</div>
            <div class="fuel-stat-label">ZIPs</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-value">${report.byFuelType.heating_oil?.requests || 0}</div>
            <div class="fuel-stat-label">Requests</div>
          </div>
        </div>
      </div>
      ${report.byFuelType.heating_oil?.byState?.length > 0 ? `
        <table>
          <tr><th>State</th><th>Users</th><th>Requests</th></tr>
          ${report.byFuelType.heating_oil.byState.slice(0, 5).map(s => `
            <tr><td>${s.state}</td><td>${s.users}</td><td>${s.requests}</td></tr>
          `).join('')}
        </table>
      ` : '<p><em>No state data</em></p>'}
    </div>

    <!-- Propane Section -->
    <div class="fuel-section fuel-propane">
      <div class="fuel-header">
        <span class="fuel-title">💨 Propane</span>
        <div class="fuel-stats">
          <div class="fuel-stat">
            <div class="fuel-stat-value">${report.byFuelType.propane?.users || 0}</div>
            <div class="fuel-stat-label">Users</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-value">${report.byFuelType.propane?.zips || 0}</div>
            <div class="fuel-stat-label">ZIPs</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-value">${report.byFuelType.propane?.requests || 0}</div>
            <div class="fuel-stat-label">Requests</div>
          </div>
        </div>
      </div>
      ${report.byFuelType.propane?.byState?.length > 0 ? `
        <table>
          <tr><th>State</th><th>Users</th><th>Requests</th></tr>
          ${report.byFuelType.propane.byState.slice(0, 5).map(s => `
            <tr><td>${s.state}</td><td>${s.users}</td><td>${s.requests}</td></tr>
          `).join('')}
        </table>
      ` : '<p><em>No propane activity</em></p>'}
    </div>
  ` : ''}

  <!-- Geographic Distribution -->
  ${report.byState.length > 0 ? `
    <h3>📍 Users by State</h3>
    <table>
      <tr><th>State</th><th>Users</th><th>Requests</th></tr>
      ${report.byState.map(s => `
        <tr>
          <td><strong>${s.state}</strong></td>
          <td>${s.users}</td>
          <td>${s.requests}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <!-- Top ZIP Codes -->
  ${report.topZips.length > 0 ? `
    <h3>🔝 Top ZIP Codes</h3>
    <table>
      <tr><th>ZIP</th><th>State</th><th>Users</th><th>Requests</th></tr>
      ${report.topZips.slice(0, 5).map(z => `
        <tr>
          <td><strong>${z.zipCode}</strong></td>
          <td>${z.state}</td>
          <td>${z.users}</td>
          <td>${z.requests}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <!-- Top Endpoints -->
  ${report.topEndpoints.length > 0 ? `
    <h3>🔗 Top Endpoints</h3>
    <table>
      <tr><th>Endpoint</th><th>Hits</th></tr>
      ${report.topEndpoints.slice(0, 5).map(e => `
        <tr>
          <td><code>${e.endpoint}</code></td>
          <td>${e.hits}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <!-- Supplier Engagements -->
  ${report.engagements.length > 0 ? `
    <h3>👆 Supplier Engagements</h3>
    <table>
      <tr><th>Action</th><th>Count</th></tr>
      ${report.engagements.map(e => `
        <tr>
          <td>${e.type}</td>
          <td>${e.count}</td>
        </tr>
      `).join('')}
    </table>
  ` : '<p><em>No supplier engagements in last 24 hours.</em></p>'}

  <!-- 7-Day History -->
  ${report.dauHistory.length > 1 ? `
    <h3>📈 7-Day History</h3>
    <table>
      <tr><th>Date</th><th>Users</th><th>Oil</th><th>Propane</th><th>Requests</th></tr>
      ${report.dauHistory.map(d => `
        <tr>
          <td>${d.date}</td>
          <td>${d.users || 0}</td>
          <td>${d.usersByFuel?.heating_oil || 0}</td>
          <td>${d.usersByFuel?.propane || 0}</td>
          <td>${d.requests || 0}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <!-- V2.9.0: Canada Waitlist -->
  ${report.waitlist && report.waitlist.total > 0 ? `
    <h3>🇨🇦 Canada Waitlist</h3>
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-number">${report.waitlist.total}</div>
        <div class="stat-label">Total Signups</div>
      </div>
      <div class="stat-box ${report.waitlist.today > 0 ? 'stat-highlight' : ''}">
        <div class="stat-number">${report.waitlist.today}</div>
        <div class="stat-label">New Today</div>
      </div>
    </div>
    ${report.waitlist.byProvince && report.waitlist.byProvince.length > 0 ? `
      <h4>By Province</h4>
      <table>
        <tr><th>Province</th><th>Signups</th></tr>
        ${report.waitlist.byProvince.map(p => `
          <tr>
            <td>${p.province}</td>
            <td>${p.count}</td>
          </tr>
        `).join('')}
      </table>
    ` : ''}
  ` : ''}

  <!-- Errors -->
  ${report.summary.errors > 0 ? `
    <h3>⚠️ Errors</h3>
    <p><strong>${report.summary.errors}</strong> API errors in the last 24 hours.</p>
  ` : ''}

  <div class="footer">
    <p>This report is auto-generated daily at 6 AM EST by SmartHeat Activity Analytics.</p>
  </div>
</body>
</html>
    `;
  }
}

module.exports = CoverageReportMailer;
