/**
 * OutreachSequenceService
 *
 * Automated follow-up email sequence for supplier outreach (heatingoil-014).
 * Runs from the 6 AM EST daily cron in server.js.
 *
 * Sequence:
 *   E1 (Day 0)  — Sent by claim-targets.js --send (manual, one-by-one)
 *   E2 (Day 5)  — Auto nudge: "X homeowners searched your area this week"
 *   E3 (Day 14) — Auto soft close: "Should we remove your listing?"
 *
 * Safety:
 *   - Cron lock prevents concurrent runs (Railway deploy overlap)
 *   - Per-run rate limits: MAX_EMAILS_PER_RUN, MAX_SMS_PER_RUN
 *   - Duplicate-send guard via audit_logs check before each send
 *   - email_unsubscribed / sms_opted_out checked before each send
 */

const { buildUnsubscribeUrl } = require('../routes/outreach');

const MAX_EMAILS_PER_RUN = 50;
const MAX_SMS_PER_RUN = 30;
const LOCK_TTL_MINUTES = 15;

class OutreachSequenceService {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger || console;
    this.apiKey = process.env.RESEND_API_KEY;
    this.emailFrom = process.env.EMAIL_FROM;
  }

  /**
   * Main entry point — called from 6 AM cron
   */
  async runSequence() {
    if (!this.apiKey || !this.emailFrom) {
      this.logger.info?.('[OutreachSequence] Missing RESEND_API_KEY or EMAIL_FROM — skipping');
      return { skipped: true };
    }

    // Acquire cron lock
    const locked = await this.acquireLock('outreach_sequence');
    if (!locked) {
      this.logger.info?.('[OutreachSequence] Another instance is running — skipping');
      return { skipped: true, reason: 'locked' };
    }

    const results = { e2_sent: 0, e3_sent: 0, e2_failed: 0, e3_failed: 0, skipped: 0, complete: 0 };

    try {
      // Process E2 follow-ups (Day 5+)
      const e2Candidates = await this.getE2Candidates();
      let emailsSent = 0;

      for (const candidate of e2Candidates) {
        if (emailsSent >= MAX_EMAILS_PER_RUN) break;

        const sent = await this.sendE2(candidate);
        if (sent) {
          results.e2_sent++;
          emailsSent++;
        } else {
          results.e2_failed++;
        }
      }

      // Process E3 follow-ups (Day 14+)
      const e3Candidates = await this.getE3Candidates();

      for (const candidate of e3Candidates) {
        if (emailsSent >= MAX_EMAILS_PER_RUN) break;

        const sent = await this.sendE3(candidate);
        if (sent) {
          results.e3_sent++;
          emailsSent++;
        } else {
          results.e3_failed++;
        }
      }

      // Mark completed sequences (E3 sent 7+ days ago, no claim)
      results.complete = await this.markCompletedSequences();

      this.logger.info?.(`[OutreachSequence] Done: E2=${results.e2_sent}/${e2Candidates.length}, E3=${results.e3_sent}/${e3Candidates.length}, complete=${results.complete}`);

    } finally {
      await this.releaseLock('outreach_sequence');
    }

    return results;
  }

  /**
   * Cron lock — prevents concurrent runs during Railway deploy overlap
   */
  async acquireLock(jobName) {
    try {
      // Try to insert or update lock only if expired
      const [result] = await this.sequelize.query(`
        INSERT INTO cron_locks (job_name, locked_until, locked_by)
        VALUES (:jobName, NOW() + INTERVAL '${LOCK_TTL_MINUTES} minutes', :lockedBy)
        ON CONFLICT (job_name) DO UPDATE
          SET locked_until = NOW() + INTERVAL '${LOCK_TTL_MINUTES} minutes',
              locked_by = :lockedBy,
              updated_at = NOW()
          WHERE cron_locks.locked_until < NOW()
        RETURNING job_name
      `, {
        replacements: {
          jobName,
          lockedBy: `pid-${process.pid}`
        }
      });

      return result.length > 0;
    } catch (err) {
      this.logger.warn?.('[OutreachSequence] Lock acquisition failed:', err.message);
      return false;
    }
  }

  async releaseLock(jobName) {
    try {
      await this.sequelize.query(`
        UPDATE cron_locks SET locked_until = NOW() WHERE job_name = :jobName
      `, { replacements: { jobName } });
    } catch (err) {
      // Non-critical — lock will expire naturally
    }
  }

  /**
   * Find suppliers eligible for E2 (Day 5 nudge)
   * Criteria: E1 sent 5+ days ago, no claim submitted, E2 not already sent, not unsubscribed
   */
  async getE2Candidates() {
    const [rows] = await this.sequelize.query(`
      SELECT
        e1.slug,
        e1.email,
        e1.campaign_batch,
        e1.sent_at,
        s.id as supplier_id,
        s.name,
        s.city,
        s.state,
        s.email_unsubscribed
      FROM (
        SELECT
          COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug,
          details::jsonb->>'email' as email,
          details::jsonb->>'campaign_batch' as campaign_batch,
          MIN(created_at) as sent_at
        FROM audit_logs
        WHERE action = 'outreach_email_sent'
          AND created_at > NOW() - INTERVAL '60 days'
        GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug'),
                 details::jsonb->>'email',
                 details::jsonb->>'campaign_batch'
      ) e1
      JOIN suppliers s ON s.slug = e1.slug
      WHERE e1.sent_at <= NOW() - INTERVAL '5 days'
        AND s.email_unsubscribed IS NOT TRUE
        AND s.claimed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_logs
          WHERE action = 'outreach_email_2_sent'
            AND COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') = e1.slug
        )
        AND NOT EXISTS (
          SELECT 1 FROM supplier_claims
          WHERE supplier_id = s.id
            AND status IN ('pending', 'verified')
        )
      ORDER BY e1.sent_at ASC
    `);

    return rows;
  }

  /**
   * Find suppliers eligible for E3 (Day 14 soft close)
   * Criteria: E2 sent 9+ days ago, no claim submitted, E3 not already sent
   */
  async getE3Candidates() {
    const [rows] = await this.sequelize.query(`
      SELECT
        e2.slug,
        e2.email,
        e2.campaign_batch,
        s.id as supplier_id,
        s.name,
        s.city,
        s.state,
        s.email_unsubscribed
      FROM (
        SELECT
          COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug,
          details::jsonb->>'email' as email,
          details::jsonb->>'campaign_batch' as campaign_batch,
          MIN(created_at) as sent_at
        FROM audit_logs
        WHERE action = 'outreach_email_2_sent'
          AND created_at > NOW() - INTERVAL '60 days'
        GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug'),
                 details::jsonb->>'email',
                 details::jsonb->>'campaign_batch'
      ) e2
      JOIN suppliers s ON s.slug = e2.slug
      WHERE e2.sent_at <= NOW() - INTERVAL '9 days'
        AND s.email_unsubscribed IS NOT TRUE
        AND s.claimed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_logs
          WHERE action = 'outreach_email_3_sent'
            AND COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') = e2.slug
        )
        AND NOT EXISTS (
          SELECT 1 FROM supplier_claims
          WHERE supplier_id = s.id
            AND status IN ('pending', 'verified')
        )
      ORDER BY e2.sent_at ASC
    `);

    return rows;
  }

  /**
   * Send E2 nudge email
   */
  async sendE2(candidate) {
    // Fetch fresh demand data
    const demandData = await this.getDemandData(candidate.supplier_id);
    const unsubscribeUrl = buildUnsubscribeUrl(candidate.slug);

    const subject = `${demandData.searches} homeowners searched for heating oil near ${candidate.city} this week`;
    const html = this.buildE2Html(candidate, demandData, unsubscribeUrl);

    const sent = await this.sendEmail(candidate.email, subject, html);

    // Log result
    const action = sent ? 'outreach_email_2_sent' : 'outreach_email_2_failed';
    await this.logAudit(action, {
      supplier_slug: candidate.slug,
      email: candidate.email,
      channel: 'email',
      campaign_batch: candidate.campaign_batch || '2026_spring_claim_push',
      ...(sent ? {} : { error: 'send_failed' })
    });

    return sent;
  }

  /**
   * Send E3 soft close email
   */
  async sendE3(candidate) {
    const demandData = await this.getDemandData(candidate.supplier_id);
    const unsubscribeUrl = buildUnsubscribeUrl(candidate.slug);

    const subject = `Should we remove ${candidate.name} from HomeHeat?`;
    const html = this.buildE3Html(candidate, demandData, unsubscribeUrl);

    const sent = await this.sendEmail(candidate.email, subject, html);

    const action = sent ? 'outreach_email_3_sent' : 'outreach_email_3_failed';
    await this.logAudit(action, {
      supplier_slug: candidate.slug,
      email: candidate.email,
      channel: 'email',
      campaign_batch: candidate.campaign_batch || '2026_spring_claim_push',
      ...(sent ? {} : { error: 'send_failed' })
    });

    return sent;
  }

  /**
   * Mark sequences as complete (E3 sent 7+ days ago, no claim)
   */
  async markCompletedSequences() {
    const [candidates] = await this.sequelize.query(`
      SELECT
        COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug,
        details::jsonb->>'campaign_batch' as campaign_batch
      FROM audit_logs
      WHERE action = 'outreach_email_3_sent'
        AND created_at <= NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM audit_logs a2
          WHERE a2.action = 'outreach_sequence_complete'
            AND COALESCE(a2.details::jsonb->>'supplier_slug', a2.details::jsonb->>'slug') =
                COALESCE(audit_logs.details::jsonb->>'supplier_slug', audit_logs.details::jsonb->>'slug')
        )
    `);

    for (const c of candidates) {
      // Check if claim was submitted in the meantime
      const [claims] = await this.sequelize.query(`
        SELECT 1 FROM supplier_claims sc
        JOIN suppliers s ON sc.supplier_id = s.id
        WHERE s.slug = :slug AND sc.status IN ('pending', 'verified')
      `, { replacements: { slug: c.slug } });

      if (claims.length === 0) {
        await this.logAudit('outreach_sequence_complete', {
          supplier_slug: c.slug,
          campaign_batch: c.campaign_batch,
          result: 'no_response'
        });
      }
    }

    return candidates.length;
  }

  /**
   * Fetch demand data for personalized emails
   */
  async getDemandData(supplierId) {
    try {
      const [rows] = await this.sequelize.query(`
        WITH own_clicks AS (
          SELECT COUNT(*) as total
          FROM supplier_clicks
          WHERE supplier_id = :supplierId AND created_at > NOW() - INTERVAL '7 days'
        ),
        area_searches AS (
          SELECT COALESCE(SUM(request_count), 0) as total
          FROM user_locations ul
          WHERE ul.zip_code IN (
            SELECT jsonb_array_elements_text(postal_codes_served)
            FROM suppliers WHERE id = :supplierId
          )
          AND ul.created_at > NOW() - INTERVAL '7 days'
        ),
        competitor_clicks AS (
          SELECT COUNT(*) as total
          FROM supplier_clicks sc
          WHERE sc.zip_code IN (
            SELECT jsonb_array_elements_text(postal_codes_served)
            FROM suppliers WHERE id = :supplierId
          )
          AND sc.supplier_id != :supplierId
          AND sc.created_at > NOW() - INTERVAL '7 days'
        )
        SELECT
          (SELECT total FROM own_clicks) as own_clicks,
          (SELECT total FROM area_searches) as searches,
          (SELECT total FROM competitor_clicks) as competitor_clicks
      `, { replacements: { supplierId } });

      return {
        ownClicks: parseInt(rows[0]?.own_clicks || 0),
        searches: parseInt(rows[0]?.searches || 0),
        competitorClicks: parseInt(rows[0]?.competitor_clicks || 0)
      };
    } catch {
      return { ownClicks: 0, searches: 0, competitorClicks: 0 };
    }
  }

  /**
   * E2 email template — nudge with fresh demand data
   */
  buildE2Html(candidate, demand, unsubscribeUrl) {
    const baseUrl = process.env.BACKEND_URL || 'https://gethomeheat.com';
    const claimUrl = `${baseUrl}/claim/${candidate.slug}`;

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="https://www.gethomeheat.com/images/app-icon-small.png" alt="HomeHeat" style="width: 40px; height: 40px; border-radius: 8px;">
      </div>

      <p style="font-size: 15px; color: #374151; line-height: 1.6;">
        Quick update — <strong>${demand.searches}</strong> homeowners searched for heating oil in ${candidate.city} this past week.
      </p>

      ${demand.competitorClicks > 0 ? `
      <div style="background: #fff3cd; border-left: 4px solid #F5A623; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px; color: #856404;">
          <strong>${demand.competitorClicks}</strong> of those clicks went to competing suppliers in your area.
        </p>
      </div>
      ` : ''}

      <p style="font-size: 15px; color: #374151; line-height: 1.6;">
        Your listing on HomeHeat is still unclaimed. Claiming takes 60 seconds and lets you control your displayed price.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${claimUrl}" style="display: inline-block; background: #FF6B35; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Claim Your Listing — Free
        </a>
      </div>

      <p style="font-size: 13px; color: #999; text-align: center; margin-top: 32px; line-height: 1.5;">
        You're receiving this because ${candidate.name} is listed on HomeHeat.<br>
        ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe from these emails</a>` : 'Reply "unsubscribe" to stop receiving these emails.'}<br><br>
        HomeHeat · Connecting homeowners with local heating oil suppliers
      </p>
    </div>
    `;
  }

  /**
   * E3 email template — soft close (loss aversion)
   */
  buildE3Html(candidate, demand, unsubscribeUrl) {
    const baseUrl = process.env.BACKEND_URL || 'https://gethomeheat.com';
    const claimUrl = `${baseUrl}/claim/${candidate.slug}`;

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="https://www.gethomeheat.com/images/app-icon-small.png" alt="HomeHeat" style="width: 40px; height: 40px; border-radius: 8px;">
      </div>

      <p style="font-size: 15px; color: #374151; line-height: 1.6;">
        I sent a couple of emails about your listing on HomeHeat but haven't heard back. No worries — I know you're busy.
      </p>

      <p style="font-size: 15px; color: #374151; line-height: 1.6;">
        Should I remove <strong>${candidate.name}</strong> from the site? Homeowners in ${candidate.city} are actively comparing prices, and I want to make sure we're only showing suppliers who want to be listed.
      </p>

      ${demand.searches > 0 ? `
      <div style="background: #f8f9fa; border-left: 4px solid #1a1a1a; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px; color: #374151;">
          <strong>${demand.searches}</strong> homeowners searched your area this week.
        </p>
      </div>
      ` : ''}

      <p style="font-size: 15px; color: #374151; line-height: 1.6;">
        If you'd like to keep your listing and control your displayed price, just click below:
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${claimUrl}" style="display: inline-block; background: #FF6B35; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Keep My Listing
        </a>
      </div>

      <p style="font-size: 15px; color: #374151; line-height: 1.6;">
        Otherwise, no action needed. This is my last email.
      </p>

      <p style="font-size: 14px; color: #666; margin-top: 20px;">
        — Leo, HomeHeat
      </p>

      <p style="font-size: 13px; color: #999; text-align: center; margin-top: 32px; line-height: 1.5;">
        ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe from these emails</a>` : 'Reply "unsubscribe" to stop receiving these emails.'}<br><br>
        HomeHeat · Connecting homeowners with local heating oil suppliers
      </p>
    </div>
    `;
  }

  /**
   * Send email via Resend
   */
  async sendEmail(to, subject, html) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.emailFrom,
          to: [to],
          subject,
          html
        })
      });

      const result = await response.json();

      if (response.ok) {
        this.logger.info?.(`[OutreachSequence] Email sent to ${to}: ${result.id}`);
        return true;
      } else {
        this.logger.error?.(`[OutreachSequence] Resend error for ${to}:`, JSON.stringify(result));
        return false;
      }
    } catch (error) {
      this.logger.error?.(`[OutreachSequence] Send failed for ${to}:`, error.message);
      return false;
    }
  }

  /**
   * Write audit log entry
   */
  async logAudit(action, details) {
    try {
      await this.sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'system', :action, :details, NOW(), NOW())
      `, {
        replacements: {
          action,
          details: JSON.stringify(details)
        }
      });
    } catch (err) {
      this.logger.warn?.(`[OutreachSequence] Audit log failed for ${action}:`, err.message);
    }
  }
}

module.exports = OutreachSequenceService;
