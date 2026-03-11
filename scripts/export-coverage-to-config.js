#!/usr/bin/env node
/**
 * export-coverage-to-config.js
 *
 * One-time script to export postal_codes_served from the DB (via CSV dump)
 * into scrape-config.json, establishing config as the single source of truth.
 *
 * Usage:
 *   1. Dump coverage from prod:
 *      psql "$DATABASE_URL" -c "COPY (
 *        SELECT slug, website, postal_codes_served
 *        FROM suppliers
 *        WHERE postal_codes_served IS NOT NULL
 *      ) TO STDOUT CSV HEADER" > coverage_export.csv
 *
 *   2. Run dry-run:  node scripts/export-coverage-to-config.js --dry-run
 *   3. Run write:    node scripts/export-coverage-to-config.js --write
 *   4. Review:       git diff src/data/scrape-config.json
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../src/data/scrape-config.json');
const CSV_PATH = path.join(__dirname, '../coverage_export.csv');

const args = process.argv.slice(2);
const dryRun = !args.includes('--write');

if (dryRun) {
  console.log('[EXPORT] DRY RUN — pass --write to actually update scrape-config.json\n');
}

// --- Helpers ---

function normalizeZip(z, supplierName) {
  const s = String(z).trim();
  if (/^\d{5}/.test(s)) return s.slice(0, 5);
  if (s.length > 0) console.warn(`[EXPORT] Dropped invalid ZIP "${s}" for ${supplierName}`);
  return null;
}

function normalizeDomain(url) {
  if (!url) return null;
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const header = lines[0];
  if (!header.includes('slug') || !header.includes('postal_codes_served')) {
    throw new Error('CSV must have slug, website, postal_codes_served columns');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // CSV with JSONB arrays is tricky — postal_codes_served is quoted JSON
    // Format: slug,website,"[""10001"",""10002""]"
    // Use a simple state machine to handle quoted fields
    const fields = parseCSVLine(line);
    if (fields.length < 3) {
      console.warn(`[EXPORT] Skipping malformed line ${i + 1}: ${line.substring(0, 80)}...`);
      continue;
    }

    const [slug, website, postalRaw] = fields;

    let zips = [];
    try {
      // JSONB exports as JSON array string
      const parsed = JSON.parse(postalRaw);
      if (Array.isArray(parsed)) {
        zips = parsed;
      }
    } catch (e) {
      // Maybe it's a plain string or empty
      if (postalRaw && postalRaw.trim() !== '') {
        console.warn(`[EXPORT] Could not parse postal_codes_served for ${slug}: ${postalRaw.substring(0, 50)}`);
      }
    }

    rows.push({ slug, website, zips });
  }

  return rows;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// --- Main ---

if (!fs.existsSync(CSV_PATH)) {
  console.error(`[EXPORT] CSV not found at ${CSV_PATH}`);
  console.error('Run the psql COPY command first — see script header for instructions.');
  process.exit(1);
}

const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parseCSV(csvContent);
console.log(`[EXPORT] Loaded ${rows.length} suppliers from CSV\n`);

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Build domain→configKey lookup from existing config
const domainToKey = {};
for (const [key, val] of Object.entries(config)) {
  if (key.startsWith('_')) continue;
  if (typeof val !== 'object' || val === null) continue;
  const normalized = normalizeDomain(key);
  if (normalized) domainToKey[normalized] = key;
}

// Build slug→configKey lookup (for suppliers whose website domain matches a config key)
// We'll also try matching by extracting domain from the supplier's website
const stats = {
  matched: 0,
  newEntries: 0,
  noWebsite: [],
  warnings: 0,
  skippedEmpty: 0,
};

for (const row of rows) {
  const { slug, website, zips: rawZips } = row;

  // Normalize ZIPs
  const dbZips = rawZips
    .map(z => normalizeZip(z, slug))
    .filter(Boolean);

  if (dbZips.length === 0) {
    stats.skippedEmpty++;
    continue;
  }

  // Try to find matching config entry
  let configKey = null;

  // Match by domain from supplier's website
  if (website) {
    const domain = normalizeDomain(website);
    if (domain) {
      // Direct match
      if (domainToKey[domain]) {
        configKey = domainToKey[domain];
      } else {
        // Try without subdomain variations (order.X, shop.X)
        const parts = domain.split('.');
        if (parts.length > 2) {
          const baseDomain = parts.slice(-2).join('.');
          if (domainToKey[baseDomain]) {
            configKey = domainToKey[baseDomain];
          }
        }
        // Try adding www
        if (!configKey && domainToKey['www.' + domain]) {
          configKey = domainToKey['www.' + domain];
        }
      }
    }
  }

  if (configKey) {
    // Match found — union merge
    const cfg = config[configKey];
    const existingConfigZips = (cfg.postalCodesServed || [])
      .map(z => normalizeZip(z, configKey))
      .filter(Boolean);

    const configSet = new Set(existingConfigZips);
    const dbSet = new Set(dbZips);

    // Check for config ZIPs not in DB (pre-existing drift)
    const configOnly = existingConfigZips.filter(z => !dbSet.has(z));
    if (configOnly.length > 0) {
      console.warn(`[EXPORT WARNING] ${slug} (${configKey}): ${configOnly.length} ZIPs in config not in DB`);
      stats.warnings++;
    }

    // Union merge
    const merged = [...new Set([...existingConfigZips, ...dbZips])];
    merged.sort((a, b) => Number(a) - Number(b));

    const added = dbZips.filter(z => !configSet.has(z));
    if (added.length > 0) {
      console.log(`[EXPORT] ${slug} (${configKey}): adding ${added.length} ZIPs from DB (${existingConfigZips.length} → ${merged.length})`);
    }

    cfg.postalCodesServed = merged;
    stats.matched++;
  } else {
    // No match — create disabled entry
    if (!website) {
      stats.noWebsite.push(slug);
      // Create entry with slug as key
      const entryKey = `_no_website_${slug}`;
      config[entryKey] = {
        enabled: false,
        pattern: 'none',
        notes: `DISABLED: No website — directory-only. Slug: ${slug}`,
        postalCodesServed: dbZips.sort((a, b) => Number(a) - Number(b)),
      };
      stats.newEntries++;
      console.log(`[EXPORT] NEW (no website) ${slug}: ${dbZips.length} ZIPs — needs manual config entry`);
    } else {
      const domain = normalizeDomain(website);
      const entryKey = domain || slug;
      config[entryKey] = {
        enabled: false,
        pattern: 'none',
        notes: `DISABLED: Added by coverage export — not yet in scrape config. Slug: ${slug}`,
        postalCodesServed: dbZips.sort((a, b) => Number(a) - Number(b)),
      };
      stats.newEntries++;
      console.log(`[EXPORT] NEW ${slug} → ${entryKey}: ${dbZips.length} ZIPs`);
    }
  }
}

// Validate all postalCodesServed entries
let validationErrors = 0;
for (const [key, val] of Object.entries(config)) {
  if (key.startsWith('_') || typeof val !== 'object' || val === null) continue;
  if (!Array.isArray(val.postalCodesServed)) continue;

  const zips = val.postalCodesServed;
  const invalid = zips.filter(z => !/^\d{5}$/.test(z));
  if (invalid.length > 0) {
    console.error(`[EXPORT VALIDATION] ${key}: ${invalid.length} invalid ZIPs: ${invalid.slice(0, 5).join(', ')}`);
    validationErrors++;
  }

  const dupes = zips.filter((z, i) => zips.indexOf(z) !== i);
  if (dupes.length > 0) {
    console.error(`[EXPORT VALIDATION] ${key}: ${dupes.length} duplicate ZIPs`);
    // Deduplicate
    val.postalCodesServed = [...new Set(zips)].sort((a, b) => Number(a) - Number(b));
    validationErrors++;
  }

  if (zips.length > 500) {
    console.error(`[EXPORT VALIDATION] ${key}: ${zips.length} ZIPs (>500 — suspicious)`);
    validationErrors++;
  }
}

// Print summary
console.log('\n=== EXPORT SUMMARY ===');
console.log(`  Suppliers in CSV:      ${rows.length}`);
console.log(`  Matched to config:     ${stats.matched}`);
console.log(`  New config entries:     ${stats.newEntries}`);
console.log(`  Skipped (empty ZIPs):  ${stats.skippedEmpty}`);
console.log(`  Warnings:              ${stats.warnings}`);
console.log(`  Validation errors:     ${validationErrors}`);

if (stats.noWebsite.length > 0) {
  console.log(`\n  Suppliers with no website (need manual review):`);
  for (const slug of stats.noWebsite) {
    console.log(`    - ${slug}`);
  }
}

if (!dryRun) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\n[EXPORT] ✅ Written to ${CONFIG_PATH}`);
  console.log('[EXPORT] Run: git diff src/data/scrape-config.json');
} else {
  console.log(`\n[EXPORT] DRY RUN complete — pass --write to apply changes`);
}
