/**
 * Quote Request Service (heatingoil-h1fy)
 *
 * Lead routing: consumer requests quotes via web form → OTP verification →
 * 2-3 opted-in suppliers get branded SMS lead → supplier calls consumer.
 *
 * Two separate SMS channels:
 *   Price SMS (845-335-8855): sms-price-service.js, TWILIO_PHONE_NUMBER, sms_opted_out
 *   Lead SMS (934-348-HEAT): this service, TWILIO_LEAD_PHONE_NUMBER, leads_opted_out_at
 *   DO NOT mix them.
 */

const crypto = require('crypto');
const twilio = require('twilio');
const { findSuppliersForZip } = require('./supplierMatcher');
const { isValidZip } = require('../utils/email-validation');
const { escapeHtml } = require('../utils/html');
const { extractLast10, formatPhone } = require('../utils/phone');
const { SITE_URL, QUOTE_STATUS, QUOTE_SUPPLIER_STATUS } = require('../utils/constants');

// --- Configuration (env-driven) ---
const DISABLED = process.env.DISABLE_QUOTE_SYSTEM === 'true';
const TRIAL_ZIPS = (process.env.QUOTE_TRIAL_ZIPS || '').split(',').filter(Boolean);
const LEAD_PHONE = process.env.TWILIO_LEAD_PHONE_NUMBER;
const CLAIM_SECRET = process.env.CLAIM_VERIFY_SECRET;

// --- Constants ---
const OTP_LENGTH = 4;
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const MAX_SUPPLIERS_PER_LEAD = 3;
const SUPPLIERS_TO_QUERY = 5; // Query 5, send to 3, keep 2 as Twilio failure fallback
const LEAD_EXPIRY_HOURS = 24;
const PENDING_EXPIRY_HOURS = 1;
const FALLBACK_DELAY_MINUTES_DEFAULT = 90;
const FALLBACK_DELAY_MINUTES_LOW_SUPPLY = 30; // 1 supplier = faster fallback
const OUTCOME_CHECK_HOURS = 6;
const MAX_REQUESTS_PER_PHONE_PER_DAY = 3;
const MAX_OTP_SMS_PER_DAY = parseInt(process.env.QUOTE_MAX_OTP_PER_DAY) || 50;
const BUSINESS_HOURS = { start: 6, end: 19 }; // ET — suppliers plan routes as early as 6 AM
const MIN_FORM_TIME_MS = 3000;
const ADVISORY_LOCK_KEY = 742019233;

class QuoteRequestService {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;
    this.twilioClient = null;

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (sid && token) {
      this.twilioClient = twilio(sid, token);
      this.logger.info('[QuoteRequest] Twilio client initialized');
    } else {
      this.logger.warn('[QuoteRequest] Twilio credentials not configured — SMS disabled');
    }

