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

const PRICE_EXPIRY_DAYS = 7;
const CONFIRM_EXPIRY_HOURS = 24;
const KEYWORDS = ['STOP', 'HELP', 'START'];

// V2.12.0: Per-fuel validation ranges
const FUEL_PRICE_RANGES = {
  heating_oil: { min: 1.50, max: 8.00 },
  kerosene:    { min: 2.50, max: 8.00 },
};
// V2.12.0: Keywords that identify kerosene in SMS messages
const KEROSENE_KEYWORDS = ['k1', 'k-1', 'kero', 'kerosene'];

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
   * V2.12.0: Supports multi-fuel messages
   */
  async handleFirstTime(fromPhone, normalizedPhone, body, supplier, twilioMessageSid) {
    const priceResults = this.parsePriceMessage(body);

    if (priceResults.length === 0) {
      // Check if it was an ambiguous two-price message without keywords
      const priceCount = (body.match(/\d+\.\d{1,2}/g) || []).length;
      if (priceCount >= 2) {
        await this.logSms({
          fromPhone, messageBody: body, supplierId: supplier.id,
          type: 'price_attempt', status: 'ambiguous_fuel', twilioMessageSid
        });
        return "Got two prices but not sure which is oil vs kerosene. Try: 3.49 oil 4.91 k1";
      }
      await this.logSms({
        fromPhone, messageBody: body, supplierId: supplier.id,
        type: 'price_attempt', status: 'invalid_price', twilioMessageSid
      });
      return "Didn't catch that. Please reply with just your price, like 3.49";
    }

    // Store pending confirmation — serialize all fuel prices as JSON in parsed_price note
    const primaryPrice = priceResults[0].price;
    await this.logSms({
      fromPhone, messageBody: body, supplierId: supplier.id,
      parsedPrice: primaryPrice, type: 'price_attempt', status: 'pending_confirm',
      twilioMessageSid, fuelType: priceResults[0].fuelType
    });

    // Build confirmation message
    const priceList = priceResults.map(p => {
      const label = p.fuelType === 'kerosene' ? 'K-1 Kerosene' : 'Heating Oil';
      return `${label} $${p.price.toFixed(2)}`;
    }).join(' and ');

    return `HomeHeat: You're updating ${supplier.name}. Reply YES to publish ${priceList} on your listing. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help.`;
  }

  /**
   * Handle YES confirmation — publish the pending price
   */
  async handleConfirmation(fromPhone, normalizedPhone, supplier, twilioMessageSid) {
    // Look up latest pending confirmation for this supplier from this phone
    const [pending] = await this.sequelize.query(`
      SELECT id, parsed_price, fuel_type, message_body FROM sms_price_updates
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
        return "That confirmation expired. Text your price again, like 3.49";
      }

      await this.logSms({ fromPhone, supplierId: supplier.id, type: 'confirm', status: 'no_pending', twilioMessageSid });
      return "No pending price. Text your price first, like 3.49";
    }

    const price = parseFloat(pending[0].parsed_price);
    // V2.12.0: Get fuel type from pending record (defaults to heating_oil)
    const fuelType = pending[0].fuel_type || 'heating_oil';

    // Re-parse the original message to get all fuel prices (for multi-fuel confirmation)
    const originalBody = pending[0].message_body || '';
    const allPrices = this.parsePriceMessage(originalBody);
    // If re-parse fails, fall back to the single stored price
    const pricesToInsert = allPrices.length > 0 ? allPrices : [{ price, fuelType }];

    // Insert into supplier_prices (one row per fuel)
    const expiresAt = new Date(Date.now() + PRICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    for (const fp of pricesToInsert) {
      await this.sequelize.query(`
        INSERT INTO supplier_prices (
          id, supplier_id, price_per_gallon, min_gallons, fuel_type,
          source_type, scraped_at, expires_at, is_valid, notes,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), :supplierId, :price, 150, :fuelType,
          'supplier_sms', NOW(), :expiresAt, true, 'First SMS price update (confirmed)',
          NOW(), NOW()
        )
      `, { replacements: { supplierId: supplier.id, price: fp.price, fuelType: fp.fuelType, expiresAt } });
    }

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
    // V2.12.0: Confirm all published fuel prices
    const confirmList = pricesToInsert.map(fp => {
      const label = fp.fuelType === 'kerosene' ? 'K-1 Kerosene' : 'Heating Oil';
      return `${label} $${fp.price.toFixed(2)}/gal`;
    }).join(' and ');
    return `Published! ${confirmList} now live: gethomeheat.com/supplier/${slug}\nJust text your price anytime to update. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help.`;
  }

  /**
   * Returning supplier — direct price update
   * V2.12.0: Supports multi-fuel messages
   */
  async handlePriceUpdate(fromPhone, normalizedPhone, body, supplier, twilioMessageSid) {
    const priceResults = this.parsePriceMessage(body);

    if (priceResults.length === 0) {
      // Check for ambiguous two-price message
      const priceCount = (body.match(/\d+\.\d{1,2}/g) || []).length;
      if (priceCount >= 2) {
        await this.logSms({
          fromPhone, messageBody: body, supplierId: supplier.id,
          type: 'price_update', status: 'ambiguous_fuel', twilioMessageSid
        });
        return "Got two prices but not sure which is oil vs kerosene. Try: 3.49 oil 4.91 k1";
      }
      await this.logSms({
        fromPhone, messageBody: body, supplierId: supplier.id,
        type: 'price_update', status: 'invalid_price', twilioMessageSid
      });
      return "Didn't catch that. Please reply with just your price, like 3.49";
    }

    // Insert into supplier_prices (one row per fuel)
    const expiresAt = new Date(Date.now() + PRICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    for (const fp of priceResults) {
      await this.sequelize.query(`
        INSERT INTO supplier_prices (
          id, supplier_id, price_per_gallon, min_gallons, fuel_type,
          source_type, scraped_at, expires_at, is_valid, notes,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), :supplierId, :price, 150, :fuelType,
          'supplier_sms', NOW(), :expiresAt, true, 'SMS price update',
          NOW(), NOW()
        )
      `, { replacements: { supplierId: supplier.id, price: fp.price, fuelType: fp.fuelType, expiresAt } });
    }

    // Ensure allow_price_display is on (idempotent)
    await this.sequelize.query(`
      UPDATE suppliers SET allow_price_display = true WHERE id = :id AND allow_price_display = false
    `, { replacements: { id: supplier.id } });

    const primaryPrice = priceResults[0];
    await this.logSms({
      fromPhone, messageBody: body, supplierId: supplier.id,
      parsedPrice: primaryPrice.price, type: 'price_update', status: 'success',
      twilioMessageSid, fuelType: primaryPrice.fuelType
    });

    // V2.12.0: Confirm all fuel prices in response
    if (priceResults.length > 1) {
      const confirmList = priceResults.map(fp => {
        const label = fp.fuelType === 'kerosene' ? 'K-1 Kerosene' : 'Heating Oil';
        return `${label} $${fp.price.toFixed(2)}/gal`;
      }).join(' and ');
      return `Got it — ${confirmList} updated. Reply STOP to unsubscribe or HELP for help.`;
    }

    return `Saved at $${primaryPrice.price.toFixed(2)}/gal. Message frequency varies. Reply STOP to unsubscribe or HELP for help.`;
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
      return "HomeHeat: You're all set! Just text your price anytime to update your listing. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for info.";
    }

    if (keyword === 'HELP') {
      await this.logSms({ fromPhone, type: 'keyword', status: 'help', twilioMessageSid });
      return "HomeHeat SMS Help: Text your price like 3.49 to update your listing. Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help. Terms: gethomeheat.com/sms-terms Privacy: gethomeheat.com/privacy";
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
   * Parse a price from a free-form SMS message (single fuel, backward compat).
   * Accepts: "3.49", "$3.49", "3.5", "3.49 cash", "price 3.49", "3.49/gal"
   * Rejects: "349" (no decimal), "three forty nine"
   * Returns: number or null
   */
  parsePrice(text) {
    const results = this.parsePriceMessage(text);
    if (results.length === 0) return null;
    if (results.length === 1) return results[0].price;
    // Multiple prices — ambiguous for legacy callers
    return null;
  }

  /**
   * V2.12.0: Parse one or more fuel prices from an SMS message.
   * Returns array of { price, fuelType }, ordered by position in message.
   *
   * Algorithm:
   *   1. Find all prices (with positions)
   *   2. Find all fuel keywords (with positions and fuel type)
   *   3. Bind each keyword to the nearest price (by character distance)
   *   4. Unbound prices default to heating_oil
   *   5. Two prices + zero keywords → ambiguous, return []
   *
   * Safety: bare number always → heating_oil. Kerosene REQUIRES explicit keyword.
   */
  parsePriceMessage(text) {
    if (!text) return [];
    const cleaned = text.trim().toLowerCase();

    // Step 1: Find all prices with positions
    const pricePattern = /\d+\.\d{1,2}/g;
    const prices = [];
    let m;
    while ((m = pricePattern.exec(cleaned)) !== null) {
      prices.push({ value: parseFloat(m[0]), index: m.index, fuelType: null });
    }

    if (prices.length === 0) return [];
    if (prices.length > 2) return []; // 3+ prices — too ambiguous

    // Step 2: Find all fuel keywords with positions
    const keywords = [];
    // Kerosene keywords
    for (const kw of KEROSENE_KEYWORDS) {
      let idx = cleaned.indexOf(kw);
      while (idx !== -1) {
        keywords.push({ index: idx, fuelType: 'kerosene' });
        idx = cleaned.indexOf(kw, idx + kw.length);
      }
    }
    // Oil keywords
    for (const kw of ['oil', 'heating']) {
      let idx = cleaned.indexOf(kw);
      while (idx !== -1) {
        keywords.push({ index: idx, fuelType: 'heating_oil' });
        idx = cleaned.indexOf(kw, idx + kw.length);
      }
    }

    // Step 3: Bind each keyword to the nearest UNCLAIMED price
    // Process keywords in order of appearance. Once a price is claimed, later keywords
    // can only claim unclaimed prices. This handles "oil 3.49 kero 5.10" correctly:
    // "oil" claims 3.49 first, "kero" can only claim 5.10.
    // Sort keywords by position in text
    keywords.sort((a, b) => a.index - b.index);

    for (const kw of keywords) {
      let nearestPrice = null;
      let nearestDist = Infinity;
      for (const p of prices) {
        // Skip prices already claimed by a previous keyword
        if (p.fuelType !== null) continue;

        let dist;
        if (p.index < kw.index) {
          const priceEnd = p.index + String(p.value).length;
          dist = kw.index - priceEnd;
        } else {
          dist = p.index - kw.index;
        }
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPrice = p;
        }
      }

      // If no unclaimed price, try all prices (kerosene overrides oil)
      if (!nearestPrice) {
        nearestDist = Infinity;
        for (const p of prices) {
          if (p.fuelType === kw.fuelType) continue; // Same type, skip
          let dist;
          if (p.index < kw.index) {
            dist = kw.index - (p.index + String(p.value).length);
          } else {
            dist = p.index - kw.index;
          }
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestPrice = p;
          }
        }
      }

      if (nearestPrice) {
        nearestPrice.fuelType = kw.fuelType;
      }
    }

    // Step 4: Unbound prices default to heating_oil
    // BUT: if 2 prices and zero keywords total → ambiguous
    if (prices.length === 2 && keywords.length === 0) {
      return []; // "3.49 / 4.91" — can't tell which is which
    }

    for (const p of prices) {
      if (p.fuelType === null) p.fuelType = 'heating_oil';
    }

    // Step 5: Validate each price against its fuel range and build results
    const results = [];
    for (const p of prices) {
      const range = FUEL_PRICE_RANGES[p.fuelType];
      if (p.value >= range.min && p.value <= range.max) {
        results.push({ price: Math.round(p.value * 100) / 100, fuelType: p.fuelType });
      }
    }

    return results;
  }

  /**
   * Log an SMS event to the sms_price_updates table
   * V2.12.0: Added optional fuelType field
   */
  async logSms({ fromPhone, messageBody, supplierId, parsedPrice, type, status, errorMessage, twilioMessageSid, fuelType }) {
    try {
      await this.sequelize.query(`
        INSERT INTO sms_price_updates (
          id, supplier_id, from_phone, message_body, parsed_price,
          type, status, error_message, twilio_message_sid, fuel_type, created_at
        ) VALUES (
          gen_random_uuid(), :supplierId, :fromPhone, :messageBody, :parsedPrice,
          :type, :status, :errorMessage, :twilioMessageSid, :fuelType, NOW()
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
          twilioMessageSid: twilioMessageSid || null,
          fuelType: fuelType || 'heating_oil'
        }
      });
    } catch (err) {
      // Don't let logging failures break the main flow
      this.logger.error(`[SmsPriceService] Failed to log SMS: ${err.message}`);
    }
  }
}

module.exports = SmsPriceService;
