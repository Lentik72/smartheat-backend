/**
 * Migration 135: Add supplier lead opt-in columns
 *
 * Adds columns for the Smart Quote Request system (heatingoil-h1fy).
 * lead_opted_in / leads_opted_out_at are SEPARATE from sms_opted_out —
 * different Twilio numbers, different webhooks, different channels.
 * STOP on lead number sets leads_opted_out_at. STOP on price number sets sms_opted_out.
 */

async function up(sequelize) {
  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_opted_in BOOLEAN DEFAULT false
  `);

  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_opted_in_at TIMESTAMPTZ
  `);

  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS leads_opted_out_at TIMESTAMPTZ
  `);

  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS max_leads_per_day INTEGER
  `);

  // Separate lead phone — don't overwrite scraped phone data.
  // Leads route to COALESCE(lead_phone, phone).
  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_phone VARCHAR(20)
  `);

  // Audit: IP address of whoever clicked the opt-in link
  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_opted_in_ip VARCHAR(45)
  `);
}

module.exports = { up };
