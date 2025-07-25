// src/routes/admin.js - Admin Management API
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { initDatabase, DataPersistence } = require('../models/database');

// Initialize persistence layer
let dataPersistence;

// Initialize database models and persistence layer
const initializeAdmin = (sequelize) => {
  const models = initDatabase(sequelize);
  dataPersistence = new DataPersistence(models);
  return dataPersistence;
};

// Middleware to ensure persistence is initialized
const ensurePersistence = (req, res, next) => {
  if (!dataPersistence) {
    // Initialize with sequelize from app.locals if available
    dataPersistence = new DataPersistence(req.app.locals.sequelize ? initDatabase(req.app.locals.sequelize) : null);
  }
  req.dataPersistence = dataPersistence;
  next();
};

// Validation middleware
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

// Audit logging function
const logAdminAction = async (req, adminId, adminEmail, action, targetId, targetType, details, metadata = {}) => {
  const auditLog = {
    id: uuidv4(),
    adminUserId: adminId,
    adminEmail: adminEmail,
    action: action,
    targetId: targetId,
    targetType: targetType,
    details: details,
    metadata: metadata,
    severity: getSeverity(action),
    isSuccess: true,
    ipAddress: req.ip || metadata.ipAddress || 'unknown',
    userAgent: req.get('User-Agent') || metadata.userAgent || 'unknown'
  };
  
  try {
    await req.dataPersistence.createAuditLog(auditLog);
  } catch (error) {
    console.error('Failed to log admin action:', error.message);
  }
};

const getSeverity = (action) => {
  const highSeverityActions = ['approve_supplier', 'promote_user', 'export_data'];
  const criticalSeverityActions = ['reject_supplier', 'demote_user', 'deactivate_user'];
  
  if (criticalSeverityActions.includes(action)) return 'critical';
  if (highSeverityActions.includes(action)) return 'high';
  if (action.includes('view') || action.includes('send')) return 'low';
  return 'medium';
};

// POST /api/admin/supplier-requests - Submit supplier registration request
router.post('/supplier-requests', ensurePersistence, [
  body('companyName').isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters'),
  body('email').isEmail().withMessage('Valid email required'),
  body('primaryPhone').optional().matches(/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/).withMessage('Valid phone number required'),
  body('city').optional().isLength({ max: 50 }).withMessage('City too long'),
  body('state').optional().isLength({ max: 2 }).withMessage('State must be 2 characters'),
  body('servicesOffered').isArray().withMessage('Services must be an array'),
  body('serviceRadius').optional().isInt({ min: 1, max: 500 }).withMessage('Service radius must be 1-500 miles')
], handleValidationErrors, (req, res) => {
  try {
    const {
      companyName,
      contactPerson,
      primaryPhone,
      secondaryPhone,
      email,
      website,
      address,
      city,
      state,
      zipCode,
      businessLicense,
      servicesOffered,
      serviceRadius,
      yearsInBusiness,
      insuranceInfo,
      notes
    } = req.body;
    
    const logger = req.app.locals.logger;
    const deviceId = req.headers['x-device-id'] || 'unknown';
    const appVersion = req.headers['x-app-version'] || 'unknown';
    const userIP = req.ip || req.connection.remoteAddress;
    
    // Check for duplicate submissions (same email within 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingRequests = await req.dataPersistence.getSupplierRequests({ limit: 1000 });
    const existingRequest = existingRequests.find(request => 
      request.email === email && new Date(request.createdAt) > last24Hours
    );
    
    if (existingRequest) {
      return res.status(429).json({
        error: 'Duplicate request',
        message: 'A registration request from this email was already submitted in the last 24 hours'
      });
    }
    
    // Create supplier registration request
    const supplierRequest = {
      companyName: companyName.trim(),
      contactPerson: contactPerson?.trim(),
      primaryPhone: primaryPhone?.trim(),
      secondaryPhone: secondaryPhone?.trim(),
      email: email.toLowerCase().trim(),
      website: website?.trim(),
      address: address?.trim(),
      city: city?.trim(),
      state: state?.toUpperCase().trim(),
      zipCode: zipCode?.trim(),
      businessLicense: businessLicense?.trim(),
      servicesOffered: servicesOffered || [],
      serviceRadius: serviceRadius,
      yearsInBusiness: yearsInBusiness,
      insuranceInfo: insuranceInfo?.trim(),
      notes: notes?.trim(),
      deviceId: deviceId,
      submitterIP: userIP,
      appVersion: appVersion
    };
    
    const savedRequest = await req.dataPersistence.createSupplierRequest(supplierRequest);
    
    logger.info(`📝 New supplier registration: ${companyName} (${email}) - ID: ${savedRequest.id.substring(0, 8)}...`);
    
    // TODO: Send push notification to admin users
    // TODO: Send email notification to admin users
    
    res.status(201).json({
      success: true,
      message: 'Supplier registration request submitted successfully',
      requestId: savedRequest.id,
      status: 'pending',
      estimatedReviewTime: '1-3 business days'
    });
    
  } catch (error) {
    req.app.locals.logger.error('Supplier request submission error:', error);
    res.status(500).json({
      error: 'Failed to submit registration request',
      message: error.message
    });
  }
});

