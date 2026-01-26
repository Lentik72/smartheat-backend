/**
 * Supplier Price Staleness Service
 * V1.0.0: Handles stale prices for claimed suppliers
 *
 * Timeline for claimed suppliers:
 * - Days 1-7: Price shows normally
 * - Day 7: Send reminder email to supplier
 * - Days 7-14: Resume scraping their website as backup
 * - Day 14+: Show "Price may be outdated - call to confirm"
 *
 * Summer consideration: Prices don't change much, so be lenient.
 */

const STALE_THRESHOLD_DAYS = 7;      // Send reminder after 7 days
const SCRAPE_RESUME_DAYS = 7;        // Resume scraping after 7 days
const OUTDATED_THRESHOLD_DAYS = 14;  // Show warning after 14 days

class SupplierPriceStalenessService {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.initialized = false;
    this.apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.EMAIL_FROM || 'HomeHeat <onboarding@resend.dev>';
  }

  initialize() {
    if (this.apiKey) {
      this.initialized = true;
      console.log('[SupplierStaleness] Initialized');
    } else {
      console.log('[SupplierStaleness] RESEND_API_KEY not configured - reminders disabled');
    }
    return this;
  }

  /**
   * Get claimed suppliers with stale prices (7+ days old)
   * Only returns suppliers who haven't been reminded in the last 7 days
   */
  async getClaimedSuppliersNeedingReminder() {
    if (!this.sequelize) return [];

    const [rows] = await this.sequelize.query(`
      SELECT
        s.id,
        s.name,
        s.city,
        s.state,
        s.claimed_by_email,
        s.claimed_at,
        s.last_stale_reminder_at,
        sp.price_per_gallon,
        sp.scraped_at as last_price_date,
        mlt.token as magic_link_token
      FROM suppliers s
      LEFT JOIN LATERAL (
        SELECT price_per_gallon, scraped_at
        FROM supplier_prices
        WHERE supplier_id = s.id AND is_valid = true
        ORDER BY scraped_at DESC
        LIMIT 1
      ) sp ON true
      LEFT JOIN magic_link_tokens mlt ON mlt.supplier_id = s.id
        AND mlt.purpose = 'supplier_price_update'
        AND mlt.revoked_at IS NULL
        AND mlt.expires_at > NOW()
      WHERE s.claimed_at IS NOT NULL
        AND s.claimed_by_email IS NOT NULL
        AND s.active = true
        AND (
          sp.scraped_at IS NULL
          OR sp.scraped_at < NOW() - INTERVAL '${STALE_THRESHOLD_DAYS} days'
        )
        AND (
          s.last_stale_reminder_at IS NULL
          OR s.last_stale_reminder_at < NOW() - INTERVAL '7 days'
        )
    `);

    return rows;
  }

  /**
   * Get claimed suppliers eligible for backup scraping (7+ days since last update)
   */
  async getClaimedSuppliersForBackupScrape() {
    if (!this.sequelize) return [];

    const [rows] = await this.sequelize.query(`
      SELECT
        s.id,
        s.name,
        s.website
      FROM suppliers s
      LEFT JOIN LATERAL (
        SELECT scraped_at
        FROM supplier_prices
        WHERE supplier_id = s.id AND is_valid = true
        ORDER BY scraped_at DESC
        LIMIT 1
      ) sp ON true
      WHERE s.claimed_at IS NOT NULL
        AND s.active = true
        AND s.website IS NOT NULL
        AND (
          sp.scraped_at IS NULL
          OR sp.scraped_at < NOW() - INTERVAL '${SCRAPE_RESUME_DAYS} days'
        )
    `);

    return rows;
  }

  /**
   * Send reminder email to supplier
   */
  async sendReminderEmail(supplier) {
    if (!this.initialized) {
      console.log('[SupplierStaleness] Email not configured - skipping reminder');
      return false;
    }

    const magicLinkUrl = supplier.magic_link_token
      ? `https://gethomeheat.com/update-price.html?token=${supplier.magic_link_token}`
      : null;

    const daysSinceUpdate = supplier.last_price_date
      ? Math.floor((Date.now() - new Date(supplier.last_price_date).getTime()) / (1000 * 60 * 60 * 24))
      : 'N/A';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F5A623;">📊 Price Update Reminder</h2>

        <p>Hi there,</p>

        <p>Your listing for <strong>${supplier.name}</strong> on HomeHeat hasn't been updated in <strong>${daysSinceUpdate} days</strong>.</p>

        <p>Homeowners in ${supplier.city}, ${supplier.state} are looking for current prices. Keeping your price up-to-date helps you get more customers!</p>

        ${supplier.last_price_date
          ? `<p style="color: #666;">Current price on file: <strong>$${parseFloat(supplier.price_per_gallon).toFixed(3)}</strong>/gallon</p>`
          : '<p style="color: #666;">No price currently on file.</p>'
        }

        ${magicLinkUrl
          ? `<p><a href="${magicLinkUrl}" style="display: inline-block; background: #F5A623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Update My Price</a></p>`
          : '<p><em>Contact support@gethomeheat.com if you need a new update link.</em></p>'
        }

        <p style="color: #888; font-size: 14px; margin-top: 24px;">
          If your price hasn't changed, no action needed - we'll check your website as a backup.
          <br>Summer note: We know prices don't change as often in warmer months.
        </p>

        <p style="color: #888; font-size: 12px;">
          — The HomeHeat Team
        </p>
      </div>
    `;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [supplier.claimed_by_email],
          subject: `📊 Update your price on HomeHeat - ${supplier.name}`,
          html
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`[SupplierStaleness] Reminder sent to ${supplier.claimed_by_email} for ${supplier.name}`);

        // Mark reminder sent
        await this.sequelize.query(
          `UPDATE suppliers SET last_stale_reminder_at = NOW() WHERE id = :id`,
          { replacements: { id: supplier.id } }
        );

        return true;
      } else {
        console.error('[SupplierStaleness] Email error:', result);
        return false;
      }
    } catch (error) {
      console.error('[SupplierStaleness] Failed to send reminder:', error.message);
      return false;
    }
  }

  /**
   * Run daily staleness check
   * Called by scheduler
   */
  async runDailyCheck() {
    console.log('[SupplierStaleness] Running daily check...');

    try {
      // 1. Get suppliers needing reminders
      const needReminder = await this.getClaimedSuppliersNeedingReminder();
      console.log(`[SupplierStaleness] Found ${needReminder.length} suppliers needing reminder`);

      // 2. Send reminders
      let remindersSent = 0;
      for (const supplier of needReminder) {
        const sent = await this.sendReminderEmail(supplier);
        if (sent) remindersSent++;

        // Rate limit: 1 email per second
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 3. Get suppliers for backup scraping
      const forBackupScrape = await this.getClaimedSuppliersForBackupScrape();
      console.log(`[SupplierStaleness] Found ${forBackupScrape.length} claimed suppliers eligible for backup scrape`);

      // Note: Actual scraping is handled by the price scraper
      // This just identifies them - scraper will check claimed_at + last price age

      console.log(`[SupplierStaleness] Daily check complete: ${remindersSent} reminders sent`);

      return {
        suppliersChecked: needReminder.length,
        remindersSent,
        eligibleForBackupScrape: forBackupScrape.length
      };

    } catch (error) {
      console.error('[SupplierStaleness] Daily check failed:', error.message);
      return { error: error.message };
    }
  }
}

// Singleton
let instance = null;

const getSupplierStalenessService = (sequelize) => {
  if (!instance && sequelize) {
    instance = new SupplierPriceStalenessService(sequelize);
    instance.initialize();
  }
  return instance;
};

module.exports = {
  SupplierPriceStalenessService,
  getSupplierStalenessService,
  STALE_THRESHOLD_DAYS,
  SCRAPE_RESUME_DAYS,
  OUTDATED_THRESHOLD_DAYS
};
