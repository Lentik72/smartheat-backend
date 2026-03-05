/**
 * UserLocation Model
 * V2.3.0: Coverage Intelligence System
 *
 * Tracks unique ZIP codes from user supplier lookups.
 * Used for: coverage gap detection, expansion analysis, automated reporting.
 */
const { DataTypes, Op } = require('sequelize');

// Full US ZIP lookup (41K entries) for validation and city/state resolution
const usZipLookup = require('../data/us-zip-lookup.json');

let UserLocation;

const initUserLocationModel = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - UserLocation model not initialized');
    return null;
  }

  try {
    UserLocation = sequelize.define('UserLocation', {
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
      city: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      county: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      state: {
        type: DataTypes.STRING(2),
        allowNull: true
      },
      // Tracking
      firstSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      requestCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      },
      // Coverage snapshot (updated by daily job)
      supplierCount: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      coverageQuality: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'none, poor, adequate, good'
      },
      lastCoverageCheck: {
        type: DataTypes.DATE,
        allowNull: true
      }
    }, {
      tableName: 'user_locations',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['first_seen_at'] },
        { fields: ['state'] },
        { fields: ['coverage_quality'] },
        { fields: ['request_count'], order: 'DESC' }
      ]
    });

    console.log('✅ UserLocation model initialized');
    return UserLocation;
  } catch (error) {
    console.error('❌ Failed to initialize UserLocation model:', error.message);
    return null;
  }
};

const getUserLocationModel = () => UserLocation;

/**
 * Track a user location (upsert)
 * Called on every supplier lookup API call
 */
const trackLocation = async (zipCode, userInfo = {}) => {
  if (!UserLocation) {
    console.log('⚠️  UserLocation model not available');
    return null;
  }

  // V2.8.0: Resolve city/state from full US ZIP lookup when caller doesn't provide
  const zipInfo = usZipLookup[zipCode] || null;
  const city = userInfo.city || (zipInfo && zipInfo.city) || null;
  const county = userInfo.county || (zipInfo && zipInfo.county) || null;
  const state = userInfo.state || (zipInfo && zipInfo.state) || null;

  try {
    // Try to find existing
    let location = await UserLocation.findOne({ where: { zipCode } });

    if (location) {
      // Update existing — also backfill null city/state from lookup
      const updates = { lastSeenAt: new Date() };
      if (!location.city && city) updates.city = city;
      if (!location.county && county) updates.county = county;
      if (!location.state && state) updates.state = state;
      await location.increment('requestCount');
      await location.update(updates);
    } else {
      // Create new
      location = await UserLocation.create({
        zipCode,
        city,
        county,
        state,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        requestCount: 1
      });
    }

    return location;
  } catch (error) {
    // Log but don't fail the main request
    console.error('[UserLocation] Track error:', error.message);
    return null;
  }
};

/**
 * Get locations first seen in the last N hours
 */
const getNewLocations = async (hours = 24) => {
  if (!UserLocation) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return await UserLocation.findAll({
    where: { firstSeenAt: { [Op.gte]: since } },
    order: [['firstSeenAt', 'DESC']]
  });
};

/**
 * Get locations with coverage gaps
 */
const getCoverageGaps = async () => {
  if (!UserLocation) return [];

  return await UserLocation.findAll({
    where: {
      coverageQuality: { [Op.in]: ['none', 'poor'] }
    },
    order: [['requestCount', 'DESC']]
  });
};

/**
 * Get location stats by state
 */
const getStatsByState = async () => {
  if (!UserLocation) return [];

  return await UserLocation.findAll({
    attributes: [
      'state',
      [UserLocation.sequelize.fn('COUNT', '*'), 'locationCount'],
      [UserLocation.sequelize.fn('SUM', UserLocation.sequelize.col('request_count')), 'totalRequests']
    ],
    group: ['state'],
    order: [[UserLocation.sequelize.fn('COUNT', '*'), 'DESC']]
  });
};

module.exports = {
  initUserLocationModel,
  getUserLocationModel,
  trackLocation,
  getNewLocations,
  getCoverageGaps,
  getStatsByState
};
