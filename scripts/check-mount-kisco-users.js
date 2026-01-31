#!/usr/bin/env node
/**
 * Check Mount Kisco (10549) user activity
 * Identifies unique users/devices searching this ZIP
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { Sequelize } = require('sequelize');

async function checkMountKiscoUsers() {
  // Try multiple env file locations
  const dbUrl = process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL;

  if (!dbUrl) {
    console.log('No DATABASE_URL found. Checking env files...');

    // Try loading from different locations
    const fs = require('fs');
    const path = require('path');

    const envPaths = [
      path.join(__dirname, '..', '.env'),
      path.join(__dirname, '..', '.env.local'),
      path.join(__dirname, '..', '.env.production')
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        console.log(`Found env file: ${envPath}`);
        require('dotenv').config({ path: envPath });
      }
    }

    if (!process.env.DATABASE_URL) {
      console.error('ERROR: No database URL found. Please set DATABASE_URL.');
      console.log('\nTo run this script, set DATABASE_URL or copy from Railway:');
      console.log('  export DATABASE_URL="postgresql://..."');
      console.log('  node scripts/check-mount-kisco-users.js');
      process.exit(1);
    }
  }

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    // 1. Check unique device_ids and ip_hashes for Mount Kisco ZIP (10549)
    console.log('=== Mount Kisco (10549) User Analysis ===\n');

    // Unique users who searched 10549 in last 90 days
    const [searchingUsers] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT device_id) as unique_devices,
        COUNT(DISTINCT ip_hash) as unique_ips,
        COUNT(DISTINCT COALESCE(device_id, ip_hash)) as unique_users,
        COUNT(*) as total_requests
      FROM api_activity
      WHERE zip_code = '10549'
        AND created_at >= NOW() - INTERVAL '90 days'
    `);

    console.log('Users who SEARCHED for 10549:');
    console.log(`  Unique device IDs: ${searchingUsers[0]?.unique_devices || 0}`);
    console.log(`  Unique IP hashes: ${searchingUsers[0]?.unique_ips || 0}`);
    console.log(`  Unique users (device or IP): ${searchingUsers[0]?.unique_users || 0}`);
    console.log(`  Total requests: ${searchingUsers[0]?.total_requests || 0}`);

    // Get the actual device_ids and ip_hashes
    const [deviceDetails] = await sequelize.query(`
      SELECT
        device_id,
        ip_hash,
        COUNT(*) as request_count,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
      FROM api_activity
      WHERE zip_code = '10549'
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY device_id, ip_hash
      ORDER BY request_count DESC
    `);

    console.log('\nDevice/IP breakdown:');
    deviceDetails.forEach((d, i) => {
      console.log(`  ${i + 1}. Device: ${d.device_id || 'N/A'} | IP Hash: ${d.ip_hash || 'N/A'}`);
      console.log(`     Requests: ${d.request_count} | First: ${d.first_seen} | Last: ${d.last_seen}`);
    });

    // 2. Check excluded device IDs
    console.log('\n=== Excluded Device IDs (your devices) ===');
    const excludedDevices = (process.env.EXCLUDED_DEVICE_IDS || '')
      .split(',')
      .map(id => id.trim().toUpperCase())
      .filter(id => id.length > 0);

    if (excludedDevices.length > 0) {
      console.log(`Configured excluded devices: ${excludedDevices.length}`);
      excludedDevices.forEach(d => console.log(`  - ${d.substring(0, 8)}...`));
    } else {
      console.log('No devices configured for exclusion');
    }

    // 3. Check if any Mount Kisco requests match excluded devices
    if (excludedDevices.length > 0) {
      const [matchingExcluded] = await sequelize.query(`
        SELECT
          device_id,
          COUNT(*) as request_count
        FROM api_activity
        WHERE zip_code = '10549'
          AND created_at >= NOW() - INTERVAL '90 days'
          AND device_id IN (:excludedDevices)
        GROUP BY device_id
      `, { replacements: { excludedDevices } });

      if (matchingExcluded.length > 0) {
        console.log('\nYour excluded devices that searched 10549:');
        matchingExcluded.forEach(d => {
          console.log(`  - ${d.device_id.substring(0, 8)}... (${d.request_count} requests)`);
        });
      }
    }

    // 4. Summary
    console.log('\n=== Summary ===');
    const yourDevices = deviceDetails.filter(d =>
      d.device_id && excludedDevices.includes(d.device_id.toUpperCase())
    );
    const otherDevices = deviceDetails.filter(d =>
      !d.device_id || !excludedDevices.includes(d.device_id.toUpperCase())
    );

    console.log(`Your devices searching 10549: ${yourDevices.length}`);
    console.log(`Other devices/IPs searching 10549: ${otherDevices.length}`);

    if (otherDevices.length > 0) {
      console.log('\nOther users in Mount Kisco:');
      otherDevices.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.device_id ? 'Device' : 'IP-only'}: ${(d.device_id || d.ip_hash || 'unknown').substring(0, 12)}...`);
        console.log(`     Requests: ${d.request_count}`);
      });
    } else {
      console.log('\n⚠️  No other users found in Mount Kisco besides your excluded devices.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkMountKiscoUsers();
