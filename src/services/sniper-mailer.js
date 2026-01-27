// src/services/sniper-mailer.js
// Sniper Mailer - Send lead notifications to suppliers when users click their listings

const { Sequelize } = require('sequelize');

// Configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Leo from HomeHeat <hello@gethomeheat.com>';
const REPLY_TO = 'support@gethomeheat.com';
const ADMIN_BCC = 'ltsoir@gmail.com';
const COOLDOWN_DAYS = 14;
const DRY_RUN = process.env.SNIPER_DRY_RUN === 'true';

// State slug mapping
const STATE_SLUGS = {
  'NY': 'new-york', 'NJ': 'new-jersey', 'CT': 'connecticut',
  'MA': 'massachusetts', 'PA': 'pennsylvania', 'NH': 'new-hampshire',
  'RI': 'rhode-island', 'ME': 'maine', 'VT': 'vermont', 'DE': 'delaware',
  'MD': 'maryland', 'VA': 'virginia', 'AK': 'alaska'
};

class SniperMailer {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  /**
   * Process unprocessed clicks and send emails
   */
  async processClicks() {
    console.log('[SniperMailer] Processing clicks...');

    // Get unprocessed clicks with supplier info
    const [clicks] = await this.sequelize.query(`
      SELECT
        sc.id as click_id,
        sc.supplier_id,
        sc.zip_code,
        sc.action_type,
        sc.created_at as click_time,
        s.name as supplier_name,
        s.email as supplier_email,
        s.phone,
        s.website,
        s.state,
        sp.price_per_gallon
      FROM supplier_clicks sc
      JOIN suppliers s ON sc.supplier_id = s.id
      LEFT JOIN LATERAL (
        SELECT price_per_gallon
        FROM supplier_prices
        WHERE supplier_id = sc.supplier_id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) sp ON true
      WHERE sc.processed_for_email = false
        AND s.email IS NOT NULL
        AND s.email != ''
        AND s.active = true
      ORDER BY sc.created_at ASC
      LIMIT 50
    `);

    console.log(`[SniperMailer] Found ${clicks.length} unprocessed clicks with emails`);

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const click of clicks) {
      try {
        // Check cooldown - has this supplier been emailed recently?
        const [recentEmail] = await this.sequelize.query(`
          SELECT 1 FROM supplier_clicks
          WHERE supplier_id = :supplierId
            AND email_sent_at > NOW() - INTERVAL '${COOLDOWN_DAYS} days'
          LIMIT 1
        `, { replacements: { supplierId: click.supplier_id } });

        if (recentEmail.length > 0) {
          console.log(`[SniperMailer] Skipping ${click.supplier_name} - emailed within ${COOLDOWN_DAYS} days`);
          // Mark as processed but don't send
          await this.markProcessed(click.click_id, false);
          skipped++;
          continue;
        }

        // Check if this is first email ever to this supplier
        const [previousEmails] = await this.sequelize.query(`
          SELECT 1 FROM supplier_clicks
          WHERE supplier_id = :supplierId
            AND email_sent_at IS NOT NULL
          LIMIT 1
        `, { replacements: { supplierId: click.supplier_id } });

        const isFirstEmail = previousEmails.length === 0;

        // Send email
        const success = await this.sendEmail(click, isFirstEmail);

        if (success) {
          await this.markProcessed(click.click_id, true);
          sent++;
        } else {
          errors++;
        }

      } catch (err) {
        console.error(`[SniperMailer] Error processing click ${click.click_id}:`, err.message);
        errors++;
      }
    }

