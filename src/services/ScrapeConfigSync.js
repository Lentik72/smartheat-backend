/**
 * ScrapeConfigSync - Syncs scrape-config.json to suppliers database table
 *
 * This ensures the database always reflects the scrape-config.json file,
 * which is the source of truth for supplier coverage data.
 *
 * Runs on server startup to keep database in sync with git-versioned config.
 */

const fs = require('fs');
const path = require('path');

class ScrapeConfigSync {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.configPath = path.join(__dirname, '../data/scrape-config.json');
  }

  /**
   * Load and parse scrape-config.json
   */
  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.error('[ScrapeConfigSync] Failed to load config:', error.message);
      return null;
    }
  }

  /**
   * Extract domain from website URL
   */
  normalizeDomain(domain) {
    // Remove protocol and www prefix for matching
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  /**
   * Sync scrape-config.json to suppliers table
   */
  async sync() {
    if (!this.sequelize) {
      console.log('[ScrapeConfigSync] No database connection - skipping sync');
      return { success: false, reason: 'no_database' };
    }

    const config = this.loadConfig();
    if (!config) {
      return { success: false, reason: 'config_load_failed' };
    }

    console.log('[ScrapeConfigSync] Starting sync...');

    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    // Filter entries that have postalCodesServed (actual supplier configs)
    const supplierEntries = Object.entries(config).filter(([domain, cfg]) => {
      return typeof cfg === 'object' &&
             cfg !== null &&
             Array.isArray(cfg.postalCodesServed) &&
             cfg.postalCodesServed.length > 0;
    });

    console.log(`[ScrapeConfigSync] Found ${supplierEntries.length} suppliers with ZIP coverage`);

    for (const [domain, cfg] of supplierEntries) {
      try {
        stats.processed++;

        const normalizedDomain = this.normalizeDomain(domain);
        const websiteUrl = `https://${normalizedDomain}`;

        // Check if supplier exists (match by website domain)
        const [existing] = await this.sequelize.query(`
          SELECT id, name, phone, postal_codes_served, active
          FROM suppliers
          WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
             OR LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $2
          LIMIT 1
        `, {
          bind: [`%${normalizedDomain}%`, `%www.${normalizedDomain}%`],
          type: this.sequelize.QueryTypes.SELECT
        });

        if (existing) {
          // Update existing supplier
          const updates = [];
          const values = [];
          let paramIndex = 1;

          // Update postal_codes_served
          updates.push(`postal_codes_served = $${paramIndex++}`);
          values.push(JSON.stringify(cfg.postalCodesServed));

          // Update name if provided in config
          if (cfg.name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(cfg.name);
          }

          // Update phone if provided in config
          if (cfg.phone) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(cfg.phone);
          }

          // Always update updated_at
          updates.push(`updated_at = NOW()`);

          // Add supplier ID for WHERE clause
          values.push(existing.id);

          await this.sequelize.query(`
            UPDATE suppliers
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
          `, {
            bind: values,
            type: this.sequelize.QueryTypes.UPDATE
          });

          stats.updated++;
        } else {
          // Create new supplier
          const name = cfg.name || this.domainToName(normalizedDomain);

          await this.sequelize.query(`
            INSERT INTO suppliers (
              id, name, phone, website, postal_codes_served,
              active, source, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4,
              true, 'scrape_config_sync', NOW(), NOW()
            )
          `, {
            bind: [
              name,
              cfg.phone || null,
              websiteUrl,
              JSON.stringify(cfg.postalCodesServed)
            ],
            type: this.sequelize.QueryTypes.INSERT
          });

          stats.created++;
        }
      } catch (error) {
        stats.errors.push({ domain, error: error.message });
        console.error(`[ScrapeConfigSync] Error processing ${domain}:`, error.message);
      }
    }

    console.log(`[ScrapeConfigSync] Sync complete:`, {
      processed: stats.processed,
      created: stats.created,
      updated: stats.updated,
      errors: stats.errors.length
    });

    return { success: true, stats };
  }

  /**
   * Convert domain to readable company name
   */
  domainToName(domain) {
    // Remove common suffixes and convert to title case
    return domain
      .replace(/\.(com|net|org|co|llc|inc)$/i, '')
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

module.exports = ScrapeConfigSync;
