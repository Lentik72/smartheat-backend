/**
 * Shared constants — site URL, quote request statuses
 * Single source of truth. Used by QuoteRequestService, PriceAlertService, coverage-request.
 */

const SITE_URL = 'https://www.gethomeheat.com';

// Quote request statuses
const QUOTE_STATUS = {
  PENDING_VERIFICATION: 'pending_verification',
  VERIFIED: 'verified',
  DISPATCHED: 'dispatched',
  QUEUED: 'queued',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

// Quote request supplier statuses
const QUOTE_SUPPLIER_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  RESPONDED: 'responded',
  FAILED: 'failed',
};

module.exports = { SITE_URL, QUOTE_STATUS, QUOTE_SUPPLIER_STATUS };
