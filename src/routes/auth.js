// src/routes/auth.js - Anonymous Authentication & User Management
const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage for anonymous users (replace with database in production)
let anonymousUsers = new Map();
let deviceRegistrations = new Map();

// Admin configuration - secure bootstrap
const ADMIN_EMAILS = [
  process.env.ADMIN_EMAIL || 'admin@smartheat.app', // Set via environment variable
  process.env.ADMIN_EMAIL_2 || null, // Optional second admin
  // Add additional admin emails here
].filter(Boolean); // Remove null values

const isAdminEmail = (email) => {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

const getInitialRole = (email) => {
  const cleanEmail = email.toLowerCase().trim();
  
  // First admin becomes super admin
  if (ADMIN_EMAILS[0] === cleanEmail) {
    return 'super_admin';
  }
  
  // Other configured emails become regular admins
  if (ADMIN_EMAILS.includes(cleanEmail)) {
    return 'admin';
  }
  
  return 'customer';
};

// Validation middleware
const validateDeviceRegistration = [
  body('deviceId').isLength({ min: 10, max: 100 }).withMessage('Device ID must be 10-100 characters'),
  body('deviceModel').optional().isLength({ max: 50 }).withMessage('Device model too long'),
  body('osVersion').optional().isLength({ max: 20 }).withMessage('OS version too long'),
  body('appVersion').isLength({ min: 1, max: 10 }).withMessage('App version required'),
  body('userConsent').equals('true').withMessage('User consent required')
];

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

// Middleware to verify JWT tokens
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!req.user.role || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

// Super admin authorization middleware
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!req.user.role || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  next();
};

