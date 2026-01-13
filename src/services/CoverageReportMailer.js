/**
 * Coverage Report Mailer
 * V2.3.0: Email reports for Coverage Intelligence
 *
 * Sends:
 * - Daily reports (when actionable items exist)
 * - Weekly summaries (every Monday)
 * - Instant alerts (critical gaps)
 */

const nodemailer = require('nodemailer');

class CoverageReportMailer {
  constructor() {
    this.transporter = null;
    this.initialized = false;

    // Initialize if credentials available
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        this.initialized = true;
        console.log('[CoverageReportMailer] Initialized with Gmail');
      } catch (error) {
        console.error('[CoverageReportMailer] Failed to initialize:', error.message);
      }
    } else {
      console.log('[CoverageReportMailer] Email credentials not configured');
    }
  }

  /**
   * Get recipient email
   */
  getRecipient() {
    return process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  }

  /**
   * Send daily coverage report
   */
  async sendDailyReport(report) {
    if (!this.initialized) {
      console.log('[CoverageReportMailer] Not initialized - skipping email');
      return false;
    }

    const recipient = this.getRecipient();
    if (!recipient) {
      console.log('[CoverageReportMailer] No recipient configured');
      return false;
    }

    const html = this.formatDailyReport(report);
    const subject = this.getDailySubject(report);

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipient,
        subject,
        html
      });
      console.log(`[CoverageReportMailer] Daily report sent to ${recipient}`);
      return true;
    } catch (error) {
      console.error('[CoverageReportMailer] Failed to send daily report:', error.message);
      return false;
    }
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
    if (!this.initialized) return false;

    const recipient = this.getRecipient();
    if (!recipient) return false;

    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const subject = `SmartHeat Weekly Summary - ${date}`;

    const html = this.formatWeeklySummary(stats);

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipient,
        subject,
        html
      });
      console.log(`[CoverageReportMailer] Weekly summary sent to ${recipient}`);
      return true;
    } catch (error) {
      console.error('[CoverageReportMailer] Failed to send weekly summary:', error.message);
      return false;
    }
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
    if (!this.initialized) return false;

    const recipient = this.getRecipient();
    if (!recipient) return false;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: `[CRITICAL] No suppliers for ${city || zipCode}, ${state}`,
        html: `
          <h2>Critical Coverage Gap Detected</h2>
          <p>A user in <strong>${city || 'Unknown'}, ${state}</strong> (ZIP: ${zipCode}) has no supplier options.</p>
          <p>This location has received <strong>${requestCount}</strong> API requests.</p>
          <p>Please add suppliers for this area as soon as possible.</p>
        `
      });
      console.log(`[CoverageReportMailer] Critical alert sent for ${zipCode}`);
      return true;
    } catch (error) {
      console.error('[CoverageReportMailer] Failed to send critical alert:', error.message);
      return false;
    }
  }
}

module.exports = CoverageReportMailer;
