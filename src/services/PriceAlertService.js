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
      let skipAboveThreshold = 0;
      let skipDedup = 0;
      let skipCooldown = 0;

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
          this.logger.info(`[PriceAlert] ZIP ${zip}: no fresh prices, skipping ${byZip[zip].length} subscriber(s)`);
          continue;
        }

        for (const sub of byZip[zip]) {
          if (sent >= DAILY_CAP) {
            capped = true;
            break;
          }

          // Check if price is below threshold
          if (priceData.minPrice > sub.threshold_price) {
            skipAboveThreshold++;
            skipped++;
            continue;
          }

          // Skip if already alerted at this exact price
          if (sub.last_price_seen !== null &&
              parseFloat(sub.last_price_seen) === priceData.minPrice) {
            skipDedup++;
            skipped++;
            continue;
          }

          // Skip if within cooldown period
          if (sub.last_alert_sent_at) {
            const cooldownEnd = new Date(sub.last_alert_sent_at);
            cooldownEnd.setDate(cooldownEnd.getDate() + COOLDOWN_DAYS);
            if (new Date() < cooldownEnd) {
              skipCooldown++;
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
        skip_reasons: { above_threshold: skipAboveThreshold, dedup: skipDedup, cooldown: skipCooldown, stale: zipsStale },
        zips_checked: zipCodes.length,
        zips_stale: zipsStale,
        capped,
        errors,
        durationMs: Date.now() - startTime
      };

      // Check coverage requests (empty ZIP notifications)
      try {
        result.coverage_notified = await this.checkCoverageRequests();
      } catch (coverageErr) {
        this.logger.error('[PriceAlert] Coverage request check failed:', coverageErr.message);
        result.coverage_notified = 0;
      }

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
    // Use scraped_at window (not expires_at) for alert eligibility.
    // Alerts don't need the same real-time freshness as website display —
    // a price scraped within 72 hours is a valid signal regardless of expiry.
    const [rows] = await this.sequelize.query(`
      SELECT DISTINCT ON (s.id) s.name, s.city, s.phone, s.slug, sp.price_per_gallon
      FROM suppliers s
      JOIN supplier_prices sp ON s.id = sp.supplier_id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND sp.is_valid = true
        AND sp.scraped_at > NOW() - INTERVAL '72 hours'
        AND sp.source_type != 'aggregator_signal'
        AND sp.fuel_type = 'heating_oil'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS zip
          WHERE zip = :zipCode
        )
      ORDER BY s.id, sp.price_per_gallon ASC
    `, { replacements: { zipCode } });

    // Re-sort by price and take top 3 (DISTINCT ON requires ORDER BY s.id first)
    rows.sort((a, b) => parseFloat(a.price_per_gallon) - parseFloat(b.price_per_gallon));
    const totalSuppliers = rows.length;
    rows.splice(3);

    if (rows.length === 0) return null;

    return {
      minPrice: parseFloat(rows[0].price_per_gallon),
      totalSuppliers,
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
    const { minPrice, totalSuppliers, topSuppliers } = priceData;

    const subject = `Heating oil at $${minPrice.toFixed(2)}/gal in ${zip_code} — below your alert`;
    const html = this.buildAlertEmailHtml({
      zip_code,
      threshold_price: parseFloat(threshold_price),
      minPrice,
      totalSuppliers,
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
  async sendWelcomeEmail(email, zipCode, thresholdPrice, currentMinPrice = null, unsubscribeToken = null) {
    const subject = `Price alert set for ZIP ${zipCode}`;
    const html = this.buildWelcomeEmailHtml({ zip_code: zipCode, threshold_price: thresholdPrice, current_price: currentMinPrice, unsubscribe_token: unsubscribeToken });

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
   * Check coverage_requests for ZIPs that now have supplier coverage.
   * Sends "coverage added" email to users who requested notification.
   * Limits to 50 per run to prevent bulk sends.
   */
  async checkCoverageRequests() {
    // Check if table exists
    const [tableCheck] = await this.sequelize.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'coverage_requests'
    `);
    if (tableCheck.length === 0) return 0;

    // Find coverage requests where the ZIP now has active suppliers with prices
    const [matches] = await this.sequelize.query(`
      SELECT cr.id, cr.email, cr.zip_code, cr.city, cr.state, cr.unsubscribe_token
      FROM coverage_requests cr
      WHERE cr.active = true
        AND cr.notified_at IS NULL
        AND EXISTS (
          SELECT 1 FROM suppliers s
          JOIN supplier_prices sp ON s.id = sp.supplier_id
          WHERE s.active = true
            AND s.allow_price_display = true
            AND sp.is_valid = true
            AND sp.scraped_at > NOW() - INTERVAL '72 hours'
            AND sp.fuel_type = 'heating_oil'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS zip
              WHERE zip = cr.zip_code
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM price_alert_subscribers pas
          WHERE pas.email = cr.email AND pas.zip_code = cr.zip_code AND pas.active = true
        )
      LIMIT 50
    `);

    if (matches.length === 0) return 0;

    let notified = 0;
    for (const match of matches) {
      // Get supplier count for this ZIP
      const [countRows] = await this.sequelize.query(`
        SELECT COUNT(DISTINCT s.id) AS cnt
        FROM suppliers s
        JOIN supplier_prices sp ON s.id = sp.supplier_id
        WHERE s.active = true
          AND s.allow_price_display = true
          AND sp.is_valid = true
          AND sp.scraped_at > NOW() - INTERVAL '72 hours'
          AND sp.fuel_type = 'heating_oil'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS zip
            WHERE zip = :zipCode
          )
      `, { replacements: { zipCode: match.zip_code } });
      const supplierCount = parseInt(countRows[0]?.cnt) || 0;

      const success = await this.sendCoverageAddedEmail(match, supplierCount);
      if (success) {
        await this.sequelize.query(`
          UPDATE coverage_requests
          SET notified_at = NOW(), notified_fuel_type = 'heating_oil', updated_at = NOW()
          WHERE id = :id
        `, { replacements: { id: match.id } });
        notified++;
      }
    }

    if (notified > 0) {
      this.logger.info(`[PriceAlert] Coverage-added notifications sent: ${notified}`);
    }
    return notified;
  }

  /**
   * Send "coverage added" email for a coverage request.
   */
  async sendCoverageAddedEmail(match, supplierCount) {
    const { email, zip_code, city, state, unsubscribe_token } = match;

    const location = city && state ? `${city}, ${state.toUpperCase()}` : zip_code;
    const priceUrl = `${SITE_URL}/prices.html?zip=${zip_code}&utm_source=coverage_added&utm_medium=email`;
    const unsubUrl = `${SITE_URL}/api/coverage-request/unsubscribe?token=${unsubscribe_token}`;
    const appUrl = 'https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=coverage_added&utm_campaign=notification';

    const subject = `Heating oil prices now available near ${zip_code}`;
    const supplierNote = supplierCount > 0 ? ` from ${supplierCount} supplier${supplierCount !== 1 ? 's' : ''}` : '';

    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background: #fff;">
  ${this.buildEmailHeader()}

  <div style="padding: 0 20px;">
    <h2 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Great news — we now track heating oil prices near you!</h2>

    <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 15px; color: #333;">We now have heating oil pricing data${supplierNote} delivering to <strong>${location}</strong>.</p>
    </div>

    <p style="margin: 16px 0 24px; text-align: center;">
      <a href="${priceUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">See today's prices →</a>
    </p>

    <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 0 0 24px; text-align: center; border: 1px solid #e5e7eb;">
      <img src="${SITE_URL}/images/app-icon-192.png" alt="HomeHeat" width="48" height="48" style="border-radius: 12px; margin-bottom: 8px;">
      <div style="font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">Never miss the best time to order</div>
      <div style="font-size: 13px; color: #666; margin-bottom: 14px;">HomeHeat for iPhone tracks your tank level and predicts when to order at the lowest price.</div>
      <a href="${appUrl}" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;"><span style="font-size: 9px; display: block; font-weight: 400; line-height: 1; margin-bottom: 2px;">Download on the</span><span style="font-size: 16px; font-weight: 600; line-height: 1;">App Store</span></a>
    </div>
  </div>

  <p style="font-size: 12px; color: #888; margin-top: 32px; padding: 0 20px; border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
    <a href="${unsubUrl}" style="color: #888;">Unsubscribe</a> · <a href="${SITE_URL}/privacy.html" style="color: #888;">Privacy Policy</a>
    <br><br>HomeHeat · Katonah, NY 10536
  </p>
</div>`;

    if (DRY_RUN) {
      this.logger.info(`[PriceAlert] DRY RUN - Would send coverage-added to ${email}`);
      return true;
    }

    if (!RESEND_API_KEY) {
      this.logger.error('[PriceAlert] RESEND_API_KEY not set, skipping coverage-added email.');
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
        this.logger.info(`[PriceAlert] Coverage-added email sent to ${email} for ZIP ${zip_code}`);
        return true;
      }

      this.logger.error(`[PriceAlert] Coverage-added email failed for ${email}:`, result);
      return false;
    } catch (err) {
      this.logger.error(`[PriceAlert] Coverage-added email error for ${email}:`, err.message);
      return false;
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

    const parts = [];
    if (updateUrl) parts.push(`<a href="${updateUrl}" style="color: #888;">Update your alert</a>`);
    if (unsubUrl) parts.push(`<a href="${unsubUrl}" style="color: #888;">Unsubscribe</a>`);
    parts.push(`<a href="${SITE_URL}/privacy.html" style="color: #888;">Privacy Policy</a>`);

    return `
  <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
    ${parts.join(' · ')}
    <br><br>HomeHeat · Katonah, NY 10536
  </p>`;
  }

  /**
   * Build the price drop alert email HTML.
   */
  buildAlertEmailHtml({ zip_code, threshold_price, minPrice, totalSuppliers, topSuppliers, unsubscribe_token }) {
    const priceUrl = `${SITE_URL}/prices.html?zip=${zip_code}&utm_source=price_alert&utm_campaign=price_drop`;
    const appUrl = 'https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=price_alert&utm_campaign=price_drop';
    const savings = ((threshold_price - minPrice) * 150).toFixed(0);

    const supplierRows = topSuppliers.map((s, i) => {
      const phoneLink = s.phone ? `<a href="tel:${s.phone}" style="color: #2563eb; text-decoration: none;">${s.phone}</a>` : '';
      const nameHtml = s.slug
        ? `<a href="${SITE_URL}/supplier/${s.slug}?utm_source=price_alert&utm_campaign=price_drop" style="color: #1a1a1a; text-decoration: none;">${s.name}</a>`
        : s.name;
      const isFirst = i === 0;
      const rowBg = isFirst ? 'background: #f0fdf4;' : '';
      const priceBadge = isFirst
        ? `<span style="background: #16a34a; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 15px;">$${s.price.toFixed(2)}</span>`
        : `<span style="font-weight: 600; color: #333;">$${s.price.toFixed(2)}</span>`;
      return `
        <tr style="${rowBg}">
          <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
            <div style="font-weight: ${isFirst ? '600' : '500'}; font-size: 14px;">${nameHtml}</div>
            ${s.city ? `<div style="font-size: 12px; color: #888; margin-top: 2px;">${s.city}</div>` : ''}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: center;">${priceBadge}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: right;">${phoneLink}</td>
        </tr>`;
    }).join('');

    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background: #fff;">
  ${this.buildEmailHeader()}

  <div style="padding: 0 20px;">
    <p style="margin: 0 0 20px; font-size: 15px; color: #444;">Heating oil in <strong>${zip_code}</strong> is below your <strong>$${threshold_price.toFixed(2)}</strong> target.</p>

    <div style="background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%); border-radius: 12px; padding: 24px; margin: 0 0 24px; text-align: center;">
      <div style="font-size: 13px; color: rgba(255,255,255,0.8); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Lowest price in ${zip_code}</div>
      <div style="font-size: 36px; font-weight: 800; color: #fff;">$${minPrice.toFixed(2)}<span style="font-size: 18px; font-weight: 500;">/gal</span></div>
      ${parseFloat(savings) > 0 ? `<div style="font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 6px;">Save ~$${savings} on a 150-gallon fill vs. your target price</div>` : ''}
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 0 0 8px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th style="padding: 10px 16px; text-align: left; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Supplier</th>
          <th style="padding: 10px 16px; text-align: center; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Price</th>
          <th style="padding: 10px 16px; text-align: right; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Call</th>
        </tr>
      </thead>
      <tbody>
        ${supplierRows}
      </tbody>
    </table>

    <p style="margin: 8px 0 0; font-size: 12px; color: #999; text-align: center;">Based on ${totalSuppliers} supplier${totalSuppliers !== 1 ? 's' : ''} checked today in ${zip_code}</p>

    <p style="margin: 16px 0 24px; text-align: center;">
      <a href="${priceUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Compare all suppliers in ${zip_code}</a>
    </p>

    <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 0 0 24px; text-align: center; border: 1px solid #e5e7eb;">
      <img src="${SITE_URL}/images/app-icon-192.png" alt="HomeHeat" width="48" height="48" style="border-radius: 12px; margin-bottom: 8px;">
      <div style="font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">Never miss the best time to order</div>
      <div style="font-size: 13px; color: #666; margin-bottom: 14px;">HomeHeat for iPhone tracks your tank level and predicts when to order at the lowest price.</div>
      <a href="${appUrl}" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;"><span style="font-size: 9px; display: block; font-weight: 400; line-height: 1; margin-bottom: 2px;">Download on the</span><span style="font-size: 16px; font-weight: 600; line-height: 1;">App Store</span></a>
    </div>
  </div>

  ${this.buildEmailFooter({ zip_code, unsubscribe_token })}
</div>`;
  }

  /**
   * Build the welcome confirmation email HTML.
   */
  buildWelcomeEmailHtml({ zip_code, threshold_price, current_price, unsubscribe_token }) {
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

  ${this.buildEmailFooter({ zip_code, unsubscribe_token })}
</div>`;
  }
}

module.exports = PriceAlertService;