    console.log(`[SniperMailer] Complete: ${sent} sent, ${skipped} skipped (cooldown), ${errors} errors`);
    return { sent, skipped, errors };
  }

  /**
   * Send email to supplier
   */
  async sendEmail(click, isFirstEmail) {
    const { supplier_email, supplier_name, supplier_id, zip_code, action_type, phone, website, state, price_per_gallon } = click;

    // Format price
    const priceDisplay = price_per_gallon
      ? `$${parseFloat(price_per_gallon).toFixed(2)}/gal`
      : 'Not listed';

    // Format phone
    const phoneDisplay = phone || 'Not listed';

    // Format website (remove protocol for display)
    const websiteDisplay = website
      ? website.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : 'Not listed';

    // Action text based on action type
    const actionText = action_type === 'phone'
      ? 'clicked to call you'
      : action_type === 'website'
        ? 'visited your website'
        : 'viewed your listing';

    // State slug for URL
    const stateSlug = STATE_SLUGS[state] || state?.toLowerCase() || 'new-york';

    // UTM tracking
    const utm = `utm_source=sniper&utm_campaign=${supplier_id}`;
    const siteUrl = `https://gethomeheat.com/prices/${stateSlug}?${utm}`;

    // Choose template
    const subject = isFirstEmail
      ? `Customer in ${zip_code} just clicked your listing`
      : `New lead: Customer in ${zip_code} found you on HomeHeat`;

    const html = isFirstEmail
      ? this.getEmail1Template({ zip_code, actionText, priceDisplay, phoneDisplay, websiteDisplay, siteUrl })
      : this.getEmail2Template({ zip_code, actionText, priceDisplay, siteUrl });

    if (DRY_RUN) {
      console.log(`[SniperMailer] DRY RUN - Would send ${isFirstEmail ? 'Email 1' : 'Email 2'} to ${supplier_email}`);
      console.log(`  Subject: ${subject}`);
      return true;
    }

    // Send via Resend
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [supplier_email],
          bcc: [ADMIN_BCC],
          reply_to: REPLY_TO,
          subject,
          html
        })
      });

      const result = await response.json();

      if (response.ok && result.id) {
        console.log(`[SniperMailer] Sent ${isFirstEmail ? 'Email 1' : 'Email 2'} to ${supplier_email} (${supplier_name})`);
        return true;
      } else {
        console.error(`[SniperMailer] Failed to send to ${supplier_email}:`, result);
        return false;
      }
    } catch (err) {
      console.error(`[SniperMailer] Network error sending to ${supplier_email}:`, err.message);
      return false;
    }
  }

  /**
   * Email 1: First contact / Introduction
   */
  getEmail1Template({ zip_code, actionText, priceDisplay, phoneDisplay, websiteDisplay, siteUrl }) {
    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px;">
  <p>Hi there,</p>

  <p>I'm Leo, founder of HomeHeat — a free app that connects homeowners with local oil suppliers.</p>

  <p>A homeowner in <strong>${zip_code}</strong> just <strong>${actionText}</strong> after finding you on HomeHeat.</p>

  <p>We listed you for free because we found your business online.</p>

  <p><strong>Quick check — is this info correct?</strong></p>
  <ul style="margin: 10px 0; padding-left: 20px;">
    <li>Price: ${priceDisplay}</li>
    <li>Phone: ${phoneDisplay}</li>
    <li>Website: ${websiteDisplay}</li>
  </ul>

  <p>If anything's outdated, just reply and I'll fix it.</p>

  <p><strong>See yourself:</strong> Search "${zip_code}" at <a href="${siteUrl}" style="color: #2563eb;">gethomeheat.com</a></p>

  <p>We'll notify you whenever customers find you — no fees, no catches.</p>

  <p>
    Best,<br>
    Leo
  </p>

  <p style="color: #999; font-size: 12px; margin-top: 30px;">
    Reply "remove" to opt out.
  </p>
</div>
    `.trim();
  }

  /**
   * Email 2+: Follow-up / Shorter notification
   */
  getEmail2Template({ zip_code, actionText, priceDisplay, siteUrl }) {
    return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px;">
  <p>Hi there,</p>

  <p>Another homeowner found you on HomeHeat — this time from <strong>${zip_code}</strong>. They <strong>${actionText}</strong>.</p>

  <p>Your listed price: <strong>${priceDisplay}</strong></p>

  <p>Price changed? Just reply and I'll update it.</p>

  <p>
    Best,<br>
    Leo
  </p>

  <p style="color: #999; font-size: 12px; margin-top: 30px;">
    Reply "remove" to opt out.
  </p>
</div>
    `.trim();
  }

  /**
   * Mark click as processed
   */
  async markProcessed(clickId, emailSent) {
    if (emailSent) {
      await this.sequelize.query(`
        UPDATE supplier_clicks
        SET processed_for_email = true, email_sent_at = NOW()
        WHERE id = :clickId
      `, { replacements: { clickId } });
    } else {
      await this.sequelize.query(`
        UPDATE supplier_clicks
        SET processed_for_email = true
        WHERE id = :clickId
      `, { replacements: { clickId } });
    }
  }
}

module.exports = SniperMailer;

// CLI execution
if (require.main === module) {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
  });

  const mailer = new SniperMailer(sequelize);

  mailer.processClicks()
    .then(result => {
      console.log('\nResults:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