// POST /api/auth/register - Register anonymous user device
router.post('/register', validateDeviceRegistration, handleValidationErrors, (req, res) => {
  try {
    const {
      deviceId,
      deviceModel,
      osVersion,
      appVersion,
      userConsent
    } = req.body;
    
    const logger = req.app.locals.logger;
    
    // Verify user consent
    if (userConsent !== 'true') {
      return res.status(403).json({
        error: 'Consent required',
        message: 'Device registration requires user consent'
      });
    }
    
    // Check if device is already registered
    if (deviceRegistrations.has(deviceId)) {
      const existingDevice = deviceRegistrations.get(deviceId);
      
      // Update existing registration
      existingDevice.lastSeen = new Date().toISOString();
      existingDevice.appVersion = appVersion;
      deviceRegistrations.set(deviceId, existingDevice);
      
      // Generate new token for existing user
      const token = jwt.sign(
        { 
          userId: existingDevice.userId,
          deviceId: deviceId,
          type: 'anonymous'
        },
        process.env.JWT_SECRET,
        { expiresIn: '90d' }
      );
      
      logger.info(`🔄 Device re-registered: ${deviceId.substring(0, 8)}...`);
      
      return res.json({
        success: true,
        message: 'Device re-registered successfully',
        token,
        userId: existingDevice.userId,
        expiresIn: '90 days'
      });
    }
    
    // Create new anonymous user
    const userId = uuidv4();
    const anonymousUser = {
      id: userId,
      type: 'anonymous',
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      deviceCount: 1,
      privacySettings: {
        analyticsConsent: true,
        communityConsent: false,
        marketDataConsent: true
      }
    };
    
    // Register device
    const deviceRegistration = {
      deviceId,
      userId,
      deviceModel: deviceModel || 'unknown',
      osVersion: osVersion || 'unknown',
      appVersion,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isActive: true
    };
    
    // Store registrations
    anonymousUsers.set(userId, anonymousUser);
    deviceRegistrations.set(deviceId, deviceRegistration);
    
    // Generate JWT token
    const token = jwt.sign(
      {
        userId,
        deviceId,
        type: 'anonymous'
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );
    
    logger.info(`✅ New anonymous user registered: ${userId.substring(0, 8)}... Device: ${deviceId.substring(0, 8)}...`);
    
    res.status(201).json({
      success: true,
      message: 'Anonymous user registered successfully',
      token,
      userId,
      expiresIn: '90 days',
      features: {
        communityAccess: true,
        marketIntelligence: true,
        analytics: true,
        dataExport: true
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('User registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

// POST /api/auth/verify - Verify and refresh token
router.post('/verify', verifyToken, (req, res) => {
  try {
    const { userId, deviceId } = req.user;
    const logger = req.app.locals.logger;
    
    // Check if user exists
    const user = anonymousUsers.get(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Anonymous user record not found'
      });
    }
    
    // Update last active
    user.lastActive = new Date().toISOString();
    anonymousUsers.set(userId, user);
    
    // Update device last seen
    if (deviceRegistrations.has(deviceId)) {
      const device = deviceRegistrations.get(deviceId);
      device.lastSeen = new Date().toISOString();
      deviceRegistrations.set(deviceId, device);
    }
    
    logger.info(`🔍 Token verified for user: ${userId.substring(0, 8)}...`);
    
    res.json({
      valid: true,
      userId,
      deviceId,
      userType: 'anonymous',
      features: {
        communityAccess: true,
        marketIntelligence: true,
        analytics: true,
        dataExport: true
      },
      privacySettings: user.privacySettings
    });
    
  } catch (error) {
    req.app.locals.logger.error('Token verification error:', error);
    res.status(500).json({
      error: 'Verification failed',
      message: error.message
    });
  }
});

// POST /api/auth/privacy-settings - Update privacy settings
router.post('/privacy-settings', [
  verifyToken,
  body('analyticsConsent').isBoolean().withMessage('Analytics consent must be boolean'),
  body('communityConsent').isBoolean().withMessage('Community consent must be boolean'),
  body('marketDataConsent').isBoolean().withMessage('Market data consent must be boolean')
], handleValidationErrors, (req, res) => {
  try {
    const { userId } = req.user;
    const { analyticsConsent, communityConsent, marketDataConsent } = req.body;
    const logger = req.app.locals.logger;
    
    const user = anonymousUsers.get(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    // Update privacy settings
    user.privacySettings = {
      analyticsConsent,
      communityConsent,
      marketDataConsent
    };
    user.lastActive = new Date().toISOString();
    
    anonymousUsers.set(userId, user);
    
    logger.info(`🔒 Privacy settings updated for user: ${userId.substring(0, 8)}...`);
    
    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      settings: user.privacySettings
    });
    
  } catch (error) {
    req.app.locals.logger.error('Privacy settings update error:', error);
    res.status(500).json({
      error: 'Failed to update privacy settings',
      message: error.message
    });
  }
});

// DELETE /api/auth/account - Delete anonymous user account
router.delete('/account', verifyToken, (req, res) => {
  try {
    const { userId, deviceId } = req.user;
    const logger = req.app.locals.logger;
    
    // Remove user data
    anonymousUsers.delete(userId);
    
    // Remove device registrations for this user
    for (const [id, device] of deviceRegistrations.entries()) {
      if (device.userId === userId) {
        deviceRegistrations.delete(id);
      }
    }
    
    logger.info(`🗑️ Anonymous user account deleted: ${userId.substring(0, 8)}...`);
    
    res.json({
      success: true,
      message: 'Anonymous user account deleted successfully'
    });
    
  } catch (error) {
    req.app.locals.logger.error('Account deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete account',
      message: error.message
    });
  }
});

// GET /api/auth/stats - Get authentication statistics (admin only)
router.get('/stats', (req, res) => {
  try {
    // Simple admin check via IP or header (improve in production)
    const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let activeUsers24h = 0;
    let activeUsers7d = 0;
    let totalUsers = anonymousUsers.size;
    
    for (const user of anonymousUsers.values()) {
      const lastActive = new Date(user.lastActive);
      if (lastActive > last24h) activeUsers24h++;
      if (lastActive > last7d) activeUsers7d++;
    }
    
    let activeDevices = 0;
    for (const device of deviceRegistrations.values()) {
      const lastSeen = new Date(device.lastSeen);
      if (lastSeen > last24h) activeDevices++;
    }
    
    res.json({
      users: {
        total: totalUsers,
        active24h: activeUsers24h,
        active7d: activeUsers7d
      },
      devices: {
        total: deviceRegistrations.size,
        active24h: activeDevices
      },
      privacy: {
        analyticsOptIn: Array.from(anonymousUsers.values()).filter(u => u.privacySettings.analyticsConsent).length,
        communityOptIn: Array.from(anonymousUsers.values()).filter(u => u.privacySettings.communityConsent).length,
        marketDataOptIn: Array.from(anonymousUsers.values()).filter(u => u.privacySettings.marketDataConsent).length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    req.app.locals.logger.error('Auth stats error:', error);
    res.status(500).json({
      error: 'Failed to get authentication statistics',
      message: error.message
    });
  }
});

// Cleanup inactive users (run periodically)
const cleanupInactiveUsers = () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 180); // 6 months
  
  let deletedUsers = 0;
  let deletedDevices = 0;
  
  for (const [userId, user] of anonymousUsers.entries()) {
    const lastActive = new Date(user.lastActive);
    if (lastActive < cutoffDate) {
      anonymousUsers.delete(userId);
      deletedUsers++;
      
      // Delete associated devices
      for (const [deviceId, device] of deviceRegistrations.entries()) {
        if (device.userId === userId) {
          deviceRegistrations.delete(deviceId);
          deletedDevices++;
        }
      }
    }
  }
  
  if (deletedUsers > 0) {
    // Cleanup will be logged by the main application logger if needed
  }
};

// Run cleanup every 24 hours
setInterval(cleanupInactiveUsers, 24 * 60 * 60 * 1000);

// POST /api/auth/admin-login - Admin email-based authentication
router.post('/admin-login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('deviceId').isLength({ min: 10, max: 100 }).withMessage('Device ID required'),
  body('appVersion').isLength({ min: 1, max: 10 }).withMessage('App version required')
], handleValidationErrors, (req, res) => {
  try {
    const { email, deviceId, appVersion } = req.body;
    const logger = req.app.locals.logger;
    
    // Check if email is authorized admin
    if (!isAdminEmail(email)) {
      logger.warn(`🚫 Unauthorized admin login attempt: ${email}`);
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Email not authorized for admin access'
      });
    }
    
    const role = getInitialRole(email);
    const userId = uuidv4();
    
    // Create admin user record
    const adminUser = {
      id: userId,
      email: email.toLowerCase().trim(),
      role: role,
      type: 'admin',
      isActive: true,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      deviceCount: 1,
      privacySettings: {
        analyticsConsent: true,
        communityConsent: true,
        marketDataConsent: true
      }
    };
    
    // Register admin device
    const deviceRegistration = {
      deviceId,
      userId,
      deviceModel: 'Admin Device',
      osVersion: 'iOS',
      appVersion,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isActive: true,
      isAdminDevice: true
    };
    
    // Store registrations
    anonymousUsers.set(userId, adminUser);
    deviceRegistrations.set(deviceId, deviceRegistration);
    
    // Generate JWT token with admin role
    const token = jwt.sign(
      {
        userId,
        email: email.toLowerCase().trim(),
        role,
        deviceId,
        type: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } // Shorter expiry for admin tokens
    );
    
    logger.info(`🔑 Admin login successful: ${email} (${role}) - Device: ${deviceId.substring(0, 8)}...`);
    
    res.status(200).json({
      success: true,
      message: 'Admin authentication successful',
      token,
      userId,
      email: email.toLowerCase().trim(),
      role,
      expiresIn: '30 days',
      permissions: {
        manageSupplierRequests: true,
        viewAnalytics: true,
        manageUsers: role === 'super_admin',
        systemSettings: role === 'super_admin'
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin login error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
});

// GET /api/auth/admin/profile - Get admin profile
router.get('/admin/profile', verifyToken, requireAdmin, (req, res) => {
  try {
    const { userId, email, role } = req.user;
    const logger = req.app.locals.logger;
    
    const user = anonymousUsers.get(userId);
    if (!user) {
      return res.status(404).json({
        error: 'Admin user not found'
      });
    }
    
    logger.info(`📋 Admin profile accessed: ${email}`);
    
    res.json({
      userId,
      email,
      role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
      lastLoginAt: user.lastLoginAt,
      permissions: {
        manageSupplierRequests: true,
        viewAnalytics: true,
        manageUsers: role === 'super_admin',
        systemSettings: role === 'super_admin'
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin profile error:', error);
    res.status(500).json({
      error: 'Failed to get admin profile',
      message: error.message
    });
  }
});

module.exports = router;