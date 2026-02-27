#!/usr/bin/env node
/**
 * Generate Static Supplier Profile Pages
 * Creates /supplier/{slug}.html for each active supplier
 *
 * V2.0 — Profile Page Overhaul
 * - Price shown regardless of claim status
 * - Service details (payment, fuel types, min gallons)
 * - Nearby suppliers comparison hub
 * - Breadcrumb navigation
 * - sp- prefixed CSS classes (isolates from card styles)
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

// ─── Utility Functions ─────────────────────────────────────────

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return phone;
}

const stateNames = {
  'NY': 'New York', 'NJ': 'New Jersey', 'CT': 'Connecticut',
  'MA': 'Massachusetts', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
  'NH': 'New Hampshire', 'ME': 'Maine', 'VT': 'Vermont',
  'VA': 'Virginia', 'MD': 'Maryland', 'DE': 'Delaware', 'OH': 'Ohio'
};

// ─── Helper Functions (ported from prices.js byte-for-byte) ────

// Matches prices.js:436 — must produce same initials as card avatars
function getInitials(name) {
  if (!name) return '?';
  var words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

// Matches prices.js:447 — same hash = same color on card and profile
function getAvatarColor(name) {
  if (!name) return 0;
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 10;
}

// Matches prices.js:496 buildFreshness() — same thresholds, same labels
// Returns { dotClass, text } for server-side rendering into static HTML.
// Uses explicit UTC comparison to avoid timezone drift vs browser.
function getFreshness(scrapedAt) {
  if (!scrapedAt) return { dotClass: 'stale', text: 'Update time unknown' };

  var date = new Date(scrapedAt);
  if (isNaN(date.getTime())) return { dotClass: 'stale', text: 'Update time unknown' };

  var now = new Date();
  var diff = now - date;
  if (diff < 0) return { dotClass: 'stale', text: 'Update time unknown' };

  var hours = Math.floor(diff / (1000 * 60 * 60));
  var days = Math.floor(diff / (1000 * 60 * 60 * 24));

  var dotClass, text;
  if (hours < 24) {
    dotClass = 'fresh';
    text = hours < 1 ? 'Updated now' : hours + 'h ago';
  } else if (days <= 3) {
    dotClass = 'recent';
    text = days === 1 ? 'Yesterday' : days + 'd ago';
  } else {
    dotClass = 'stale';
    text = days < 7 ? days + 'd ago' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return { dotClass, text };
}

// Format JSONB arrays to display strings
function formatPaymentMethods(methods) {
  if (!methods || !Array.isArray(methods) || methods.length === 0) return null;
  const labels = {
    'cash': 'Cash', 'check': 'Check',
    'credit_card': 'Credit Card', 'debit_card': 'Debit Card'
  };
  return methods.map(m => labels[m] || m).join(', ');
}

function formatFuelTypes(types) {
  if (!types || !Array.isArray(types) || types.length === 0) return null;
  const labels = {
    'oil': 'Heating Oil', 'kerosene': 'Kerosene',
    'diesel': 'Diesel', 'propane': 'Propane'
  };
  return types.map(t => labels[t] || t).join(', ');
}

// ─── Nearby Suppliers Algorithm ────────────────────────────────
/**
 * Find nearby suppliers for comparison hub.
 *
 * Scoring: (countyOverlap * 10) + zipOverlap
 *
 * Fallback tiers (deterministic, 3-tier):
 *   1. Primary: county OR ZIP overlap (scored)
 *   2. Fallback 1: same county only (already captured by tier 1 scoring)
 *   3. Fallback 2: same state, sorted by price ASC
 *   4. If still none → return empty (section hidden)
 *
 * Strong = overlap score > 0 (county or ZIP overlap)
 * Weak = same-state fallback only (no overlap)
 */
