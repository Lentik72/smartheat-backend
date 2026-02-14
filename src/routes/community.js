// src/routes/community.js - Privacy-Compliant Community Supplier API
// V18.0: Added community benchmarking endpoints for delivery price sharing
// V18.6: Added distance-based community grouping (10→15→20 mile tiers)
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { Op, fn, col, literal } = require('sequelize');
const {
  getCommunityDeliveryModel,
  getGallonsBucket,
  roundPrice,
  getCurrentMonth,
  getPreviousMonth,
  VALIDATION_THRESHOLDS,
  FUEL_TYPES,
  DEFAULT_FUEL_TYPE
} = require('../models/CommunityDelivery');

// V20.1: 45-day freshness threshold for community data
const FRESHNESS_THRESHOLD_DAYS = 45;
const {
  findNearbyPrefixes,
  findNearbyPrefixesProgressive,
  getCentroid,
  isInSupportedRegion,
  calculateDistance
} = require('../data/zip-centroids');
const router = express.Router();

// V2.3.0: Helper to get state from ZIP code
function getStateFromZip(zipCode) {
  if (!zipCode || zipCode.length < 2) return null;
  const prefix2 = zipCode.substring(0, 2);
  const prefix3 = zipCode.substring(0, 3);

  // Special cases
  if (['028', '029'].includes(prefix3)) return 'RI';
  if (['197', '198', '199'].includes(prefix3)) return 'DE';

  const stateMap = {
    '01': 'MA', '02': 'MA',
    '03': 'NH', '04': 'ME', '05': 'VT', '06': 'CT',
    '07': 'NJ', '08': 'NJ',
    '10': 'NY', '11': 'NY', '12': 'NY', '13': 'NY', '14': 'NY',
    '15': 'PA', '16': 'PA', '17': 'PA', '18': 'PA', '19': 'PA',
    '20': 'DC', '21': 'MD', '22': 'VA', '23': 'VA'
  };

  return stateMap[prefix2] || null;
}

// V2.3.0: Calculate market price from scraped supplier data
async function calculateMarketPriceFromScrapedData(sequelize, zipPrefix, fullZipCode, logger) {
  try {
    const state = getStateFromZip(fullZipCode || zipPrefix);
    if (!state) {
      logger.debug(`[V2.3.0] Cannot determine state from ZIP ${zipPrefix}`);
      return null;
    }

    // Query average price from scraped data for this state (last 7 days)
    const [results] = await sequelize.query(`
      SELECT
        AVG(sp.price_per_gallon) as avg_price,
        COUNT(*) as data_points,
        MIN(sp.price_per_gallon) as min_price,
        MAX(sp.price_per_gallon) as max_price
      FROM supplier_prices sp
      JOIN suppliers s ON sp.supplier_id = s.id
      WHERE s.state = :state
        AND sp.is_valid = true
        AND sp.scraped_at > NOW() - INTERVAL '7 days'
        AND sp.price_per_gallon BETWEEN 1.50 AND 7.00
    `, {
      replacements: { state },
      type: sequelize.QueryTypes.SELECT
    });

    if (!results || !results.avg_price || results.data_points < 3) {
      logger.debug(`[V2.3.0] Insufficient scraped data for state ${state}: ${results?.data_points || 0} points`);
      return null;
    }

    const avgPrice = parseFloat(results.avg_price);
    logger.info(`[V2.3.0] Calculated market price for ${state}: $${avgPrice.toFixed(2)} (${results.data_points} suppliers, range $${parseFloat(results.min_price).toFixed(2)}-$${parseFloat(results.max_price).toFixed(2)})`);

    return avgPrice;
  } catch (error) {
    logger.error(`[V2.3.0] Error calculating market price: ${error.message}`);
    return null;
  }
}

// Mock database - In production, replace with MongoDB
let communitySuppliers = [
  {
    id: 'sample-1',
    companyName: 'Northeastern Heating Oil',
    city: 'Boston',
    state: 'MA',
    zipCode: '02101',
    servicesArea: 'Greater Boston Area',
    phone: '617-555-0123',
    email: 'service@northeastern-oil.com',
    deliveryCount: 45,
    averageRating: 4.5,
    lastActive: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    isVerified: true,
    services: ['heating_oil_delivery', 'emergency_delivery', 'automatic_delivery'],
    website: 'https://northeastern-oil.com'
  },
  {
    id: 'sample-2', 
    companyName: 'Harbor Fuel Company',
    city: 'Portland',
    state: 'ME',
    zipCode: '04101',
    servicesArea: 'Southern Maine',
    phone: '207-555-0456',
    email: 'info@harborfuel.com',
    deliveryCount: 32,
    averageRating: 4.2,
    lastActive: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    isVerified: true,
    services: ['heating_oil_delivery', 'tank_maintenance'],
    website: 'https://harborfuel.com'
  },
  {
    id: 'sample-3',
    companyName: 'Valley Oil Services',  
    city: 'Hartford',
    state: 'CT',
    zipCode: '06101',
    servicesArea: 'Central Connecticut',
    phone: '860-555-0789',
    email: 'orders@valleyoil.com', 
    deliveryCount: 28,
    averageRating: 4.7,
    lastActive: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    isVerified: true,
    services: ['heating_oil_delivery', 'budget_plans', 'online_ordering'],
    website: 'https://valleyoil.com'
  }
];

let communityActivities = [
  {
    id: 'activity-1',
    type: 'supplier_shared',
    description: 'New supplier added to community',
    supplierName: 'Northeastern Heating Oil',
    city: 'Boston, MA',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'activity-2', 
    type: 'delivery_completed',
    description: 'Delivery completed',
    supplierName: 'Harbor Fuel Company',
    city: 'Portland, ME',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
];

let supplierReports = [];
let communityStats = {
  totalSuppliers: 3,
  totalDeliveries: 105,
  citiesServed: 12,
  lastUpdated: new Date().toISOString()
};

// Email transporter for supplier invitations
const createEmailTransporter = () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return null;
};

