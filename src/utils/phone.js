/**
 * Shared phone utilities — extractLast10, formatPhone
 * Single source of truth. Used by QuoteRequestService, sms-price-service, claim-page.
 */

/** Extract last 10 digits from any phone format (+19145551234, (914) 555-1234, etc.) */
function extractLast10(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Format 10-digit phone for display: 9145551234 → (914) 555-1234 */
function formatPhone(phone10) {
  if (!phone10 || phone10.length !== 10) return phone10;
  return `(${phone10.slice(0, 3)}) ${phone10.slice(3, 6)}-${phone10.slice(6)}`;
}

module.exports = { extractLast10, formatPhone };
