// src/routes/admin.js - Admin Management API
const express = require('express');
const { body, param, validationResult, query } = require('express-validator');
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
], handleValidationErrors, async (req, res) => {
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
  ensurePersistence,
  verifyToken,
  requireAdmin,
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'reviewing']).withMessage('Invalid status'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0')
], handleValidationErrors, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    // Get requests from database/memory
    const requests = await req.dataPersistence.getSupplierRequests({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    // Get total count for pagination
    const allRequests = await req.dataPersistence.getSupplierRequests({ limit: 1000 });
    const totalCount = status ? allRequests.filter(r => r.status === status).length : allRequests.length;
    
    // Add computed fields
    const enrichedRequests = requests.map(request => ({
      ...request,
      daysSinceSubmission: Math.floor((Date.now() - new Date(request.createdAt || request.submittedAt)) / (1000 * 60 * 60 * 24)),
      isOverdue: Math.floor((Date.now() - new Date(request.createdAt || request.submittedAt)) / (1000 * 60 * 60 * 24)) > 2
    }));
    
    // Log admin action
    await logAdminAction(
      req,
      userId,
      adminEmail,
      'view_pending_requests',
      null,
      'supplier_requests',
      `Viewed ${totalCount} supplier requests`,
      { status, totalCount, returnedCount: requests.length }
    );
    
    logger.info(`👀 Admin ${adminEmail} viewed supplier requests: ${totalCount} total, ${requests.length} returned`);
    
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
  ensurePersistence,  
  verifyToken,
  requireAdmin,
  body('adminNotes').optional().isLength({ max: 500 }).withMessage('Admin notes too long')
], handleValidationErrors, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { adminNotes } = req.body;
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    // Get the request from database/memory
    const allRequests = await req.dataPersistence.getSupplierRequests({ limit: 1000 });
    const supplierRequest = allRequests.find(r => r.id === requestId);
    
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
    const updatedRequest = await req.dataPersistence.updateSupplierRequest(requestId, {
      status: 'approved',
      reviewedAt: new Date(),
      reviewedBy: userId,
      adminNotes: adminNotes
    });
    
    if (!updatedRequest) {
      return res.status(500).json({
        error: 'Failed to update supplier request'
      });
    }
    
    // Log admin action
    await logAdminAction(
      req,
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
      request: updatedRequest
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
  ensurePersistence,
  verifyToken,
  requireAdmin,
  body('rejectionReason').isLength({ min: 10, max: 200 }).withMessage('Rejection reason must be 10-200 characters'),
  body('adminNotes').optional().isLength({ max: 500 }).withMessage('Admin notes too long')
], handleValidationErrors, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { rejectionReason, adminNotes } = req.body;
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    // Get the request from database/memory
    const allRequests = await req.dataPersistence.getSupplierRequests({ limit: 1000 });
    const supplierRequest = allRequests.find(r => r.id === requestId);
    
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
    const updatedRequest = await req.dataPersistence.updateSupplierRequest(requestId, {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: userId,
      rejectionReason: rejectionReason,
      adminNotes: adminNotes
    });
    
    if (!updatedRequest) {
      return res.status(500).json({
        error: 'Failed to update supplier request'
      });
    }
    
    // Log admin action
    await logAdminAction(
      req,
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
      request: updatedRequest
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
  ensurePersistence,
  verifyToken,
  requireAdmin,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
  query('action').optional().isString().withMessage('Action must be string'),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity')
], handleValidationErrors, async (req, res) => {
  try {
    const { limit = 50, offset = 0, action, severity } = req.query;
    const { userId, email: adminEmail } = req.user;
    
    // Get logs from database/memory
    const logs = await req.dataPersistence.getAuditLogs({
      action,
      severity,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    // Get total count for pagination
    const allLogs = await req.dataPersistence.getAuditLogs({ limit: 1000 });
    const totalCount = allLogs.length;
    
    // Add relative timestamps
    const enrichedLogs = logs.map(log => ({
      ...log,
      timeAgo: getTimeAgo(new Date(log.createdAt || log.timestamp))
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
router.get('/dashboard', ensurePersistence, verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId, email: adminEmail } = req.user;
    const logger = req.app.locals.logger;
    
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get all requests from database/memory
    const allRequests = await req.dataPersistence.getSupplierRequests({ limit: 1000 });
    const recentRequests = allRequests.filter(r => new Date(r.createdAt || r.submittedAt) > last24h);
    const weeklyRequests = allRequests.filter(r => new Date(r.createdAt || r.submittedAt) > last7d);
    
    const dashboard = {
      supplierRequests: {
        total: allRequests.length,
        pending: allRequests.filter(r => r.status === 'pending').length,
        reviewing: allRequests.filter(r => r.status === 'reviewing').length,
        approved: allRequests.filter(r => r.status === 'approved').length,
        rejected: allRequests.filter(r => r.status === 'rejected').length,
        overdue: allRequests.filter(r => {
          const days = Math.floor((Date.now() - new Date(r.createdAt || r.submittedAt)) / (1000 * 60 * 60 * 24));
          return r.status === 'pending' && days > 2;
        }).length,
        recent24h: recentRequests.length,
        recent7d: weeklyRequests.length
      },
      activity: {
        totalAuditLogs: (await req.dataPersistence.getAuditLogs({ limit: 1000 })).length,
        recentActions: (await req.dataPersistence.getAuditLogs({ limit: 1000 }))
          .filter(log => new Date(log.createdAt || log.timestamp) > last24h)
          .length,
        criticalActions: (await req.dataPersistence.getAuditLogs({ severity: 'critical', limit: 1000 }))
          .filter(log => new Date(log.createdAt || log.timestamp) > last7d)
          .length
      },
      recentRequests: allRequests
        .sort((a, b) => new Date(b.createdAt || b.submittedAt) - new Date(a.createdAt || a.submittedAt))
        .slice(0, 5)
        .map(request => ({
          id: request.id,
          companyName: request.companyName,
          email: request.email,
          status: request.status,
          submittedAt: request.createdAt || request.submittedAt,
          daysSinceSubmission: Math.floor((Date.now() - new Date(request.createdAt || request.submittedAt)) / (1000 * 60 * 60 * 24)),
          isOverdue: Math.floor((Date.now() - new Date(request.createdAt || request.submittedAt)) / (1000 * 60 * 60 * 24)) > 2
        }))
    };
    
    // Log dashboard access
    await logAdminAction(
      req,
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

// GET /api/admin/health - Admin system health check
router.get('/health', ensurePersistence, verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId, email: adminEmail } = req.user;
    
    // Test database operations
    let dbStatus = 'unknown';
    let testResults = {};
    
    try {
      // Test supplier request creation and retrieval
      const testData = {
        companyName: 'Health Check Test',
        email: 'test@healthcheck.com',
        servicesOffered: ['test'],
        deviceId: 'health-check',
        submitterIP: req.ip
      };
      
      // This will test both database and memory fallback
      const testRequest = await req.dataPersistence.createSupplierRequest(testData);
      const retrievedRequests = await req.dataPersistence.getSupplierRequests({ limit: 1 });
      
      if (testRequest && retrievedRequests.length > 0) {
        dbStatus = req.dataPersistence.hasDatabase ? 'database' : 'memory';
      }
      
      testResults.persistence = 'working';
    } catch (error) {
      testResults.persistence = 'error';
      testResults.persistenceError = error.message;
    }
    
    // Test audit logging
    try {
      await logAdminAction(req, userId, adminEmail, 'health_check', null, 'admin_system', 'Admin health check performed');
      testResults.auditLog = 'working';
    } catch (error) {
      testResults.auditLog = 'error';
      testResults.auditError = error.message;
    }
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      adminSystem: {
        persistence: dbStatus,
        hasDatabase: req.dataPersistence.hasDatabase,
        authentication: 'working',
        authorization: 'working'
      },
      tests: testResults,
      admin: {
        userId,
        email: adminEmail,
        role: req.user.role
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin health check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Admin health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ===============================================
// COMMUNITY SUPPLIER MANAGEMENT ENDPOINTS  
// ===============================================

// GET /api/admin/community/suppliers - Get all community suppliers (Admin only)
router.get('/community/suppliers', [
  ensurePersistence,
  verifyToken,
  requireAdmin,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('search').optional().isString().withMessage('Search must be string'),
  query('city').optional().isString().withMessage('City must be string'),
  query('state').optional().isString().withMessage('State must be string')
], handleValidationErrors, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, city, state } = req.query;
    const { userId, email: adminEmail } = req.user;
    
    // Get community suppliers from persistence layer
    const communitySuppliers = await req.dataPersistence.getCommunitySuppliers({
      search,
      city,
      state,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    // Log admin action
    await logAdminAction(
      req,
      userId,
      adminEmail,
      'view_community_suppliers',
      null,
      'community_management',
      'Admin viewed community suppliers',
      { page, limit, search, city, state, count: communitySuppliers.data.length }
    );
    
    logger.info(`👤 Admin ${adminEmail} viewed community suppliers (page ${page}, ${communitySuppliers.data.length} results)`);
    
    res.json({
      success: true,
      suppliers: communitySuppliers.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: communitySuppliers.total,
        pages: Math.ceil(communitySuppliers.total / limit)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin view community suppliers error:', error);
    res.status(500).json({
      error: 'Failed to fetch community suppliers',
      message: error.message
    });
  }
});

// PUT /api/admin/community/suppliers/:id - Edit community supplier (Admin only)
router.put('/community/suppliers/:id', [
  ensurePersistence,
  verifyToken,
  requireAdmin,
  param('id').isUUID().withMessage('Invalid supplier ID'),
  body('companyName').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters'),
  body('city').optional().trim().isLength({ min: 2, max: 50 }).withMessage('City must be 2-50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primaryPhone').optional().matches(/^[\d\s\-\(\)\+\.]+$/).withMessage('Invalid phone format'),
  body('website').optional().isURL().withMessage('Invalid website URL'),
  body('servicesArea').optional().trim().isLength({ max: 200 }).withMessage('Services area too long'),
  body('isVerified').optional().isBoolean().withMessage('isVerified must be boolean'),
  body('adminNotes').optional().trim().isLength({ max: 500 }).withMessage('Admin notes too long')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email: adminEmail } = req.user;
    const updateData = req.body;
    
    // Get existing supplier
    const existingSupplier = await req.dataPersistence.getCommunitySupplierById(id);
    if (!existingSupplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Community supplier does not exist'
      });
    }
    
    // Update supplier
    const updatedSupplier = await req.dataPersistence.updateCommunitySupplier(id, {
      ...updateData,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: adminEmail
    });
    
    // Log admin action
    await logAdminAction(
      req,
      userId,
      adminEmail,
      'edit_community_supplier',
      id,
      'community_management',
      `Admin edited community supplier: ${existingSupplier.companyName}`,
      { 
        companyName: existingSupplier.companyName,
        changes: updateData,
        before: existingSupplier,
        after: updatedSupplier
      }
    );
    
    logger.info(`✏️ Admin ${adminEmail} edited community supplier: ${existingSupplier.companyName}`);
    
    res.json({
      success: true,
      message: 'Community supplier updated successfully',
      supplier: updatedSupplier
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin edit community supplier error:', error);
    res.status(500).json({
      error: 'Failed to update community supplier',
      message: error.message
    });
  }
});

// DELETE /api/admin/community/suppliers/:id - Remove community supplier (Admin only)
router.delete('/community/suppliers/:id', [
  ensurePersistence,
  verifyToken,
  requireAdmin,
  param('id').isUUID().withMessage('Invalid supplier ID'),
  body('reason').trim().isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters'),
  body('adminNotes').optional().trim().isLength({ max: 500 }).withMessage('Admin notes too long')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, adminNotes } = req.body;
    const { userId, email: adminEmail } = req.user;
    
    // Get existing supplier
    const existingSupplier = await req.dataPersistence.getCommunitySupplierById(id);
    if (!existingSupplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Community supplier does not exist'
      });
    }
    
    // Remove supplier
    await req.dataPersistence.deleteCommunitySupplier(id);
    
    // Log admin action with high severity
    await logAdminAction(
      req,
      userId,
      adminEmail,
      'delete_community_supplier',
      id,
      'community_management',
      `Admin removed community supplier: ${existingSupplier.companyName} - Reason: ${reason}`,
      { 
        companyName: existingSupplier.companyName,
        reason,
        adminNotes,
        supplierData: existingSupplier
      },
      'high'
    );
    
    logger.warn(`🗑️ Admin ${adminEmail} removed community supplier: ${existingSupplier.companyName} - ${reason}`);
    
    res.json({
      success: true,
      message: 'Community supplier removed successfully',
      removedSupplier: {
        id: existingSupplier.id,
        companyName: existingSupplier.companyName,
        city: existingSupplier.city,
        state: existingSupplier.state
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin delete community supplier error:', error);
    res.status(500).json({
      error: 'Failed to remove community supplier',
      message: error.message
    });
  }
});

// GET /api/admin/community/reports - Get all supplier reports (Admin only)
router.get('/community/reports', [
  ensurePersistence,
  verifyToken,
  requireAdmin,
  query('status').optional().isIn(['pending', 'resolved', 'dismissed']).withMessage('Invalid status'),
  query('type').optional().isIn(['invalid_phone', 'out_of_business', 'poor_service', 'incorrect_info', 'spam']).withMessage('Invalid report type'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
], handleValidationErrors, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 25 } = req.query;
    const { userId, email: adminEmail } = req.user;
    
    // Get supplier reports from persistence layer
    const reports = await req.dataPersistence.getSupplierReports({
      status,
      type,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    // Log admin action
    await logAdminAction(
      req,
      userId,
      adminEmail,
      'view_supplier_reports',
      null,
      'community_management',
      'Admin viewed supplier reports',
      { status, type, page, limit, count: reports.data.length }
    );
    
    logger.info(`📋 Admin ${adminEmail} viewed supplier reports (${reports.data.length} results)`);
    
    res.json({
      success: true,
      reports: reports.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: reports.total,
        pages: Math.ceil(reports.total / limit)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin view supplier reports error:', error);
    res.status(500).json({
      error: 'Failed to fetch supplier reports',
      message: error.message
    });
  }
});

// PUT /api/admin/community/reports/:id/resolve - Resolve supplier report (Admin only)
router.put('/community/reports/:id/resolve', [
  ensurePersistence,
  verifyToken,
  requireAdmin,
  param('id').isUUID().withMessage('Invalid report ID'),
  body('action').isIn(['dismiss', 'resolved', 'supplier_warned', 'supplier_removed']).withMessage('Invalid action'),
  body('adminNotes').trim().isLength({ min: 10, max: 500 }).withMessage('Admin notes must be 10-500 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminNotes } = req.body;
    const { userId, email: adminEmail } = req.user;
    
    // Get existing report
    const existingReport = await req.dataPersistence.getSupplierReportById(id);
    if (!existingReport) {
      return res.status(404).json({
        error: 'Report not found',
        message: 'Supplier report does not exist'
      });
    }
    
    // Update report status
    const updatedReport = await req.dataPersistence.updateSupplierReport(id, {
      status: action === 'dismiss' ? 'dismissed' : 'resolved',
      resolution: action,
      adminNotes,
      resolvedBy: adminEmail,
      resolvedAt: new Date().toISOString()
    });
    
    // If removing supplier, also remove from community
    if (action === 'supplier_removed') {
      await req.dataPersistence.deleteCommunitySupplier(existingReport.supplierId);
    }
    
    // Log admin action
    await logAdminAction(
      req,
      userId,
      adminEmail,
      'resolve_supplier_report',
      id,
      'community_management',
      `Admin resolved supplier report: ${existingReport.supplierName} - Action: ${action}`,
      { 
        supplierName: existingReport.supplierName,
        reportType: existingReport.reportType,
        action,
        adminNotes,
        originalReport: existingReport
      },
      action === 'supplier_removed' ? 'high' : 'medium'
    );
    
    logger.info(`✅ Admin ${adminEmail} resolved supplier report: ${existingReport.supplierName} - ${action}`);
    
    res.json({
      success: true,
      message: 'Supplier report resolved successfully',
      report: updatedReport
    });
    
  } catch (error) {
    req.app.locals.logger.error('Admin resolve supplier report error:', error);
    res.status(500).json({
      error: 'Failed to resolve supplier report',
      message: error.message
    });
  }
});

module.exports = router;