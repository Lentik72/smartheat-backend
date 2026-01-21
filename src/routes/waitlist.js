/**
 * Waitlist Routes
 * V1.0.0: Capture users from unsupported regions (e.g., Canada)
 *
 * Strategy: Option C
 * - Immediate email notification for early signups (first 20)
 * - After that, just store in DB (included in daily report)
 */

const express = require('express');
const router = express.Router();

// Threshold for immediate email notifications
const IMMEDIATE_EMAIL_THRESHOLD = 20;

/**
 * Canadian postal code to province mapping (first letter of FSA)
 * FSA = Forward Sortation Area (first 3 chars of postal code)
 */
const PROVINCE_MAP = {
  'A': { province: 'NL', name: 'Newfoundland and Labrador' },
  'B': { province: 'NS', name: 'Nova Scotia' },
  'C': { province: 'PE', name: 'Prince Edward Island' },
  'E': { province: 'NB', name: 'New Brunswick' },
  'G': { province: 'QC', name: 'Quebec' },
  'H': { province: 'QC', name: 'Quebec (Montreal)' },
  'J': { province: 'QC', name: 'Quebec' },
  'K': { province: 'ON', name: 'Ontario (Eastern)' },
  'L': { province: 'ON', name: 'Ontario (Central)' },
  'M': { province: 'ON', name: 'Ontario (Toronto)' },
  'N': { province: 'ON', name: 'Ontario (Southwestern)' },
  'P': { province: 'ON', name: 'Ontario (Northern)' },
  'R': { province: 'MB', name: 'Manitoba' },
  'S': { province: 'SK', name: 'Saskatchewan' },
  'T': { province: 'AB', name: 'Alberta' },
  'V': { province: 'BC', name: 'British Columbia' },
  'X': { province: 'NT/NU', name: 'Northwest Territories / Nunavut' },
  'Y': { province: 'YT', name: 'Yukon' }
};

/**
 * Get province info from Canadian postal code
 */
function getProvinceFromPostalCode(postalCode) {
  if (!postalCode || postalCode.length < 1) return null;
  const firstLetter = postalCode.charAt(0).toUpperCase();
  return PROVINCE_MAP[firstLetter] || null;
}

/**
 * Validate Canadian postal code format
 */
function isCanadianPostalCode(code) {
  if (!code) return false;
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, '');
  // Canadian format: A1A1A1 or A1A 1A1
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned);
}

/**
 * Send immediate email notification for waitlist signup
 */
async function sendWaitlistNotification(signup, totalCount) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.ADMIN_EMAIL || 'ltsoir@gmail.com';

  if (!apiKey) {
    console.log('[Waitlist] RESEND_API_KEY not configured - skipping email');
    return false;
  }

  const provinceInfo = getProvinceFromPostalCode(signup.postal_code);
  const provinceName = provinceInfo?.name || 'Unknown';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">🇨🇦 New Canada Waitlist Signup</h2>

      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 8px 0;"><strong>Email:</strong> ${signup.email}</p>
        <p style="margin: 8px 0;"><strong>Postal Code:</strong> ${signup.postal_code}</p>
        <p style="margin: 8px 0;"><strong>Province:</strong> ${provinceName}</p>
        <p style="margin: 8px 0;"><strong>Source:</strong> ${signup.source || 'app_onboarding'}</p>
        <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      </div>

      <p style="color: #666; font-size: 14px;">
        Total Canada waitlist: <strong>${totalCount}</strong> signups
      </p>

      ${totalCount >= IMMEDIATE_EMAIL_THRESHOLD ? `
        <p style="color: #666; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee;">
          📊 You've reached ${IMMEDIATE_EMAIL_THRESHOLD}+ Canadian signups. Future signups will be included in your daily analytics report instead of immediate emails.
        </p>
      ` : ''}
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'SmartHeat <onboarding@resend.dev>',
        to: [recipient],
        subject: `🇨🇦 Canada Waitlist: ${signup.postal_code} (${provinceName}) - #${totalCount}`,
        html
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`[Waitlist] Notification email sent: ${result.id}`);
      return true;
    } else {
      console.error('[Waitlist] Resend API error:', result);
      return false;
    }
  } catch (error) {
    console.error('[Waitlist] Failed to send notification:', error.message);
    return false;
  }
}