// Validation middleware
const validateZipCode = param('zipCode').matches(/^\d{5}$/).withMessage('Invalid ZIP code format');
const validateSupplierData = [
  body('companyName').trim().isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters'),
  body('city').trim().isLength({ min: 2, max: 50 }).withMessage('City must be 2-50 characters'),
  body('state').isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('zipCode').matches(/^\d{5}$/).withMessage('Invalid ZIP code format'),
  body('phone').optional().matches(/^[\d\s\-\(\)\+\.]+$/).withMessage('Invalid phone format'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('servicesArea').optional().trim().isLength({ max: 200 }).withMessage('Services area too long'),
  body('userConsent').equals('true').withMessage('User consent required for community sharing')
];

// Error handler for validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

// GET /api/community/suppliers - Get community suppliers with privacy controls
router.get('/suppliers', [
  query('zipCode').optional().matches(/^\d{5}$/).withMessage('Invalid ZIP code format'),
  query('radius').optional().isInt({ min: 5, max: 100 }).withMessage('Radius must be 5-100 miles'),
  handleValidationErrors
], (req, res) => {
  try {
    const { zipCode, radius = 25 } = req.query;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    
    const cacheKey = `community_suppliers_${zipCode || 'all'}_${radius}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      logger.info(`📦 Cache hit: community suppliers for ${zipCode || 'all'}`);
      return res.json(cached);
    }
    
    let filteredSuppliers = [...communitySuppliers];
    
    // Filter by ZIP code radius if provided
    if (zipCode) {
      filteredSuppliers = communitySuppliers.filter(supplier => {
        // Simple ZIP code proximity (first digit matching for demo)
        const supplierZip = supplier.zipCode;
        const userZip = zipCode;
        
        // More sophisticated geo-filtering would use actual coordinates
        return Math.abs(parseInt(supplierZip[0]) - parseInt(userZip[0])) <= 1;
      });
    }
    
    // Sort by delivery count and recent activity
    filteredSuppliers.sort((a, b) => {
      return (b.deliveryCount || 0) - (a.deliveryCount || 0);
    });
    
    const response = {
      suppliers: filteredSuppliers.map(supplier => ({
        id: supplier.id,
        companyName: supplier.companyName,
        city: supplier.city,
        state: supplier.state,
        servicesArea: supplier.servicesArea || '',
        phone: supplier.phone,
        email: supplier.email,
        deliveryCount: supplier.deliveryCount || 0,
        averageRating: supplier.averageRating || 0,
        lastActive: supplier.lastActive,
        isVerified: supplier.isVerified || false,
        // Privacy-compliant: Don't expose exact addresses or personal data
        bestPhoneNumber: supplier.phone || supplier.alternatePhone
      })),
      meta: {
        total: filteredSuppliers.length,
        zipCode: zipCode || null,
        radius: parseInt(radius),
        timestamp: new Date().toISOString()
      }
    };
    
    // Cache for 10 minutes
    cache.set(cacheKey, response, 600);
    
    logger.info(`📋 Returned ${response.suppliers.length} community suppliers`);
    res.json(response);
    
  } catch (error) {
    req.app.locals.logger.error('Community suppliers fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch community suppliers',
      message: error.message
    });
  }
});

// POST /api/community/suppliers - Add supplier to community (privacy-compliant)
router.post('/suppliers', validateSupplierData, handleValidationErrors, (req, res) => {
  try {
    const {
      companyName,
      city,
      state,
      zipCode,
      phone,
      email,
      servicesArea,
      userConsent,
      contactPerson
    } = req.body;
    
    const logger = req.app.locals.logger;
    
    // Verify user consent for community sharing
    if (userConsent !== 'true') {
      return res.status(403).json({
        error: 'User consent required',
        message: 'Community sharing requires explicit user consent'
      });
    }
    
    // Check for duplicate suppliers
    const existingSupplier = communitySuppliers.find(supplier => 
      supplier.companyName.toLowerCase() === companyName.toLowerCase() &&
      supplier.city.toLowerCase() === city.toLowerCase() &&
      supplier.state.toLowerCase() === state.toLowerCase()
    );
    
    if (existingSupplier) {
      return res.status(409).json({
        error: 'Supplier already exists',
        message: 'This supplier is already in the community database'
      });
    }
    
    // Create new community supplier
    const newSupplier = {
      id: uuidv4(),
      companyName: companyName.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      zipCode: zipCode.trim(),
      phone: phone?.trim(),
      email: email?.trim()?.toLowerCase(),
      contactPerson: contactPerson?.trim(),
      servicesArea: servicesArea?.trim() || `${city}, ${state}`,
      deliveryCount: 0,
      averageRating: 0,
      isVerified: false,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      addedBy: req.ip // Anonymous tracking for spam prevention
    };
    
    communitySuppliers.push(newSupplier);
    
    // Add activity record
    const activity = {
      id: uuidv4(),
      activityType: 'supplier_added',
      activityDescription: `New supplier added: ${companyName} in ${city}, ${state}`,
      createdAt: new Date().toISOString()
    };
    
    communityActivities.unshift(activity);
    
    // Keep only last 100 activities
    if (communityActivities.length > 100) {
      communityActivities = communityActivities.slice(0, 100);
    }
    
    // Update community stats
    communityStats.totalSuppliers = communitySuppliers.length;
    const uniqueCities = new Set(communitySuppliers.map(s => `${s.city}, ${s.state}`));
    communityStats.citiesServed = uniqueCities.size;
    communityStats.lastUpdated = new Date().toISOString();
    
    // Clear relevant caches
    const cache = req.app.locals.cache;
    cache.keys().forEach(key => {
      if (key.startsWith('community_suppliers') || key === 'community_stats') {
        cache.del(key);
      }
    });
    
    logger.info(`✅ New supplier added to community: ${companyName} in ${city}, ${state}`);
    
    res.status(201).json({
      success: true,
      message: 'Supplier added to community successfully',
      supplier: {
        id: newSupplier.id,
        companyName: newSupplier.companyName,
        city: newSupplier.city,
        state: newSupplier.state
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Add supplier error:', error);
    res.status(500).json({
      error: 'Failed to add supplier',
      message: error.message
    });
  }
});

// POST /api/community/suppliers/invite - Send supplier invitation
router.post('/suppliers/invite', [
  body('supplierName').trim().isLength({ min: 2, max: 100 }).withMessage('Supplier name required'),
  body('contactEmail').isEmail().withMessage('Valid email required'),
  body('contactName').optional().trim().isLength({ max: 100 }),
  body('personalMessage').optional().trim().isLength({ max: 500 }),
  body('userConsent').equals('true').withMessage('User consent required')
], handleValidationErrors, async (req, res) => {
  try {
    const { supplierName, contactEmail, contactName, personalMessage, userConsent } = req.body;
    const logger = req.app.locals.logger;
    
    if (userConsent !== 'true') {
      return res.status(403).json({
        error: 'User consent required',
        message: 'Sending invitations requires explicit user consent'
      });
    }
    
    const transporter = createEmailTransporter();
    if (!transporter) {
      return res.status(503).json({
        error: 'Email service unavailable',
        message: 'Email invitations are temporarily unavailable'
      });
    }
    
    // Create invitation email
    const invitationSubject = 'Invitation to Join HomeHeat Community Platform';
    const invitationBody = `
Hello${contactName ? ` ${contactName}` : ''},

You've been invited to join the HomeHeat Community Platform by one of our users.

HomeHeat is a community-driven platform that helps homeowners:
• Find reliable heating oil suppliers in their area
• Get better pricing through community recommendations
• Share and discover trusted service providers
• Access market intelligence and pricing trends

${personalMessage ? `Personal message from the user:\n"${personalMessage}"\n\n` : ''}

Benefits of joining:
✓ Get discovered by more customers in your service area
✓ Build your customer base through referrals
✓ Optional: Access market intelligence and pricing trends
✓ Optional: Get notified about delivery demand in your area

Getting started is simple:
1. Reply to this email to express interest
2. We'll add your company to our community directory
3. Users can find and contact you directly

Your privacy is protected:
• We only share basic business contact information
• All data sharing requires explicit consent
• Users contact you directly - no middleman
• You control what information is public

Questions? Reply to this email or visit our website.

Best regards,
The HomeHeat Team

---
This invitation was sent because a HomeHeat user recommended your services.
If you don't wish to receive these invitations, please reply with "UNSUBSCRIBE".
    `;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: contactEmail,
      subject: invitationSubject,
      text: invitationBody,
      replyTo: process.env.EMAIL_USER
    };
    
    await transporter.sendMail(mailOptions);
    
    // Log invitation (without storing email for privacy)
    const activity = {
      id: uuidv4(),
      activityType: 'supplier_invited',
      activityDescription: `Supplier invitation sent to ${supplierName}`,
      createdAt: new Date().toISOString()
    };
    
    communityActivities.unshift(activity);
    
    logger.info(`📧 Supplier invitation sent to: ${contactEmail} for ${supplierName}`);
    
    res.json({
      success: true,
      message: 'Invitation sent successfully',
      recipient: supplierName
    });
    
  } catch (error) {
    req.app.locals.logger.error('Supplier invitation error:', error);
    res.status(500).json({
      error: 'Failed to send invitation',
      message: error.message
    });
  }
});

// GET /api/community/stats - Get community statistics
router.get('/stats', (req, res) => {
  try {
    const cache = req.app.locals.cache;
    const cached = cache.get('community_stats');
    
    if (cached) {
      return res.json(cached);
    }
    
    // Calculate real-time stats
    const stats = {
      totalSuppliers: communitySuppliers.length,
      totalDeliveries: communitySuppliers.reduce((sum, supplier) => sum + (supplier.deliveryCount || 0), 0),
      citiesServed: new Set(communitySuppliers.map(s => `${s.city}, ${s.state}`)).size,
      recentActivity: communityActivities.slice(0, 20),
      lastUpdated: new Date().toISOString()
    };
    
    // Cache for 5 minutes
    cache.set('community_stats', stats, 300);
    
    res.json(stats);
    
  } catch (error) {
    req.app.locals.logger.error('Community stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch community statistics',
      message: error.message
    });
  }
});

// POST /api/community/report - Report supplier issues
router.post('/report', [
  body('supplierId').isUUID().withMessage('Valid supplier ID required'),
  body('reportType').isIn(['invalid_phone', 'out_of_business', 'poor_service', 'incorrect_info', 'spam']).withMessage('Valid report type required'),
  body('details').trim().isLength({ min: 10, max: 500 }).withMessage('Details must be 10-500 characters'),
  body('reporterConsent').equals('true').withMessage('Reporter consent required')
], handleValidationErrors, (req, res) => {
  try {
    const { supplierId, reportType, details, reporterConsent } = req.body;
    const logger = req.app.locals.logger;
    
    if (reporterConsent !== 'true') {
      return res.status(403).json({
        error: 'Consent required',
        message: 'Reporting requires explicit consent'
      });
    }
    
    // Find supplier
    const supplier = communitySuppliers.find(s => s.id === supplierId);
    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'The specified supplier does not exist'
      });
    }
    
    // Create report
    const report = {
      id: uuidv4(),
      supplierId,
      supplierName: supplier.companyName,
      reportType,
      details: details.trim(),
      reportedBy: req.ip, // Anonymous
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    supplierReports.push(report);
    
    logger.warn(`🚨 Supplier report submitted: ${reportType} for ${supplier.companyName}`);
    
    res.json({
      success: true,
      message: 'Report submitted successfully',
      reportId: report.id
    });
    
  } catch (error) {
    req.app.locals.logger.error('Supplier report error:', error);
    res.status(500).json({
      error: 'Failed to submit report',
      message: error.message
    });
  }
});

// GET /api/community/activity - Get recent community activity
router.get('/activity', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const activities = communityActivities
      .slice(0, limit)
      .map(activity => ({
        id: activity.id,
        activityType: activity.activityType,
        activityDescription: activity.activityDescription,
        createdAt: activity.createdAt
      }));

    res.json({
      activities,
      total: communityActivities.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    req.app.locals.logger.error('Community activity error:', error);
    res.status(500).json({
      error: 'Failed to fetch community activity',
      message: error.message
    });
  }
});

// ============================================================================
// V18.0: COMMUNITY BENCHMARKING ENDPOINTS
// Anonymous delivery price sharing for local market intelligence
// ============================================================================

// POST /api/community/deliveries - Submit anonymous delivery for community benchmarking
// V18.6: Now accepts optional fullZipCode for distance-based community
// V20.1: Now requires fuelType for propane/oil isolation
// V2.2.0: Now accepts optional supplier tracking data
router.post('/deliveries', [
  body('zipPrefix').matches(/^\d{3}$/).withMessage('ZIP prefix must be 3 digits'),
  body('fullZipCode').optional().matches(/^\d{5}$/).withMessage('Full ZIP code must be 5 digits'),
  body('pricePerGallon').isFloat({ min: 1.00, max: 8.00 }).withMessage('Price must be between $1.00 and $8.00'),
  body('deliveryMonth').matches(/^\d{4}-\d{2}$/).withMessage('Delivery month must be YYYY-MM format'),
  // V2.3.0: Full delivery date for better duplicate detection (optional for backward compat)
  body('deliveryDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Delivery date must be YYYY-MM-DD format'),
  body('gallonsBucket').isIn(['small', 'medium', 'large', 'xlarge', 'bulk']).withMessage('Invalid gallons bucket'),
  body('marketPriceAtTime').optional({ nullable: true }).isFloat({ min: 1.00, max: 8.00 }),
  body('contributorHash').isLength({ min: 64, max: 64 }).withMessage('Invalid contributor hash'),
  // V20.1: Fuel type is required for new submissions
  body('fuelType').isIn(FUEL_TYPES).withMessage(`Fuel type must be one of: ${FUEL_TYPES.join(', ')}`),
  // V2.2.0: Optional supplier tracking
  body('supplierName').optional().trim().isLength({ max: 255 }).withMessage('Supplier name too long'),
  body('supplierId').optional().isUUID().withMessage('Invalid supplier ID format'),
  body('isDirectorySupplier').optional().isBoolean().withMessage('isDirectorySupplier must be boolean')
], handleValidationErrors, async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({
        success: false,
        status: 'service_unavailable',
        message: 'Community benchmarking is temporarily unavailable'
      });
    }

    const {
      zipPrefix,
      fullZipCode,
      pricePerGallon,
      deliveryMonth,
      deliveryDate,  // V2.3.0: Full date for duplicate detection
      gallonsBucket,
      marketPriceAtTime,
      contributorHash,
      fuelType,  // V20.1: Required fuel type
      // V2.2.0: Optional supplier tracking
      supplierName,
      supplierId,
      isDirectorySupplier
    } = req.body;

    // Round price to nearest $0.05 for anonymization
    const roundedPrice = roundPrice(parseFloat(pricePerGallon));

    // Validate delivery month is not too old (max 90 days)
    const deliveryDate = new Date(deliveryMonth + '-01');
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    if (deliveryDate < ninetyDaysAgo) {
      return res.status(400).json({
        success: false,
        status: 'rejected',
        reason: 'stale_submission',
        message: 'Delivery is too old to submit (max 90 days)'
      });
    }

    // Rate limiting: Max 4 submissions per contributor per month
    const currentMonth = getCurrentMonth();
    const recentSubmissions = await CommunityDelivery.count({
      where: {
        contributorHash,
        deliveryMonth: currentMonth
      }
    });

    if (recentSubmissions >= 4) {
      return res.status(429).json({
        success: false,
        status: 'rejected',
        reason: 'rate_limit_exceeded',
        message: 'Maximum 4 submissions per month reached'
      });
    }

    // V19.0.5: Duplicate detection - same user can't submit same delivery twice
    // V20.1: Now includes fuelType in duplicate check
    // V2.3.0: Use deliveryDate when available for more precise duplicate detection
    // Match on: contributorHash + (deliveryDate OR deliveryMonth) + roundedPrice + gallonsBucket + fuelType
    const duplicateWhere = {
      contributorHash,
      pricePerGallon: roundedPrice,
      gallonsBucket,
      fuelType  // V20.1: Fuel type must match
    };

    // V2.3.0: Prefer exact date match, fall back to month for older clients
    if (deliveryDate) {
      duplicateWhere.deliveryDate = deliveryDate;
    } else {
      duplicateWhere.deliveryMonth = deliveryMonth;
    }

    const existingDelivery = await CommunityDelivery.findOne({ where: duplicateWhere });

    if (existingDelivery) {
      logger.info(`[V2.3.0] Duplicate submission rejected: ${contributorHash.substring(0, 8)}... already submitted $${roundedPrice} for ${deliveryDate || deliveryMonth} (${fuelType})`);
      return res.status(409).json({
        success: false,
        status: 'duplicate',
        reason: 'already_submitted',
        message: 'This delivery has already been shared'
      });
    }

    // V19.0.5b: Also check for same price in same area (catches reinstalls with new hash)
    // V20.1: Now includes fuelType - same price+fuel in same ZIP is likely same person
    // V2.3.0: Use deliveryDate when available
    const areaDuplicateWhere = {
      zipPrefix,
      pricePerGallon: roundedPrice,
      gallonsBucket,
      fuelType  // V20.1: Fuel type must match
    };

    if (deliveryDate) {
      areaDuplicateWhere.deliveryDate = deliveryDate;
    } else {
      areaDuplicateWhere.deliveryMonth = deliveryMonth;
    }

    const existingAreaDelivery = await CommunityDelivery.findOne({ where: areaDuplicateWhere });

    if (existingAreaDelivery) {
      logger.info(`[V2.3.0] Area duplicate rejected: $${roundedPrice} ${fuelType} for ${deliveryDate || deliveryMonth} in ${zipPrefix} already exists`);
      return res.status(409).json({
        success: false,
        status: 'duplicate',
        reason: 'price_already_reported',
        message: 'This price has already been reported in your area'
      });
    }

    // V2.3.0: Calculate market price from scraped data if not provided by client
    let effectiveMarketPrice = marketPriceAtTime;
    if (!effectiveMarketPrice) {
      const sequelize = req.app.locals.sequelize;
      if (sequelize) {
        effectiveMarketPrice = await calculateMarketPriceFromScrapedData(
          sequelize, zipPrefix, fullZipCode, logger
        );
      }
    }

    // Validation: Check against market price if available
    let validationStatus = 'valid';
    let rejectionReason = null;

    if (effectiveMarketPrice) {
      const thresholds = VALIDATION_THRESHOLDS[gallonsBucket];
      const deviation = Math.abs(roundedPrice - effectiveMarketPrice) / effectiveMarketPrice;

      if (deviation > thresholds.hardReject) {
        // Hard rejection - don't store
        logger.warn(`[V18.0] Hard reject: ${roundedPrice} vs market ${effectiveMarketPrice} (${(deviation * 100).toFixed(1)}% deviation)`);
        return res.status(400).json({
          success: false,
          status: 'rejected',
          reason: 'price_outside_expected_range',
          message: 'Price seems incorrect. Please verify and try again.'
        });
      } else if (deviation > thresholds.softExclude) {
        // Soft exclusion - store but don't include in averages
        validationStatus = 'soft_excluded';
        rejectionReason = 'moderate_market_deviation';
        logger.info(`[V18.0] Soft exclude: ${roundedPrice} vs market ${effectiveMarketPrice} (${(deviation * 100).toFixed(1)}% deviation)`);
      }
    }

    // Calculate contributor weight (prevent one user from dominating)
    // V20.1: Filter by fuelType
    const areaDeliveries = await CommunityDelivery.count({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only count same fuel type
        deliveryMonth: { [Op.in]: [currentMonth, getPreviousMonth()] },
        validationStatus: 'valid'
      }
    });

    const contributorDeliveries = await CommunityDelivery.count({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only count same fuel type
        contributorHash,
        deliveryMonth: { [Op.in]: [currentMonth, getPreviousMonth()] },
        validationStatus: 'valid'
      }
    });

    // Weight capping based on sample size
    let maxWeight;
    if (areaDeliveries < 5) {
      maxWeight = 0.40;
    } else if (areaDeliveries < 10) {
      maxWeight = 0.30;
    } else {
      maxWeight = 0.20;
    }

    // If this contributor already has entries, reduce weight
    const contributionWeight = contributorDeliveries > 0
      ? Math.max(0.5, 1.0 - (contributorDeliveries * 0.2))
      : 1.0;

    const cappedWeight = Math.min(contributionWeight, maxWeight * (areaDeliveries + 1));

    // Create the delivery record
    // V18.6: Include fullZipCode for distance-based queries
    // V20.1: Include fuelType for propane/oil isolation
    // V2.2.0: Include supplier tracking data
    // V2.3.0: Include deliveryDate for precise duplicate detection
    const delivery = await CommunityDelivery.create({
      zipPrefix,
      fullZipCode: fullZipCode || null,
      fuelType,  // V20.1: Store fuel type
      pricePerGallon: roundedPrice,
      deliveryMonth,
      deliveryDate: deliveryDate || null,  // V2.3.0: Full date
      gallonsBucket,
      marketPriceAtTime: effectiveMarketPrice || null,
      validationStatus,
      rejectionReason,
      contributorHash,
      contributionWeight: Math.min(cappedWeight, 1.0),
      // V2.2.0: Supplier tracking
      supplierName: supplierName || null,
      supplierId: supplierId || null,
      isDirectorySupplier: isDirectorySupplier || false
    });

    // Get updated area stats
    // V20.1: Filter by fuelType
    const updatedStats = await CommunityDelivery.count({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only count same fuel type
        deliveryMonth: { [Op.in]: [currentMonth, getPreviousMonth()] },
        validationStatus: 'valid'
      }
    });

    const uniqueContributors = await CommunityDelivery.count({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only count same fuel type
        deliveryMonth: { [Op.in]: [currentMonth, getPreviousMonth()] },
        validationStatus: 'valid'
      },
      distinct: true,
      col: 'contributorHash'
    });

    const thresholdMet = updatedStats >= 3 && uniqueContributors >= 2;
    const unlockedFeature = thresholdMet && areaDeliveries < 3;

    // V2.2.0: Log supplier if provided
    const supplierInfo = supplierName ? `, supplier: ${supplierName}${isDirectorySupplier ? ' (directory)' : ''}` : '';
    logger.info(`[V2.2.0] Delivery submitted: ZIP ${zipPrefix}, $${roundedPrice}, ${fuelType}, bucket ${gallonsBucket}, status ${validationStatus}${supplierInfo}`);

    // Response based on validation status
    if (validationStatus === 'soft_excluded') {
      return res.json({
        success: true,
        status: 'soft_excluded',
        message: "Received! Price seems unusual so we're reviewing it.",
        reason: rejectionReason
      });
    }

    res.status(201).json({
      success: true,
      status: 'valid',
      message: unlockedFeature
        ? '🎉 You just activated community data for your area!'
        : 'Thank you for contributing!',
      areaStats: {
        deliveryCount: updatedStats,
        contributorCount: uniqueContributors,
        thresholdMet
      },
      unlockedFeature
    });

  } catch (error) {
    logger.error('[V18.0] Community delivery submission error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to submit delivery'
    });
  }
});

// GET /api/community/benchmark/:zipPrefix - Get community benchmark for area
// V20.1: Now requires fuelType query param for propane/oil isolation
router.get('/benchmark/:zipPrefix', [
  param('zipPrefix').matches(/^\d{3}$/).withMessage('ZIP prefix must be 3 digits'),
  query('months').optional().isInt({ min: 1, max: 6 }).withMessage('Months must be 1-6'),
  query('userBucket').optional().isIn(['small', 'medium', 'large', 'xlarge', 'bulk']),
  // V20.1: Fuel type filter (defaults to heating_oil for backwards compatibility)
  query('fuelType').optional().isIn(FUEL_TYPES).withMessage(`Fuel type must be one of: ${FUEL_TYPES.join(', ')}`)
], handleValidationErrors, async (req, res) => {
  const logger = req.app.locals.logger;
  const cache = req.app.locals.cache;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({
        hasData: false,
        message: 'Community benchmarking is temporarily unavailable'
      });
    }

    const { zipPrefix } = req.params;
    const months = parseInt(req.query.months) || 2;
    const userBucket = req.query.userBucket;
    // V20.1: Default to heating_oil for backwards compatibility
    const fuelType = req.query.fuelType || DEFAULT_FUEL_TYPE;

    // Check cache first
    // V20.1: Include fuelType in cache key
    const cacheKey = `benchmark_${zipPrefix}_${months}_${userBucket || 'all'}_${fuelType}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Calculate date range
    const monthsToInclude = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthsToInclude.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Get all valid deliveries in range
    // V20.1: Filter by fuelType
    const deliveries = await CommunityDelivery.findAll({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only include matching fuel type
        deliveryMonth: { [Op.in]: monthsToInclude },
        validationStatus: 'valid'
      },
      order: [['createdAt', 'DESC']]
    });

    // Count unique contributors
    const contributors = new Set(deliveries.map(d => d.contributorHash));
    const contributorCount = contributors.size;
    const deliveryCount = deliveries.length;

    // V20.1: Check 45-day freshness - if all data is stale, return hasData: false
    let freshDeliveries = deliveries;
    if (deliveryCount > 0) {
      const freshnessThreshold = new Date();
      freshnessThreshold.setDate(freshnessThreshold.getDate() - FRESHNESS_THRESHOLD_DAYS);
      freshDeliveries = deliveries.filter(d => new Date(d.createdAt) > freshnessThreshold);

      if (freshDeliveries.length === 0) {
        const response = {
          hasData: false,
          zipPrefix,
          fuelType,  // V20.1: Include fuel type
          dataFreshness: 'stale',  // V20.1: Indicate data is stale
          confidence: {
            level: 'stale',
            score: 0,
            badge: '⚪'
          },
          message: 'Not enough recent local prices to compare',
          growthPrompt: 'share_recent'
        };
        cache.set(cacheKey, response, 300);
        return res.json(response);
      }
    }

    // Check thresholds
    if (deliveryCount < 3 || contributorCount < 2) {
      const response = {
        hasData: false,
        zipPrefix,
        fuelType,  // V20.1: Include fuel type
        confidence: {
          level: 'insufficient',
          score: deliveryCount / 3 * 0.5 + contributorCount / 2 * 0.5,
          badge: '⚪'
        },
        progress: {
          deliveryCount,
          requiredCount: 3,
          contributorCount,
          requiredContributors: 2,
          percentComplete: Math.round((deliveryCount / 3) * 100)
        },
        message: deliveryCount === 0
          ? 'Be the first in your area!'
          : `Almost there! ${3 - deliveryCount} more delivery needed.`,
        growthPrompt: deliveryCount === 0 ? 'be_first' : 'invite_neighbor'
      };

      cache.set(cacheKey, response, 300); // 5 min cache
      return res.json(response);
    }

    // Calculate statistics
    const prices = deliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // IQR for typical range (only if enough data)
    let typicalRange = null;
    if (prices.length >= 5) {
      const q1Idx = Math.floor(prices.length * 0.25);
      const q3Idx = Math.floor(prices.length * 0.75);
      typicalRange = {
        low: prices[q1Idx],
        high: prices[q3Idx]
      };
    }

    // Calculate by bucket
    const byBucket = {};
    const buckets = ['small', 'medium', 'large', 'xlarge', 'bulk'];
    for (const bucket of buckets) {
      const bucketDeliveries = deliveries.filter(d => d.gallonsBucket === bucket);
      if (bucketDeliveries.length > 0) {
        const bucketPrices = bucketDeliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
        byBucket[bucket] = {
          median: bucketPrices[Math.floor(bucketPrices.length / 2)],
          count: bucketPrices.length
        };
      }
    }

    // User's bucket stats
    let userBucketStats = null;
    if (userBucket && byBucket[userBucket]) {
      userBucketStats = {
        median: byBucket[userBucket].median,
        count: byBucket[userBucket].count,
        hasSufficientData: byBucket[userBucket].count >= 3
      };
    }

    // Calculate bucket spread
    let bucketSpread = null;
    if (byBucket.small && byBucket.bulk) {
      const spread = byBucket.small.median - byBucket.bulk.median;
      if (spread > 0) {
        bucketSpread = {
          smallVsBulk: spread,
          insight: `Bulk orders save ~$${spread.toFixed(2)}/gal vs small orders`
        };
      }
    }

    // Calculate confidence
    const newestDelivery = deliveries[0];
    const daysSinceNewest = Math.floor((new Date() - new Date(newestDelivery.createdAt)) / (1000 * 60 * 60 * 24));

    const deliveryCountFactor = Math.min(deliveryCount / 10, 1.0);
    const contributorCountFactor = Math.min(contributorCount / 5, 1.0);
    const recencyFactor = daysSinceNewest < 14 ? 1.0 : daysSinceNewest < 30 ? 0.7 : 0.4;

    const confidenceScore = (deliveryCountFactor * 0.4) + (contributorCountFactor * 0.3) + (recencyFactor * 0.3);

    let confidenceLevel, confidenceBadge;
    if (confidenceScore >= 0.8) {
      confidenceLevel = 'high';
      confidenceBadge = '🟢';
    } else if (confidenceScore >= 0.5) {
      confidenceLevel = 'medium';
      confidenceBadge = '🟠';
    } else {
      confidenceLevel = 'low';
      confidenceBadge = '🟡';
    }

    const response = {
      hasData: true,
      zipPrefix,
      fuelType,  // V20.1: Include fuel type
      confidence: {
        level: confidenceLevel,
        score: confidenceScore,
        badge: confidenceBadge
      },
      period: {
        start: monthsToInclude[monthsToInclude.length - 1],
        end: monthsToInclude[0]
      },
      stats: {
        medianPrice,
        avgPrice: Math.round(avgPrice * 100) / 100,
        typicalRange,
        deliveryCount,
        contributorCount
      },
      byBucket,
      userBucket: userBucket || null,
      userBucketStats,
      bucketSpread,
      lastUpdated: newestDelivery.createdAt
    };

    // Add caveat for low confidence
    if (confidenceLevel === 'low') {
      response.caveat = 'Early signal - limited data';
    }

    cache.set(cacheKey, response, 300); // 5 min cache
    logger.info(`[V20.1] Benchmark served: ZIP ${zipPrefix}, ${fuelType}, ${deliveryCount} deliveries, ${confidenceLevel} confidence`);

    res.json(response);

  } catch (error) {
    logger.error('[V18.0] Community benchmark error:', error);
    res.status(500).json({
      hasData: false,
      message: 'Failed to fetch community benchmark'
    });
  }
});