function findNearbySuppliers(current, allSuppliers, limit) {
  if (limit === undefined) limit = 5;
  const currentCounties = current._normalizedCounties || [];
  const currentZips = current._normalizedZips || new Set();
  const state = current.state;

  if (!state) return [];

  // Filter: same state, exclude self, exclude stale >14 days
  var now = Date.now();
  var FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

  var candidates = allSuppliers.filter(function(s) {
    if (s.id === current.id) return false;
    if (s.state !== state) return false;
    if (!s.latestPrice) return false;
    var scrapedAt = s.latestPrice.scraped_at;
    if (!scrapedAt || (now - new Date(scrapedAt).getTime()) > FOURTEEN_DAYS) return false;
    return true;
  });

  // Tier 1: Score by county + ZIP overlap
  var scored = candidates.map(function(s) {
    var sCounties = s._normalizedCounties || [];
    var sZips = s._normalizedZips || new Set();

    var countyOverlap = 0;
    for (var i = 0; i < sCounties.length; i++) {
      if (currentCounties.indexOf(sCounties[i]) !== -1) countyOverlap++;
    }

    var zipOverlap = 0;
    for (var z of sZips) {
      if (currentZips.has(z)) zipOverlap++;
    }

    var score = (countyOverlap * 10) + zipOverlap;
    return { supplier: s, score: score };
  });

  // Strong matches: overlap score > 0
  var strong = scored
    .filter(function(s) { return s.score > 0; })
    .sort(function(a, b) {
      // Sort: score DESC, price ASC, freshness DESC
      if (b.score !== a.score) return b.score - a.score;
      var priceA = a.supplier.latestPrice.price_per_gallon;
      var priceB = b.supplier.latestPrice.price_per_gallon;
      if (priceA !== priceB) return priceA - priceB;
      return new Date(b.supplier.latestPrice.scraped_at) - new Date(a.supplier.latestPrice.scraped_at);
    });

  if (strong.length >= 3) {
    return strong.slice(0, limit).map(function(s) { return s.supplier; });
  }

  // Tier 3 fallback: same state, sorted by price ASC
  var weak = scored
    .filter(function(s) { return s.score === 0; })
    .sort(function(a, b) {
      var priceA = a.supplier.latestPrice.price_per_gallon;
      var priceB = b.supplier.latestPrice.price_per_gallon;
      if (priceA !== priceB) return priceA - priceB;
      return new Date(b.supplier.latestPrice.scraped_at) - new Date(a.supplier.latestPrice.scraped_at);
    });

  var combined = strong.concat(weak);

  // Dynamic count: if <3 strong, cap at 3 to avoid dilution. 3 strong > 5 mixed.
  var maxResults = strong.length >= 3 ? limit : Math.min(3, combined.length);

  return combined.slice(0, maxResults).map(function(s) { return s.supplier; });
}

// ─── SVG Icons ─────────────────────────────────────────────────

const SVG_PHONE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>';

const SVG_GLOBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>';

// ─── Page Template ─────────────────────────────────────────────