/**
 * POST /api/waitlist
 * Add user to waitlist for unsupported region
 */
router.post('/', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { email, postalCode, source } = req.body;

      // Validate required fields
      if (!email || !postalCode) {
        return res.status(400).json({
          success: false,
          error: 'Email and postal code are required'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // Normalize postal code
      const normalizedPostalCode = postalCode.trim().toUpperCase().replace(/\s+/g, '');

      // Determine country (currently only supporting Canada waitlist)
      let country = 'CA';
      let province = null;

      if (isCanadianPostalCode(normalizedPostalCode)) {
        const provinceInfo = getProvinceFromPostalCode(normalizedPostalCode);
        province = provinceInfo?.province || null;
      } else {
        // Not a recognized format - still accept but mark as unknown
        country = 'XX';
      }

      // Format postal code for storage (A1A 1A1 format for Canada)
      const formattedPostalCode = normalizedPostalCode.length === 6
        ? `${normalizedPostalCode.slice(0, 3)} ${normalizedPostalCode.slice(3)}`
        : normalizedPostalCode;

      // Insert into waitlist (or update if email already exists for this country)
      const [result] = await sequelize.query(`
        INSERT INTO waitlist (email, postal_code, province, country, source)
        VALUES (:email, :postalCode, :province, :country, :source)
        ON CONFLICT (email, country)
        DO UPDATE SET
          postal_code = EXCLUDED.postal_code,
          province = EXCLUDED.province,
          source = EXCLUDED.source,
          created_at = NOW()
        RETURNING id, created_at
      `, {
        replacements: {
          email: email.toLowerCase().trim(),
          postalCode: formattedPostalCode,
          province,
          country,
          source: source || 'app_onboarding'
        }
      });

      const signupId = result[0]?.id;

      // Get total count for this country
      const [countResult] = await sequelize.query(
        'SELECT COUNT(*) as total FROM waitlist WHERE country = :country',
        { replacements: { country } }
      );
      const totalCount = parseInt(countResult[0]?.total || 0);

      logger?.info(`[Waitlist] New signup: ${email} from ${formattedPostalCode} (${country}) - Total: ${totalCount}`);

      // Send immediate email notification if under threshold
      if (totalCount <= IMMEDIATE_EMAIL_THRESHOLD) {
        await sendWaitlistNotification({
          email: email.toLowerCase().trim(),
          postal_code: formattedPostalCode,
          province,
          country,
          source: source || 'app_onboarding'
        }, totalCount);
      }

      res.json({
        success: true,
        message: "You're on the list! We'll notify you when we launch in your area.",
        data: {
          position: totalCount
        }
      });

    } catch (error) {
      logger?.error('[Waitlist] Error:', error.message);

      // Handle duplicate email gracefully
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return res.json({
          success: true,
          message: "You're already on the list! We'll notify you when we launch.",
          data: { alreadyRegistered: true }
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to join waitlist. Please try again.'
      });
    }
});

/**
 * GET /api/waitlist/stats
 * Get waitlist statistics (admin only - no auth for now)
 */
router.get('/stats', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const [stats] = await sequelize.query(`
        SELECT
          country,
          province,
          COUNT(*) as count,
          MIN(created_at) as first_signup,
          MAX(created_at) as latest_signup
        FROM waitlist
        GROUP BY country, province
        ORDER BY count DESC
      `);

      const [total] = await sequelize.query('SELECT COUNT(*) as total FROM waitlist');

      res.json({
        success: true,
        data: {
          total: parseInt(total[0]?.total || 0),
          byRegion: stats
        }
      });

    } catch (error) {
      logger?.error('[Waitlist] Stats error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get waitlist stats'
      });
    }
});

module.exports = router;