// GET /api/community/trend/:zipPrefix - Get trend for Buy Meter integration
// V20.1: Now requires fuelType query param for propane/oil isolation
router.get('/trend/:zipPrefix', [
  param('zipPrefix').matches(/^\d{3}$/).withMessage('ZIP prefix must be 3 digits'),
  // V20.1: Fuel type filter (defaults to heating_oil for backwards compatibility)
  query('fuelType').optional().isIn(FUEL_TYPES).withMessage(`Fuel type must be one of: ${FUEL_TYPES.join(', ')}`)
], handleValidationErrors, async (req, res) => {
  const logger = req.app.locals.logger;
  const cache = req.app.locals.cache;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({
        hasTrend: false,
        message: 'Community benchmarking is temporarily unavailable'
      });
    }

    const { zipPrefix } = req.params;
    // V20.1: Default to heating_oil for backwards compatibility
    const fuelType = req.query.fuelType || DEFAULT_FUEL_TYPE;

    // V20.1: Include fuelType in cache key
    const cacheKey = `trend_${zipPrefix}_${fuelType}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const currentMonth = getCurrentMonth();
    const previousMonth = getPreviousMonth();

    // Get current month deliveries
    // V20.1: Filter by fuelType
    const currentDeliveries = await CommunityDelivery.findAll({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only include matching fuel type
        deliveryMonth: currentMonth,
        validationStatus: 'valid'
      }
    });

    // Get previous month deliveries
    // V20.1: Filter by fuelType
    const previousDeliveries = await CommunityDelivery.findAll({
      where: {
        zipPrefix,
        fuelType,  // V20.1: Only include matching fuel type
        deliveryMonth: previousMonth,
        validationStatus: 'valid'
      }
    });

    const currentPrices = currentDeliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
    const previousPrices = previousDeliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);

    // Need at least 3 in current month for any trend
    if (currentPrices.length < 3) {
      const response = {
        hasTrend: false,
        zipPrefix,
        fuelType,  // V20.1: Include fuel type
        confidence: 'insufficient',
        recentDeliveryCount: currentPrices.length,
        signal: 'insufficient_data',
        buyTimingImpact: {
          direction: 'neutral',
          weight: 0,
          reason: 'Not enough data for trend'
        }
      };

      if (currentPrices.length > 0) {
        response.displayOnly = {
          show: true,
          message: `${currentPrices.length} neighbors paid ~$${currentPrices[Math.floor(currentPrices.length / 2)].toFixed(2)} this month`
        };
      }

      cache.set(cacheKey, response, 300);
      return res.json(response);
    }

    const currentMedian = currentPrices[Math.floor(currentPrices.length / 2)];

    // Calculate trend if we have previous month data
    let changePercent = null;
    let previousMedian = null;
    let signal = 'stable';
    let hasEnoughHistory = false;

    if (previousPrices.length >= 3) {
      previousMedian = previousPrices[Math.floor(previousPrices.length / 2)];
      changePercent = ((currentMedian - previousMedian) / previousMedian) * 100;
      hasEnoughHistory = true;

      if (changePercent <= -3) {
        signal = 'prices_falling';
      } else if (changePercent >= 3) {
        signal = 'prices_rising';
      }
    }

    // Determine confidence
    const uniqueContributors = new Set(currentDeliveries.map(d => d.contributorHash)).size;
    let confidence;
    if (currentPrices.length >= 10 && uniqueContributors >= 5) {
      confidence = 'high';
    } else if (currentPrices.length >= 5 && uniqueContributors >= 3) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Calculate Buy Meter impact
    let buyTimingWeight = 0;
    let buyTimingDirection = 'neutral';
    let buyTimingReason = '';

    if (confidence === 'high' && hasEnoughHistory) {
      if (signal === 'prices_falling') {
        buyTimingWeight = 0.15;
        buyTimingDirection = 'positive';
        buyTimingReason = `Community prices down ${Math.abs(changePercent).toFixed(0)}% this month`;
      } else if (signal === 'prices_rising') {
        buyTimingWeight = -0.15;
        buyTimingDirection = 'negative';
        buyTimingReason = `Community prices up ${changePercent.toFixed(0)}% this month`;
      }
    } else if (confidence === 'medium' && hasEnoughHistory) {
      if (signal === 'prices_falling') {
        buyTimingWeight = 0.10;
        buyTimingDirection = 'positive';
        buyTimingReason = `Community prices down ${Math.abs(changePercent).toFixed(0)}% this month`;
      } else if (signal === 'prices_rising') {
        buyTimingWeight = -0.10;
        buyTimingDirection = 'negative';
        buyTimingReason = `Community prices up ${changePercent.toFixed(0)}% this month`;
      }
    }

    const response = {
      hasTrend: true,
      zipPrefix,
      fuelType,  // V20.1: Include fuel type
      confidence,
      currentMonthMedian: currentMedian,
      previousMonthMedian: previousMedian,
      changePercent: changePercent ? Math.round(changePercent * 10) / 10 : null,
      recentDeliveryCount: currentPrices.length,
      signal,
      buyTimingImpact: {
        direction: buyTimingDirection,
        weight: buyTimingWeight,
        reason: buyTimingReason || 'Stable community prices'
      }
    };

    if (confidence === 'low') {
      response.displayOnly = {
        show: true,
        message: `${currentPrices.length} neighbors paid ~$${currentMedian.toFixed(2)} this month`
      };
    }

    cache.set(cacheKey, response, 300);
    logger.info(`[V20.1] Trend served: ZIP ${zipPrefix}, ${fuelType}, ${confidence} confidence, signal ${signal}`);

    res.json(response);

  } catch (error) {
    logger.error('[V18.0] Community trend error:', error);
    res.status(500).json({
      hasTrend: false,
      message: 'Failed to fetch community trend'
    });
  }
});

// ============================================================================
// V18.6: DISTANCE-BASED COMMUNITY BENCHMARKING
// Progressive radius expansion: 10 → 15 → 20 → 30 → 50 miles
// ============================================================================

// GET /api/community/benchmark-v2/:zipCode - Distance-based community benchmark
// V20.1: Now requires fuelType query param for propane/oil isolation
router.get('/benchmark-v2/:zipCode', [
  param('zipCode').matches(/^\d{5}$/).withMessage('ZIP code must be 5 digits'),
  query('months').optional().isInt({ min: 1, max: 6 }).withMessage('Months must be 1-6'),
  query('userBucket').optional().isIn(['small', 'medium', 'large', 'xlarge', 'bulk']),
  // V20.1: Fuel type filter (defaults to heating_oil for backwards compatibility)
  query('fuelType').optional().isIn(FUEL_TYPES).withMessage(`Fuel type must be one of: ${FUEL_TYPES.join(', ')}`)
], handleValidationErrors, async (req, res) => {
  const logger = req.app.locals.logger;
  const cache = req.app.locals.cache;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({
        hasData: false,
        message: 'Community benchmarking is temporarily unavailable'
      });
    }

    const { zipCode } = req.params;
    const months = parseInt(req.query.months) || 2;
    const userBucket = req.query.userBucket;
    // V20.1: Default to heating_oil for backwards compatibility
    const fuelType = req.query.fuelType || DEFAULT_FUEL_TYPE;

    // Check if ZIP is in supported region
    if (!isInSupportedRegion(zipCode)) {
      return res.json({
        hasData: false,
        zipCode,
        fuelType,  // V20.1: Include fuel type
        confidence: {
          level: 'unsupported',
          score: 0,
          badge: '⚪'
        },
        message: 'Community data not yet available for this region',
        radiusMiles: null
      });
    }

    // Check cache first
    // V20.1: Include fuelType in cache key
    const cacheKey = `benchmark_v2_${zipCode}_${months}_${userBucket || 'all'}_${fuelType}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Calculate date range
    const monthsToInclude = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthsToInclude.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Progressive radius expansion to find enough data
    // V18.6.1: Capped at 20mi for price benchmarks (pricing is hyperlocal)
    const radiusTiers = [10, 15, 20];
    let deliveries = [];
    let usedRadius = radiusTiers[0];
    let nearbyPrefixes = [];

    for (const radius of radiusTiers) {
      nearbyPrefixes = findNearbyPrefixes(zipCode, radius).map(n => n.prefix);

      if (nearbyPrefixes.length === 0) continue;

      // Query deliveries from all nearby prefixes
      // V20.1: Filter by fuelType
      deliveries = await CommunityDelivery.findAll({
        where: {
          zipPrefix: { [Op.in]: nearbyPrefixes },
          fuelType,  // V20.1: Only include matching fuel type
          deliveryMonth: { [Op.in]: monthsToInclude },
          validationStatus: 'valid'
        },
        order: [['createdAt', 'DESC']]
      });

      // Count unique contributors
      const contributors = new Set(deliveries.map(d => d.contributorHash));
      const deliveryCount = deliveries.length;
      const contributorCount = contributors.size;

      // Check if thresholds are met
      if (deliveryCount >= 3 && contributorCount >= 2) {
        usedRadius = radius;
        break;
      }

      usedRadius = radius;
    }

    // Count unique contributors
    const contributors = new Set(deliveries.map(d => d.contributorHash));
    const contributorCount = contributors.size;
    const deliveryCount = deliveries.length;

    // V20.1: Check 45-day freshness - if all data is stale, return hasData: false
    let freshDeliveries = deliveries;
    if (deliveryCount > 0) {
      const freshnessThreshold = new Date();
      freshnessThreshold.setDate(freshnessThreshold.getDate() - FRESHNESS_THRESHOLD_DAYS);
      freshDeliveries = deliveries.filter(d => new Date(d.createdAt) > freshnessThreshold);

      if (freshDeliveries.length === 0) {
        const response = {
          hasData: false,
          zipCode,
          fuelType,  // V20.1: Include fuel type
          radiusMiles: usedRadius,
          dataFreshness: 'stale',  // V20.1: Indicate data is stale
          confidence: {
            level: 'stale',
            score: 0,
            badge: '⚪'
          },
          message: 'Not enough recent local prices to compare',
          growthPrompt: 'share_recent',
          nearbyAreas: nearbyPrefixes.length
        };
        cache.set(cacheKey, response, 300);
        return res.json(response);
      }
    }

    // Check thresholds
    if (deliveryCount < 3 || contributorCount < 2) {
      const response = {
        hasData: false,
        zipCode,
        fuelType,  // V20.1: Include fuel type
        radiusMiles: usedRadius,
        confidence: {
          level: 'insufficient',
          score: deliveryCount / 3 * 0.5 + contributorCount / 2 * 0.5,
          badge: '⚪'
        },
        progress: {
          deliveryCount,
          requiredCount: 3,
          contributorCount,
          requiredContributors: 2,
          percentComplete: Math.round((deliveryCount / 3) * 100)
        },
        message: deliveryCount === 0
          ? 'Be the first in your area!'
          : `Almost there! ${3 - deliveryCount} more ${3 - deliveryCount === 1 ? 'delivery' : 'deliveries'} needed.`,
        growthPrompt: deliveryCount === 0 ? 'be_first' : 'invite_neighbor',
        nearbyAreas: nearbyPrefixes.length
      };

      cache.set(cacheKey, response, 300); // 5 min cache
      return res.json(response);
    }

    // Calculate statistics
    const prices = deliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // IQR for typical range (only if enough data)
    let typicalRange = null;
    if (prices.length >= 5) {
      const q1Idx = Math.floor(prices.length * 0.25);
      const q3Idx = Math.floor(prices.length * 0.75);
      typicalRange = {
        low: prices[q1Idx],
        high: prices[q3Idx]
      };
    }

    // Calculate by bucket
    const byBucket = {};
    const buckets = ['small', 'medium', 'large', 'xlarge', 'bulk'];
    for (const bucket of buckets) {
      const bucketDeliveries = deliveries.filter(d => d.gallonsBucket === bucket);
      if (bucketDeliveries.length > 0) {
        const bucketPrices = bucketDeliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
        byBucket[bucket] = {
          median: bucketPrices[Math.floor(bucketPrices.length / 2)],
          count: bucketPrices.length
        };
      }
    }

    // User's bucket stats
    let userBucketStats = null;
    if (userBucket && byBucket[userBucket]) {
      userBucketStats = {
        median: byBucket[userBucket].median,
        count: byBucket[userBucket].count,
        hasSufficientData: byBucket[userBucket].count >= 3
      };
    }

    // Calculate bucket spread
    let bucketSpread = null;
    if (byBucket.small && byBucket.bulk) {
      const spread = byBucket.small.median - byBucket.bulk.median;
      if (spread > 0) {
        bucketSpread = {
          smallVsBulk: spread,
          insight: `Bulk orders save ~$${spread.toFixed(2)}/gal vs small orders`
        };
      }
    }

    // Calculate confidence (enhanced for distance-based)
    const newestDelivery = deliveries[0];
    const daysSinceNewest = Math.floor((new Date() - new Date(newestDelivery.createdAt)) / (1000 * 60 * 60 * 24));

    const deliveryCountFactor = Math.min(deliveryCount / 10, 1.0);
    const contributorCountFactor = Math.min(contributorCount / 5, 1.0);
    const recencyFactor = daysSinceNewest < 14 ? 1.0 : daysSinceNewest < 30 ? 0.7 : 0.4;
    // V18.6: Tighter radius = higher confidence
    const radiusFactor = usedRadius <= 10 ? 1.0 : usedRadius <= 15 ? 0.9 : 0.8;

    const confidenceScore = (deliveryCountFactor * 0.35) + (contributorCountFactor * 0.25) + (recencyFactor * 0.2) + (radiusFactor * 0.2);

    let confidenceLevel, confidenceBadge;
    // V18.6.1: Cap confidence at Medium when radius > 15mi (farther = fuzzier)
    const maxConfidenceForRadius = usedRadius <= 15 ? 'high' : 'medium';

    if (confidenceScore >= 0.8 && maxConfidenceForRadius === 'high') {
      confidenceLevel = 'high';
      confidenceBadge = '🟢';
    } else if (confidenceScore >= 0.5 || maxConfidenceForRadius === 'medium') {
      confidenceLevel = 'medium';
      confidenceBadge = '🟠';
    } else {
      confidenceLevel = 'low';
      confidenceBadge = '🟡';
    }

    const response = {
      hasData: true,
      zipCode,
      fuelType,  // V20.1: Include fuel type
      radiusMiles: usedRadius,
      confidence: {
        level: confidenceLevel,
        score: Math.round(confidenceScore * 100) / 100,
        badge: confidenceBadge
      },
      period: {
        start: monthsToInclude[monthsToInclude.length - 1],
        end: monthsToInclude[0]
      },
      stats: {
        medianPrice,
        avgPrice: Math.round(avgPrice * 100) / 100,
        typicalRange,
        deliveryCount,
        contributorCount
      },
      byBucket,
      userBucket: userBucket || null,
      userBucketStats,
      bucketSpread,
      lastUpdated: newestDelivery.createdAt,
      nearbyAreas: nearbyPrefixes.length
    };

    // Add descriptive radius text
    // V18.6.1: Language refined per GPT feedback - avoid "region" sounding too big
    if (usedRadius <= 10) {
      response.radiusDescription = 'Your immediate neighborhood';
    } else if (usedRadius <= 15) {
      response.radiusDescription = 'Your local area';
    } else {
      // 20mi max for benchmarks
      response.radiusDescription = 'Wider local area';
    }

    // Add caveat for low confidence
    if (confidenceLevel === 'low') {
      response.caveat = 'Early signal - limited data';
    }

    cache.set(cacheKey, response, 300); // 5 min cache
    logger.info(`[V20.1] Distance benchmark served: ZIP ${zipCode}, ${fuelType}, ${usedRadius}mi radius, ${deliveryCount} deliveries, ${confidenceLevel} confidence`);

    res.json(response);

  } catch (error) {
    logger.error('[V18.6] Distance-based benchmark error:', error);
    res.status(500).json({
      hasData: false,
      message: 'Failed to fetch community benchmark'
    });
  }
});

