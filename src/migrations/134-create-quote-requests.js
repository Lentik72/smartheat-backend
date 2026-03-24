/**
 * Migration 134: Create quote_requests and quote_request_suppliers tables
 *
 * Smart Quote Request system — consumers request delivery quotes via web form,
 * verified by OTP, routed to 2-3 opted-in suppliers via SMS.
 * Part of heatingoil-h1fy.
 */

async function up(sequelize) {
  // --- quote_requests ---
  const [existing] = await sequelize.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'quote_requests'
  `);

  if (existing.length === 0) {
    await sequelize.query(`
      CREATE TABLE quote_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        consumer_name VARCHAR(100) NOT NULL,
        consumer_phone VARCHAR(20) NOT NULL,
        consumer_phone_last10 VARCHAR(10) NOT NULL,
        consumer_zip VARCHAR(5) NOT NULL,
        gallons_requested INTEGER NOT NULL,
        tank_level VARCHAR(20) DEFAULT 'not_sure',
        phone_verified BOOLEAN DEFAULT false,
        verification_code VARCHAR(4),
        verification_attempts INTEGER DEFAULT 0,
        verification_expires_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'pending_verification',
        dispatched_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        consumer_notified_fallback BOOLEAN DEFAULT false,
        consumer_outcome_sent BOOLEAN DEFAULT false,
        consumer_outcome VARCHAR(10),
        consumer_outcome_at TIMESTAMPTZ,
        source_page TEXT,
        is_business_hours BOOLEAN,
        honeypot TEXT,
        form_rendered_at BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Dedupe: same phone+ZIP within 24h, excluding expired/cancelled
    await sequelize.query(`
      CREATE INDEX idx_qr_dedupe ON quote_requests(consumer_phone_last10, consumer_zip)
      WHERE status NOT IN ('expired', 'cancelled')
    `);

    // Cron processing: find active requests
    await sequelize.query(`
      CREATE INDEX idx_qr_status ON quote_requests(status)
      WHERE status IN ('pending_verification', 'verified', 'dispatched', 'queued')
    `);

    // Expiration: find requests to expire
    await sequelize.query(`
      CREATE INDEX idx_qr_expires ON quote_requests(expires_at)
      WHERE status IN ('pending_verification', 'dispatched', 'queued')
    `);

    // Phone lookup for consumer reply matching
    await sequelize.query(`
      CREATE INDEX idx_qr_phone ON quote_requests(consumer_phone_last10)
    `);

    // ZIP lookup for rotation counting and dashboard
    await sequelize.query(`
      CREATE INDEX idx_qr_zip ON quote_requests(consumer_zip)
    `);
  }

  // --- quote_request_suppliers ---
  const [existing2] = await sequelize.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'quote_request_suppliers'
  `);

  if (existing2.length === 0) {
    await sequelize.query(`
      CREATE TABLE quote_request_suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        sms_sent_at TIMESTAMPTZ,
        twilio_message_sid VARCHAR(50),
        response_token VARCHAR(64) NOT NULL,
        responded_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE INDEX idx_qrs_request ON quote_request_suppliers(quote_request_id)
    `);

    await sequelize.query(`
      CREATE INDEX idx_qrs_supplier ON quote_request_suppliers(supplier_id)
    `);

    await sequelize.query(`
      CREATE UNIQUE INDEX idx_qrs_token ON quote_request_suppliers(response_token)
    `);

    // Idempotency: prevent duplicate Twilio processing
    await sequelize.query(`
      CREATE UNIQUE INDEX idx_qrs_twilio_sid ON quote_request_suppliers(twilio_message_sid)
      WHERE twilio_message_sid IS NOT NULL
    `);
  }
}

module.exports = { up };
