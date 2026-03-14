// src/services/PriceAlertService.js
// Daily price alert checker — emails subscribers when prices drop below their threshold

const crypto = require('crypto');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Leo from HomeHeat <hello@gethomeheat.com>';
const REPLY_TO = 'support@gethomeheat.com';
const DRY_RUN = process.env.PRICE_ALERT_DRY_RUN === 'true';
const ADVISORY_LOCK_KEY = 742019232;
const DAILY_CAP = 500;
const COOLDOWN_DAYS = 7;
const ZOMBIE_MONTHS = 6;
const SITE_URL = 'https://www.gethomeheat.com';

class PriceAlertService {
  constructor(sequelize, logger = console) {
    this.sequelize = sequelize;
    this.logger = logger;
  }

  /**
   * Run daily price alert check. Called by cron at 8 AM ET.
   */
  async runDailyCheck() {
    const startTime = Date.now();
    let lockAcquired = false;

    try {
      const [[lockResult]] = await this.sequelize.query(
        `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`
      );
      lockAcquired = lockResult.locked;

      if (!lockAcquired) {
        this.logger.info('[PriceAlert] Another instance running, skipping.');
        return { success: false, reason: 'locked' };
      }

      // Clean up zombie subscribers (signed up > 6 months ago, never received an alert)
      await this.cleanupZombies();

      // Fetch all active subscribers
      const [subscribers] = await this.sequelize.query(`
        SELECT id, email, zip_code, threshold_price, unsubscribe_token,
               last_alert_sent_at, last_price_seen, alert_count, first_sent_at
        FROM price_alert_subscribers
        WHERE active = true
        ORDER BY zip_code
      `);

      if (subscribers.length === 0) {
        this.logger.info('[PriceAlert] No active subscribers.');
        return { success: true, checked: 0, sent: 0, skipped: 0, capped: false, errors: 0 };
      }

      // Group by ZIP for efficient price lookups
      const byZip = {};
      for (const sub of subscribers) {
        if (!byZip[sub.zip_code]) byZip[sub.zip_code] = [];
        byZip[sub.zip_code].push(sub);
      }

      const zipCodes = Object.keys(byZip);
      let sent = 0;
      let skipped = 0;
      let errors = 0;
      let capped = false;
      let zipsStale = 0;

      for (const zip of zipCodes) {
        if (sent >= DAILY_CAP) {
          capped = true;
          this.logger.warn(`[PriceAlert] Daily cap of ${DAILY_CAP} reached, stopping.`);
          break;
        }

        // Get fresh min price and top 3 suppliers for this ZIP
        const priceData = await this.getZipPriceData(zip);

        if (!priceData) {
          zipsStale++;
          skipped += byZip[zip].length;
          continue;
        }

        for (const sub of byZip[zip]) {
          if (sent >= DAILY_CAP) {
            capped = true;
            break;
          }

          // Check if price is below threshold
          if (priceData.minPrice > sub.threshold_price) {
            skipped++;
            continue;
          }

          // Skip if already alerted at this exact price
          if (sub.last_price_seen !== null &&
              parseFloat(sub.last_price_seen) === priceData.minPrice) {
            skipped++;
            continue;
          }

          // Skip if within cooldown period
          if (sub.last_alert_sent_at) {
            const cooldownEnd = new Date(sub.last_alert_sent_at);
            cooldownEnd.setDate(cooldownEnd.getDate() + COOLDOWN_DAYS);
            if (new Date() < cooldownEnd) {
              skipped++;
              continue;
            }
          }

          // Send alert
          const success = await this.sendAlertEmail(sub, priceData);
          if (success) {
            await this.markAlertSent(sub.id, priceData.minPrice);
            sent++;
          } else {
            errors++;
          }
        }
      }

      const result = {
        success: true,
        subscribers_total: subscribers.length,
        alerts_sent: sent,
        alerts_skipped: skipped,
        zips_checked: zipCodes.length,
        zips_stale: zipsStale,
        capped,
        errors,
        durationMs: Date.now() - startTime
      };

      this.logger.info(`[PriceAlert] Complete: ${JSON.stringify(result)}`);
      return result;

    } finally {
      if (lockAcquired) {
        await this.sequelize.query(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
      }
    }
  }

  /**
   * Get min price and top 3 cheapest suppliers for a ZIP code.
   * Returns null if no fresh prices available.
   */
  async getZipPriceData(zipCode) {
    const [rows] = await this.sequelize.query(`
      SELECT DISTINCT ON (s.id) s.name, s.city, s.phone, s.slug, sp.price_per_gallon
      FROM suppliers s
      JOIN supplier_prices sp ON s.id = sp.supplier_id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND sp.is_valid = true
        AND sp.expires_at > NOW()
        AND sp.scraped_at > NOW() - INTERVAL '72 hours'
        AND sp.source_type != 'aggregator_signal'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS zip
          WHERE zip = :zipCode
        )
      ORDER BY s.id, sp.price_per_gallon ASC
    `, { replacements: { zipCode } });

    // Re-sort by price and take top 3 (DISTINCT ON requires ORDER BY s.id first)
    rows.sort((a, b) => parseFloat(a.price_per_gallon) - parseFloat(b.price_per_gallon));
    rows.splice(3);

    if (rows.length === 0) return null;

    return {
      minPrice: parseFloat(rows[0].price_per_gallon),
      topSuppliers: rows.map(r => ({
        name: r.name,
        city: r.city,
        phone: r.phone,
        slug: r.slug,
        price: parseFloat(r.price_per_gallon)
      }))
    };
  }

  /**
   * Send price drop alert email via Resend.
   */
  async sendAlertEmail(subscriber, priceData) {
    const { email, zip_code, threshold_price, unsubscribe_token } = subscriber;
    const { minPrice, topSuppliers } = priceData;

    const subject = `Prices dropped below $${parseFloat(threshold_price).toFixed(2)} in ${zip_code}`;
    const html = this.buildAlertEmailHtml({
      zip_code,
      threshold_price: parseFloat(threshold_price),
      minPrice,
      topSuppliers,
      unsubscribe_token
    });

    if (DRY_RUN) {
      this.logger.info(`[PriceAlert] DRY RUN - Would send to ${email}: ${subject}`);
      return true;
    }

    if (!RESEND_API_KEY) {
      this.logger.error('[PriceAlert] RESEND_API_KEY not set, skipping send.');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          reply_to: REPLY_TO,
          subject,
          html
        })
      });

      const result = await response.json();

      if (response.ok && result.id) {
        this.logger.info(`[PriceAlert] Sent alert to ${email} for ZIP ${zip_code} ($${minPrice})`);
        return true;
      }

      // Handle bounce/suppression
      if (result.statusCode === 422 || result.name === 'validation_error') {
        this.logger.warn(`[PriceAlert] Bounce/suppression for ${email}, deactivating.`);
        await this.sequelize.query(
          `UPDATE price_alert_subscribers SET active = false WHERE email = :email`,
          { replacements: { email } }
        );
        return false;
      }

      this.logger.error(`[PriceAlert] Failed to send to ${email}:`, result);
      return false;

    } catch (err) {
      this.logger.error(`[PriceAlert] Network error sending to ${email}:`, err.message);
      return false;
    }
  }

  /**
   * Send welcome email confirming alert setup.
   */
  async sendWelcomeEmail(email, zipCode, thresholdPrice, currentMinPrice = null) {
    const subject = `Price alert set for ZIP ${zipCode}`;
    const html = this.buildWelcomeEmailHtml({ zip_code: zipCode, threshold_price: thresholdPrice, current_price: currentMinPrice });

    if (DRY_RUN) {
      this.logger.info(`[PriceAlert] DRY RUN - Would send welcome to ${email}`);
      return true;
    }

    if (!RESEND_API_KEY) {
      this.logger.error('[PriceAlert] RESEND_API_KEY not set, skipping welcome email.');
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          reply_to: REPLY_TO,
          subject,
          html
        })
      });

      const result = await response.json();
      if (response.ok && result.id) {
        this.logger.info(`[PriceAlert] Welcome email sent to ${email}`);
        return true;
      }

      this.logger.error(`[PriceAlert] Welcome email failed for ${email}:`, result);
      return false;
    } catch (err) {
      this.logger.error(`[PriceAlert] Welcome email error for ${email}:`, err.message);
      return false;
    }
  }

  /**
   * Mark an alert as sent for a subscriber.
   */
  async markAlertSent(subscriberId, price) {
    await this.sequelize.query(`
      UPDATE price_alert_subscribers
      SET last_alert_sent_at = NOW(),
          last_price_seen = :price,
          alert_count = alert_count + 1,
          first_sent_at = COALESCE(first_sent_at, NOW())
      WHERE id = :subscriberId
    `, { replacements: { subscriberId, price } });
  }

  /**
   * Deactivate zombie subscribers (signed up > 6 months ago, never received an alert).
   */
  async cleanupZombies() {
    const [, meta] = await this.sequelize.query(`
      UPDATE price_alert_subscribers
      SET active = false
      WHERE active = true
        AND first_sent_at IS NULL
        AND created_at < NOW() - INTERVAL '${ZOMBIE_MONTHS} months'
    `);
    const count = meta?.rowCount || 0;
    if (count > 0) {
      this.logger.info(`[PriceAlert] Deactivated ${count} zombie subscribers.`);
    }
  }

  /**
   * Shared branded email header with app icon + wordmark.
   */
  buildEmailHeader() {
    return `
  <div style="background: #f8f9fa; padding: 16px 20px; margin-bottom: 24px; border-radius: 8px 8px 0 0;">
    <a href="${SITE_URL}" style="text-decoration: none; display: inline-flex; align-items: center; gap: 10px;">
      <img src="${SITE_URL}/images/app-icon-192.png" alt="HomeHeat" width="40" height="40" style="border-radius: 10px;">
      <span style="font-size: 20px; font-weight: 700; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">HomeHeat</span>
    </a>
  </div>`;
  }

  /**
   * Shared email footer with update/unsubscribe links, privacy, and CAN-SPAM address.
   */
  buildEmailFooter({ zip_code, unsubscribe_token } = {}) {
    const updateUrl = zip_code ? `${SITE_URL}/prices.html?zip=${zip_code}&update_alert=1&utm_source=price_alert` : null;
    const unsubUrl = unsubscribe_token ? `${SITE_URL}/api/price-alerts/unsubscribe?token=${unsubscribe_token}` : null;

    let links = '';
    if (updateUrl) links += `<a href="${updateUrl}" style="color: #888;">Update your alert</a>`;
    if (updateUrl && unsubUrl) links += ' · ';
    if (unsubUrl) links += `<a href="${unsubUrl}" style="color: #888;">Unsubscribe</a>`;
    if (links) links += '<br>';

    return `
  <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
    ${links}<a href="${SITE_URL}/privacy.html" style="color: #888;">Privacy Policy</a>
    <br><br>HomeHeat · Katonah, NY 10536
  </p>`;
  }

  /**
   * Build the price drop alert email HTML.
   */
  buildAlertEmailHtml({ zip_code, threshold_price, minPrice, topSuppliers, unsubscribe_token }) {
    const priceUrl = `${SITE_URL}/prices.html?zip=${zip_code}&utm_source=price_alert&utm_campaign=price_drop`;
    const appUrl = 'https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=price_alert&utm_campaign=price_drop';

    const supplierRows = topSuppliers.map(s => {
      const phoneLink = s.phone ? `<a href="tel:${s.phone}" style="color: #2563eb;">${s.phone}</a>` : '';
      const nameHtml = s.slug
        ? `<a href="${SITE_URL}/supplier/${s.slug}?utm_source=price_alert&utm_campaign=price_drop" style="color: #1a1a1a; text-decoration: none; font-weight: 500;">${s.name}</a>`
        : s.name;
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${nameHtml}${s.city ? ` <span style="color: #888;">· ${s.city}</span>` : ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 600;">$${s.price.toFixed(2)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${phoneLink}</td>
        </tr>`;
    }).join('');

    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
  ${this.buildEmailHeader()}

  <p>Good news — heating oil prices in <strong>${zip_code}</strong> dropped below your target of <strong>$${threshold_price.toFixed(2)}/gal</strong>.</p>

  <div style="background: #f0f7ff; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
    <div style="font-size: 28px; font-weight: 700; color: #1a56db;">$${minPrice.toFixed(2)}/gal</div>
    <div style="font-size: 13px; color: #666; margin-top: 4px;">Current lowest price in ${zip_code}</div>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="background: #f8f9fa;">
        <th style="padding: 8px 12px; text-align: left; font-size: 13px; color: #666;">Supplier</th>
        <th style="padding: 8px 12px; text-align: left; font-size: 13px; color: #666;">Price</th>
        <th style="padding: 8px 12px; text-align: left; font-size: 13px; color: #666;">Phone</th>
      </tr>
    </thead>
    <tbody>
      ${supplierRows}
    </tbody>
  </table>

  <p><a href="${priceUrl}" style="color: #2563eb;">See today's cheapest heating oil in ${zip_code} →</a></p>

  <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 13px;">
    📱 <strong>Want smarter alerts?</strong> The HomeHeat app predicts when your tank runs out and finds the best time to order.
    <a href="${appUrl}" style="color: #2563eb;">Download free →</a>
  </div>

  ${this.buildEmailFooter({ zip_code, unsubscribe_token })}
</div>`;
  }

  /**
   * Build the welcome confirmation email HTML.
   */
  buildWelcomeEmailHtml({ zip_code, threshold_price, current_price }) {
    const priceUrl = `${SITE_URL}/prices.html?zip=${zip_code}&utm_source=price_alert&utm_campaign=welcome`;
    const appUrl = 'https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=price_alert&utm_campaign=welcome';
    const formattedThreshold = parseFloat(threshold_price).toFixed(2);
    const hasCoverage = current_price !== null && current_price !== undefined;

    // Coverage-dependent sections
    const currentPriceSection = hasCoverage
      ? `<div style="font-size: 13px; color: #666; margin-top: 8px;">Current lowest price in ${zip_code}: <strong style="color: #1a56db;">$${parseFloat(current_price).toFixed(2)}/gal</strong></div>
    <div style="font-size: 13px; color: #666; margin-top: 4px;">We check prices daily and email you when they drop below your threshold.</div>`
      : `<div style="font-size: 13px; color: #666; margin-top: 8px;">We don't have supplier data for ${zip_code} yet, but we're expanding coverage daily. We'll email you when we add suppliers in your area and prices match your threshold.</div>`;

    const ctaSection = hasCoverage
      ? `<p><a href="${priceUrl}" style="color: #2563eb;">See today's cheapest heating oil in ${zip_code} →</a></p>`
      : `<p><a href="${priceUrl}" style="color: #2563eb;">Check back for prices in ${zip_code} →</a></p>`;

    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
  ${this.buildEmailHeader()}

  <h2 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Your price alert is set for ${zip_code}</h2>

  <div style="background: #f0f7ff; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
    <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Alert threshold</div>
    <div style="font-size: 28px; font-weight: 700; color: #1a56db;">$${formattedThreshold}/gal</div>
    ${currentPriceSection}
  </div>

  <p>That's it — no newsletters, no spam. Just a heads-up when it's a good time to order.</p>

  ${ctaSection}

  <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 13px;">
    📱 <strong>Track your tank level and get smarter alerts.</strong> The HomeHeat app predicts when you'll run out and finds the best time to order.
    <a href="${appUrl}" style="color: #2563eb;">Download free →</a>
  </div>

  ${this.buildEmailFooter({ zip_code })}
</div>`;
  }
}

module.exports = PriceAlertService;
