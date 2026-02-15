#!/usr/bin/env node
/**
 * Generate Static Supplier Profile Pages
 * Creates /supplier/{slug}.html for each active supplier
 *
 * Features:
 * - Static HTML (no live price data unless claimed)
 * - Service area by county
 * - Hours only if verified (Scope 17)
 * - Claim CTA linking to /for-suppliers.html
 *
 * Usage:
 *   node scripts/generate-supplier-pages.js
 *   node scripts/generate-supplier-pages.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format phone number
function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return phone;
}

// State abbreviation to full name
const stateNames = {
  'NY': 'New York', 'NJ': 'New Jersey', 'CT': 'Connecticut',
  'MA': 'Massachusetts', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
  'NH': 'New Hampshire', 'ME': 'Maine', 'VT': 'Vermont',
  'VA': 'Virginia', 'MD': 'Maryland', 'DE': 'Delaware', 'OH': 'Ohio'
};

// Generate HTML for a supplier profile page
function generateSupplierPage(supplier, latestPrice) {
  const name = escapeHtml(supplier.name);
  const city = escapeHtml(supplier.city) || '';
  const state = supplier.state || '';
  const stateName = stateNames[state] || state;
  const location = city && state ? `${city}, ${state}` : (city || stateName || '');
  const phone = formatPhone(supplier.phone);
  const website = supplier.website;
  const hasWebsite = website && website.startsWith('http');

  // Service area - summarize by county
  const counties = supplier.serviceCounties || [];
  const serviceArea = counties.length > 0
    ? counties.map(c => escapeHtml(c)).join(', ')
    : (supplier.state ? stateName : 'Contact for service area');

  // Claimed/verified status
  const isClaimed = !!supplier.claimedAt;
  const hasVerifiedHours = !!supplier.hoursVerifiedAt;

  // Price (only show if claimed)
  const showPrice = isClaimed && latestPrice;
  const priceDisplay = showPrice
    ? `$${latestPrice.price_per_gallon.toFixed(2)}/gal`
    : null;
  const priceDate = showPrice && latestPrice.scraped_at
    ? new Date(latestPrice.scraped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Hours (only show if verified)
  let hoursHtml = '';
  if (hasVerifiedHours) {
    const hours = [];
    if (supplier.hoursWeekday) hours.push(`<li><strong>Mon-Fri:</strong> ${escapeHtml(supplier.hoursWeekday)}</li>`);
    if (supplier.hoursSaturday) hours.push(`<li><strong>Saturday:</strong> ${escapeHtml(supplier.hoursSaturday)}</li>`);
    if (supplier.hoursSunday) hours.push(`<li><strong>Sunday:</strong> ${escapeHtml(supplier.hoursSunday)}</li>`);

    if (hours.length > 0) {
      hoursHtml = `
        <div class="supplier-section">
          <h2>Hours</h2>
          <ul class="hours-list">${hours.join('')}</ul>
          ${supplier.emergencyDelivery === 'yes' ? '<p class="badge badge-emergency">Emergency Delivery Available</p>' : ''}
          ${supplier.weekendDelivery === 'yes' ? '<p class="badge badge-weekend">Weekend Delivery Available</p>' : ''}
        </div>`;
    }
  }

  // Schema.org structured data
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": supplier.name,
    "@id": `https://www.gethomeheat.com/supplier/${supplier.slug}`,
    ...(hasWebsite && { "url": website }),
    ...(phone && { "telephone": phone }),
    ...(city && state && {
      "address": {
        "@type": "PostalAddress",
        "addressLocality": city,
        "addressRegion": state,
        "addressCountry": "US"
      }
    }),
    "areaServed": counties.map(c => ({
      "@type": "AdministrativeArea",
      "name": c
    }))
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-HCNTVGNVJ9');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - Heating Oil Delivery | HomeHeat</title>
  <meta name="description" content="${name} provides heating oil delivery in ${serviceArea}. Contact for current prices and delivery availability.">
  <link rel="canonical" href="https://www.gethomeheat.com/supplier/${supplier.slug}">

  <meta property="og:title" content="${name} - Heating Oil Delivery">
  <meta property="og:description" content="Heating oil delivery in ${serviceArea}">
  <meta property="og:type" content="business.business">
  <meta property="og:url" content="https://www.gethomeheat.com/supplier/${supplier.slug}">

  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">
  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="/style.min.css?v=26">
  <link rel="stylesheet" href="/supplier/supplier.css?v=24">

  <script type="application/ld+json">${JSON.stringify(schemaData)}</script>
</head>
<body>
  <nav class="nav">
    <div class="nav-container">
      <a href="/" class="nav-logo">
        <img src="/images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon">
        HomeHeat
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/prices">Prices</a></li>
        <li><a href="/for-suppliers">For Suppliers</a></li>
        <li><a href="/learn/">Learn</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </div>
  </nav>

  <main class="supplier-profile">
    <div class="supplier-header">
      <h1>${name}</h1>
      <p class="supplier-location">${location}</p>
      ${isClaimed ? '<span class="badge badge-claimed">Verified Business</span>' : ''}
    </div>

    <div class="supplier-contact">
      ${phone ? `<a href="tel:${supplier.phone}" class="contact-btn contact-phone" data-supplier-id="${supplier.id}" data-supplier-name="${name}" data-action="call"><span class="icon">&#128222;</span> ${phone}</a>` : ''}
      ${hasWebsite ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="contact-btn contact-website" data-supplier-id="${supplier.id}" data-supplier-name="${name}" data-action="website"><span class="icon">&#127760;</span> Visit Website</a>` : ''}
    </div>

    ${showPrice ? `
    <div class="supplier-section supplier-price">
      <h2>Current Price</h2>
      <p class="price-display">${priceDisplay}</p>
      <p class="price-meta">150+ gallons &middot; Updated ${priceDate}</p>
    </div>
    ` : `
    <div class="supplier-section supplier-price-cta">
      <h2>Looking for prices?</h2>
      <p>Search your ZIP code to see current heating oil prices from suppliers in your area.</p>
      <a href="/prices.html" class="btn btn-primary">Check Prices</a>
    </div>
    `}

    <div class="supplier-section">
      <h2>Service Area</h2>
      <p>${serviceArea}</p>
    </div>

    ${hoursHtml}

    <div class="supplier-section supplier-app-cta">
      <h2>Track Your Oil Usage</h2>
      <p>Get price drop alerts, run-out predictions, and track your heating oil &mdash; no sensors needed.</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_supplier&utm_medium=website&utm_campaign=supplier_profile" class="btn btn-primary ios-only">Download HomeHeat Free &rarr;</a>
      <a href="/prices.html" class="btn btn-primary android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Save HomeHeat to Your Phone &rarr;</a>
      <p class="app-micro ios-only">Free. No hardware. No ads.</p>
      <p class="app-micro android-only" style="display:none">Works like an app &mdash; no download needed.</p>
    </div>

    ${!isClaimed ? `
    <div class="supplier-section supplier-claim">
      <h2>Is this your business?</h2>
      <p>Claim your listing to display your current prices, hours, and connect with local customers.</p>
      <a href="/for-suppliers.html?supplier=${supplier.slug}" class="btn btn-secondary" rel="nofollow">Claim Your Listing</a>
    </div>
    ` : ''}
  </main>

  <div class="floating-app-wrapper ios-only" id="floating-app-wrapper">
    <button class="floating-app-dismiss" aria-label="Dismiss">&times;</button>
    <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_supplier&utm_medium=website&utm_campaign=supplier_floating" class="floating-app-icon" id="floating-app-cta">
      <img src="/images/app-icon.png" alt="HomeHeat">
      <div class="float-text">
        <span class="float-title">Get HomeHeat</span>
        <span class="float-subtitle">Free on App Store</span>
      </div>
    </a>
  </div>

  <footer class="footer">
    <div class="footer-links">
      <a href="/prices">Prices</a>
      <a href="/for-suppliers">For Suppliers</a>
      <a href="/how-prices-work">How Prices Work</a>
      <a href="/learn/">Learn</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </div>
    <p class="footer-audience">Built for homeowners who rely on heating oil or propane.</p>
    <p>&copy; ${new Date().getFullYear()} HomeHeat. All rights reserved.</p>
  </footer>

  <script src="/js/nav.js"></script>
  <script src="/js/widgets.js"></script>
  <script src="/js/seo-tracking.js"></script>
  <script src="/js/pwa.js"></script>
</body>
</html>`;
}

async function generateSupplierPages(options = {}) {
  const { sequelize: externalSequelize, logger = console, websiteDir } = options;
  const isCLI = !externalSequelize;

  if (isCLI) {
    logger.log('═══════════════════════════════════════════════════════════');
    logger.log('  Supplier Profile Page Generator');
    logger.log('  ' + new Date().toLocaleString());
    logger.log('═══════════════════════════════════════════════════════════');
    logger.log('');

    if (dryRun) {
      logger.log('🔍 DRY RUN - No files will be written\n');
    }
  }

  // Connect to database (or use provided instance)
  const sequelize = externalSequelize || new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    }
  });

  try {
    if (!externalSequelize) {
      await sequelize.authenticate();
      logger.log('✅ Database connected\n');
    }

    // Get all active suppliers with slugs
    const [suppliers] = await sequelize.query(`
      SELECT
        s.*,
        s.hours_weekday as "hoursWeekday",
        s.hours_saturday as "hoursSaturday",
        s.hours_sunday as "hoursSunday",
        s.weekend_delivery as "weekendDelivery",
        s.emergency_delivery as "emergencyDelivery",
        s.hours_verified_at as "hoursVerifiedAt",
        s.claimed_at as "claimedAt",
        s.service_counties as "serviceCounties"
      FROM suppliers s
      WHERE s.active = true
        AND s.slug IS NOT NULL
      ORDER BY s.name
    `);

    logger.log(`📋 Found ${suppliers.length} active suppliers with slugs\n`);

    // Get latest prices for claimed suppliers
    const [prices] = await sequelize.query(`
      SELECT DISTINCT ON (supplier_id)
        supplier_id, price_per_gallon, scraped_at
      FROM supplier_prices
      WHERE is_valid = true
      ORDER BY supplier_id, scraped_at DESC
    `);

    const priceMap = new Map(prices.map(p => [p.supplier_id, p]));

    // Create output directory
    const baseDir = websiteDir || path.join(__dirname, '../website');
    const outputDir = path.join(baseDir, 'supplier');
    if (!dryRun && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate pages
    let generated = 0;
    for (const supplier of suppliers) {
      const latestPrice = priceMap.get(supplier.id);
      const html = generateSupplierPage(supplier, latestPrice);
      const filePath = path.join(outputDir, `${supplier.slug}.html`);

      if (!dryRun) {
        fs.writeFileSync(filePath, html);
      }
      generated++;

      if (isCLI && (generated <= 5 || generated % 50 === 0)) {
        logger.log(`  [${generated}/${suppliers.length}] ${supplier.name} → /supplier/${supplier.slug}.html`);
      }
    }

    logger.log(`✅ Generated ${generated} supplier profile pages`);

    // Generate CSS file
    if (!dryRun) {
      const cssPath = path.join(outputDir, 'supplier.css');
      fs.writeFileSync(cssPath, generateSupplierCSS());
      if (isCLI) logger.log('✅ Generated supplier.css');
    }

    if (!externalSequelize) {
      await sequelize.close();
    }

    if (isCLI) logger.log('\n🎉 Done!');

    return { success: true, generated, suppliers: suppliers.length };

  } catch (error) {
    logger.error('❌ Error:', error.message);
    if (isCLI) process.exit(1);
    return { success: false, error: error.message };
  }
}

function generateSupplierCSS() {
  return `/* Supplier Profile Page Styles */

