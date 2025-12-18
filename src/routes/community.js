// src/routes/community.js - Privacy-Compliant Community Supplier API
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const router = express.Router();

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

module.exports = router;