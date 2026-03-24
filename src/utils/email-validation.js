// src/utils/email-validation.js
// Shared email + ZIP validation used by price-alerts.js and coverage-request.js

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'throwaway.email', 'yopmail.com', 'sharklasers.com', 'guerrillamail.info',
  'grr.la', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net',
  'trashmail.com', 'trashmail.me', 'trashmail.net', 'dispostable.com',
  'maildrop.cc', 'mailnesia.com', 'tempail.com', 'tempmailaddress.com',
  'getairmail.com', 'fakeinbox.com', 'mailcatch.com', 'mintemail.com',
  'example.com'
]);

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(email)) return false;

  // Reject obvious fakes
  const lower = email.toLowerCase();
  if (lower === 'test@test.test' || lower === 'test@test.com') return false;

  // Block disposable domains
  const domain = lower.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) return false;

  // Reject single-char local parts
  if (lower.split('@')[0].length < 2) return false;

  return true;
}

function isValidZip(zip) {
  return /^\d{5}$/.test(zip);
}

module.exports = { isValidEmail, isValidZip, DISPOSABLE_DOMAINS };