function generateSupplierPage(supplier, latestPrice, nearbySuppliers) {
  const name = escapeHtml(supplier.name);
  const city = escapeHtml(supplier.city) || '';
  const state = supplier.state || '';
  const stateName = stateNames[state] || state;
  const location = city && state ? `${city}, ${state}` : (city || stateName || '');
  const phone = formatPhone(supplier.phone);
  const website = supplier.website;
  const hasWebsite = website && website.startsWith('http');
  const isClaimed = !!supplier.claimedAt;

  // Avatar
  const initials = getInitials(supplier.name);
  const avatarColor = getAvatarColor(supplier.name);

  // Price — show regardless of claim status
  const hasPrice = latestPrice && latestPrice.price_per_gallon;
  const priceDisplay = hasPrice ? `$${latestPrice.price_per_gallon.toFixed(2)}` : null;
  const freshness = hasPrice ? getFreshness(latestPrice.scraped_at) : null;
  const minGallons = supplier.minimumGallons;

  // Service details
  const paymentMethods = formatPaymentMethods(supplier.paymentMethods);
  const fuelTypes = formatFuelTypes(supplier.fuelTypes);
  const seniorDiscount = supplier.seniorDiscount;
  const weekendDelivery = supplier.weekendDelivery;
  const emergencyDelivery = supplier.emergencyDelivery;
  const hasServiceDetails = paymentMethods || fuelTypes || minGallons ||
    (seniorDiscount && seniorDiscount !== 'unknown') ||
    weekendDelivery === 'yes' || emergencyDelivery === 'yes';

  // Service area
  const counties = supplier.serviceCounties || [];
  const towns = supplier.serviceCities || [];
  const serviceAreaText = counties.length > 0
    ? counties.map(c => escapeHtml(c)).join(', ')
    : (supplier.state ? stateName : 'Contact for service area');

  // Hours
  const hasVerifiedHours = !!supplier.hoursVerifiedAt;
  const hoursWeekday = supplier.hoursWeekday;
  const hoursSaturday = supplier.hoursSaturday;
  const hoursSunday = supplier.hoursSunday;

  // Meta description with price
  const metaPrice = hasPrice ? ` Current price: ${priceDisplay}/gal.` : '';
  const metaDesc = `${supplier.name} provides heating oil delivery in ${serviceAreaText}.${metaPrice} Contact for delivery availability.`;

  // ─── Build Sections ─────

  // 1. Hero
  const heroHtml = `
    <section class="sp-hero">
      <div class="sp-avatar" data-color="${avatarColor}">${escapeHtml(initials)}</div>
      <div class="sp-hero-text">
        <h1>${name}</h1>
        <p class="sp-location">${location}</p>
        ${isClaimed
          ? '<span class="sp-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="#2d8a2d"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg> Verified Business</span>'
          : '<span class="sp-claim-hint">Is this your business?</span>'}
      </div>
    </section>`;

  // 2. Price
  let priceHtml;
  if (hasPrice) {
    const priceMeta = [];
    if (minGallons) priceMeta.push(`${minGallons} gallon minimum`);
    if (freshness) priceMeta.push(`<span class="freshness-dot ${freshness.dotClass}"></span> ${escapeHtml(freshness.text)}`);

    priceHtml = `
    <section class="sp-price">
      <div class="sp-price-amount">${priceDisplay}<span class="sp-price-unit">/gal</span></div>
      ${priceMeta.length > 0 ? `<div class="sp-price-meta">${priceMeta.join(' &middot; ')}</div>` : ''}
    </section>`;
  } else {
    let helpText = '';
    if (phone && nearbySuppliers.length > 0) {
      helpText = 'Call for current pricing or check nearby suppliers below';
    } else if (phone) {
      helpText = 'Call for current pricing';
    } else if (nearbySuppliers.length > 0) {
      helpText = 'Check nearby suppliers below';
    }

    priceHtml = `
    <section class="sp-price sp-price-unavailable">
      <div class="sp-price-none">Price not available online</div>
      ${helpText ? `<p class="sp-price-help">${helpText}</p>` : ''}
    </section>`;
  }

  // 3. Breadcrumb
  const stateSlug = state ? state.toLowerCase() : '';
  const breadcrumbHtml = `
    <nav class="sp-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span class="sp-breadcrumb-sep">&rsaquo;</span>
      ${state ? `<a href="/prices.html?state=${stateSlug}">${escapeHtml(stateName)}</a> <span class="sp-breadcrumb-sep">&rsaquo;</span>` : ''}
      <span>${name}</span>
    </nav>`;

  // 4. Contact
  let contactHtml = '';
  if (phone || hasWebsite) {
    contactHtml = `
    <section class="sp-contact">
      ${phone ? `<a href="tel:${supplier.phone}" class="sp-contact-btn sp-contact-phone" data-supplier-id="${supplier.id}" data-supplier-name="${name}" data-action="call">${SVG_PHONE} ${phone}</a>` : ''}
      ${hasWebsite ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="sp-contact-btn sp-contact-website" data-supplier-id="${supplier.id}" data-supplier-name="${name}" data-action="website">${SVG_GLOBE} Visit Website</a>` : ''}
    </section>`;
  }

  // 5. Service Details
  let detailsHtml = '';
  if (hasServiceDetails) {
    const items = [];
    if (minGallons) items.push(`<div class="sp-detail-item"><dt>Minimum Order</dt><dd>${minGallons} gallons</dd></div>`);
    if (paymentMethods) items.push(`<div class="sp-detail-item"><dt>Payment</dt><dd>${escapeHtml(paymentMethods)}</dd></div>`);
    if (fuelTypes) items.push(`<div class="sp-detail-item"><dt>Fuel Types</dt><dd>${escapeHtml(fuelTypes)}</dd></div>`);
    if (seniorDiscount === 'yes') items.push('<div class="sp-detail-item"><dt>Senior Discount</dt><dd>Available</dd></div>');
    if (weekendDelivery === 'yes') items.push('<div class="sp-detail-item"><dt>Weekend Delivery</dt><dd>Available</dd></div>');
    if (emergencyDelivery === 'yes') items.push('<div class="sp-detail-item"><dt>Emergency Delivery</dt><dd>Available</dd></div>');

    if (items.length > 0) {
      detailsHtml = `
    <section class="sp-section sp-details">
      <h2>Service Details</h2>
      <dl class="sp-details-grid">${items.join('')}</dl>
    </section>`;
    }
  }

  // 6. Service Area
  let areaHtml = '';
  if (counties.length > 0 || towns.length > 0) {
    const countiesStr = counties.length > 0
      ? `<div class="sp-area-counties"><strong>Counties:</strong> ${counties.map(c => escapeHtml(c)).join(', ')}</div>`
      : '';

    let townsStr = '';
    if (towns.length > 0) {
      const TOWN_LIMIT = 20;
      const visibleTowns = towns.slice(0, TOWN_LIMIT);
      const remaining = towns.length - TOWN_LIMIT;
      townsStr = `<div class="sp-area-towns"><strong>Towns:</strong> ${visibleTowns.map(t => escapeHtml(t)).join(', ')}${remaining > 0 ? ` <span class="sp-towns-more">+${remaining} more</span>` : ''}</div>`;
    }

    areaHtml = `
    <section class="sp-section sp-area">
      <h2>Service Area</h2>
      ${countiesStr}
      ${townsStr}
    </section>`;
  }

  // 7. Hours
  let hoursHtml = '';
  if (hasVerifiedHours && (hoursWeekday || hoursSaturday || hoursSunday)) {
    const hourItems = [];
    if (hoursWeekday) hourItems.push(`<div class="sp-hours-row"><dt>Mon\u2013Fri</dt><dd>${escapeHtml(hoursWeekday)}</dd></div>`);
    if (hoursSaturday) hourItems.push(`<div class="sp-hours-row"><dt>Saturday</dt><dd>${escapeHtml(hoursSaturday)}</dd></div>`);
    if (hoursSunday) hourItems.push(`<div class="sp-hours-row"><dt>Sunday</dt><dd>${escapeHtml(hoursSunday)}</dd></div>`);

    hoursHtml = `
    <section class="sp-section sp-hours">
      <h2>Hours</h2>
      <dl class="sp-hours-dl">${hourItems.join('')}</dl>
      ${emergencyDelivery === 'yes' ? '<p class="sp-badge sp-badge-emergency">Emergency Delivery Available</p>' : ''}
      ${weekendDelivery === 'yes' ? '<p class="sp-badge sp-badge-weekend">Weekend Delivery Available</p>' : ''}
    </section>`;
  }

  // 8. Nearby Suppliers
  let nearbyHtml = '';
  if (nearbySuppliers.length > 0) {
    const nearbyCards = nearbySuppliers.map(function(ns) {
      const nsName = escapeHtml(ns.name);
      const nsInitials = getInitials(ns.name);
      const nsColor = getAvatarColor(ns.name);
      const nsCity = escapeHtml(ns.city) || '';
      const nsState = ns.state || '';
      const nsLocation = nsCity && nsState ? `${nsCity}, ${nsState}` : (nsCity || nsState);
      const nsPrice = ns.latestPrice ? `$${ns.latestPrice.price_per_gallon.toFixed(2)}` : '';
      const nsFreshness = ns.latestPrice ? getFreshness(ns.latestPrice.scraped_at) : null;

      return `
        <a href="/supplier/${ns.slug}" class="sp-nearby-card">
          <div class="sp-nearby-avatar" data-color="${nsColor}">${escapeHtml(nsInitials)}</div>
          <div class="sp-nearby-info">
            <h3>${nsName}</h3>
            <span class="sp-nearby-location">${nsLocation}</span>
          </div>
          ${nsPrice ? `<div class="sp-nearby-price">
            <span class="sp-nearby-amount">${nsPrice}<span class="sp-nearby-unit">/gal</span></span>
            ${nsFreshness ? `<span class="sp-nearby-freshness"><span class="freshness-dot ${nsFreshness.dotClass}"></span> ${escapeHtml(nsFreshness.text)}</span>` : ''}
          </div>` : ''}
        </a>`;
    }).join('');

    nearbyHtml = `
    <section class="sp-nearby">
      <h2>Compare with Nearby Suppliers</h2>
      <div class="sp-nearby-list">${nearbyCards}</div>
    </section>`;
  }

  // 9. Claim Banner (unclaimed only)
  let claimHtml = '';
  if (!isClaimed) {
    claimHtml = `
    <section class="sp-claim">
      <div class="sp-claim-content">
        <div class="sp-claim-text">
          <strong>Own this business?</strong>
          <span>Claim your listing to update pricing and details.</span>
        </div>
        <a href="/claim/${supplier.slug}" class="sp-claim-btn" rel="nofollow">Claim Listing</a>
      </div>
    </section>`;
  }

  // 10. App CTA
  let appCtaText, appCtaSubtext;
  if (hasPrice && nearbySuppliers.length > 0) {
    appCtaText = 'Track price changes for this supplier and nearby competitors';
    appCtaSubtext = 'Get alerts when prices drop in your area.';
  } else if (hasPrice) {
    appCtaText = 'Track price changes for this supplier';
    appCtaSubtext = 'Get alerts when prices drop.';
  } else {
    appCtaText = 'Get notified when this supplier posts a new price';
    appCtaSubtext = 'Price alerts, run-out predictions, and usage tracking.';
  }

  const appCtaHtml = `
    <section class="sp-section sp-app-cta">
      <h2>${escapeHtml(appCtaText)}</h2>
      <p>${escapeHtml(appCtaSubtext)}</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_supplier&utm_medium=website&utm_campaign=supplier_profile" class="btn btn-primary ios-only">Download HomeHeat Free &rarr;</a>
      <a href="/prices.html" class="btn btn-primary android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Save HomeHeat to Your Phone &rarr;</a>
      <p class="sp-app-micro ios-only">Free. No hardware. No ads.</p>
      <p class="sp-app-micro android-only" style="display:none">Works like an app &mdash; no download needed.</p>
    </section>`;

  // ─── JSON-LD ─────

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
    })
  };

  // areaServed — only if counties exist
  if (counties.length > 0) {
    schemaData.areaServed = counties.map(c => ({
      "@type": "AdministrativeArea",
      "name": c
    }));
  }

  // makesOffer — only if BOTH currency AND price exist
  if (hasPrice && latestPrice.price_per_gallon) {
    schemaData.makesOffer = {
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": latestPrice.price_per_gallon.toFixed(2),
      "itemOffered": {
        "@type": "Product",
        "name": "Heating Oil Delivery"
      }
    };
  }

  // paymentAccepted — only if methods exist
  if (paymentMethods) {
    schemaData.paymentAccepted = paymentMethods;
  }

  // openingHoursSpecification — only if verified hours with actual values
  if (hasVerifiedHours) {
    const hoursSpecs = [];
    if (hoursWeekday) {
      hoursSpecs.push({
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "description": hoursWeekday
      });
    }
    if (hoursSaturday) {
      hoursSpecs.push({
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Saturday",
        "description": hoursSaturday
      });
    }
    if (hoursSunday) {
      hoursSpecs.push({
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Sunday",
        "description": hoursSunday
      });
    }
    // Never render arrays with 0 length — omit the key entirely
    if (hoursSpecs.length > 0) {
      schemaData.openingHoursSpecification = hoursSpecs;
    }
  }

  // ─── Full Page ─────

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
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <link rel="canonical" href="https://www.gethomeheat.com/supplier/${supplier.slug}">

  <meta property="og:title" content="${name} - Heating Oil Delivery">
  <meta property="og:description" content="Heating oil delivery in ${escapeHtml(serviceAreaText)}">
  <meta property="og:type" content="business.business">
  <meta property="og:url" content="https://www.gethomeheat.com/supplier/${supplier.slug}">

  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">
  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="/style.min.css?v=38">
  <link rel="stylesheet" href="/supplier/supplier.css?v=25">

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
    ${heroHtml}
    ${priceHtml}
    ${breadcrumbHtml}
    ${contactHtml}
    ${detailsHtml}
    ${areaHtml}
    ${hoursHtml}
    ${nearbyHtml}
    ${claimHtml}
    ${appCtaHtml}
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
    <p>&copy; ${new Date().getFullYear()} HomeHeat by Tsoir Advisors LLC. All rights reserved.</p>
  </footer>

  <script src="/js/nav.js"></script>
  <script src="/js/widgets.js"></script>
  <script src="/js/seo-tracking.js"></script>
  <script src="/js/pwa.js"></script>
</body>
</html>`;
}