.supplier-profile {
  max-width: 700px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.supplier-header {
  text-align: center;
  margin-bottom: 24px;
}

.supplier-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.supplier-location {
  font-size: 18px;
  color: #666;
  margin: 0 0 12px;
}

.supplier-contact {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 32px;
}

.contact-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.2s;
}

.contact-phone {
  background: #FF6B35;
  color: white;
}

.contact-phone:hover {
  background: #E55A2B;
}

.contact-website {
  background: #FEF3EB;
  color: #374151;
}

.contact-website:hover {
  background: #FDDCC8;
}

.contact-btn .icon {
  font-size: 18px;
}

.supplier-section {
  background: #FEF3EB;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.supplier-section h2 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.supplier-price .price-display {
  font-size: 36px;
  font-weight: 700;
  color: #2d8a2d;
  margin: 0;
}

.supplier-price .price-meta {
  font-size: 14px;
  color: #4B5563;
  margin: 4px 0 0;
}

.supplier-price-cta {
  text-align: center;
}

.supplier-price-cta p {
  color: #4B5563;
  margin: 0 0 16px;
}

.hours-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.hours-list li {
  padding: 6px 0;
  color: #1a1a1a;
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.badge-claimed {
  background: #d1fae5;
  color: #065f46;
}

.badge-emergency {
  background: #fee2e2;
  color: #991b1b;
  margin-top: 12px;
}

.badge-weekend {
  background: #dbeafe;
  color: #1e40af;
  margin-top: 8px;
}

.supplier-claim {
  text-align: center;
  background: #fffbeb;
  border: 1px solid #fcd34d;
}

.supplier-claim p {
  color: #92400e;
  margin: 0 0 16px;
}

.btn {
  display: inline-block;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s;
}

.btn-primary {
  background: #FF6B35;
  color: white;
}

.btn-primary:hover {
  background: #E55A2B;
}

.btn-secondary {
  background: #FF6B35;
  color: white;
}

.btn-secondary:hover {
  background: #E55A2B;
}

@media (max-width: 480px) {
  .supplier-header h1 {
    font-size: 24px;
  }

  .supplier-contact {
    flex-direction: column;
  }

  .contact-btn {
    justify-content: center;
  }
}

.supplier-app-cta {
  text-align: center;
  background: #FEF3EB;
  border: 1px solid #E5D8D0;
}

.supplier-app-cta p {
  color: #374151;
  margin: 0 0 16px;
}

.supplier-app-cta .app-micro {
  font-size: 12px;
  color: #6b7280;
  margin: 12px 0 0;
}

`;
}

// Export for scheduler
module.exports = { generateSupplierPages };

// Run directly if executed from command line
if (require.main === module) {
  generateSupplierPages()
    .then(result => {
      if (result?.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(() => process.exit(1));
}
