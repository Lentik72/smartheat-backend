// Database models and persistence layer
const { DataTypes } = require('sequelize');

// In-memory fallback storage
let supplierRequestsMemory = new Map();
let auditLogsMemory = new Map();
let usersMemory = new Map();
let communitySupplierMemory = new Map();
let supplierReportsMemory = new Map();
let coverageGapsMemory = new Map();  // V1.4.1: Coverage gaps fallback

// Database Models
let SupplierRequest, AuditLog, User, CommunitySupplier, SupplierReport, CoverageGap;

const initDatabase = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - using memory storage');
    return null;
  }

  try {
    // Define SupplierRequest model
    SupplierRequest = sequelize.define('SupplierRequest', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      companyName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      contactPerson: DataTypes.STRING(100),
      primaryPhone: DataTypes.STRING(20),
      secondaryPhone: DataTypes.STRING(20),
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          isEmail: true
        }
      },
      website: DataTypes.STRING(255),
      address: DataTypes.TEXT,
      city: DataTypes.STRING(50),
      state: DataTypes.STRING(2),
      zipCode: DataTypes.STRING(10),
      businessLicense: DataTypes.STRING(100),
      servicesOffered: {
        type: DataTypes.JSONB,
        defaultValue: []
      },
      serviceRadius: DataTypes.INTEGER,
      yearsInBusiness: DataTypes.INTEGER,
      insuranceInfo: DataTypes.TEXT,
      notes: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'reviewing'),
        defaultValue: 'pending'
      },
      reviewedAt: DataTypes.DATE,
      reviewedBy: DataTypes.UUID,
      rejectionReason: DataTypes.TEXT,
      adminNotes: DataTypes.TEXT,
      deviceId: DataTypes.STRING(100),
      submitterIP: DataTypes.INET,
      appVersion: DataTypes.STRING(20)
    }, {
      tableName: 'supplier_requests',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['email'] },
        { fields: ['created_at'] }
      ]
    });

    // Define AuditLog model
    AuditLog = sequelize.define('AuditLog', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      adminUserId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      adminEmail: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      targetId: DataTypes.UUID,
      targetType: DataTypes.STRING(50),
      details: DataTypes.TEXT,
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      },
      severity: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        defaultValue: 'medium'
      },
      ipAddress: DataTypes.INET,
      userAgent: DataTypes.TEXT,
      isSuccess: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      errorMessage: DataTypes.TEXT
    }, {
      tableName: 'audit_logs',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['admin_user_id'] },
        { fields: ['action'] },
        { fields: ['severity'] },
        { fields: ['created_at'] }
      ]
    });

    // Define User model (for admin auth)
    User = sequelize.define('User', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      role: {
        type: DataTypes.ENUM('customer', 'admin', 'super_admin'),
        defaultValue: 'customer'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      lastLoginAt: DataTypes.DATE,
      lastAdminActionAt: DataTypes.DATE,
      deviceTokens: {
        type: DataTypes.JSONB,
        defaultValue: []
      },
      permissions: {
        type: DataTypes.JSONB,
        defaultValue: {}
      }
    }, {
      tableName: 'users',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['email'] },
        { fields: ['role'] },
        { fields: ['is_active'] }
      ]
    });

    // Define CommunitySupplier model
    CommunitySupplier = sequelize.define('CommunitySupplier', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      companyName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      contactPerson: DataTypes.STRING(100),
      primaryPhone: DataTypes.STRING(20),
      secondaryPhone: DataTypes.STRING(20),
      email: {
        type: DataTypes.STRING(255),
        validate: {
          isEmail: true
        }
      },
      website: DataTypes.STRING(255),
      address: DataTypes.TEXT,
      city: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      state: {
        type: DataTypes.STRING(2),
        allowNull: false
      },
      zipCode: DataTypes.STRING(10),
      servicesArea: DataTypes.STRING(200),
      deliveryCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      averageRating: {
        type: DataTypes.DECIMAL(2, 1),
        defaultValue: 0.0
      },
      isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      lastActivityDate: DataTypes.DATE,
      addedByUserZip: DataTypes.STRING(10),
      lastModifiedBy: DataTypes.STRING(255),
      adminNotes: DataTypes.TEXT,
      services: {
        type: DataTypes.JSONB,
        defaultValue: []
      }
    }, {
      tableName: 'community_suppliers',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['company_name'] },
        { fields: ['city', 'state'] },
        { fields: ['is_verified'] },
        { fields: ['delivery_count'] }
      ]
    });

    // Define SupplierReport model
    SupplierReport = sequelize.define('SupplierReport', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: CommunitySupplier,
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      supplierName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      reportType: {
        type: DataTypes.ENUM('invalid_phone', 'out_of_business', 'poor_service', 'incorrect_info', 'spam'),
        allowNull: false
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      reportedBy: DataTypes.STRING(45), // IP address for anonymous reporting
      status: {
        type: DataTypes.ENUM('pending', 'resolved', 'dismissed'),
        defaultValue: 'pending'
      },
      resolution: DataTypes.ENUM('dismiss', 'resolved', 'supplier_warned', 'supplier_removed'),
      adminNotes: DataTypes.TEXT,
      resolvedBy: DataTypes.STRING(255),
      resolvedAt: DataTypes.DATE
    }, {
      tableName: 'supplier_reports',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['supplier_id'] },
        { fields: ['status'] },
        { fields: ['report_type'] },
        { fields: ['created_at'] }
      ]
    });

    // V1.4.1: Define CoverageGap model for tracking supplier coverage gaps
    CoverageGap = sequelize.define('CoverageGap', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      zipCode: {
        type: DataTypes.STRING(5),
        allowNull: false,
        unique: true
      },
      county: DataTypes.STRING(100),
      state: DataTypes.STRING(2),
      reportCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      },
      firstReportedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      lastReportedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      resolved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      resolvedAt: DataTypes.DATE,
      notes: DataTypes.TEXT
    }, {
      tableName: 'coverage_gaps',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['zip_code'], unique: true },
        { fields: ['report_count'] },
        { fields: ['resolved'] },
        { fields: ['last_reported_at'] }
      ]
    });

    // Define associations
    CommunitySupplier.hasMany(SupplierReport, { foreignKey: 'supplierId', as: 'reports' });
    SupplierReport.belongsTo(CommunitySupplier, { foreignKey: 'supplierId', as: 'supplier' });

    // Sync models (create tables if they don't exist)
    sequelize.sync({ alter: true }) // Allow creating new tables
      .then(() => console.log('✅ Database models synchronized'))
      .catch(err => console.error('❌ Database sync error:', err.message));

    return { SupplierRequest, AuditLog, User, CommunitySupplier, SupplierReport, CoverageGap };
  } catch (error) {
    console.error('❌ Database model initialization error:', error.message);
    return null;
  }
};