// ─── Main Generation Logic ─────────────────────────────────────

async function generateSupplierPages(options = {}) {
  const { sequelize: externalSequelize, logger = console, websiteDir } = options;
  const isCLI = !externalSequelize;

  if (isCLI) {
    logger.log('═══════════════════════════════════════════════════════════');
    logger.log('  Supplier Profile Page Generator V2');
    logger.log('  ' + new Date().toLocaleString());
    logger.log('═══════════════════════════════════════════════════════════');
    logger.log('');

    if (dryRun) {
      logger.log('DRY RUN - No files will be written\n');
    }
  }

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
      logger.log('Database connected\n');
    }

    // Get all active suppliers with slugs — includes service detail fields
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
        s.service_counties as "serviceCounties",
        s.service_cities as "serviceCities",
        s.postal_codes_served as "postalCodesServed",
        s.minimum_gallons as "minimumGallons",
        s.payment_methods as "paymentMethods",
        s.fuel_types as "fuelTypes",
        s.senior_discount as "seniorDiscount",
        s.delivery_model as "deliveryModel"
      FROM suppliers s
      WHERE s.active = true
        AND s.slug IS NOT NULL
      ORDER BY s.name
    `);

    logger.log(`Found ${suppliers.length} active suppliers with slugs\n`);

    // Get latest valid prices for ALL suppliers (not just claimed)
    const [prices] = await sequelize.query(`
      SELECT DISTINCT ON (supplier_id)
        supplier_id, price_per_gallon, scraped_at
      FROM supplier_prices
      WHERE is_valid = true
      ORDER BY supplier_id, scraped_at DESC
    `);

    // Parse price_per_gallon to Number — PostgreSQL DECIMAL returns as string
    const priceMap = new Map(prices.map(p => {
      p.price_per_gallon = parseFloat(p.price_per_gallon);
      return [p.supplier_id, p];
    }));

    // Pre-attach prices and pre-normalize counties/ZIPs for nearby algorithm.
    // Done ONCE here, NOT inside the nested loop.
    const anomalies = [];
    for (const supplier of suppliers) {
      supplier.latestPrice = priceMap.get(supplier.id) || null;

      // Normalize counties to lowercase for overlap comparison
      const rawCounties = supplier.serviceCounties || [];
      supplier._normalizedCounties = rawCounties.map(c => (c || '').toLowerCase().trim()).filter(Boolean);

      // Normalize ZIPs to a Set for O(1) lookup
      const rawZips = supplier.postalCodesServed || [];
      supplier._normalizedZips = new Set(rawZips.map(z => (z || '').trim()).filter(Boolean));

      // Log data anomalies (once per build)
      if (!supplier.state) anomalies.push(`${supplier.name} (${supplier.slug}): missing state`);
      if (rawCounties.length === 0 && rawZips.size === 0) {
        anomalies.push(`${supplier.name} (${supplier.slug}): no service area data`);
      }
    }

    if (anomalies.length > 0) {
      logger.log(`Data anomalies found (${anomalies.length}):`);
      anomalies.slice(0, 20).forEach(a => logger.log(`  - ${a}`));
      if (anomalies.length > 20) logger.log(`  ... and ${anomalies.length - 20} more`);
      logger.log('');
    }

    // Create output directory
    const baseDir = websiteDir || path.join(__dirname, '../website');
    const outputDir = path.join(baseDir, 'supplier');
    if (!dryRun && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate pages
    let generated = 0;
    let withPrice = 0;
    let withNearby = 0;
    for (const supplier of suppliers) {
      const latestPrice = supplier.latestPrice;
      const nearby = findNearbySuppliers(supplier, suppliers);
      const html = generateSupplierPage(supplier, latestPrice, nearby);
      const filePath = path.join(outputDir, `${supplier.slug}.html`);

      if (latestPrice) withPrice++;
      if (nearby.length > 0) withNearby++;

      if (!dryRun) {
        fs.writeFileSync(filePath, html);
      }
      generated++;

      if (isCLI && (generated <= 5 || generated % 50 === 0)) {
        logger.log(`  [${generated}/${suppliers.length}] ${supplier.name} → /supplier/${supplier.slug}.html${nearby.length > 0 ? ` (${nearby.length} nearby)` : ''}`);
      }
    }

    logger.log(`Generated ${generated} supplier profile pages (${withPrice} with prices, ${withNearby} with nearby)`);

    // Generate CSS file
    if (!dryRun) {
      const cssPath = path.join(outputDir, 'supplier.css');
      fs.writeFileSync(cssPath, generateSupplierCSS());
      if (isCLI) logger.log('Generated supplier.css');
    }

    if (!externalSequelize) {
      await sequelize.close();
    }

    if (isCLI) logger.log('\nDone!');

    return { success: true, generated, suppliers: suppliers.length };

  } catch (error) {
    logger.error('Error:', error.message);
    if (isCLI) process.exit(1);
    return { success: false, error: error.message };
  }
}

// ─── CSS Generation ────────────────────────────────────────────
function generateSupplierCSS() {
  return `/* ========================================
   Supplier Profile Styles (sp- prefix)
   ======================================== */

