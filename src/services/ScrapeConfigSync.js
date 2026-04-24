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

/**
 * Decide whether a config entry should enter the sync loop.
 *
 * Accepts:
 * - Single-branch entries with non-empty postalCodesServed (existing behavior)
 * - Multi-branch entries with non-empty branches map (NEW — heatingoil-jx8r)
 *
 * Without this predicate widening, multi-branch entries silently skip the
 * sync loop because they have no top-level postalCodesServed. Pure function,
 * exported for unit testing.
 */
function _shouldSyncConfigEntry(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const hasFlatZips = Array.isArray(cfg.postalCodesServed) && cfg.postalCodesServed.length > 0;
  const hasBranches = !!(cfg.branches && typeof cfg.branches === 'object' && Object.keys(cfg.branches).length > 0);
  return hasFlatZips || hasBranches;
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

    // heatingoil-jx8r: surface multi-branch config errors at startup. Non-fatal.
    await this._validateMultiBranchConfigs(config);

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
    const zipDb = getZipDatabase();
    const zipDbLoaded = Object.keys(zipDb).length > 0;
    if (!zipDbLoaded) {
      console.error('[ScrapeConfigSync] ZIP database failed to load — skipping coverage cross-check');
    }

    // Filter entries that should sync (single-branch with postalCodesServed,
    // or multi-branch with branches). See _shouldSyncConfigEntry above.
    const supplierEntries = Object.entries(config).filter(([domain, cfg]) => {
      if (domain.startsWith('_')) return false;
      return _shouldSyncConfigEntry(cfg);
    });

    console.log(`[ScrapeConfigSync] Found ${supplierEntries.length} suppliers with ZIP coverage`);

    for (const [domain, cfg] of supplierEntries) {
      try {
        const normalizedDomain = this.normalizeDomain(domain);

        // ── Multi-branch path (heatingoil-jx8r) ──────────────────────────
        // Iterate each branch, match supplier by slug (not domain), coverage-
        // sync per branch. Single-branch path unchanged below.
        if (cfg.branches) {
          for (const [branchSlug, branchCfg] of Object.entries(cfg.branches)) {
            stats.processed++;
            const branchLabel = `${domain}[${branchSlug}]`;

            const [branchSupplier] = await this.sequelize.query(
              `SELECT id, name, phone, postal_codes_served, active,
                      allow_price_display, scrape_status, consecutive_scrape_failures
               FROM suppliers WHERE slug = $1 LIMIT 1`,
              { bind: [branchSlug], type: this.sequelize.QueryTypes.SELECT }
            );

            if (!branchSupplier) {
              console.warn(`[ScrapeConfigSync] Branch "${branchSlug}" in ${domain} has no matching supplier — skipping`);
              stats.skipped++;
              continue;
            }

            // Merge branch over top-level for coverage sync (same semantic
            // as priceScraper.getConfigForSupplier).
            const mergedCfg = { ...cfg, ...branchCfg };
            try {
              const result = await this._syncSupplierCoverage(branchSupplier, mergedCfg, branchLabel, {
                skipCoverage, zipDbLoaded, zipDb, unresolvableZips
              });
              if (result.updated) stats.updated++;
              else stats.skipped++;
              if (result.driftDetected) driftCount++;
            } catch (err) {
              stats.errors.push({ domain: branchLabel, error: err.message });
              console.error(`[ScrapeConfigSync] Error processing branch ${branchLabel}:`, err.message);
            }
          }
          continue;  // don't fall through to single-branch path
        }

        // ── Single-branch path (unchanged) ──────────────────────────────
        stats.processed++;

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

            // Cross-check: flag ZIPs not in zip-database (users get degraded matching)
            if (zipDbLoaded) {
              configZips.forEach(z => { if (!zipDb[z]) unresolvableZips.add(z); });
            }

            if (configZips.length === 0 && cfg.postalCodesOverride !== true) {
              // Empty config with no override → skip (protects against accidental wipe)
              console.log(`[ScrapeConfigSync] Skipping empty coverage for ${supplierLabel}`);
            } else {
              // Get existing DB ZIPs (JSONB returns array directly)
              const rawDbZips = Array.isArray(existing.postal_codes_served)
                ? existing.postal_codes_served
                : (() => { try { return JSON.parse(existing.postal_codes_served || '[]'); } catch(e) { return []; } })();
              const existingZips = rawDbZips
                .map(z => normalizeZip(z, supplierLabel)).filter(Boolean);

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

              // Idempotency: only write if coverage actually changed.
              // Compare against raw DB ZIPs (not normalized) so invalid entries get cleaned up.
              const rawSorted = [...rawDbZips].map(String).sort();
              const finalForCompare = [...finalZips].sort();
              if (JSON.stringify(rawSorted) !== JSON.stringify(finalForCompare)) {
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
   * Validate multi-branch config entries at startup. Non-fatal — warnings only.
   *
   * Surfaces problems early (boot time) rather than on each scrape run. Writes
   * to console.warn, which lands in Railway logs. Warnings:
   *   1. Domain has both top-level postalCodesServed AND branches — ambiguous;
   *      top-level ZIPs will be silently ignored.
   *   2. Domain has both top-level lookupZip AND branches — same ambiguity.
   *   3. Branch missing postalCodesServed — likely authoring error.
   *   4. Two branches under the same domain claim the same ZIP — coverage
   *      conflict; the second branch "wins" in union-merge but attribution
   *      becomes nondeterministic.
   *   5. Branch slug has no matching supplier row in the DB — orphan; will
   *      also be warned at sync time, this just surfaces earlier.
   *
   * Test surface (jx8r): 5 assertions cover each warning class with
   * stubbed sequelize.
   */
  async _validateMultiBranchConfigs(config) {
    for (const [domain, cfg] of Object.entries(config)) {
      if (domain.startsWith('_')) continue;
      if (!cfg || !cfg.branches) continue;

      if (cfg.postalCodesServed) {
        console.warn(`[ScrapeConfigSync][validate] ${domain}: has both top-level postalCodesServed AND branches — top-level ZIPs will be ignored`);
      }
      if (cfg.lookupZip) {
        console.warn(`[ScrapeConfigSync][validate] ${domain}: has both top-level lookupZip AND branches — top-level lookupZip will be ignored`);
      }

      const seenZips = new Map(); // zip -> first branch slug that claimed it
      for (const [branchSlug, branchCfg] of Object.entries(cfg.branches)) {
        if (!Array.isArray(branchCfg.postalCodesServed) || branchCfg.postalCodesServed.length === 0) {
          console.warn(`[ScrapeConfigSync][validate] ${domain} branch "${branchSlug}": missing or empty postalCodesServed`);
          continue;
        }
        for (const zip of branchCfg.postalCodesServed) {
          if (seenZips.has(zip)) {
            console.warn(`[ScrapeConfigSync][validate] ${domain}: ZIP ${zip} appears in both "${seenZips.get(zip)}" and "${branchSlug}" branches`);
          } else {
            seenZips.set(zip, branchSlug);
          }
        }
      }

      // Orphan-branch check: branch slug has no matching supplier row.
      const branchSlugs = Object.keys(cfg.branches);
      if (branchSlugs.length > 0) {
        try {
          const matches = await this.sequelize.query(
            `SELECT slug FROM suppliers WHERE slug = ANY($1::text[])`,
            { bind: [branchSlugs], type: this.sequelize.QueryTypes.SELECT }
          );
          const found = new Set(matches.map(r => r.slug));
          for (const slug of branchSlugs) {
            if (!found.has(slug)) {
              console.warn(`[ScrapeConfigSync][validate] ${domain} branch "${slug}": no supplier record with this slug`);
            }
          }
        } catch (err) {
          console.warn(`[ScrapeConfigSync][validate] ${domain}: orphan-slug check failed — ${err.message}`);
        }
      }
    }
  }

  /**
   * Sync one branch's coverage to one supplier row. Factored out so the
   * multi-branch path can reuse the existing union-merge + drift-log logic
   * without duplicating the ~70 lines of the single-branch inline path.
   *
   * Scope: ONLY coverage (postal_codes_served). Does NOT sync name/phone/
   * active/scrape_status — the single-branch path handles those inline, and
   * for multi-branch those fields should come from the per-branch migration
   * (e.g., migration 152 for cn-brown-lancaster), not from scrape-config.
   *
   * @param {object} supplier — { id, name, postal_codes_served, ... } DB row
   * @param {object} cfg — merged config (branch merged over top-level)
   * @param {string} supplierLabel — for log lines, e.g. "cnbrownenergy.com[cn-brown-augusta]"
   * @param {object} ctx — { skipCoverage, zipDbLoaded, zipDb, unresolvableZips }
   * @returns {Promise<{updated: boolean, driftDetected: boolean}>}
   */
  async _syncSupplierCoverage(supplier, cfg, supplierLabel, ctx) {
    if (ctx.skipCoverage) return { updated: false, driftDetected: false };

    const configZips = (cfg.postalCodesServed || [])
      .map(z => normalizeZip(z, supplierLabel))
      .filter(Boolean);

    if (ctx.zipDbLoaded) {
      configZips.forEach(z => { if (!ctx.zipDb[z]) ctx.unresolvableZips.add(z); });
    }

    if (configZips.length === 0 && cfg.postalCodesOverride !== true) {
      console.log(`[ScrapeConfigSync] Skipping empty coverage for ${supplierLabel}`);
      return { updated: false, driftDetected: false };
    }

    const rawDbZips = Array.isArray(supplier.postal_codes_served)
      ? supplier.postal_codes_served
      : (() => { try { return JSON.parse(supplier.postal_codes_served || '[]'); } catch (e) { return []; } })();
    const existingZips = rawDbZips.map(z => normalizeZip(z, supplierLabel)).filter(Boolean);

    let finalZips;
    if (cfg.postalCodesOverride === true) {
      finalZips = configZips;
      const configSet = new Set(configZips);
      const removed = existingZips.filter(z => !configSet.has(z));
      if (removed.length > 0 && existingZips.length > 0 && (removed.length / existingZips.length > 0.3 || removed.length > 20)) {
        console.warn(`[ScrapeConfigSync] LARGE SHRINK ${supplierLabel}: removing ${removed.length}/${existingZips.length} ZIPs (${Math.round(removed.length / existingZips.length * 100)}%)`);
      } else if (removed.length > 0) {
        console.log(`[ScrapeConfigSync] OVERRIDE ${supplierLabel}: removed ${removed.length} ZIPs`);
      }
    } else {
      finalZips = [...new Set([...existingZips, ...configZips])];
      if (existingZips.length > 0 && finalZips.length > existingZips.length * 3) {
        console.warn(`[ScrapeConfigSync] MASSIVE EXPANSION ${supplierLabel}: ${existingZips.length} → ${finalZips.length} ZIPs`);
      }
    }

    finalZips.sort((a, b) => Number(a) - Number(b));

    const rawSorted = [...rawDbZips].map(String).sort();
    const finalForCompare = [...finalZips].sort();
    const needsUpdate = JSON.stringify(rawSorted) !== JSON.stringify(finalForCompare);

    // Drift logging (always, even when no update needed)
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
    const driftDetected = dbOnly.length > 0 || configOnly.length > 0;

    if (!needsUpdate) return { updated: false, driftDetected };

    await this.sequelize.query(
      `UPDATE suppliers SET postal_codes_served = $1, updated_at = NOW() WHERE id = $2`,
      { bind: [JSON.stringify(finalZips), supplier.id], type: this.sequelize.QueryTypes.UPDATE }
    );
    return { updated: true, driftDetected };
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
module.exports._shouldSyncConfigEntry = _shouldSyncConfigEntry;