// Persistence layer with fallback
class DataPersistence {
  constructor(models) {
    this.models = models;
    this.hasDatabase = !!models;
  }

  // Supplier Requests
  async createSupplierRequest(data) {
    if (this.hasDatabase) {
      try {
        const request = await this.models.SupplierRequest.create(data);
        return request.toJSON();
      } catch (error) {
        console.error('Database create error, falling back to memory:', error.message);
      }
    }
    
    // Memory fallback
    const id = data.id || require('uuid').v4();
    const request = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
    supplierRequestsMemory.set(id, request);
    return request;
  }

  async getSupplierRequests(filters = {}) {
    if (this.hasDatabase) {
      try {
        const whereClause = {};
        if (filters.status) whereClause.status = filters.status;
        
        const requests = await this.models.SupplierRequest.findAll({
          where: whereClause,
          order: [['createdAt', 'DESC']],
          limit: filters.limit || 50,
          offset: filters.offset || 0
        });
        
        return requests.map(r => r.toJSON());
      } catch (error) {
        console.error('Database query error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    let requests = Array.from(supplierRequestsMemory.values());
    if (filters.status) {
      requests = requests.filter(r => r.status === filters.status);
    }
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return requests.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50));
  }

  async updateSupplierRequest(id, updates) {
    if (this.hasDatabase) {
      try {
        await this.models.SupplierRequest.update(
          { ...updates, updatedAt: new Date() },
          { where: { id } }
        );
        const updated = await this.models.SupplierRequest.findByPk(id);
        return updated ? updated.toJSON() : null;
      } catch (error) {
        console.error('Database update error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const existing = supplierRequestsMemory.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      supplierRequestsMemory.set(id, updated);
      return updated;
    }
    return null;
  }

  // Audit Logs
  async createAuditLog(data) {
    if (this.hasDatabase) {
      try {
        const log = await this.models.AuditLog.create(data);
        return log.toJSON();
      } catch (error) {
        console.error('Database audit log error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const id = data.id || require('uuid').v4();
    const log = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
    auditLogsMemory.set(id, log);
    return log;
  }

  async getAuditLogs(filters = {}) {
    if (this.hasDatabase) {
      try {
        const whereClause = {};
        if (filters.action) whereClause.action = { [require('sequelize').Op.iLike]: `%${filters.action}%` };
        if (filters.severity) whereClause.severity = filters.severity;

        const logs = await this.models.AuditLog.findAll({
          where: whereClause,
          order: [['createdAt', 'DESC']],
          limit: filters.limit || 50,
          offset: filters.offset || 0
        });

        return logs.map(l => l.toJSON());
      } catch (error) {
        console.error('Database audit query error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    let logs = Array.from(auditLogsMemory.values());
    if (filters.action) {
      logs = logs.filter(l => l.action.includes(filters.action));
    }
    if (filters.severity) {
      logs = logs.filter(l => l.severity === filters.severity);
    }
    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return logs.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50));
  }

  // Community Suppliers
  async createCommunitySupplier(data) {
    if (this.hasDatabase) {
      try {
        const supplier = await this.models.CommunitySupplier.create(data);
        return supplier.toJSON();
      } catch (error) {
        console.error('Database create community supplier error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const id = data.id || require('uuid').v4();
    const supplier = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
    communitySupplierMemory.set(id, supplier);
    return supplier;
  }

  async getCommunitySuppliers(filters = {}) {
    if (this.hasDatabase) {
      try {
        const whereClause = {};
        const { Op } = require('sequelize');
        
        if (filters.search) {
          whereClause[Op.or] = [
            { companyName: { [Op.iLike]: `%${filters.search}%` } },
            { city: { [Op.iLike]: `%${filters.search}%` } },
            { servicesArea: { [Op.iLike]: `%${filters.search}%` } }
          ];
        }
        if (filters.city) whereClause.city = { [Op.iLike]: `%${filters.city}%` };
        if (filters.state) whereClause.state = filters.state.toUpperCase();

        const offset = ((filters.page || 1) - 1) * (filters.limit || 25);
        const limit = filters.limit || 25;

        const { count, rows } = await this.models.CommunitySupplier.findAndCountAll({
          where: whereClause,
          order: [['deliveryCount', 'DESC'], ['createdAt', 'DESC']],
          limit,
          offset,
          include: [{
            model: this.models.SupplierReport,
            as: 'reports',
            attributes: ['id', 'reportType', 'status'],
            required: false
          }]
        });

        return {
          data: rows.map(r => r.toJSON()),
          total: count,
          page: filters.page || 1,
          limit: filters.limit || 25
        };
      } catch (error) {
        console.error('Database community suppliers query error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    let suppliers = Array.from(communitySupplierMemory.values());
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      suppliers = suppliers.filter(s => 
        s.companyName.toLowerCase().includes(searchLower) ||
        s.city.toLowerCase().includes(searchLower) ||
        (s.servicesArea && s.servicesArea.toLowerCase().includes(searchLower))
      );
    }
    if (filters.city) {
      suppliers = suppliers.filter(s => s.city.toLowerCase().includes(filters.city.toLowerCase()));
    }
    if (filters.state) {
      suppliers = suppliers.filter(s => s.state === filters.state.toUpperCase());
    }

    suppliers.sort((a, b) => (b.deliveryCount || 0) - (a.deliveryCount || 0));
    
    const offset = ((filters.page || 1) - 1) * (filters.limit || 25);
    const limit = filters.limit || 25;
    
    return {
      data: suppliers.slice(offset, offset + limit),
      total: suppliers.length,
      page: filters.page || 1,
      limit: filters.limit || 25
    };
  }

  async getCommunitySupplierById(id) {
    if (this.hasDatabase) {
      try {
        const supplier = await this.models.CommunitySupplier.findByPk(id, {
          include: [{
            model: this.models.SupplierReport,
            as: 'reports',
            order: [['createdAt', 'DESC']]
          }]
        });
        return supplier ? supplier.toJSON() : null;
      } catch (error) {
        console.error('Database get community supplier error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    return communitySupplierMemory.get(id) || null;
  }

  async updateCommunitySupplier(id, updates) {
    if (this.hasDatabase) {
      try {
        await this.models.CommunitySupplier.update(
          { ...updates, updatedAt: new Date() },
          { where: { id } }
        );
        const updated = await this.models.CommunitySupplier.findByPk(id);
        return updated ? updated.toJSON() : null;
      } catch (error) {
        console.error('Database update community supplier error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const existing = communitySupplierMemory.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      communitySupplierMemory.set(id, updated);
      return updated;
    }
    return null;
  }

  async deleteCommunitySupplier(id) {
    if (this.hasDatabase) {
      try {
        const result = await this.models.CommunitySupplier.destroy({ where: { id } });
        return result > 0;
      } catch (error) {
        console.error('Database delete community supplier error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    return communitySupplierMemory.delete(id);
  }

  // Supplier Reports
  async createSupplierReport(data) {
    if (this.hasDatabase) {
      try {
        const report = await this.models.SupplierReport.create(data);
        return report.toJSON();
      } catch (error) {
        console.error('Database create supplier report error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const id = data.id || require('uuid').v4();
    const report = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
    supplierReportsMemory.set(id, report);
    return report;
  }

  async getSupplierReports(filters = {}) {
    if (this.hasDatabase) {
      try {
        const whereClause = {};
        if (filters.status) whereClause.status = filters.status;
        if (filters.type) whereClause.reportType = filters.type;

        const offset = ((filters.page || 1) - 1) * (filters.limit || 25);
        const limit = filters.limit || 25;

        const { count, rows } = await this.models.SupplierReport.findAndCountAll({
          where: whereClause,
          order: [['createdAt', 'DESC']],
          limit,
          offset,
          include: [{
            model: this.models.CommunitySupplier,
            as: 'supplier',
            attributes: ['id', 'companyName', 'city', 'state']
          }]
        });

        return {
          data: rows.map(r => r.toJSON()),
          total: count,
          page: filters.page || 1,
          limit: filters.limit || 25
        };
      } catch (error) {
        console.error('Database supplier reports query error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    let reports = Array.from(supplierReportsMemory.values());
    
    if (filters.status) {
      reports = reports.filter(r => r.status === filters.status);
    }
    if (filters.type) {
      reports = reports.filter(r => r.reportType === filters.type);
    }

    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const offset = ((filters.page || 1) - 1) * (filters.limit || 25);
    const limit = filters.limit || 25;
    
    return {
      data: reports.slice(offset, offset + limit),
      total: reports.length,
      page: filters.page || 1,
      limit: filters.limit || 25
    };
  }

  async getSupplierReportById(id) {
    if (this.hasDatabase) {
      try {
        const report = await this.models.SupplierReport.findByPk(id, {
          include: [{
            model: this.models.CommunitySupplier,
            as: 'supplier',
            attributes: ['id', 'companyName', 'city', 'state']
          }]
        });
        return report ? report.toJSON() : null;
      } catch (error) {
        console.error('Database get supplier report error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    return supplierReportsMemory.get(id) || null;
  }

  async updateSupplierReport(id, updates) {
    if (this.hasDatabase) {
      try {
        await this.models.SupplierReport.update(
          { ...updates, updatedAt: new Date() },
          { where: { id } }
        );
        const updated = await this.models.SupplierReport.findByPk(id);
        return updated ? updated.toJSON() : null;
      } catch (error) {
        console.error('Database update supplier report error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const existing = supplierReportsMemory.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      supplierReportsMemory.set(id, updated);
      return updated;
    }
    return null;
  }

  // V1.4.1: Coverage Gap Methods
  async reportCoverageGap(zipCode, county, state) {
    if (this.hasDatabase && this.models.CoverageGap) {
      try {
        // Try to find existing gap
        const existing = await this.models.CoverageGap.findOne({ where: { zipCode } });

        if (existing) {
          // Increment count and update timestamp
          existing.reportCount += 1;
          existing.lastReportedAt = new Date();
          await existing.save();
          return { ...existing.toJSON(), isNew: false };
        } else {
          // Create new gap record
          const gap = await this.models.CoverageGap.create({
            zipCode,
            county,
            state,
            reportCount: 1,
            firstReportedAt: new Date(),
            lastReportedAt: new Date()
          });
          return { ...gap.toJSON(), isNew: true };
        }
      } catch (error) {
        console.error('Database coverage gap error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    const existing = coverageGapsMemory.get(zipCode);
    if (existing) {
      existing.reportCount += 1;
      existing.lastReportedAt = new Date().toISOString();
      coverageGapsMemory.set(zipCode, existing);
      return { ...existing, isNew: false };
    } else {
      const gap = {
        id: require('uuid').v4(),
        zipCode,
        county,
        state,
        reportCount: 1,
        firstReportedAt: new Date().toISOString(),
        lastReportedAt: new Date().toISOString(),
        resolved: false
      };
      coverageGapsMemory.set(zipCode, gap);
      return { ...gap, isNew: true };
    }
  }

  async getCoverageGaps(filters = {}) {
    if (this.hasDatabase && this.models.CoverageGap) {
      try {
        const whereClause = {};
        if (filters.resolved !== undefined) whereClause.resolved = filters.resolved;
        if (filters.state) whereClause.state = filters.state;

        const gaps = await this.models.CoverageGap.findAll({
          where: whereClause,
          order: [['reportCount', 'DESC'], ['lastReportedAt', 'DESC']],
          limit: filters.limit || 100
        });

        return gaps.map(g => g.toJSON());
      } catch (error) {
        console.error('Database get coverage gaps error, falling back to memory:', error.message);
      }
    }

    // Memory fallback
    let gaps = Array.from(coverageGapsMemory.values());
    if (filters.resolved !== undefined) {
      gaps = gaps.filter(g => g.resolved === filters.resolved);
    }
    if (filters.state) {
      gaps = gaps.filter(g => g.state === filters.state);
    }
    gaps.sort((a, b) => b.reportCount - a.reportCount);
    return gaps.slice(0, filters.limit || 100);
  }

  async resolveCoverageGap(zipCode, notes) {
    if (this.hasDatabase && this.models.CoverageGap) {
      try {
        const gap = await this.models.CoverageGap.findOne({ where: { zipCode } });
        if (gap) {
          gap.resolved = true;
          gap.resolvedAt = new Date();
          gap.notes = notes;
          await gap.save();
          return { success: true, gap: gap.toJSON() };
        }
        return { success: false };
      } catch (error) {
        console.error('Database resolve coverage gap error:', error.message);
        return { success: false, error: error.message };
      }
    }

    // Memory fallback
    const existing = coverageGapsMemory.get(zipCode);
    if (existing) {
      existing.resolved = true;
      existing.resolvedAt = new Date().toISOString();
      existing.notes = notes;
      coverageGapsMemory.set(zipCode, existing);
      return { success: true, gap: existing };
    }
    return { success: false };
  }
}

// Export initialization function and persistence class
module.exports = {
  initDatabase,
  DataPersistence
};