// GET /api/admin/supplier-requests - Get all supplier registration requests (Admin only)
router.get('/supplier-requests', [
  verifyToken,
  requireAdmin,
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'reviewing']).withMessage('Invalid status'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0')
], handleValidationErrors, (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    let requests = Array.from(supplierRequests.values());
    
    // Filter by status if provided
    if (status) {
      requests = requests.filter(request => request.status === status);
    }
    
    // Sort by submission date (newest first)
    requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
    // Apply pagination
    const totalCount = requests.length;
    const paginatedRequests = requests.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    // Add computed fields
    const enrichedRequests = paginatedRequests.map(request => ({
      ...request,
      daysSinceSubmission: Math.floor((Date.now() - new Date(request.submittedAt)) / (1000 * 60 * 60 * 24)),
      isOverdue: Math.floor((Date.now() - new Date(request.submittedAt)) / (1000 * 60 * 60 * 24)) > 2
    }));
    
    // Log admin action
    logAdminAction(
      userId,
      adminEmail,
      'view_pending_requests',
      null,
      'supplier_requests',
      `Viewed ${totalCount} supplier requests`,
      { status, totalCount, returnedCount: paginatedRequests.length }
    );
    
    logger.info(`👀 Admin ${adminEmail} viewed supplier requests: ${totalCount} total, ${paginatedRequests.length} returned`);
    
    res.json({
      success: true,
      data: enrichedRequests,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount
      },
      summary: {
        totalRequests: totalCount,
        pendingCount: requests.filter(r => r.status === 'pending').length,
        reviewingCount: requests.filter(r => r.status === 'reviewing').length,
        overdueCount: requests.filter(r => {
          const days = Math.floor((Date.now() - new Date(r.submittedAt)) / (1000 * 60 * 60 * 24));
          return r.status === 'pending' && days > 2;
        }).length
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin supplier requests error:', error);
    res.status(500).json({
      error: 'Failed to get supplier requests',
      message: error.message
    });
  }
});

// PUT /api/admin/supplier-requests/:id/approve - Approve supplier registration (Admin only)
router.put('/supplier-requests/:id/approve', [
  verifyToken,
  requireAdmin,
  body('adminNotes').optional().isLength({ max: 500 }).withMessage('Admin notes too long')
], handleValidationErrors, (req, res) => {
  try {
    const requestId = req.params.id;
    const { adminNotes } = req.body;
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    const supplierRequest = supplierRequests.get(requestId);
    if (!supplierRequest) {
      return res.status(404).json({
        error: 'Supplier request not found'
      });
    }
    
    if (supplierRequest.status !== 'pending' && supplierRequest.status !== 'reviewing') {
      return res.status(400).json({
        error: 'Invalid request status',
        message: 'Only pending or reviewing requests can be approved'
      });
    }
    
    // Update request status
    supplierRequest.status = 'approved';
    supplierRequest.reviewedAt = new Date().toISOString();
    supplierRequest.reviewedBy = userId;
    supplierRequest.adminNotes = adminNotes;
    
    supplierRequests.set(requestId, supplierRequest);
    
    // Log admin action
    logAdminAction(
      userId,
      adminEmail,
      'approve_supplier',
      requestId,
      'supplier_request',
      `Approved supplier: ${supplierRequest.companyName}`,
      { companyName: supplierRequest.companyName, email: supplierRequest.email, adminNotes }
    );
    
    logger.info(`✅ Admin ${adminEmail} approved supplier: ${supplierRequest.companyName} (${supplierRequest.email})`);
    
    // TODO: Send approval email to supplier
    // TODO: Add supplier to community database
    // TODO: Send push notification to supplier if they have the app
    
    res.json({
      success: true,
      message: 'Supplier registration approved successfully',
      request: supplierRequest
    });
    
  } catch (error) {
    req.app.locals.logger.error('Supplier approval error:', error);
    res.status(500).json({
      error: 'Failed to approve supplier request',
      message: error.message
    });
  }
});

