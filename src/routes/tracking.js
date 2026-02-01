/**
 * Tracking Routes - Capture user interactions for "Sniper" outreach
 * V2.12.0: Click tracking for supplier lead notifications
 * V2.13.0: PWA install tracking
 */

const express = require('express');
const router = express.Router();

/**
 * POST /api/track-pwa
 * Records PWA install prompts, installations, and standalone launches
 */
router.post('/track-pwa', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { event, platform } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';

  // Validate event type
  const validEvents = ['install_prompt', 'installed', 'standalone_launch'];
  if (!event || !validEvents.includes(event)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  try {
    // Insert PWA event (using a simple log approach - can create dedicated table later)
    await sequelize.query(
      `INSERT INTO pwa_events (event_type, platform, user_agent, ip_address, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      { bind: [event, platform || 'unknown', userAgent, ip] }
    );

    console.log(`[PWA] ${event} on ${platform || 'unknown'}`);
    res.json({ success: true });

  } catch (err) {
    // Table might not exist yet - log but don't fail
    console.log(`[PWA] ${event} on ${platform || 'unknown'} (not persisted: ${err.message})`);
    res.json({ success: true });
  }
});

/**
 * POST /api/log-action (renamed from track-click to avoid ad blockers)
 * Records when a user clicks "Call" or "Website" for a supplier
 */
router.post('/log-action', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { supplierId, action, zipCode, supplierName, pageSource, deviceType, platform } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';

  // Validate required fields (supplierName is enough if supplierId not available)
  if (!action || (!supplierId && !supplierName)) {
    return res.status(400).json({ error: 'Missing required fields (need action and either supplierId or supplierName)' });
  }

  // Validate action type
  if (!['call', 'website'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action type' });
  }

  // Validate pageSource if provided
  const validPageSources = ['prices', 'state', 'county', 'city'];
  if (pageSource && !validPageSources.includes(pageSource)) {
    return res.status(400).json({ error: 'Invalid page source' });
  }

  try {
    // Try to verify supplier exists (but don't fail if not found)
    let resolvedSupplierId = null;
    let resolvedSupplierName = supplierName || 'Unknown';

    if (supplierId) {
      try {
        const [suppliers] = await sequelize.query(
          'SELECT id, name FROM suppliers WHERE id = $1 AND active = true',
          { bind: [supplierId] }
        );
        if (suppliers && suppliers.length > 0) {
          resolvedSupplierId = suppliers[0].id;
          resolvedSupplierName = supplierName || suppliers[0].name;
        }
      } catch (lookupErr) {
        // Invalid UUID format or DB error - continue without supplier_id
        console.log(`[Tracking] Supplier lookup failed for ${supplierId}: ${lookupErr.message}`);
      }
    }

    // Insert click record (supplier_id can be NULL if not found)
    await sequelize.query(
      `INSERT INTO supplier_clicks
       (supplier_id, action_type, zip_code, user_agent, ip_address, supplier_name, page_source, device_type, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      { bind: [resolvedSupplierId, action, zipCode || null, userAgent, ip, resolvedSupplierName, pageSource || null, deviceType || null, platform || null] }
    );

    console.log(`[Tracking] ${action} click for ${resolvedSupplierName} from ZIP ${zipCode || 'unknown'} (${deviceType || 'unknown'}/${platform || 'unknown'})`);

    res.json({ success: true });

  } catch (err) {
    console.error('[Tracking Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/app-engagement
 * Records iOS app supplier engagements (separate from website clicks)
 * V22.0: Dedicated endpoint for iOS app tracking
 */
router.post('/app-engagement', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { supplierId, supplierName, engagementType, zipCode, fuelType } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';

  // Validate required fields
  if (!engagementType || (!supplierId && !supplierName)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate engagement type
  const validTypes = [
    'call', 'text', 'email', 'view', 'save', 'request_quote',
    'dealer_request',    // User requested quote/delivery
    'order_placed',      // User logged delivery from this supplier
    'price_compared'     // User viewed price comparison including this supplier
  ];
  if (!validTypes.includes(engagementType)) {
    return res.status(400).json({ error: 'Invalid engagement type' });
  }

  try {
    // Hash IP for privacy (just first few chars for rough deduplication)
    const ipHash = ip ? require('crypto').createHash('sha256').update(ip).digest('hex').substring(0, 16) : null;

    // Try to resolve supplier ID
    let resolvedSupplierId = null;
    let resolvedSupplierName = supplierName || 'Unknown';

    if (supplierId) {
      try {
        const [suppliers] = await sequelize.query(
          'SELECT id, name FROM suppliers WHERE id = $1 AND active = true',
          { bind: [supplierId] }
        );
        if (suppliers && suppliers.length > 0) {
          resolvedSupplierId = suppliers[0].id;
          resolvedSupplierName = supplierName || suppliers[0].name;
        }
      } catch (lookupErr) {
        console.log(`[AppEngagement] Supplier lookup failed for ${supplierId}: ${lookupErr.message}`);
      }
    }

    // Derive state from ZIP if possible
    let userState = null;
    if (zipCode && zipCode.length >= 3) {
      // Simple ZIP prefix to state mapping (Northeast focus)
      const zipPrefix = zipCode.substring(0, 3);
      const zipStateMap = {
        '100': 'NY', '101': 'NY', '102': 'NY', '103': 'NY', '104': 'NY', '105': 'NY', '106': 'NY', '107': 'NY', '108': 'NY', '109': 'NY',
        '110': 'NY', '111': 'NY', '112': 'NY', '113': 'NY', '114': 'NY', '115': 'NY', '116': 'NY', '117': 'NY', '118': 'NY', '119': 'NY',
        '120': 'NY', '121': 'NY', '122': 'NY', '123': 'NY', '124': 'NY', '125': 'NY', '126': 'NY', '127': 'NY', '128': 'NY', '129': 'NY',
        '130': 'NY', '131': 'NY', '132': 'NY', '133': 'NY', '134': 'NY', '135': 'NY', '136': 'NY', '137': 'NY', '138': 'NY', '139': 'NY', '140': 'NY', '141': 'NY', '142': 'NY', '143': 'NY', '144': 'NY', '145': 'NY', '146': 'NY', '147': 'NY', '148': 'NY', '149': 'NY',
        '060': 'CT', '061': 'CT', '062': 'CT', '063': 'CT', '064': 'CT', '065': 'CT', '066': 'CT', '067': 'CT', '068': 'CT', '069': 'CT',
        '010': 'MA', '011': 'MA', '012': 'MA', '013': 'MA', '014': 'MA', '015': 'MA', '016': 'MA', '017': 'MA', '018': 'MA', '019': 'MA', '020': 'MA', '021': 'MA', '022': 'MA', '023': 'MA', '024': 'MA', '025': 'MA', '026': 'MA', '027': 'MA',
        '070': 'NJ', '071': 'NJ', '072': 'NJ', '073': 'NJ', '074': 'NJ', '075': 'NJ', '076': 'NJ', '077': 'NJ', '078': 'NJ', '079': 'NJ', '080': 'NJ', '081': 'NJ', '082': 'NJ', '083': 'NJ', '084': 'NJ', '085': 'NJ', '086': 'NJ', '087': 'NJ', '088': 'NJ', '089': 'NJ',
        '028': 'RI', '029': 'RI',
        '150': 'PA', '151': 'PA', '152': 'PA', '153': 'PA', '154': 'PA', '155': 'PA', '156': 'PA', '157': 'PA', '158': 'PA', '159': 'PA', '160': 'PA', '161': 'PA', '162': 'PA', '163': 'PA', '164': 'PA', '165': 'PA', '166': 'PA', '167': 'PA', '168': 'PA', '169': 'PA', '170': 'PA', '171': 'PA', '172': 'PA', '173': 'PA', '174': 'PA', '175': 'PA', '176': 'PA', '177': 'PA', '178': 'PA', '179': 'PA', '180': 'PA', '181': 'PA', '182': 'PA', '183': 'PA', '184': 'PA', '185': 'PA', '186': 'PA', '187': 'PA', '188': 'PA', '189': 'PA', '190': 'PA', '191': 'PA', '192': 'PA', '193': 'PA', '194': 'PA', '195': 'PA', '196': 'PA'
      };
      userState = zipStateMap[zipPrefix] || null;
    }

    // Insert engagement record
    await sequelize.query(
      `INSERT INTO supplier_engagements
       (supplier_id, supplier_name, engagement_type, user_zip, user_state, ip_hash, source, fuel_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      { bind: [resolvedSupplierId, resolvedSupplierName, engagementType, zipCode || null, userState, ipHash, 'ios_app', fuelType || 'heating_oil'] }
    );

    console.log(`[AppEngagement] ${engagementType} for ${resolvedSupplierName} from ZIP ${zipCode || 'unknown'}`);
    res.json({ success: true });

  } catch (err) {
    console.error('[AppEngagement Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/onboarding-step
 * Records anonymous onboarding funnel data WITHOUT requiring user consent.
 * Used to measure completion rates and identify drop-off points.
 * V2.14.0: Anonymous onboarding tracking
 */
router.post('/onboarding-step', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { step, action, zipCode, appVersion } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';

  // Validate required fields
  if (!step || !action) {
    return res.status(400).json({ error: 'Missing required fields (step, action)' });
  }

  // Validate step name
  const validSteps = [
    'value_screen', 'intent', 'fuel_type', 'postal_code', 'tank_size',
    'home_size', 'tank_level', 'notifications', 'smartburn', 'consent',
    'onboarding',  // For overall completion tracking
    'settings'     // V22.1: For tracking analytics enable/disable in Settings
  ];
  if (!validSteps.includes(step)) {
    return res.status(400).json({ error: 'Invalid step name' });
  }

  // Validate action
  const validActions = [
    'viewed', 'completed', 'skipped', 'granted', 'denied', 'continue', 'selected',
    'analytics_enabled', 'analytics_disabled',           // V22.0: Onboarding consent choices
    'settings_analytics_enabled', 'settings_analytics_disabled'  // V22.1: Settings changes
  ];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    // Hash IP for privacy (just first few chars for rough deduplication)
    const ipHash = ip ? require('crypto').createHash('sha256').update(ip).digest('hex').substring(0, 16) : null;

    // Extract ZIP prefix (first 3 digits) for anonymous regional data
    const zipPrefix = zipCode && zipCode.length >= 3 ? zipCode.substring(0, 3) : null;

    // Insert onboarding step record
    await sequelize.query(
      `INSERT INTO onboarding_steps (step_name, action, zip_prefix, ip_hash, app_version)
       VALUES ($1, $2, $3, $4, $5)`,
      { bind: [step, action, zipPrefix, ipHash, appVersion || null] }
    );

    console.log(`[Onboarding] ${step}/${action} from ZIP prefix ${zipPrefix || 'unknown'} (v${appVersion || '?'})`);
    res.json({ received: true });

  } catch (err) {
    // Table might not exist yet - log but don't fail the app
    console.log(`[Onboarding] ${step}/${action} (not persisted: ${err.message})`);
    res.json({ received: true });
  }
});

/**
 * GET /api/admin/tracking/pending
 * Get unprocessed clicks for email outreach (admin only)
 */
router.get('/admin/pending', async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const [clicks] = await sequelize.query(`
      SELECT
        sc.id,
        sc.supplier_id,
        s.name as supplier_name,
        s.email as supplier_email,
        s.phone as supplier_phone,
        sc.action_type,
        sc.zip_code,
        sc.created_at,
        (
          SELECT MAX(email_sent_at)
          FROM supplier_clicks
          WHERE supplier_id = sc.supplier_id
          AND email_sent_at IS NOT NULL
        ) as last_email_sent
      FROM supplier_clicks sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.processed_for_email = FALSE
      ORDER BY sc.created_at DESC
      LIMIT 50
    `);

    // Filter out suppliers emailed in last 7 days
    const filtered = clicks.filter(c => {
      if (!c.last_email_sent) return true;
      const daysSinceEmail = (Date.now() - new Date(c.last_email_sent).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceEmail >= 7;
    });

    res.json({
      success: true,
      data: filtered,
      total: clicks.length,
      eligible: filtered.length
    });

  } catch (err) {
    console.error('[Tracking Admin Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tracking/mark-processed
 * Mark clicks as processed after sending email
 */
router.post('/admin/mark-processed', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { clickIds, supplierId } = req.body;

  if (!clickIds && !supplierId) {
    return res.status(400).json({ error: 'Provide clickIds or supplierId' });
  }

  try {
    if (supplierId) {
      // Mark all unprocessed clicks for this supplier
      await sequelize.query(`
        UPDATE supplier_clicks
        SET processed_for_email = TRUE, email_sent_at = NOW()
        WHERE supplier_id = $1 AND processed_for_email = FALSE
      `, { bind: [supplierId] });
    } else {
      // Mark specific click IDs
      await sequelize.query(`
        UPDATE supplier_clicks
        SET processed_for_email = TRUE, email_sent_at = NOW()
        WHERE id = ANY($1::uuid[])
      `, { bind: [clickIds] });
    }

    res.json({ success: true });

  } catch (err) {
    console.error('[Tracking Mark Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tracking/stats
 * Get click statistics
 */
router.get('/admin/stats', async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total_clicks,
        COUNT(DISTINCT supplier_id) as unique_suppliers,
        COUNT(*) FILTER (WHERE action_type = 'call') as call_clicks,
        COUNT(*) FILTER (WHERE action_type = 'website') as website_clicks,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE processed_for_email = TRUE) as emails_sent
      FROM supplier_clicks
    `);

    res.json({ success: true, data: stats[0] });

  } catch (err) {
    console.error('[Tracking Stats Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
