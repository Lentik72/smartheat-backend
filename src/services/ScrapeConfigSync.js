/**
 * ScrapeConfigSync - Syncs scrape-config.json to suppliers database table
 *
 * This ensures the database always reflects the scrape-config.json file,
 * which is the source of truth for supplier coverage data.
 *
 * Coverage model: scrape-config.json is authoritative for postal_codes_served.
 * - Default: union merge (config adds ZIPs, never removes)
 * - Override: set postalCodesOverride: true in config entry to fully replace
 * - Kill switch: set SCRAPECONFIG_SKIP_COVERAGE=true env var to skip all coverage writes
 *
 * Runs on server startup to keep database in sync with git-versioned config.
 */

const fs = require('fs');
const path = require('path');

// Load zip-database once for coverage validation
let zipDatabase = null;
function getZipDatabase() {
  if (!zipDatabase) {
    try {
      zipDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/zip-database.json'), 'utf8'));
    } catch (e) {
      zipDatabase = {};
    }
  }
  return zipDatabase;
}

/**
 * Normalize a ZIP code to 5 digits. Logs and drops invalid values.
 */
function normalizeZip(z, supplierName) {
  const s = String(z).trim();
  if (/^\d{5}/.test(s)) return s.slice(0, 5);
  if (s.length > 0) console.warn(`[ScrapeConfigSync] Dropped invalid ZIP "${s}" for ${supplierName}`);
  return null;
}

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

    const skipCoverage = process.env.SCRAPECONFIG_SKIP_COVERAGE === 'true';
    if (skipCoverage) {
      console.log('[ScrapeConfigSync] Coverage writes disabled via SCRAPECONFIG_SKIP_COVERAGE');
    }

    console.log('[ScrapeConfigSync] Starting sync...');

    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    let driftCount = 0;
    const unresolvableZips = new Set(); // ZIPs in coverage but not in zip-database

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
        const supplierLabel = cfg.name || domain;

        // Check if supplier exists (match by website domain)
        // ORDER BY active DESC so we always update the active record first,
        // avoiding sync drift when duplicates exist
        const [existing] = await this.sequelize.query(`
          SELECT id, name, phone, postal_codes_served, active,
                 allow_price_display, scrape_status, consecutive_scrape_failures
          FROM suppliers
          WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
             OR LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $2
          ORDER BY active DESC, created_at ASC
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

          // --- Coverage sync ---
          if (!skipCoverage) {
            // Normalize config ZIPs
            const configZips = (cfg.postalCodesServed || [])
              .map(z => normalizeZip(z, supplierLabel))
              .filter(Boolean);

            // Cross-check: flag ZIPs not in zip-database (users can't resolve them)
            const db = getZipDatabase();
            const unresolvable = configZips.filter(z => !db[z]);
            if (unresolvable.length > 0) {
              unresolvable.forEach(z => unresolvableZips.add(z));
            }

            if (configZips.length === 0 && cfg.postalCodesOverride !== true) {
              // Empty config with no override → skip (protects against accidental wipe)
              console.log(`[ScrapeConfigSync] Skipping empty coverage for ${supplierLabel}`);
            } else {
              // Get existing DB ZIPs (JSONB returns array directly)
              const existingZips = (Array.isArray(existing.postal_codes_served)
                ? existing.postal_codes_served
                : (() => { try { return JSON.parse(existing.postal_codes_served || '[]'); } catch(e) { return []; } })()
              ).map(z => normalizeZip(z, supplierLabel)).filter(Boolean);

              let finalZips;

              if (cfg.postalCodesOverride === true) {
                // Override: full replace — intentional coverage change
                finalZips = configZips;
                const configSet = new Set(configZips);
                const removed = existingZips.filter(z => !configSet.has(z));
                if (removed.length > 0 && existingZips.length > 0 && (removed.length / existingZips.length > 0.3 || removed.length > 20)) {
                  console.warn(`[ScrapeConfigSync] LARGE SHRINK ${supplierLabel}: removing ${removed.length}/${existingZips.length} ZIPs (${Math.round(removed.length / existingZips.length * 100)}%)`);
                } else if (removed.length > 0) {
                  console.log(`[ScrapeConfigSync] OVERRIDE ${supplierLabel}: removed ${removed.length} ZIPs`);
                }
              } else {
                // Default: union merge — config adds, never removes
                finalZips = [...new Set([...existingZips, ...configZips])];

                // Safety: warn on massive expansion (>3x)
                if (existingZips.length > 0 && finalZips.length > existingZips.length * 3) {
                  console.warn(`[ScrapeConfigSync] MASSIVE EXPANSION ${supplierLabel}: ${existingZips.length} → ${finalZips.length} ZIPs`);
                }
              }

              // Sort deterministically
              finalZips.sort((a, b) => Number(a) - Number(b));

              // Idempotency: only write if coverage actually changed
              const existingSorted = [...existingZips].sort((a, b) => Number(a) - Number(b));
              if (JSON.stringify(existingSorted) !== JSON.stringify(finalZips)) {
                updates.push(`postal_codes_served = $${paramIndex++}`);
                values.push(JSON.stringify(finalZips));
              }

              // Two-way drift logging
              const configSet = new Set(configZips);
              const existingSet = new Set(existingZips);
              const dbOnly = existingZips.filter(z => !configSet.has(z));
              const configOnly = configZips.filter(z => !existingSet.has(z));
              if (dbOnly.length > 0) {
                console.log(`[ScrapeConfigSync] DRIFT ${supplierLabel}: ${dbOnly.length} ZIPs in DB not in config`);
              }
              if (configOnly.length > 0) {
                console.log(`[ScrapeConfigSync] DRIFT ${supplierLabel}: ${configOnly.length} ZIPs in config not in DB (adding)`);
              }
              if (dbOnly.length > 0 || configOnly.length > 0) driftCount++;
            }
          }

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

          // If config says enabled and DB has price display off, this is a re-enable.
          // Reset failure counters so supplier doesn't show as "at risk" from stale data.
          if (cfg.enabled === true && !existing.allow_price_display) {
            updates.push(`allow_price_display = true`);
            updates.push(`scrape_status = 'active'`);
            updates.push(`consecutive_scrape_failures = 0`);
            updates.push(`last_scrape_failure_at = NULL`);
            updates.push(`scrape_failure_dates = NULL`);
            updates.push(`scrape_cooldown_until = NULL`);
            console.log(`[ScrapeConfigSync] Re-enabling ${supplierLabel}: resetting failure counters`);
            stats.reEnabled = (stats.reEnabled || 0) + 1;
          }

          if (updates.length > 0) {
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
            stats.skipped++;
          }
        } else {
          // Create new supplier — inactive by default until vetted via migration
          const name = cfg.name || this.domainToName(normalizedDomain);

          await this.sequelize.query(`
            INSERT INTO suppliers (
              id, name, phone, website, postal_codes_served,
              active, source, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4,
              false, 'scrape_config_sync', NOW(), NOW()
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

    console.log(`[ScrapeConfigSync] Summary: ${stats.processed} processed, ${stats.updated} updated, ${stats.skipped} unchanged, drift detected: ${driftCount}`);
    if (unresolvableZips.size > 0) {
      console.warn(`[ScrapeConfigSync] WARNING: ${unresolvableZips.size} ZIPs in supplier coverage not in zip-database.json — users searching these ZIPs get degraded results (ZIP-exact match only, no city/county/radius)`);
      if (unresolvableZips.size <= 20) {
        console.warn(`[ScrapeConfigSync] Unresolvable ZIPs: ${[...unresolvableZips].sort().join(', ')}`);
      }
    }
    console.log(`[ScrapeConfigSync] Sync complete:`, {
      processed: stats.processed,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.errors.length,
      unresolvableZips: unresolvableZips.size
    });

    return { success: true, stats, unresolvableZips: unresolvableZips.size };
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