// PUT /api/admin/supplier-requests/:id/reject - Reject supplier registration (Admin only)
router.put('/supplier-requests/:id/reject', [
  verifyToken,
  requireAdmin,
  body('rejectionReason').isLength({ min: 10, max: 200 }).withMessage('Rejection reason must be 10-200 characters'),
  body('adminNotes').optional().isLength({ max: 500 }).withMessage('Admin notes too long')
], handleValidationErrors, (req, res) => {
  try {
    const requestId = req.params.id;
    const { rejectionReason, adminNotes } = req.body;
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    const supplierRequest = supplierRequests.get(requestId);
    if (!supplierRequest) {
      return res.status(404).json({
        error: 'Supplier request not found'
      });
    }
    
    if (supplierRequest.status !== 'pending' && supplierRequest.status !== 'reviewing') {
      return res.status(400).json({
        error: 'Invalid request status',
        message: 'Only pending or reviewing requests can be rejected'
      });
    }
    
    // Update request status
    supplierRequest.status = 'rejected';
    supplierRequest.reviewedAt = new Date().toISOString();
    supplierRequest.reviewedBy = userId;
    supplierRequest.rejectionReason = rejectionReason;
    supplierRequest.adminNotes = adminNotes;
    
    supplierRequests.set(requestId, supplierRequest);
    
    // Log admin action
    logAdminAction(
      userId,
      adminEmail,
      'reject_supplier',
      requestId,
      'supplier_request',
      `Rejected supplier: ${supplierRequest.companyName} - Reason: ${rejectionReason}`,
      { companyName: supplierRequest.companyName, email: supplierRequest.email, rejectionReason, adminNotes }
    );
    
    logger.info(`❌ Admin ${adminEmail} rejected supplier: ${supplierRequest.companyName} (${supplierRequest.email}) - ${rejectionReason}`);
    
    // TODO: Send rejection email to supplier with reason
    
    res.json({
      success: true,
      message: 'Supplier registration rejected',
      request: supplierRequest
    });
    
  } catch (error) {
    req.app.locals.logger.error('Supplier rejection error:', error);
    res.status(500).json({
      error: 'Failed to reject supplier request',
      message: error.message
    });
  }
});

// GET /api/admin/audit-logs - Get admin audit logs (Admin only)
router.get('/audit-logs', [
  verifyToken,
  requireAdmin,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
  query('action').optional().isString().withMessage('Action must be string'),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity')
], handleValidationErrors, (req, res) => {
  try {
    const { limit = 50, offset = 0, action, severity } = req.query;
    const { userId, email: adminEmail } = req.user;
    
    let logs = Array.from(auditLogs.values());
    
    // Filter by action if provided
    if (action) {
      logs = logs.filter(log => log.action.includes(action));
    }
    
    // Filter by severity if provided
    if (severity) {
      logs = logs.filter(log => log.severity === severity);
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply pagination
    const totalCount = logs.length;
    const paginatedLogs = logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    // Add relative timestamps
    const enrichedLogs = paginatedLogs.map(log => ({
      ...log,
      timeAgo: getTimeAgo(new Date(log.timestamp))
    }));
    
    res.json({
      success: true,
      data: enrichedLogs,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Audit logs error:', error);
    res.status(500).json({
      error: 'Failed to get audit logs',
      message: error.message
    });
  }
});

// GET /api/admin/dashboard - Get admin dashboard data (Admin only)
router.get('/dashboard', verifyToken, requireAdmin, (req, res) => {
  try {
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const allRequests = Array.from(supplierRequests.values());
    const recentRequests = allRequests.filter(r => new Date(r.submittedAt) > last24h);
    const weeklyRequests = allRequests.filter(r => new Date(r.submittedAt) > last7d);
    
    const dashboard = {
      supplierRequests: {
        total: allRequests.length,
        pending: allRequests.filter(r => r.status === 'pending').length,
        reviewing: allRequests.filter(r => r.status === 'reviewing').length,
        approved: allRequests.filter(r => r.status === 'approved').length,
        rejected: allRequests.filter(r => r.status === 'rejected').length,
        overdue: allRequests.filter(r => {
          const days = Math.floor((Date.now() - new Date(r.submittedAt)) / (1000 * 60 * 60 * 24));
          return r.status === 'pending' && days > 2;
        }).length,
        recent24h: recentRequests.length,
        recent7d: weeklyRequests.length
      },
      activity: {
        totalAuditLogs: auditLogs.size,
        recentActions: Array.from(auditLogs.values())
          .filter(log => new Date(log.timestamp) > last24h)
          .length,
        criticalActions: Array.from(auditLogs.values())
          .filter(log => log.severity === 'critical' && new Date(log.timestamp) > last7d)
          .length
      },
      recentRequests: allRequests
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .slice(0, 5)
        .map(request => ({
          id: request.id,
          companyName: request.companyName,
          email: request.email,
          status: request.status,
          submittedAt: request.submittedAt,
          daysSinceSubmission: Math.floor((Date.now() - new Date(request.submittedAt)) / (1000 * 60 * 60 * 24)),
          isOverdue: Math.floor((Date.now() - new Date(request.submittedAt)) / (1000 * 60 * 60 * 24)) > 2
        }))
    };
    
    // Log dashboard access
    logAdminAction(
      userId,
      adminEmail,
      'view_dashboard',
      null,
      'admin_dashboard',
      'Accessed admin dashboard',
      { requestCount: allRequests.length, pendingCount: dashboard.supplierRequests.pending }
    );
    
    logger.info(`📊 Admin ${adminEmail} accessed dashboard`);
    
    res.json({
      success: true,
      data: dashboard,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard data',
      message: error.message
    });
  }
});

// Helper function for relative time
const getTimeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  return `${Math.floor(diffInSeconds / 86400)} days ago`;
};

module.exports = router;