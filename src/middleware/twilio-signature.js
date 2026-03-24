/**
 * Shared Twilio signature validation middleware.
 * Validates X-Twilio-Signature header against the request.
 * Used by both price SMS webhook and lead SMS webhook.
 */

const twilio = require('twilio');

/**
 * Validate Twilio webhook signature (production only).
 * @param {object} req - Express request
 * @param {object} logger - Logger instance
 * @param {string} label - Log prefix for this webhook
 * @returns {boolean} true if valid (or skipped in dev), false if invalid
 */
function validateTwilioSignature(req, logger, label) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || process.env.NODE_ENV !== 'production') {
    return true;
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['host'];
  const url = `${proto}://${host}${req.originalUrl}`;
  const signature = req.headers['x-twilio-signature'];
  const valid = twilio.validateRequest(authToken, signature, url, req.body);

  if (!valid) {
    logger.warn(`[${label}] Invalid Twilio signature — rejecting`);
  }

  return valid;
}

module.exports = { validateTwilioSignature };
