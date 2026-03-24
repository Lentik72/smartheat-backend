/**
 * Lead SMS Webhook — Twilio inbound SMS handler for the LEAD phone number
 *
 * POST /api/webhook/twilio-leads/sms — Receive inbound SMS on lead number
 *
 * Completely separate from the price SMS webhook (/api/webhook/twilio/sms).
 * Different number, different webhook, different STOP column.
 *
 * Routing:
 *   STOP  → set leads_opted_out_at (does NOT touch sms_opted_out)
 *   START → reset leads_opted_out_at, restore lead_opted_in
 *   HELP  → reply with info
 *   1/2   → consumer outcome reply
 *   else  → ignore (empty TwiML)
 */

const express = require('express');
const router = express.Router();
const { validateTwilioSignature } = require('../middleware/twilio-signature');

router.post('/sms', async (req, res) => {
  const logger = req.app.locals.logger;
  const quoteRequestService = req.app.locals.quoteRequestService;

  if (!validateTwilioSignature(req, logger, 'Lead SMS Webhook')) {
    return res.status(403).type('text/xml').send('<Response></Response>');
  }

  const { From, Body, MessageSid } = req.body;

  if (!From || !quoteRequestService) {
    logger.warn('[Lead SMS Webhook] Missing From or QuoteRequestService not initialized');
    return res.type('text/xml').send('<Response></Response>');
  }

  try {
    const upperBody = (Body || '').trim().toUpperCase();

    // STOP — supplier opts out of leads
    if (upperBody === 'STOP') {
      await quoteRequestService.handleLeadStop(From);
      logger.info(`[Lead SMS Webhook] STOP from ${From}`);
      // Twilio handles STOP automatically, but we also update our DB
      return res.type('text/xml').send('<Response></Response>');
    }

    // START — supplier re-opts in
    if (upperBody === 'START') {
      await quoteRequestService.handleLeadStart(From);
      logger.info(`[Lead SMS Webhook] START from ${From}`);
      return res.type('text/xml').send(
        '<Response><Message>HomeHeat lead notifications re-enabled. You\'ll receive leads when homeowners request quotes in your area.</Message></Response>'
      );
    }

    // HELP
    if (upperBody === 'HELP') {
      return res.type('text/xml').send(
        '<Response><Message>HomeHeat lead notifications. Reply STOP to unsubscribe. Questions? Visit gethomeheat.com/support</Message></Response>'
      );
    }

    // Consumer outcome reply: "1" or "2"
    const trimmed = (Body || '').trim();
    if (trimmed === '1' || trimmed === '2') {
      const outcome = await quoteRequestService.handleConsumerReply(From, trimmed);
      if (outcome === 'contacted') {
        return res.type('text/xml').send(
          '<Response><Message>Thanks for letting us know! Glad a supplier reached out.</Message></Response>'
        );
      }
      if (outcome === 'not_contacted') {
        return res.type('text/xml').send(
          '<Response><Message>Sorry to hear that. We\'ll follow up. Visit gethomeheat.com/prices for supplier phone numbers.</Message></Response>'
        );
      }
      // outcome is null — no matching request found, fall through to ignore
    }

    // Anything else — log and ignore (so Leo can see if suppliers are trying to reply)
    logger.info(`[Lead SMS Webhook] Unhandled message from ${From}: "${(Body || '').slice(0, 50)}"`);
    return res.type('text/xml').send('<Response></Response>');

  } catch (err) {
    logger.error(`[Lead SMS Webhook] Error: ${err.message}`);
    return res.type('text/xml').send('<Response></Response>');
  }
});

module.exports = router;