// GET /api/community/trend-v2/:zipCode - Distance-based trend for Buy Meter integration
// V20.1: Now requires fuelType query param for propane/oil isolation
router.get('/trend-v2/:zipCode', [
  param('zipCode').matches(/^\d{5}$/).withMessage('ZIP code must be 5 digits'),
  // V20.1: Fuel type filter (defaults to heating_oil for backwards compatibility)
  query('fuelType').optional().isIn(FUEL_TYPES).withMessage(`Fuel type must be one of: ${FUEL_TYPES.join(', ')}`)
], handleValidationErrors, async (req, res) => {
  const logger = req.app.locals.logger;
  const cache = req.app.locals.cache;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({
        hasTrend: false,
        message: 'Community benchmarking is temporarily unavailable'
      });
    }

    const { zipCode } = req.params;
    // V20.1: Default to heating_oil for backwards compatibility
    const fuelType = req.query.fuelType || DEFAULT_FUEL_TYPE;

    // V20.1: Include fuelType in cache key
    const cacheKey = `trend_v2_${zipCode}_${fuelType}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Check if ZIP is in supported region
    if (!isInSupportedRegion(zipCode)) {
      return res.json({
        hasTrend: false,
        zipCode,
        fuelType,  // V20.1: Include fuel type
        confidence: 'unsupported',
        signal: 'unsupported_region',
        buyTimingImpact: {
          direction: 'neutral',
          weight: 0,
          reason: 'Community data not available for this region'
        }
      });
    }

    const currentMonth = getCurrentMonth();
    const previousMonth = getPreviousMonth();

    // Progressive radius expansion
    // V18.6.1: Trends allow 30mi (directional signals tolerate abstraction)
    // Benchmarks capped at 20mi (exact prices need tighter locality)
    const radiusTiers = [10, 15, 20, 30];
    let currentDeliveries = [];
    let previousDeliveries = [];
    let usedRadius = 10;

    for (const radius of radiusTiers) {
      const nearbyPrefixes = findNearbyPrefixes(zipCode, radius).map(n => n.prefix);

      if (nearbyPrefixes.length === 0) continue;

      // V20.1: Filter by fuelType
      currentDeliveries = await CommunityDelivery.findAll({
        where: {
          zipPrefix: { [Op.in]: nearbyPrefixes },
          fuelType,  // V20.1: Only include matching fuel type
          deliveryMonth: currentMonth,
          validationStatus: 'valid'
        }
      });

      if (currentDeliveries.length >= 3) {
        usedRadius = radius;

        // V20.1: Filter by fuelType
        previousDeliveries = await CommunityDelivery.findAll({
          where: {
            zipPrefix: { [Op.in]: nearbyPrefixes },
            fuelType,  // V20.1: Only include matching fuel type
            deliveryMonth: previousMonth,
            validationStatus: 'valid'
          }
        });
        break;
      }

      usedRadius = radius;
    }

    const currentPrices = currentDeliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
    const previousPrices = previousDeliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);

    // Need at least 3 in current month for any trend
    if (currentPrices.length < 3) {
      const response = {
        hasTrend: false,
        zipCode,
        fuelType,  // V20.1: Include fuel type
        radiusMiles: usedRadius,
        confidence: 'insufficient',
        recentDeliveryCount: currentPrices.length,
        signal: 'insufficient_data',
        buyTimingImpact: {
          direction: 'neutral',
          weight: 0,
          reason: 'Not enough data for trend'
        }
      };

      if (currentPrices.length > 0) {
        response.displayOnly = {
          show: true,
          message: `${currentPrices.length} neighbors paid ~$${currentPrices[Math.floor(currentPrices.length / 2)].toFixed(2)} this month`
        };
      }

      cache.set(cacheKey, response, 300);
      return res.json(response);
    }

    const currentMedian = currentPrices[Math.floor(currentPrices.length / 2)];

    // Calculate trend if we have previous month data
    let changePercent = null;
    let previousMedian = null;
    let signal = 'stable';
    let hasEnoughHistory = false;

    if (previousPrices.length >= 3) {
      previousMedian = previousPrices[Math.floor(previousPrices.length / 2)];
      changePercent = ((currentMedian - previousMedian) / previousMedian) * 100;
      hasEnoughHistory = true;

      if (changePercent <= -3) {
        signal = 'prices_falling';
      } else if (changePercent >= 3) {
        signal = 'prices_rising';
      }
    }

    // Determine confidence
    const uniqueContributors = new Set(currentDeliveries.map(d => d.contributorHash)).size;
    let confidence;
    if (currentPrices.length >= 10 && uniqueContributors >= 5) {
      confidence = 'high';
    } else if (currentPrices.length >= 5 && uniqueContributors >= 3) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Calculate Buy Meter impact
    let buyTimingWeight = 0;
    let buyTimingDirection = 'neutral';
    let buyTimingReason = '';

    if (confidence === 'high' && hasEnoughHistory) {
      if (signal === 'prices_falling') {
        buyTimingWeight = 0.15;
        buyTimingDirection = 'positive';
        buyTimingReason = `Community prices down ${Math.abs(changePercent).toFixed(0)}% this month`;
      } else if (signal === 'prices_rising') {
        buyTimingWeight = -0.15;
        buyTimingDirection = 'negative';
        buyTimingReason = `Community prices up ${changePercent.toFixed(0)}% this month`;
      }
    } else if (confidence === 'medium' && hasEnoughHistory) {
      if (signal === 'prices_falling') {
        buyTimingWeight = 0.10;
        buyTimingDirection = 'positive';
        buyTimingReason = `Community prices down ${Math.abs(changePercent).toFixed(0)}% this month`;
      } else if (signal === 'prices_rising') {
        buyTimingWeight = -0.10;
        buyTimingDirection = 'negative';
        buyTimingReason = `Community prices up ${changePercent.toFixed(0)}% this month`;
      }
    }

    const response = {
      hasTrend: true,
      zipCode,
      fuelType,  // V20.1: Include fuel type
      radiusMiles: usedRadius,
      confidence,
      currentMonthMedian: currentMedian,
      previousMonthMedian: previousMedian,
      changePercent: changePercent ? Math.round(changePercent * 10) / 10 : null,
      recentDeliveryCount: currentPrices.length,
      signal,
      buyTimingImpact: {
        direction: buyTimingDirection,
        weight: buyTimingWeight,
        reason: buyTimingReason || 'Stable community prices'
      }
    };

    if (confidence === 'low') {
      response.displayOnly = {
        show: true,
        message: `${currentPrices.length} neighbors paid ~$${currentMedian.toFixed(2)} this month`
      };
    }

    // Add radius description
    // V18.6.1: Language refined - trends can go to 30mi for directional signals
    if (usedRadius <= 10) {
      response.radiusDescription = 'Your immediate neighborhood';
    } else if (usedRadius <= 15) {
      response.radiusDescription = 'Your local area';
    } else if (usedRadius <= 20) {
      response.radiusDescription = 'Wider local area';
    } else {
      // 30mi for trends only
      response.radiusDescription = 'Surrounding area';
    }

    cache.set(cacheKey, response, 300);
    logger.info(`[V20.1] Distance trend served: ZIP ${zipCode}, ${fuelType}, ${usedRadius}mi radius, ${confidence} confidence, signal ${signal}`);

    res.json(response);

  } catch (error) {
    logger.error('[V18.6] Distance-based trend error:', error);
    res.status(500).json({
      hasTrend: false,
      message: 'Failed to fetch community trend'
    });
  }
});

// ============================================================================
// V19.0.5b: ADMIN - Deduplicate existing data (one-time cleanup)
// ============================================================================

// V19.0.5b: Debug - view all deliveries
router.get('/admin/deliveries', async (req, res) => {
  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({ error: 'Service unavailable' });
    }

    const deliveries = await CommunityDelivery.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({
      count: deliveries.length,
      deliveries: deliveries.map(d => ({
        id: d.id,
        zipPrefix: d.zipPrefix,
        fullZipCode: d.fullZipCode,
        pricePerGallon: d.pricePerGallon,
        deliveryMonth: d.deliveryMonth,
        gallonsBucket: d.gallonsBucket,
        contributorHash: d.contributorHash ? d.contributorHash.substring(0, 8) + '...' : null,
        validationStatus: d.validationStatus,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// V19.0.5b: Delete all test data
router.delete('/admin/deliveries', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({ error: 'Service unavailable' });
    }

    const count = await CommunityDelivery.count();
    await CommunityDelivery.destroy({ where: {}, truncate: true });

    // Clear cache
    const cache = req.app.locals.cache;
    cache.flushAll();

    logger.info(`[V19.0.5b] Deleted all ${count} deliveries`);

    res.json({
      success: true,
      deletedCount: count
    });

  } catch (error) {
    logger.error('[V19.0.5b] Delete all error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

router.post('/admin/deduplicate', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const CommunityDelivery = getCommunityDeliveryModel();
    if (!CommunityDelivery) {
      return res.status(503).json({ error: 'Service unavailable' });
    }

    // Find all deliveries grouped by zipPrefix + deliveryMonth + pricePerGallon + gallonsBucket
    const allDeliveries = await CommunityDelivery.findAll({
      order: [['createdAt', 'ASC']]  // Keep oldest, delete newer duplicates
    });

    const seen = new Map();  // key -> first delivery id
    const toDelete = [];

    for (const delivery of allDeliveries) {
      const key = `${delivery.zipPrefix}|${delivery.deliveryMonth}|${delivery.pricePerGallon}|${delivery.gallonsBucket}`;

      if (seen.has(key)) {
        // This is a duplicate - mark for deletion
        toDelete.push(delivery.id);
      } else {
        seen.set(key, delivery.id);
      }
    }

    // Delete duplicates
    if (toDelete.length > 0) {
      await CommunityDelivery.destroy({
        where: { id: { [Op.in]: toDelete } }
      });
    }

    // Clear cache
    const cache = req.app.locals.cache;
    cache.flushAll();

    logger.info(`[V19.0.5b] Deduplication complete: removed ${toDelete.length} duplicates`);

    res.json({
      success: true,
      duplicatesRemoved: toDelete.length,
      remainingDeliveries: allDeliveries.length - toDelete.length
    });

  } catch (error) {
    logger.error('[V19.0.5b] Deduplication error:', error);
    res.status(500).json({ error: 'Deduplication failed' });
  }
});

module.exports = router;