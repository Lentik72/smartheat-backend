/**
 * SMS Price Service
 * Handles inbound SMS from suppliers via Twilio, validates prices,
 * and publishes them to the supplier_prices table.
 *
 * Flow:
 *   First time: Supplier texts price → gets YES prompt → replies YES → price published
 *   Returning:  Supplier texts price → price updated immediately
 */

const twilio = require('twilio');

const PRICE_MIN = 1.50;
const PRICE_MAX = 8.00;
const PRICE_EXPIRY_DAYS = 7;
const CONFIRM_EXPIRY_HOURS = 24;
const KEYWORDS = ['STOP', 'HELP', 'START'];

class SmsPriceService {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;
    this.twilioClient = null;

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (sid && token) {
      this.twilioClient = twilio(sid, token);
      this.logger.info('[SmsPriceService] Twilio client initialized');
    } else {
      this.logger.warn('[SmsPriceService] Twilio credentials not configured — SMS disabled');
    }
  }

  /**
   * Process an incoming SMS from the Twilio webhook.
   * Returns the reply message string (caller wraps in TwiML).
   */
  async handleIncoming(fromPhone, messageBody, twilioMessageSid) {
    const normalizedPhone = this.extractLast10(fromPhone);
    const body = (messageBody || '').trim();
    const upperBody = body.toUpperCase();

    // Idempotency: check if we already processed this Twilio SID
    if (twilioMessageSid) {
      const [existing] = await this.sequelize.query(`
        SELECT id, status FROM sms_price_updates
        WHERE twilio_message_sid = :sid
        LIMIT 1
      `, { replacements: { sid: twilioMessageSid } });

      if (existing.length > 0) {
        this.logger.info(`[SmsPriceService] Duplicate SID ${twilioMessageSid} — returning cached`);
        return null; // Let Twilio retry handler return empty TwiML
      }
    }

    // Check for STOP/HELP/START keywords first (before any other processing)
    if (KEYWORDS.includes(upperBody)) {
      return this.handleKeyword(fromPhone, normalizedPhone, upperBody, twilioMessageSid);
    }

    // Look up supplier by phone_last10
    if (!normalizedPhone) {
      await this.logSms({ fromPhone, messageBody: body, type: 'price_attempt', status: 'no_match', twilioMessageSid });
      return "We don't recognize this number yet. If this is a listed supplier, reply with your company name or email support@gethomeheat.com and we'll help.";
    }

    const [suppliers] = await this.sequelize.query(`
      SELECT id, name, slug, sms_confirmed, sms_opted_out, allow_price_display
      FROM suppliers
      WHERE phone_last10 = :phone AND active = true
    `, { replacements: { phone: normalizedPhone } });

    // No match
    if (suppliers.length === 0) {
      await this.logSms({ fromPhone, messageBody: body, type: 'price_attempt', status: 'no_match', twilioMessageSid });
      return "We don't recognize this number yet. If this is a listed supplier, reply with your company name or email support@gethomeheat.com and we'll help.";
    }

    // Multiple matches
    if (suppliers.length > 1) {
      await this.logSms({ fromPhone, messageBody: body, type: 'price_attempt', status: 'duplicate_match', twilioMessageSid });
      return "This number matches multiple listings. Email support@gethomeheat.com and we'll link it correctly.";
    }

    const supplier = suppliers[0];

    // Opted out — only accept START or HELP
    if (supplier.sms_opted_out) {
      if (upperBody === 'START' || upperBody === 'HELP') {
        return this.handleKeyword(fromPhone, normalizedPhone, upperBody, twilioMessageSid);
      }
      await this.logSms({ fromPhone, messageBody: body, supplierId: supplier.id, type: 'price_attempt', status: 'opted_out', twilioMessageSid });
      return "You're unsubscribed. Text START to re-enable.";
    }

    // Handle YES confirmation (first-time flow)
    if (upperBody === 'YES') {
      return this.handleConfirmation(fromPhone, normalizedPhone, supplier, twilioMessageSid);
    }

    // First time — not yet confirmed
    if (!supplier.sms_confirmed) {
      return this.handleFirstTime(fromPhone, normalizedPhone, body, supplier, twilioMessageSid);
    }

    // Returning supplier — direct price update
    return this.handlePriceUpdate(fromPhone, normalizedPhone, body, supplier, twilioMessageSid);
  }

  /**
   * First-time supplier: parse price, store pending, ask for YES confirmation
   */
  async handleFirstTime(fromPhone, normalizedPhone, body, supplier, twilioMessageSid) {
    const price = this.parsePrice(body);

    if (price === null) {
      await this.logSms({
        fromPhone, messageBody: body, supplierId: supplier.id,
        type: 'price_attempt', status: 'invalid_price', twilioMessageSid
      });
      return "Didn't catch that. Reply with just your price, e.g. 3.49";
    }

    // Store pending confirmation in sms_price_updates
    await this.logSms({
      fromPhone, messageBody: body, supplierId: supplier.id,
      parsedPrice: price, type: 'price_attempt', status: 'pending_confirm',
      twilioMessageSid
    });

    return `You're updating ${supplier.name}. Reply YES to publish $${price.toFixed(2)} on your listing.`;
  }

  /**
   * Handle YES confirmation — publish the pending price
   */
  async handleConfirmation(fromPhone, normalizedPhone, supplier, twilioMessageSid) {
    // Look up latest pending confirmation for this supplier from this phone
    const [pending] = await this.sequelize.query(`
      SELECT id, parsed_price FROM sms_price_updates
      WHERE supplier_id = :supplierId
        AND from_phone = :phone
        AND type = 'price_attempt'
        AND status = 'pending_confirm'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 1
    `, { replacements: { supplierId: supplier.id, phone: fromPhone } });

    if (pending.length === 0) {
      // Check if there's an expired one
      const [expired] = await this.sequelize.query(`
        SELECT id FROM sms_price_updates
        WHERE supplier_id = :supplierId
          AND from_phone = :phone
          AND type = 'price_attempt'
          AND status = 'pending_confirm'
        ORDER BY created_at DESC
        LIMIT 1
      `, { replacements: { supplierId: supplier.id, phone: fromPhone } });

      if (expired.length > 0) {
        await this.logSms({ fromPhone, supplierId: supplier.id, type: 'confirm', status: 'expired', twilioMessageSid });
        return "That confirmation expired. Text your price again, e.g. 3.49";
      }

      await this.logSms({ fromPhone, supplierId: supplier.id, type: 'confirm', status: 'no_pending', twilioMessageSid });
      return "No pending price. Text your price first, e.g. 3.49";
    }

    const price = parseFloat(pending[0].parsed_price);

    // Insert into supplier_prices
    const expiresAt = new Date(Date.now() + PRICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await this.sequelize.query(`
      INSERT INTO supplier_prices (
        id, supplier_id, price_per_gallon, min_gallons, fuel_type,
        source_type, scraped_at, expires_at, is_valid, notes,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), :supplierId, :price, 150, 'heating_oil',
        'supplier_sms', NOW(), :expiresAt, true, 'First SMS price update (confirmed)',
        NOW(), NOW()
      )
    `, { replacements: { supplierId: supplier.id, price, expiresAt } });

    // Mark supplier as confirmed + enable price display
    await this.sequelize.query(`
      UPDATE suppliers
      SET sms_confirmed = true,
          sms_confirmed_at = NOW(),
          allow_price_display = true
      WHERE id = :id
    `, { replacements: { id: supplier.id } });

    // Mark the pending record as confirmed
    await this.sequelize.query(`
      UPDATE sms_price_updates SET status = 'confirmed' WHERE id = :id
    `, { replacements: { id: pending[0].id } });

    // Log the confirmation
    await this.logSms({
      fromPhone, supplierId: supplier.id, parsedPrice: price,
      type: 'confirm', status: 'success', twilioMessageSid
    });

    const slug = supplier.slug || supplier.id;
    return `Published! $${price.toFixed(2)} is now live: gethomeheat.com/supplier/${slug}\nMost suppliers update weekly. Just text your price anytime.`;
  }

  /**
   * Returning supplier — direct price update
   */
  async handlePriceUpdate(fromPhone, normalizedPhone, body, supplier, twilioMessageSid) {
    const price = this.parsePrice(body);

    if (price === null) {
      await this.logSms({
        fromPhone, messageBody: body, supplierId: supplier.id,
        type: 'price_update', status: 'invalid_price', twilioMessageSid
      });
      return "Didn't catch that. Reply with just your price, e.g. 3.49";
    }

    // Insert into supplier_prices
    const expiresAt = new Date(Date.now() + PRICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await this.sequelize.query(`
      INSERT INTO supplier_prices (
        id, supplier_id, price_per_gallon, min_gallons, fuel_type,
        source_type, scraped_at, expires_at, is_valid, notes,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), :supplierId, :price, 150, 'heating_oil',
        'supplier_sms', NOW(), :expiresAt, true, 'SMS price update',
        NOW(), NOW()
      )
    `, { replacements: { supplierId: supplier.id, price, expiresAt } });

    // Ensure allow_price_display is on (idempotent)
    await this.sequelize.query(`
      UPDATE suppliers SET allow_price_display = true WHERE id = :id AND allow_price_display = false
    `, { replacements: { id: supplier.id } });

    await this.logSms({
      fromPhone, messageBody: body, supplierId: supplier.id,
      parsedPrice: price, type: 'price_update', status: 'success', twilioMessageSid
    });

    return `Saved at $${price.toFixed(2)}/gal. We recommend updating at least weekly to keep it fresh.`;
  }

  /**
   * Handle STOP/HELP/START SMS keywords (compliance required)
   */
  async handleKeyword(fromPhone, normalizedPhone, keyword, twilioMessageSid) {
    if (keyword === 'STOP') {
      if (normalizedPhone) {
        await this.sequelize.query(`
          UPDATE suppliers SET sms_opted_out = true WHERE phone_last10 = :phone
        `, { replacements: { phone: normalizedPhone } });
      }
      await this.logSms({ fromPhone, type: 'keyword', status: 'stop', twilioMessageSid });
      return "You've been unsubscribed. Text START to re-enable.";
    }

    if (keyword === 'START') {
      if (normalizedPhone) {
        await this.sequelize.query(`
          UPDATE suppliers SET sms_opted_out = false WHERE phone_last10 = :phone
        `, { replacements: { phone: normalizedPhone } });
      }
      await this.logSms({ fromPhone, type: 'keyword', status: 'start', twilioMessageSid });
      return "HomeHeat: You're now opted in. Text your price (e.g. 3.49) to update your listing. Reply HELP for info or STOP to unsubscribe.";
    }

    if (keyword === 'HELP') {
      await this.logSms({ fromPhone, type: 'keyword', status: 'help', twilioMessageSid });
      return "HomeHeat SMS: text your price (e.g. 3.49) to update your listing. Text STOP to unsubscribe. Terms: gethomeheat.com/sms-terms.html Questions? support@gethomeheat.com";
    }

    return null;
  }

  /**
   * Send an outbound SMS via Twilio
   */
  async sendSMS(toPhone, message) {
    if (!this.twilioClient || !this.twilioPhone) {
      this.logger.warn('[SmsPriceService] Cannot send SMS — Twilio not configured');
      return null;
    }

    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.twilioPhone,
        to: toPhone
      });
      this.logger.info(`[SmsPriceService] SMS sent to ${toPhone}: SID ${result.sid}`);
      return result;
    } catch (err) {
      this.logger.error(`[SmsPriceService] Failed to send SMS to ${toPhone}: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract last 10 digits from any phone format.
   * Handles +19145551234, (914) 555-1234, 914-555-1234, 9145551234, etc.
   */
  extractLast10(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.slice(-10);
  }

  /**
   * Parse a price from a free-form SMS message.
   * Accepts: "3.49", "$3.49", "3.5", "3.49 cash", "price 3.49", "3.49/gal"
   * Rejects: "349" (no decimal), "three forty nine", "3.49 or 3.59" (ambiguous)
   */
  parsePrice(text) {
    if (!text) return null;
    const cleaned = text.trim().toLowerCase();

    // Match numbers with 1 or 2 decimal places
    const matches = cleaned.match(/\d+\.\d{1,2}/g);
    if (!matches || matches.length === 0) return null;
    if (matches.length > 1) return null; // Ambiguous

    const price = parseFloat(matches[0]);
    if (price < PRICE_MIN || price > PRICE_MAX) return null;

    return Math.round(price * 100) / 100; // Normalize to 2 decimal places
  }

  /**
   * Log an SMS event to the sms_price_updates table
   */
  async logSms({ fromPhone, messageBody, supplierId, parsedPrice, type, status, errorMessage, twilioMessageSid }) {
    try {
      await this.sequelize.query(`
        INSERT INTO sms_price_updates (
          id, supplier_id, from_phone, message_body, parsed_price,
          type, status, error_message, twilio_message_sid, created_at
        ) VALUES (
          gen_random_uuid(), :supplierId, :fromPhone, :messageBody, :parsedPrice,
          :type, :status, :errorMessage, :twilioMessageSid, NOW()
        )
      `, {
        replacements: {
          supplierId: supplierId || null,
          fromPhone: fromPhone || '',
          messageBody: messageBody || null,
          parsedPrice: parsedPrice || null,
          type,
          status,
          errorMessage: errorMessage || null,
          twilioMessageSid: twilioMessageSid || null
        }
      });
    } catch (err) {
      // Don't let logging failures break the main flow
      this.logger.error(`[SmsPriceService] Failed to log SMS: ${err.message}`);
    }
  }
}

module.exports = SmsPriceService;
