// Database models and persistence layer
const { DataTypes } = require('sequelize');

// In-memory fallback storage
let supplierRequestsMemory = new Map();
let auditLogsMemory = new Map();
let usersMemory = new Map();

// Database Models
let SupplierRequest, AuditLog, User;

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

    // Sync models (create tables if they don't exist)
    sequelize.sync({ alter: false }) // Don't alter existing tables
      .then(() => console.log('✅ Database models synchronized'))
      .catch(err => console.error('❌ Database sync error:', err.message));

    return { SupplierRequest, AuditLog, User };
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
}

// Export initialization function and persistence class
module.exports = {
  initDatabase,
  DataPersistence
};