/* Page container */
.supplier-profile {
  max-width: 700px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

/* Shared button base (used by app CTA) */
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

/* Hero */
.sp-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.sp-avatar {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.5rem;
  color: white;
  flex-shrink: 0;
  letter-spacing: 0.02em;
  user-select: none;
}

/* Same 10-color palette as Phase 1 cards (style.css .supplier-avatar) */
.sp-avatar[data-color="0"] { background: #E07A5F; }
.sp-avatar[data-color="1"] { background: #3D85C6; }
.sp-avatar[data-color="2"] { background: #81B29A; }
.sp-avatar[data-color="3"] { background: #F2994A; }
.sp-avatar[data-color="4"] { background: #6C5B7B; }
.sp-avatar[data-color="5"] { background: #C06C84; }
.sp-avatar[data-color="6"] { background: #355C7D; }
.sp-avatar[data-color="7"] { background: #2D8A6E; }
.sp-avatar[data-color="8"] { background: #B5838D; }
.sp-avatar[data-color="9"] { background: #7B68AE; }

.sp-hero-text {
  min-width: 0;
}

.sp-hero-text h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-dark, #1a1a1a);
  margin: 0 0 4px;
  line-height: 1.2;
}

.sp-location {
  font-size: 1rem;
  color: var(--text-muted, #6b7280);
  margin: 0 0 6px;
}

.sp-verified {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #2d8a2d;
  background: #e8f5e9;
  padding: 2px 8px;
  border-radius: 4px;
}

.sp-claim-hint {
  font-size: 0.8125rem;
  color: var(--text-muted, #6b7280);
  font-style: italic;
}

/* Price */
.sp-price {
  background: var(--background-secondary, #FEF3EB);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.sp-price-amount {
  font-size: 2.25rem;
  font-weight: 700;
  color: #2d8a2d;
  margin: 0;
  line-height: 1.1;
}

.sp-price-unit {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
}

.sp-price-meta {
  font-size: 0.875rem;
  color: var(--text-muted, #6b7280);
  margin: 6px 0 0;
}

.sp-price-meta .freshness-dot {
  display: inline-block;
  vertical-align: middle;
  margin-right: 2px;
}

.sp-price-unavailable {
  text-align: center;
}

.sp-price-none {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-secondary, #374151);
  margin: 0 0 8px;
}

.sp-price-help {
  font-size: 0.875rem;
  color: var(--text-muted, #6b7280);
  margin: 0;
}

/* Breadcrumb */
.sp-breadcrumb {
  font-size: 0.8125rem;
  color: var(--text-muted, #6b7280);
  margin-bottom: 20px;
}

.sp-breadcrumb a {
  color: var(--text-muted, #6b7280);
  text-decoration: none;
}

.sp-breadcrumb a:hover {
  color: var(--primary-orange, #FF6B35);
  text-decoration: underline;
}

.sp-breadcrumb-sep {
  margin: 0 4px;
  color: var(--text-light, #9ca3af);
}

/* Contact */
.sp-contact {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.sp-contact-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.2s;
}

.sp-contact-btn svg {
  flex-shrink: 0;
}

.sp-contact-phone {
  background: var(--primary-orange, #FF6B35);
  color: white;
}

.sp-contact-phone:hover {
  background: var(--primary-orange-hover, #E55A2B);
}

.sp-contact-website {
  background: var(--background-secondary, #FEF3EB);
  color: var(--text-secondary, #374151);
}

.sp-contact-website:hover {
  background: #FDDCC8;
}

/* Shared section base */
.sp-section {
  background: var(--background-secondary, #FEF3EB);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.sp-section h2 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-dark, #1a1a1a);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Service Details Grid */
.sp-details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 0;
  padding: 0;
}

.sp-detail-item {
  display: flex;
  flex-direction: column;
}

.sp-detail-item dt {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin: 0;
}

.sp-detail-item dd {
  font-size: 0.9375rem;
  color: var(--text-dark, #1a1a1a);
  margin: 2px 0 0;
}

/* Service Area */
.sp-area-counties,
.sp-area-towns {
  margin-bottom: 8px;
  font-size: 0.9375rem;
  color: var(--text-dark, #1a1a1a);
  line-height: 1.5;
}

.sp-area-counties:last-child,
.sp-area-towns:last-child {
  margin-bottom: 0;
}

.sp-area-counties strong,
.sp-area-towns strong {
  font-weight: 600;
}

.sp-towns-more {
  color: var(--text-muted, #6b7280);
  font-style: italic;
}

/* Hours */
.sp-hours-dl {
  margin: 0;
  padding: 0;
}

.sp-hours-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.sp-hours-row:last-child {
  border-bottom: none;
}

.sp-hours-row dt {
  font-weight: 600;
  color: var(--text-dark, #1a1a1a);
}

.sp-hours-row dd {
  color: var(--text-secondary, #374151);
  margin: 0;
}

.sp-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-top: 12px;
}

.sp-badge-emergency {
  background: #fee2e2;
  color: #991b1b;
}

.sp-badge-weekend {
  background: #dbeafe;
  color: #1e40af;
}

/* Nearby Suppliers */
.sp-nearby {
  border-top: 1px solid var(--border-color, #E5D8D0);
  padding-top: 24px;
  margin-top: 8px;
  margin-bottom: 16px;
}

.sp-nearby h2 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-dark, #1a1a1a);
  margin: 0 0 16px;
}

.sp-nearby-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sp-nearby-card {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  align-items: center;
  background: var(--background-card, #FFFFFF);
  border: 1px solid var(--border-color, #E5D8D0);
  border-radius: 10px;
  padding: 12px 16px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.sp-nearby-card:hover {
  border-color: #c5b8b0;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
}

.sp-nearby-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  color: white;
  flex-shrink: 0;
  user-select: none;
}

/* Nearby avatar uses same palette */
.sp-nearby-avatar[data-color="0"] { background: #E07A5F; }
.sp-nearby-avatar[data-color="1"] { background: #3D85C6; }
.sp-nearby-avatar[data-color="2"] { background: #81B29A; }
.sp-nearby-avatar[data-color="3"] { background: #F2994A; }
.sp-nearby-avatar[data-color="4"] { background: #6C5B7B; }
.sp-nearby-avatar[data-color="5"] { background: #C06C84; }
.sp-nearby-avatar[data-color="6"] { background: #355C7D; }
.sp-nearby-avatar[data-color="7"] { background: #2D8A6E; }
.sp-nearby-avatar[data-color="8"] { background: #B5838D; }
.sp-nearby-avatar[data-color="9"] { background: #7B68AE; }

.sp-nearby-info {
  min-width: 0;
}

.sp-nearby-info h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-dark, #1a1a1a);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sp-nearby-location {
  font-size: 0.75rem;
  color: var(--text-muted, #6b7280);
}

.sp-nearby-price {
  text-align: right;
  white-space: nowrap;
}

.sp-nearby-amount {
  font-size: 1rem;
  font-weight: 700;
  color: #2d8a2d;
}

.sp-nearby-unit {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
}

.sp-nearby-freshness {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.625rem;
  color: var(--text-muted, #6b7280);
  justify-content: flex-end;
  margin-top: 2px;
}

/* Claim Banner */
.sp-claim {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.sp-claim-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sp-claim-text {
  font-size: 0.9375rem;
  color: #92400e;
}

.sp-claim-text strong {
  display: block;
  margin-bottom: 2px;
}

.sp-claim-btn {
  display: inline-block;
  padding: 8px 20px;
  background: var(--primary-orange, #FF6B35);
  color: white;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.2s;
}

.sp-claim-btn:hover {
  background: var(--primary-orange-hover, #E55A2B);
}

/* App CTA */
.sp-app-cta {
  text-align: center;
}

.sp-app-cta h2 {
  text-transform: none;
  letter-spacing: normal;
  font-size: 1rem;
}

.sp-app-cta p {
  color: var(--text-secondary, #374151);
  margin: 0 0 16px;
}

.sp-app-micro {
  font-size: 0.75rem;
  color: var(--text-muted, #6b7280);
  margin: 12px 0 0;
}

/* ========================================
   Mobile Responsive (V2)
   ======================================== */

@media (max-width: 480px) {
  .sp-hero {
    gap: 12px;
  }

  .sp-avatar {
    width: 56px;
    height: 56px;
    font-size: 1.25rem;
    border-radius: 12px;
  }

  .sp-hero-text h1 {
    font-size: 22px;
  }

  .sp-contact {
    flex-direction: column;
  }

  .sp-contact-btn {
    justify-content: center;
  }

  .sp-details-grid {
    grid-template-columns: 1fr;
  }

  .sp-claim-content {
    flex-direction: column;
    text-align: center;
  }

  .sp-nearby-card {
    grid-template-columns: 32px 1fr;
  }

  .sp-nearby-price {
    grid-column: 1 / -1;
    text-align: left;
    padding-left: 44px;
  }
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