    if (DISABLED) {
      this.logger.info('[QuoteRequest] System DISABLED via env var');
    } else if (TRIAL_ZIPS.length > 0) {
      this.logger.info(`[QuoteRequest] Trial ZIPs: ${TRIAL_ZIPS.join(', ')}`);
    } else {
      this.logger.info('[QuoteRequest] Dynamic mode — all ZIPs with opted-in suppliers allowed');
    }
  }

  // ─── Utility ───────────────────────────────────────────────

  /** Sanitize name for SMS (strip newlines, control chars, excess whitespace) */
  static sanitizeName(name) {
    if (!name) return '';
    // Strip control characters (keep Unicode letters like accented names)
    return name.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  }

  /** Check if ZIP is in trial set (empty = all ZIPs allowed) */
  isTrialZip(zip) {
    if (TRIAL_ZIPS.length === 0) return true;
    return TRIAL_ZIPS.includes(zip);
  }

  /** Check if current time is within business hours (ET) */
  isBusinessHours() {
    const now = new Date();
    const etHour = parseInt(now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false
    }));
    return etHour >= BUSINESS_HOURS.start && etHour < BUSINESS_HOURS.end;
  }

  /** Generate 4-digit OTP (cryptographically secure) */
  static generateOTP() {
    return String(crypto.randomInt(1000, 10000));
  }

  /** Generate secure token */
  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /** Generate HMAC for supplier opt-in link */
  static generateOptinHMAC(slug) {
    if (!CLAIM_SECRET) return null;
    return crypto.createHmac('sha256', CLAIM_SECRET).update(`lead-optin:${slug}`).digest('hex');
  }

  /** Verify HMAC for supplier opt-in */
  static verifyOptinHMAC(slug, token) {
    const expected = QuoteRequestService.generateOptinHMAC(slug);
    if (!expected || !token) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
    } catch {
      return false;
    }
  }

  // ─── Send SMS (lead channel only) ─────────────────────────

  /** Send SMS via lead phone number. Returns Twilio result or null on failure. */
  async sendLeadSMS(toPhone, message) {
    if (!this.twilioClient || !LEAD_PHONE) {
      this.logger.warn('[QuoteRequest] Cannot send SMS — Twilio or lead phone not configured');
      return null;
    }

    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: LEAD_PHONE,
        to: '+1' + extractLast10(toPhone)
      });
      this.logger.info(`[QuoteRequest] SMS sent to ${toPhone}: SID ${result.sid}`);
      return result;
    } catch (err) {
      this.logger.error(`[QuoteRequest] SMS failed to ${toPhone}: ${err.message}`);
      return null;
    }
  }

  // ─── Availability Check ────────────────────────────────────

  /**
   * Check if Get Quotes is available for a ZIP.
   * Returns { available, supplier_count, message }
   */
  async checkAvailability(zip) {
    if (DISABLED) {
      return { available: false, supplier_count: 0, message: 'Quote system is currently disabled.' };
    }

    if (!zip || !/^\d{5}$/.test(zip)) {
      return { available: false, supplier_count: 0, message: 'Invalid ZIP code.' };
    }

    if (!this.isTrialZip(zip)) {
      return { available: false, supplier_count: 0, message: 'Not available in your area yet.' };
    }

    const suppliers = await this._getEligibleSuppliers(zip);
    if (suppliers.length > 0) {
      return { available: true, mode: 'routed', supplier_count: suppliers.length };
    }

    // No opted-in suppliers — check if ANY suppliers serve this ZIP (cold mode)
    const allSuppliers = await this._getAllSuppliersForZip(zip);
    if (allSuppliers.length > 0) {
      return {
        available: true,
        mode: 'cold',
        supplier_count: 0,
        fallback_phones: this._buildFallbackPhones(allSuppliers)
      };
    }

    return { available: false, supplier_count: 0, message: 'No suppliers in your area yet.' };
  }

  // ─── Create Quote Request (Step 1: form submit → OTP) ─────

  /**
   * Validate form, check suppliers exist, send OTP.
   * Returns { success, request_id, ... } or { error }
   */
  async createQuoteRequest({ consumer_name, consumer_phone, consumer_zip, gallons_requested, tank_level, source_page, honeypot, form_rendered_at }) {
    if (DISABLED) return { error: 'Quote system is currently disabled.' };

    // --- Validation ---
    const name = (consumer_name || '').trim().slice(0, 100);
    if (!name) return { error: 'Name is required.' };

    const phone10 = extractLast10(consumer_phone);
    if (!phone10) return { error: 'Please enter a valid 10-digit US phone number.' };

    const zip = (consumer_zip || '').trim().slice(0, 5);
    if (!isValidZip(zip)) return { error: 'Please enter a valid 5-digit ZIP code.' };
    if (!this.isTrialZip(zip)) return { error: 'Not available in your area yet.' };

    const gallons = parseInt(gallons_requested);
    if (isNaN(gallons) || gallons < 75) return { error: 'Minimum 75 gallons.' };
    if (gallons > 500) return { error: 'Maximum 500 gallons per request.' };

    const validTankLevels = ['empty', 'quarter', 'half', 'not_sure'];
    const level = validTankLevels.includes(tank_level) ? tank_level : 'not_sure';

    // Anti-bot: honeypot must be empty
    if (honeypot) {
      // Return fake success to not reveal detection
      return { success: true, request_id: 'ok', expires_in_minutes: 10 };
    }

    // Anti-bot: form must have been rendered for at least 3 seconds
    if (form_rendered_at) {
      const elapsed = Date.now() - parseInt(form_rendered_at);
      if (elapsed < MIN_FORM_TIME_MS) {
        return { error: 'Please wait a moment before submitting.' };
      }
    }

    // --- Rate limit + dedupe + abuse cap in one query ---
    const [limitChecks] = await this.sequelize.query(`
      SELECT
        COUNT(*) AS global_count,
        COUNT(*) FILTER (WHERE consumer_phone_last10 = :phone) AS phone_count,
        COUNT(*) FILTER (WHERE consumer_phone_last10 = :phone AND consumer_zip = :zip
          AND status NOT IN ('expired', 'cancelled')) AS dupe_count
      FROM quote_requests
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `, { replacements: { phone: phone10, zip } });

    const checks = limitChecks[0];
    if (parseInt(checks.global_count) >= MAX_OTP_SMS_PER_DAY) {
      return { error: 'Service is temporarily busy. Please try again later.' };
    }
    if (parseInt(checks.phone_count) >= MAX_REQUESTS_PER_PHONE_PER_DAY) {
      return { error: 'Too many requests today. Please try again tomorrow.' };
    }
    if (parseInt(checks.dupe_count) > 0) {
      return { error: 'You already have an active request for this ZIP code.' };
    }

    // --- Pre-OTP supplier check ---
    // Even with 0 opted-in suppliers, we proceed with OTP to:
    // (a) verify the consumer is real (prevents fake activation emails)
    // (b) capture verified demand signal
    // (c) trigger activation emails to non-opted suppliers
    const eligibleSuppliers = await this._getEligibleSuppliers(zip);
    const isColdZip = eligibleSuppliers.length === 0;

    // --- Generate OTP and create request ---
    const otp = QuoteRequestService.generateOTP();
    const isBusinessHrs = this.isBusinessHours();

    const [insertResult] = await this.sequelize.query(`
      INSERT INTO quote_requests (
        consumer_name, consumer_phone, consumer_phone_last10, consumer_zip,
        gallons_requested, tank_level, phone_verified,
        verification_code, verification_attempts, verification_expires_at,
        status, source_page, is_business_hours, honeypot, form_rendered_at
      ) VALUES (
        :name, :phone, :phone10, :zip,
        :gallons, :level, false,
        :otp, 0, NOW() + INTERVAL '${OTP_EXPIRY_MINUTES} minutes',
        'pending_verification', :source_page, :is_business_hours, '', :form_rendered_at
      )
      RETURNING id
    `, {
      replacements: {
        name, phone: consumer_phone, phone10, zip,
        gallons, level, otp,
        source_page: source_page || null,
        is_business_hours: isBusinessHrs,
        form_rendered_at: form_rendered_at ? parseInt(form_rendered_at) : null
      }
    });

    const requestId = insertResult[0].id;

    // --- Send OTP SMS ---
    const otpResult = await this.sendLeadSMS(
      consumer_phone,
      `HomeHeat\n\nYour verification code: ${otp}\n\nExpires in ${OTP_EXPIRY_MINUTES} min. Msg & data rates may apply.`
    );

    if (!otpResult) {
      // SMS failed — mark as cancelled
      await this.sequelize.query(
        `UPDATE quote_requests SET status = 'cancelled', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: requestId } }
      );
      return { error: 'Could not send verification code. Please try again.' };
    }

    // Log to audit
    await this._logAudit(null, 'system', 'quote_request_created', { requestId, zip, gallons, phone10: phone10.slice(-4) });

    return {
      success: true,
      request_id: requestId,
      expires_in_minutes: OTP_EXPIRY_MINUTES,
      is_business_hours: isBusinessHrs,
      mode: isColdZip ? 'cold' : 'routed'
    };
  }

  // ─── Verify OTP (Step 2: code entry → dispatch) ───────────

  /**
   * Verify OTP code and dispatch to suppliers (or queue for after-hours).
   * Returns { success, suppliers_notified, ... } or { error }
   */
  async verifyOTP(requestId, code) {
    if (DISABLED) return { error: 'Quote system is currently disabled.' };

    if (!requestId || !code) return { error: 'Request ID and code are required.' };

    // Fetch the request with row lock to prevent concurrent verification
    const [rows] = await this.sequelize.query(`
      SELECT * FROM quote_requests WHERE id = :id AND status = 'pending_verification'
      FOR UPDATE SKIP LOCKED
    `, { replacements: { id: requestId } });

    if (rows.length === 0) return { error: 'Request not found or already processed.' };

    const request = rows[0];

    // Check expiry
    if (new Date(request.verification_expires_at) < new Date()) {
      await this.sequelize.query(
        `UPDATE quote_requests SET status = 'expired', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: requestId } }
      );
      return { error: 'Verification code expired. Please submit a new request.' };
    }

    // Check attempts
    if (request.verification_attempts >= OTP_MAX_ATTEMPTS) {
      await this.sequelize.query(
        `UPDATE quote_requests SET status = 'cancelled', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: requestId } }
      );
      return { error: 'Too many attempts. Please submit a new request.' };
    }

    // Increment attempts
    await this.sequelize.query(
      `UPDATE quote_requests SET verification_attempts = verification_attempts + 1, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: requestId } }
    );

    // Constant-time comparison
    const codeStr = String(code).trim();
    const storedCode = request.verification_code;
    let match = false;
    try {
      match = crypto.timingSafeEqual(
        Buffer.from(codeStr.padEnd(4, '0')),
        Buffer.from(storedCode.padEnd(4, '0'))
      );
    } catch {
      match = false;
    }

    if (!match) {
      const remaining = OTP_MAX_ATTEMPTS - request.verification_attempts - 1;
      return { error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` };
    }

    // --- OTP verified ---
    await this.sequelize.query(`
      UPDATE quote_requests
      SET phone_verified = true, status = 'verified', updated_at = NOW()
      WHERE id = :id
    `, { replacements: { id: requestId } });

    // Dispatch immediately if business hours, otherwise queue
    if (this.isBusinessHours()) {
      const result = await this.dispatchToSuppliers(requestId);
      // Always include fallback phones so frontend can show "Or call directly"
      const allSuppliers = result.sent > 0 ? await this._getAllSuppliersForZip(request.consumer_zip) : [];
      return {
        success: true,
        suppliers_notified: result.sent,
        is_business_hours: true,
        fallback_phones: result.sent > 0 ? this._buildFallbackPhones(allSuppliers) : result.fallbackPhones
      };
    } else {
      // Queue for 7 AM dispatch
      await this.sequelize.query(`
        UPDATE quote_requests
        SET status = 'queued', expires_at = NOW() + INTERVAL '${LEAD_EXPIRY_HOURS} hours', updated_at = NOW()
        WHERE id = :id
      `, { replacements: { id: requestId } });

      // Get fallback phones for after-hours display
      const allSuppliers = await this._getAllSuppliersForZip(request.consumer_zip);
      return {
        success: true,
        suppliers_notified: 0,
        is_business_hours: false,
        queued: true,
        fallback_phones: this._buildFallbackPhones(allSuppliers)
      };
    }
  }

  // ─── Dispatch to Suppliers ─────────────────────────────────

  /**
   * Match suppliers for a quote request and send SMS leads.
   * Returns { sent, failed, fallbackPhones }
   */
  async dispatchToSuppliers(requestId) {
    const [rows] = await this.sequelize.query(
      `SELECT * FROM quote_requests WHERE id = :id`,
      { replacements: { id: requestId } }
    );
    if (rows.length === 0) return { sent: 0, failed: 0, fallbackPhones: [] };

    const request = rows[0];

    // Pre-dispatch validation (defense-in-depth)
    // Do NOT re-check TRIAL_ZIPS — request was valid when created
    const phone10 = request.consumer_phone_last10;
    if (!phone10 || phone10.length !== 10 || request.gallons_requested < 75) {
      await this.sequelize.query(
        `UPDATE quote_requests SET status = 'cancelled', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: requestId } }
      );
      this.logger.error(`[QuoteRequest] Pre-dispatch validation failed for ${requestId}`);
      return { sent: 0, failed: 0, fallbackPhones: [] };
    }

    if (DISABLED) {
      this.logger.warn(`[QuoteRequest] Dispatch skipped — system disabled`);
      return { sent: 0, failed: 0, fallbackPhones: [] };
    }

    // Get eligible suppliers
    const eligible = await this._getEligibleSuppliers(request.consumer_zip);

    // Sanity check
    if (eligible.length === 0 || eligible.length > 10) {
      if (eligible.length > 10) {
        await this._logAudit(null, 'system', 'quote_zip_mismatch', {
          requestId, zip: request.consumer_zip, supplierCount: eligible.length
        });
      }
      // Zero-supplier fallback
      const allSuppliers = await this._getAllSuppliersForZip(request.consumer_zip);
      const fallbackPhones = allSuppliers.slice(0, 3).map(s => ({
        name: s.name,
        phone: s.phone,
        price: s.currentPrice ? s.currentPrice.pricePerGallon : null
      }));

      if (eligible.length === 0) {
        // Cold ZIP — no opted-in suppliers. Mark as expired (not queued — nothing to retry).
        await this.sequelize.query(
          `UPDATE quote_requests SET status = 'expired', updated_at = NOW() WHERE id = :id`,
          { replacements: { id: requestId } }
        );

        // Fire activation emails to non-opted suppliers (demand-driven bootstrap)
        this._sendActivationEmails(request.consumer_zip, request.gallons_requested).catch(err => {
          this.logger.warn(`[QuoteRequest] Cold ZIP activation email error: ${err.message}`);
        });

        await this._logAudit(null, 'system', 'quote_cold_zip', { requestId, zip: request.consumer_zip });
        return { sent: 0, failed: 0, fallbackPhones };
      }
    }

    // Apply supplier rotation within score tiers
    const rotated = await this._rotateWithinTiers(eligible, request.consumer_zip);
    const toSend = rotated.slice(0, MAX_SUPPLIERS_PER_LEAD);
    const fallbacks = rotated.slice(MAX_SUPPLIERS_PER_LEAD, SUPPLIERS_TO_QUERY);

    let sent = 0;
    let failed = 0;
    const smsName = QuoteRequestService.sanitizeName(request.consumer_name);
    const consumerPhone = formatPhone(phone10);
    const tankLevelText = request.tank_level !== 'not_sure'
      ? `, tank ${request.tank_level === 'empty' ? 'nearly empty' : request.tank_level === 'quarter' ? '~¼ full' : '~½ full'}`
      : '';

    const suppliersToAttempt = [...toSend, ...fallbacks];
    const notifiedCount = Math.min(MAX_SUPPLIERS_PER_LEAD, eligible.length);

    for (const supplier of suppliersToAttempt) {
      if (sent >= MAX_SUPPLIERS_PER_LEAD) break;

      const token = QuoteRequestService.generateToken();
      const responseUrl = `${SITE_URL}/api/quote-request/supplier-response?t=${token}`;
      const claimUrl = `${SITE_URL}/claim/${supplier.slug}`;
      const othersCount = notifiedCount - 1;

      const smsBody = [
        `HOMEHEAT LEAD`,
        ``,
        `${request.consumer_zip} · ~${request.gallons_requested} gal${tankLevelText}`,
        ``,
        `→ Call ${smsName}`,
        `  ${consumerPhone}`,
        ``,
        othersCount > 0 ? `Sent to ${othersCount} other supplier${othersCount > 1 ? 's' : ''}` : '',
        ``,
        `Confirm you called:`,
        responseUrl,
        ``,
        `Your listing: ${claimUrl}`,
        `Reply STOP to opt out · Msg rates may apply`
      ].filter(line => line !== false && line !== null && line !== undefined).join('\n');

      // Insert junction row
      await this.sequelize.query(`
        INSERT INTO quote_request_suppliers (quote_request_id, supplier_id, response_token, status)
        VALUES (:requestId, :supplierId, :token, 'pending')
      `, { replacements: { requestId, supplierId: supplier.id, token } });

      // Send SMS
      const smsResult = await this.sendLeadSMS(supplier.phone, smsBody);

      if (smsResult) {
        sent++;
        await this.sequelize.query(`
          UPDATE quote_request_suppliers
          SET sms_sent_at = NOW(), twilio_message_sid = :sid, status = 'sent'
          WHERE quote_request_id = :requestId AND supplier_id = :supplierId
        `, { replacements: { sid: smsResult.sid, requestId, supplierId: supplier.id } });

        // Insert supplier_engagements for leaderboard
        await this.sequelize.query(`
          INSERT INTO supplier_engagements (supplier_id, supplier_name, engagement_type, user_zip, source, created_at)
          VALUES (:supplierId, :name, 'request_quote', :zip, 'quote_system', NOW())
        `, { replacements: { supplierId: supplier.id, name: supplier.name, zip: request.consumer_zip } });
      } else {
        failed++;
        await this.sequelize.query(`
          UPDATE quote_request_suppliers SET status = 'failed'
          WHERE quote_request_id = :requestId AND supplier_id = :supplierId
        `, { replacements: { requestId, supplierId: supplier.id } });
      }
    }

    // Update request status
    if (sent > 0) {
      await this.sequelize.query(`
        UPDATE quote_requests
        SET status = 'dispatched', dispatched_at = NOW(),
            expires_at = NOW() + INTERVAL '${LEAD_EXPIRY_HOURS} hours', updated_at = NOW()
        WHERE id = :id
      `, { replacements: { id: requestId } });
    } else {
      // All sends failed — re-queue for retry
      await this.sequelize.query(
        `UPDATE quote_requests SET status = 'queued', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: requestId } }
      );
    }

    await this._logAudit(null, 'system', 'quote_dispatched', { requestId, sent, failed, zip: request.consumer_zip });

    // Email non-opted suppliers in this ZIP about the demand (activation loop, async/fire-and-forget)
    if (sent > 0) {
      this._sendActivationEmails(request.consumer_zip, request.gallons_requested).catch(err => {
        this.logger.warn(`[QuoteRequest] Activation email error: ${err.message}`);
      });
    }

    // Only fetch fallback phones when needed (avoid wasted query on success path)
    let fallbackPhones = [];
    if (sent === 0) {
      const allSuppliers = await this._getAllSuppliersForZip(request.consumer_zip);
      fallbackPhones = this._buildFallbackPhones(allSuppliers);
    }
    return { sent, failed, fallbackPhones };
  }

  // ─── Supplier Response Tracking ────────────────────────────

  /** Handle supplier tapping "Called them?" link */
  async handleSupplierResponse(token) {
    if (!token) return { found: false };

    const [rows] = await this.sequelize.query(`
      SELECT qrs.*, qr.consumer_name, qr.consumer_zip, qr.gallons_requested,
             s.name AS supplier_name
      FROM quote_request_suppliers qrs
      JOIN quote_requests qr ON qr.id = qrs.quote_request_id
      JOIN suppliers s ON s.id = qrs.supplier_id
      WHERE qrs.response_token = :token
    `, { replacements: { token } });

    if (rows.length === 0) return { found: false };

    const row = rows[0];
    if (row.responded_at) return { found: true, already_responded: true, supplier_name: row.supplier_name };

    await this.sequelize.query(`
      UPDATE quote_request_suppliers SET responded_at = NOW(), status = 'responded'
      WHERE response_token = :token
    `, { replacements: { token } });

    await this._logAudit(row.supplier_id, 'supplier', 'quote_response_confirmed', {
      requestId: row.quote_request_id, zip: row.consumer_zip
    });

    return { found: true, supplier_name: row.supplier_name, consumer_name: row.consumer_name };
  }

  // ─── Consumer Reply Handling ───────────────────────────────

  /** Handle consumer reply "1" (contacted) or "2" (not contacted) */
  async handleConsumerReply(fromPhone, body) {
    const phone10 = extractLast10(fromPhone);
    if (!phone10) return null;

    const trimmed = (body || '').trim();
    if (trimmed !== '1' && trimmed !== '2') return null;

    const outcome = trimmed === '1' ? 'contacted' : 'not_contacted';

    // Match most recent dispatched request for this phone
    const [rows] = await this.sequelize.query(`
      SELECT id FROM quote_requests
      WHERE consumer_phone_last10 = :phone
        AND status = 'dispatched'
        AND consumer_outcome_sent = true
        AND consumer_outcome IS NULL
      ORDER BY dispatched_at DESC
      LIMIT 1
    `, { replacements: { phone: phone10 } });

    if (rows.length === 0) return null;

    await this.sequelize.query(`
      UPDATE quote_requests
      SET consumer_outcome = :outcome, consumer_outcome_at = NOW(), updated_at = NOW()
      WHERE id = :id
    `, { replacements: { outcome, id: rows[0].id } });

    await this._logAudit(null, 'consumer', 'quote_outcome_reply', {
      requestId: rows[0].id, outcome, phone10: phone10.slice(-4)
    });

    return outcome;
  }

  // ─── Supplier Eligibility (gating) ─────────────────────────

  /** Check if supplier should receive next lead (must confirm previous) */
  async isSupplierEligibleForLead(supplierId) {
    const [rows] = await this.sequelize.query(`
      SELECT sms_sent_at, responded_at
      FROM quote_request_suppliers
      WHERE supplier_id = :supplierId
      ORDER BY created_at DESC
      LIMIT 1
    `, { replacements: { supplierId } });

    if (rows.length === 0) return true; // No previous leads — eligible

    const lastLead = rows[0];
    if (lastLead.responded_at) return true; // Confirmed previous lead — eligible

    // Grace period: if last lead was sent < 24h ago, still eligible
    const sentAt = new Date(lastLead.sms_sent_at);
    const hoursSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    return hoursSince < 24;
  }

  // ─── Supplier Opt-in ───────────────────────────────────────

  /** Set supplier as opted in for leads */
  async optInSupplier(slug) {
    const [result] = await this.sequelize.query(`
      UPDATE suppliers
      SET lead_opted_in = true, lead_opted_in_at = NOW(), leads_opted_out_at = NULL
      WHERE slug = :slug AND active = true
      RETURNING id, name, phone
    `, { replacements: { slug } });

    if (result.length === 0) return null;

    await this._logAudit(result[0].id, 'supplier', 'lead_opted_in', { slug });
    return result[0];
  }

  /** Handle STOP on lead number */
  async handleLeadStop(fromPhone) {
    const phone10 = extractLast10(fromPhone);
    if (!phone10) return;

    await this.sequelize.query(`
      UPDATE suppliers
      SET lead_opted_in = false, leads_opted_out_at = NOW()
      WHERE phone_last10 = :phone AND lead_opted_in = true
    `, { replacements: { phone: phone10 } });

    await this._logAudit(null, 'supplier', 'lead_stopped', { phone10: phone10.slice(-4) });
  }

  /** Handle START on lead number */
  async handleLeadStart(fromPhone) {
    const phone10 = extractLast10(fromPhone);
    if (!phone10) return;

    await this.sequelize.query(`
      UPDATE suppliers
      SET lead_opted_in = true, leads_opted_out_at = NULL, lead_opted_in_at = NOW()
      WHERE phone_last10 = :phone
    `, { replacements: { phone: phone10 } });

    await this._logAudit(null, 'supplier', 'lead_started', { phone10: phone10.slice(-4) });
  }

  // ─── Cron: Process Queue (7 AM) ────────────────────────────

  /** Dispatch queued after-hours requests. Called by 7 AM cron. */
  async processQueue() {
    if (DISABLED) return { dispatched: 0 };

    let lockAcquired = false;
    try {
      const [[lockResult]] = await this.sequelize.query(
        `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`
      );
      lockAcquired = lockResult.locked;
      if (!lockAcquired) {
        this.logger.info('[QuoteRequest] Queue lock held by another instance, skipping.');
        return { dispatched: 0, reason: 'locked' };
      }

      const [queued] = await this.sequelize.query(`
        SELECT id FROM quote_requests
        WHERE status = 'queued' AND expires_at > NOW()
        ORDER BY created_at ASC
      `);

      let dispatched = 0;
      for (const row of queued) {
        const result = await this.dispatchToSuppliers(row.id);
        if (result.sent > 0) dispatched++;
      }

      this.logger.info(`[QuoteRequest] Queue processed: ${dispatched}/${queued.length} dispatched`);
      return { dispatched, total: queued.length };
    } finally {
      if (lockAcquired) {
        await this.sequelize.query(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
      }
    }
  }

  // ─── Cron: Fallback Notifications ──────────────────────────

  /** Send fallback SMS to consumers with no supplier response after 90 min */
  async sendFallbackNotification() {
    if (DISABLED) return { sent: 0 };

    // Dynamic fallback delay: 30 min if 1 supplier was notified, 90 min if 2+
    const [rows] = await this.sequelize.query(`
      SELECT qr.id, qr.consumer_phone, qr.consumer_zip, qr.consumer_phone_last10,
             (SELECT COUNT(*) FROM quote_request_suppliers qrs2
              WHERE qrs2.quote_request_id = qr.id AND qrs2.status = 'sent') AS suppliers_sent
      FROM quote_requests qr
      WHERE qr.status = 'dispatched'
        AND qr.consumer_notified_fallback = false
        AND (
          (qr.dispatched_at < NOW() - INTERVAL '${FALLBACK_DELAY_MINUTES_LOW_SUPPLY} minutes')
        )
        AND NOT EXISTS (
          SELECT 1 FROM quote_request_suppliers qrs
          WHERE qrs.quote_request_id = qr.id AND qrs.responded_at IS NOT NULL
        )
      LIMIT 50
    `);

    // Filter by appropriate delay: 30 min for 1 supplier, 90 min for 2+
    const now = Date.now();
    const eligible = rows.filter(row => {
      const dispatched = new Date(row.dispatched_at || row.created_at).getTime();
      const delayMs = parseInt(row.suppliers_sent) <= 1
        ? FALLBACK_DELAY_MINUTES_LOW_SUPPLY * 60 * 1000
        : FALLBACK_DELAY_MINUTES_DEFAULT * 60 * 1000;
      return (now - dispatched) >= delayMs;
    });

    let sent = 0;
    for (const row of eligible) {
      const suppliers = await this._getAllSuppliersForZip(row.consumer_zip);
      const top = suppliers.slice(0, 3);

      if (top.length === 0) continue;

      // Build fallback message with lowest price (conversion moment)
      const cheapest = top[0];
      const priceText = cheapest.currentPrice
        ? `Best price: $${cheapest.currentPrice.pricePerGallon}/gal — ${cheapest.name}`
        : cheapest.name;
      const phoneList = top.map(s => `→ ${s.name}: ${s.phone}`).join('\n');

      const msg = `HomeHeat\n\nNo supplier has responded yet.\n\n${priceText}\n\nCall directly:\n${phoneList}\n\nMsg rates may apply.`;

      const result = await this.sendLeadSMS(row.consumer_phone, msg);
      if (result) {
        sent++;
        await this.sequelize.query(
          `UPDATE quote_requests SET consumer_notified_fallback = true, updated_at = NOW() WHERE id = :id`,
          { replacements: { id: row.id } }
        );
      }
    }

    if (rows.length >= 50) this.logger.warn(`[QuoteRequest] Fallback query hit LIMIT 50 — backlog may exist`);
    if (sent > 0) this.logger.info(`[QuoteRequest] Fallback notifications sent: ${sent}`);
    return { sent };
  }

  // ─── Cron: Outcome Check (6h) ─────────────────────────────

  /** Send "Did a supplier contact you?" SMS 6h after dispatch */
  async sendOutcomeCheck() {
    if (DISABLED) return { sent: 0 };

    const [rows] = await this.sequelize.query(`
      SELECT id, consumer_phone, consumer_zip
      FROM quote_requests
      WHERE status = 'dispatched'
        AND dispatched_at < NOW() - INTERVAL '${OUTCOME_CHECK_HOURS} hours'
        AND consumer_outcome_sent = false
        AND consumer_outcome IS NULL
        AND expires_at > NOW()
      LIMIT 50
    `);

    let sent = 0;
    for (const row of rows) {
      const msg = `HomeHeat\n\nDid a supplier contact you about your oil request?\n\nReply 1 = Yes\nReply 2 = No`;
      const result = await this.sendLeadSMS(row.consumer_phone, msg);

      if (result) {
        sent++;
        await this.sequelize.query(
          `UPDATE quote_requests SET consumer_outcome_sent = true, updated_at = NOW() WHERE id = :id`,
          { replacements: { id: row.id } }
        );
      }
    }

    if (rows.length >= 50) this.logger.warn(`[QuoteRequest] Outcome check hit LIMIT 50 — backlog may exist`);
    if (sent > 0) this.logger.info(`[QuoteRequest] Outcome checks sent: ${sent}`);
    return { sent };
  }

  // ─── Cron: Expire Stale Requests ──────────────────────────

  /** Expire old requests: 24h for dispatched/queued, 1h for pending_verification */
  async expireStaleRequests() {
    if (DISABLED) return { expired: 0 };

    // Expire dispatched/queued past 24h
    const [result1] = await this.sequelize.query(`
      UPDATE quote_requests
      SET status = 'expired', updated_at = NOW()
      WHERE status IN ('dispatched', 'queued')
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
      RETURNING id
    `);

    // Expire abandoned OTP verifications past 1h
    const [result2] = await this.sequelize.query(`
      UPDATE quote_requests
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'pending_verification'
        AND created_at < NOW() - INTERVAL '${PENDING_EXPIRY_HOURS} hours'
      RETURNING id
    `);

    const expired = (result1?.length || 0) + (result2?.length || 0);
    if (expired > 0) this.logger.info(`[QuoteRequest] Expired ${expired} stale requests`);
    return { expired };
  }

  // ─── Private Helpers ───────────────────────────────────────

  /** Get opted-in, eligible suppliers for a ZIP (DB query + supplierMatcher) */
  async _getEligibleSuppliers(zip) {
    const [candidates] = await this.sequelize.query(`
      SELECT s.id, s.name, s.slug,
             COALESCE(s.lead_phone, s.phone) AS phone,
             s.city, s.state,
             s.postal_codes_served AS "postalCodesServed",
             s.service_cities AS "serviceCities",
             s.service_counties AS "serviceCounties",
             s.service_area_radius AS "serviceAreaRadius",
             s.lat, s.lng, s.verified
      FROM suppliers s
      WHERE s.active = true
        AND s.lead_opted_in = true
        AND s.leads_opted_out_at IS NULL
        AND s.phone IS NOT NULL
        AND s.phone != ''
    `);

    if (candidates.length === 0) return [];

    // Use supplierMatcher for scoring
    const { suppliers: scored } = findSuppliersForZip(zip, candidates, { includeRadius: true });

    // Batch-check eligibility (must confirm previous lead) — one query instead of N
    const scoredIds = scored.map(s => s.id);
    const [lastLeads] = scoredIds.length > 0 ? await this.sequelize.query(`
      SELECT DISTINCT ON (supplier_id) supplier_id, sms_sent_at, responded_at
      FROM quote_request_suppliers
      WHERE supplier_id IN (:ids)
      ORDER BY supplier_id, created_at DESC
    `, { replacements: { ids: scoredIds } }) : [[]];

    const lastLeadMap = {};
    for (const row of lastLeads) lastLeadMap[row.supplier_id] = row;

    const eligible = [];
    for (const s of scored) {
      const last = lastLeadMap[s.id];
      const isEligible = !last // No previous leads
        || last.responded_at // Confirmed previous lead
        || (Date.now() - new Date(last.sms_sent_at).getTime()) < 24 * 60 * 60 * 1000; // Grace period
      if (isEligible) eligible.push(s);
      if (eligible.length >= SUPPLIERS_TO_QUERY) break;
    }

    return eligible;
  }

  /** Get all suppliers for a ZIP (for fallback phone numbers, any supplier) */
  async _getAllSuppliersForZip(zip) {
    const [candidates] = await this.sequelize.query(`
      SELECT s.id, s.name, s.slug,
             COALESCE(s.lead_phone, s.phone) AS phone,
             s.city, s.state,
             s.postal_codes_served AS "postalCodesServed",
             s.service_cities AS "serviceCities",
             s.service_counties AS "serviceCounties",
             s.service_area_radius AS "serviceAreaRadius",
             s.lat, s.lng, s.verified,
             sp.price_per_gallon AS "pricePerGallon"
      FROM suppliers s
      LEFT JOIN LATERAL (
        SELECT price_per_gallon FROM supplier_prices
        WHERE supplier_id = s.id AND is_valid = true
          AND expires_at > NOW() AND fuel_type = 'heating_oil'
        ORDER BY scraped_at DESC LIMIT 1
      ) sp ON true
      WHERE s.active = true
        AND s.phone IS NOT NULL
        AND s.phone != ''
    `);

    const { suppliers: scored } = findSuppliersForZip(zip, candidates, { includeRadius: true });

    // Map to include currentPrice shape
    return scored.map(s => ({
      ...s,
      currentPrice: s.pricePerGallon ? { pricePerGallon: s.pricePerGallon } : null
    }));
  }

  /** Apply rotation within same-score tiers */
  async _rotateWithinTiers(suppliers, zip) {
    if (suppliers.length <= 1) return suppliers;

    // Count total requests for this ZIP (for rotation offset)
    const [countRows] = await this.sequelize.query(`
      SELECT COUNT(*) AS cnt FROM quote_requests WHERE consumer_zip = :zip
    `, { replacements: { zip } });
    const requestCount = parseInt(countRows[0].cnt) || 0;

    // Group by score tier
    const tiers = {};
    for (const s of suppliers) {
      const score = s.score || 0;
      if (!tiers[score]) tiers[score] = [];
      tiers[score].push(s);
    }

    // Sort tiers descending, rotate within each tier
    const sortedScores = Object.keys(tiers).map(Number).sort((a, b) => b - a);
    const result = [];
    for (const score of sortedScores) {
      const tier = tiers[score];
      if (tier.length > 1) {
        const offset = requestCount % tier.length;
        result.push(...tier.slice(offset), ...tier.slice(0, offset));
      } else {
        result.push(...tier);
      }
    }

    return result;
  }

  /** Build fallback phone list from suppliers (used in 4 places) */
  /** Build fallback phone list, sorted cheapest first */
  _buildFallbackPhones(suppliers) {
    return suppliers
      .filter(s => s.phone) // Only suppliers with valid phone
      .sort((a, b) => {
        const pa = a.currentPrice ? a.currentPrice.pricePerGallon : Infinity;
        const pb = b.currentPrice ? b.currentPrice.pricePerGallon : Infinity;
        return pa - pb;
      })
      .slice(0, 3)
      .map(s => ({
        name: s.name,
        phone: s.phone,
        price: s.currentPrice ? s.currentPrice.pricePerGallon : null
      }));
  }

  /**
   * Email non-opted suppliers in a ZIP when a lead happens — activation loop.
   * Legal (email, not SMS), non-intrusive, high-signal.
   * "A customer in your area requested heating oil today. Enable leads: [link]"
   */
  async _sendActivationEmails(zip, gallons) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return;

    // Find non-opted suppliers who serve this ZIP and have an email
    const [candidates] = await this.sequelize.query(`
      SELECT s.id, s.name, s.slug, s.email, s.city, s.state
      FROM suppliers s
      WHERE s.active = true
        AND (s.lead_opted_in = false OR s.lead_opted_in IS NULL)
        AND s.email IS NOT NULL AND s.email != ''
        AND s.email_unsubscribed IS NOT TRUE
    `);

    if (candidates.length === 0) return;

    // Filter to suppliers who serve this ZIP
    const { suppliers: matched } = findSuppliersForZip(zip, candidates, { includeRadius: true });
    if (matched.length === 0) return;

    // Only email top 5 non-opted suppliers per lead (avoid spamming)
    const toEmail = matched.slice(0, 5);

    for (const supplier of toEmail) {
      // Skip if we already emailed this supplier about a lead in the last 7 days
      const [recent] = await this.sequelize.query(`
        SELECT 1 FROM audit_logs
        WHERE supplier_id = :id AND action = 'lead_activation_email'
          AND created_at > NOW() - INTERVAL '7 days'
        LIMIT 1
      `, { replacements: { id: supplier.id } });

      if (recent.length > 0) continue;

      const optinHmac = QuoteRequestService.generateOptinHMAC(supplier.slug);
      const optinUrl = `${SITE_URL}/api/quote-request/supplier-optin?supplier=${supplier.slug}&token=${optinHmac}`;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Leo from HomeHeat <hello@gethomeheat.com>',
            to: supplier.email,
            reply_to: 'support@gethomeheat.com',
            subject: `You missed a heating oil lead in ${zip}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <p>Hi ${escapeHtml(supplier.name)},</p>
                <p>A homeowner in <strong>${zip}</strong> requested <strong>~${gallons} gallons</strong> of heating oil today through HomeHeat.</p>
                <p>You weren't able to receive this lead because you're not set up for instant alerts. We sent it to other suppliers in your area.</p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${optinUrl}" style="display: inline-block; background: #FF6B35; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Enable Free Lead Alerts</a>
                </p>
                <p style="font-size: 13px; color: #666;">When you opt in, we'll text you instantly when homeowners in your area request quotes. Free during our beta. You can opt out anytime.</p>
                <p style="font-size: 12px; color: #999;">— Leo, HomeHeat</p>
              </div>
            `
          })
        });

        await this._logAudit(supplier.id, 'system', 'lead_activation_email', { zip, gallons });
      } catch (err) {
        this.logger.warn(`[QuoteRequest] Activation email failed for ${supplier.slug}: ${err.message}`);
      }
    }
  }

  /** Log to audit_logs */
  async _logAudit(supplierId, actor, action, details) {
    try {
      await this.sequelize.query(`
        INSERT INTO audit_logs (supplier_id, actor, action, details, created_at, updated_at)
        VALUES (:supplierId, :actor, :action, :details, NOW(), NOW())
      `, {
        replacements: {
          supplierId: supplierId || null,
          actor,
          action,
          details: JSON.stringify(details)
        }
      });
    } catch (err) {
      this.logger.warn(`[QuoteRequest] Audit log failed: ${err.message}`);
    }
  }
}

module.exports = QuoteRequestService;
