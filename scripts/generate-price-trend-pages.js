#!/usr/bin/env node
/**
 * Price Trend Page Generator (Phase C4)
 *
 * Creates auto-generated pages answering "should I buy heating oil now?"
 * with buy-timing verdicts, weekly price history, and volatility indicators.
 *
 * URLs:
 *   /price-trend/{state}/index.html       — e.g., /price-trend/ny/
 *   /price-trend/{state}/{county}.html     — e.g., /price-trend/ny/westchester.html
 *
 * Thresholds (stricter than Phase C):
 *   - ≥3 suppliers in the area
 *   - ≥2 active prices within 48 hours
 *   - ≥3 weeks of historical data (weeks_available)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-price-trend-pages.js
 *   DATABASE_URL="..." node scripts/generate-price-trend-pages.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const {
  init, STATES, BASE_URL,
  getCountyOilStats, getStateOilStats, getRecentPriceCount,
  getCountyWeeklyHistory, getCountyEligibility,
  getCssPath, getNavHTML, getFooterHTML,
  slugify, formatPrice,
} = require('./lib/county-data');

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const OUTPUT_DIR = path.join(WEBSITE_DIR, 'price-trend');

// Initialize shared module
init(WEBSITE_DIR);

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');

// ── Helpers ──────────────────────────────────────────────────────

function computeVolatility(history) {
  if (history.length < 4) return null;
  const medians = history.map(h => parseFloat(h.median_price));
  const mean = medians.reduce((a, b) => a + b, 0) / medians.length;
  const variance = medians.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / medians.length;
  return Math.sqrt(variance);
}

function getVolatilityLabel(stdDev) {
  if (stdDev < 0.10) return 'Low';
  if (stdDev < 0.25) return 'Moderate';
  return 'High';
}

function getTrendHeadline(county, percentChange, weeksAvailable) {
  if (percentChange === null || percentChange === undefined) {
    return `Current Oil Prices in ${county} County`;
  }
  const pct = parseFloat(percentChange);
  const weeks = Math.min(parseInt(weeksAvailable, 10) || 6, 6);
  const weekLabel = `${weeks} Week${weeks !== 1 ? 's' : ''}`;
  if (Math.abs(pct) < 2) {
    return `Oil Prices in ${county} County Are Holding Steady`;
  }
  if (pct >= 2) {
    return `Oil Prices in ${county} County Are Up ${Math.abs(pct).toFixed(1)}% in ${weekLabel}`;
  }
  return `Oil Prices in ${county} County Are Down ${Math.abs(pct).toFixed(1)}% in ${weekLabel}`;
}

function getTrendSentence(county, percentChange, weeksAvailable) {
  if (percentChange === null || percentChange === undefined) {
    return `Pricing data for ${county} County is being collected. Check back soon for trend analysis.`;
  }
  const pct = parseFloat(percentChange);
  const weeks = Math.min(parseInt(weeksAvailable, 10) || 6, 6);
  if (Math.abs(pct) < 2) {
    return `Prices have been stable in ${county} County, varying less than 2% over ${weeks} weeks.`;
  }
  if (pct >= 2) {
    return `Heating oil prices in ${county} County are up ${Math.abs(pct).toFixed(1)}% over the past ${weeks} weeks, suggesting strong seasonal demand.`;
  }
  return `Prices in ${county} County have dropped ${Math.abs(pct).toFixed(1)}% in ${weeks} weeks, indicating softening demand.`;
}

function getBuyVerdict(percentChange) {
  if (percentChange === null || percentChange === undefined) {
    return { label: 'Trend data pending', cssClass: '', show: false };
  }
  const pct = parseFloat(percentChange);
  if (pct <= -3) {
    return { label: 'Good time to buy', cssClass: 'calc-payback-good', show: true };
  }
  if (pct >= 3) {
    return { label: 'Prices elevated', cssClass: 'calc-payback-long', show: true };
  }
  return { label: 'Typical', cssClass: 'calc-payback-ok', show: true };
}

function formatWeekDate(weekStart) {
  const d = new Date(weekStart);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Chart HTML ───────────────────────────────────────────────────

function generateChartHTML(history, county) {
  if (history.length < 3) return '';

  // Reverse so oldest is first (left side of chart)
  const sorted = [...history].reverse();
  const labels = sorted.map(h => {
    const d = new Date(h.week_start);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const medians = sorted.map(h => parseFloat(h.median_price));
  const mins = sorted.map(h => parseFloat(h.min_price));
  const maxs = sorted.map(h => parseFloat(h.max_price));

  const chartData = JSON.stringify({ labels, medians, mins, maxs });

  return `
        <div style="margin: 1.5rem 0;">
            <h2>Price Trend — ${county} County</h2>
            <div style="position: relative; height: 260px;">
                <canvas id="price-trend-chart"></canvas>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-light); margin-top: 0.5rem; text-align: center;">
                Orange line = median price &nbsp;|&nbsp; Shaded area = low–high range
            </p>
        </div>
        <script>
        (function() {
            var d = ${chartData};
            function initChart() {
                var canvas = document.getElementById('price-trend-chart');
                if (!canvas || typeof Chart === 'undefined') return;
                var ctx = canvas.getContext('2d');
                var h = canvas.parentElement.clientHeight;
                var grad = ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, 'rgba(234,88,12,0.18)');
                grad.addColorStop(1, 'rgba(234,88,12,0.02)');
                new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: d.labels,
                        datasets: [
                            {
                                label: 'High',
                                data: d.maxs,
                                borderColor: 'transparent',
                                backgroundColor: 'rgba(234,88,12,0.08)',
                                fill: '+1',
                                pointRadius: 0,
                                tension: 0.3
                            },
                            {
                                label: 'Low',
                                data: d.mins,
                                borderColor: 'transparent',
                                backgroundColor: 'transparent',
                                fill: false,
                                pointRadius: 0,
                                tension: 0.3
                            },
                            {
                                label: 'Median',
                                data: d.medians,
                                borderColor: '#ea580c',
                                backgroundColor: grad,
                                borderWidth: 2.5,
                                fill: 'origin',
                                pointRadius: 3,
                                pointBackgroundColor: '#ea580c',
                                pointBorderColor: '#fff',
                                pointBorderWidth: 1.5,
                                pointHoverRadius: 5,
                                tension: 0.3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: function(items) { return items[0].label; },
                                    label: function(item) {
                                        var i = item.dataIndex;
                                        return [
                                            'Median: $' + d.medians[i].toFixed(2),
                                            'Low: $' + d.mins[i].toFixed(2),
                                            'High: $' + d.maxs[i].toFixed(2)
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                grace: '10%',
                                ticks: {
                                    callback: function(v) { return '$' + v.toFixed(2); },
                                    font: { size: 11 }
                                },
                                grid: { color: 'rgba(0,0,0,0.06)' }
                            },
                            x: {
                                ticks: { font: { size: 11 }, maxRotation: 45 },
                                grid: { display: false }
                            }
                        }
                    }
                });
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initChart);
            } else {
                initChart();
            }
        })();
        </script>`;
}

// ── County Page Generator ────────────────────────────────────────

function generateCountyPageHTML(stateCode, stateInfo, county, countyStats, history, eligibility) {
  const depth = 2;
  const stateAbbrev = stateInfo.abbrev;
  const stateName = stateInfo.name;
  const today = new Date().toISOString().split('T')[0];
  const currentYear = today.slice(0, 4);
  const countySlug = slugify(county);
  const weeksAvailable = parseInt(countyStats.weeks_available, 10) || 0;
  const percentChange = countyStats.percent_change_6w;

  const headline = getTrendHeadline(county, percentChange, weeksAvailable);
  const trendSentence = getTrendSentence(county, percentChange, weeksAvailable);
  const verdict = getBuyVerdict(percentChange);

  const medianPrice = parseFloat(countyStats.median_price);
  const minPrice = parseFloat(countyStats.min_price);
  const maxPrice = parseFloat(countyStats.max_price);

  const title = `Heating Oil Price Trend in ${county} County, ${stateName} (${currentYear})`;

  // Dynamic meta description
  let trendWord = 'stable';
  if (percentChange !== null && percentChange !== undefined) {
    const pct = parseFloat(percentChange);
    if (pct >= 2) trendWord = `up ${Math.abs(pct).toFixed(1)}%`;
    else if (pct <= -2) trendWord = `down ${Math.abs(pct).toFixed(1)}%`;
  }
  const description = `Heating oil prices in ${county} County are ${trendWord}. See weekly price history, buy-timing verdict, and current median of ${formatPrice(medianPrice)}/gal.`;
  const canonicalURL = `${BASE_URL}/price-trend/${stateAbbrev}/${countySlug}`;

  // Schema.org BreadcrumbList
  const schemaBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Price Trends', item: `${BASE_URL}/price-trend/` },
      { '@type': 'ListItem', position: 3, name: stateName, item: `${BASE_URL}/price-trend/${stateAbbrev}/` },
      { '@type': 'ListItem', position: 4, name: `${county} County`, item: canonicalURL },
    ],
  });

  // FAQPage schema
  const faq1Q = `Are heating oil prices going up or down in ${county} County?`;
  const faq1A = trendSentence + ` The current median price is ${formatPrice(medianPrice)}/gallon based on ${parseInt(countyStats.supplier_count, 10)} tracked suppliers.`;

  const faq2Q = `When is the best time to buy heating oil in ${county} County?`;
  const faq2A = `Historically, heating oil prices in the Northeast tend to be lowest in late spring and summer (May–August) when demand drops. In ${county} County, the current trend is ${trendWord}. Use our price tracking tools to monitor weekly changes and buy when prices dip.`;

  const schemaFAQ = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: faq1Q, acceptedAnswer: { '@type': 'Answer', text: faq1A } },
      { '@type': 'Question', name: faq2Q, acceptedAnswer: { '@type': 'Answer', text: faq2A } },
    ],
  });

  // Buy-timing verdict HTML
  let verdictHTML = '';
  if (verdict.show) {
    verdictHTML = `
        <div class="${verdict.cssClass}" style="display: inline-block; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; margin: 1rem 0;">
            ${verdict.label}
        </div>`;
  } else {
    verdictHTML = `<p style="color: var(--text-light); margin: 1rem 0;">Trend data pending</p>`;
  }

  // Current price snapshot
  const priceSnapshotHTML = `
        <h2>Current Price Snapshot</h2>
        <div style="display: flex; gap: 2rem; flex-wrap: wrap; margin: 1rem 0;">
            <div>
                <p style="font-size: 0.85rem; color: var(--text-light); margin: 0;">Median</p>
                <p style="font-size: 1.5rem; font-weight: 700; margin: 0;">${formatPrice(medianPrice)}<span style="font-size: 0.85rem; font-weight: 400;">/gal</span></p>
            </div>
            <div>
                <p style="font-size: 0.85rem; color: var(--text-light); margin: 0;">Low</p>
                <p style="font-size: 1.5rem; font-weight: 700; color: #16a34a; margin: 0;">${formatPrice(minPrice)}</p>
            </div>
            <div>
                <p style="font-size: 0.85rem; color: var(--text-light); margin: 0;">High</p>
                <p style="font-size: 1.5rem; font-weight: 700; color: #dc2626; margin: 0;">${formatPrice(maxPrice)}</p>
            </div>
        </div>`;

  // Volatility indicator
  let volatilityHTML = '';
  const stdDev = computeVolatility(history);
  if (stdDev !== null && weeksAvailable >= 4) {
    const volLabel = getVolatilityLabel(stdDev);
    volatilityHTML = `
        <p style="font-size: 0.9rem; color: var(--text-light); margin-top: 0.5rem;">
            Price volatility (${history.length} weeks): <strong>${volLabel}</strong>
        </p>`;
  } else if (weeksAvailable < 4) {
    volatilityHTML = `
        <p style="font-size: 0.9rem; color: var(--text-light); margin-top: 0.5rem;">
            Insufficient data for volatility assessment
        </p>`;
  }

  // Weekly price history table
  let historyTableHTML = '';
  if (history.length > 0) {
    let rows = '';
    for (const h of history) {
      rows += `
                    <tr>
                        <td>${formatWeekDate(h.week_start)}</td>
                        <td><strong>${formatPrice(h.median_price)}</strong></td>
                        <td>${formatPrice(h.min_price)}</td>
                        <td>${formatPrice(h.max_price)}</td>
                        <td>${h.supplier_count}</td>
                    </tr>`;
    }
    historyTableHTML = `
        <h2>Weekly Price History — ${county} County</h2>
        <div style="overflow-x: auto;">
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>Week</th>
                        <th>Median</th>
                        <th>Low</th>
                        <th>High</th>
                        <th>Suppliers</th>
                    </tr>
                </thead>
                <tbody>${rows}
                </tbody>
            </table>
        </div>`;
  } else {
    historyTableHTML = `
        <p style="color: var(--text-light); margin: 1rem 0;">Price history not yet available for ${county} County.</p>`;
  }

  // Last updated
  const lastUpdated = countyStats.last_scrape_at
    ? new Date(countyStats.last_scrape_at).toISOString().split('T')[0]
    : today;

  // Cross-links (conditional on eligibility)
  let crossLinks = '';
  crossLinks += `\n            <li><a href="/heating-cost/${stateAbbrev}/${countySlug}">Heating Cost Comparison in ${county} County</a></li>`;
  if (eligibility.avgBill) {
    crossLinks += `\n            <li><a href="/average-heating-bill/${stateAbbrev}/${countySlug}">Average Heating Bill in ${county} County</a></li>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
<script src="${'../'.repeat(depth)}js/analytics.js"></script>

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-itunes-app" content="app-id=6747320571">
    <title>${title}</title>
    <meta name="description" content="${description}">

    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalURL}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaBreadcrumb}</script>
    <script type="application/ld+json">${schemaFAQ}</script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" defer></script>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
            <a href="/price-trend/${stateAbbrev}/">Price Trends in ${stateName}</a> → ${county} County
        </p>

        <h1>${headline}</h1>

        <p>${trendSentence}</p>

        ${verdictHTML}
        ${volatilityHTML}

        ${generateChartHTML(history, county)}

        ${priceSnapshotHTML}

        ${historyTableHTML}

        <p style="font-size: 0.85rem; color: var(--text-light); margin-top: 1rem;">Data updated ${lastUpdated}.</p>

        <div class="calc-inline-zip">
            <span>Get prices for your ZIP:</span>
            <input type="text" maxlength="5" inputmode="numeric" pattern="[0-9]*" placeholder="ZIP code" class="calc-inline-zip-input" data-calc-zip>
            <a href="/tools/heating-cost-calculator" class="calc-inline-zip-btn" data-calc-go>Compare Costs</a>
        </div>

        <!-- App CTA -->
        <section class="zip-cta" style="margin: 2rem 0;">
            <h3>Track Price Drops in the HomeHeat App</h3>
            <p>Get notified when heating oil prices drop in ${county} County.</p>
            <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_trend&utm_medium=website&utm_campaign=trend_${stateAbbrev}_${countySlug}" class="cta-button" style="color:white">Get HomeHeat Free →</a>
            <p style="font-size:0.8rem;color:var(--text-gray);margin:0.75rem 0 0">Free app for iPhone. No hardware. No ads.</p>
        </section>

        <h2>Compare Suppliers in ${county} County</h2>
        <p>The spread between cheapest and most expensive supplier in ${county} County can be $0.50–$1.00/gallon.</p>
        <p><strong><a href="/prices/${stateAbbrev}/${countySlug}-county">Compare ${county} County Oil Prices →</a></strong></p>

        <h2>Data Sources & Methodology</h2>
        <p style="font-size: 0.9rem; color: var(--text-light);">
            Prices are collected daily from ${parseInt(countyStats.supplier_count, 10)} heating oil suppliers serving ${county} County. Weekly statistics are computed from validated supplier prices. Trend percentages compare the most recent week's median to the median from ${Math.min(parseInt(weeksAvailable, 10) || 6, 6)} weeks ago. This data is for informational purposes only and does not constitute financial advice.
        </p>

        <hr style="margin: 2.5rem 0; border: none; border-top: 1px solid var(--border-color);">

        <h3>Related</h3>
        <ul>
            <li><a href="/prices/${stateAbbrev}/${countySlug}-county">${county} County Oil Prices</a></li>${crossLinks}
            <li><a href="/tools/heating-cost-calculator">Heating Cost Calculator</a></li>
            <li><a href="/learn/cheapest-way-to-heat-your-home">What's the Cheapest Way to Heat Your Home?</a></li>
            <li><a href="/learn/heating-oil-vs-heat-pump">Heating Oil vs Heat Pump: Cost Comparison</a></li>
        </ul>

        <p style="margin-top: 2rem;">
            <a href="/price-trend/${stateAbbrev}/">← Price trends in ${stateName}</a>
        </p>
    </section>

    ${getFooterHTML(depth)}
</body>
</html>`;
}

// ── State Page Generator ─────────────────────────────────────────

function generateStatePageHTML(stateCode, stateInfo, stateStats, countyData) {
  const depth = 2;
  const stateAbbrev = stateInfo.abbrev;
  const stateName = stateInfo.name;
  const today = new Date().toISOString().split('T')[0];
  const currentYear = today.slice(0, 4);

  const title = `Heating Oil Price Trends in ${stateName} (${currentYear})`;
  const description = `Heating oil price trends across ${stateName} counties. See which areas have rising or falling prices and when to buy.`;
  const canonicalURL = `${BASE_URL}/price-trend/${stateAbbrev}/`;

  // Schema.org BreadcrumbList
  const schemaBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Price Trends', item: `${BASE_URL}/price-trend/` },
      { '@type': 'ListItem', position: 3, name: stateName, item: canonicalURL },
    ],
  });

  const schemaArticle = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    author: { '@type': 'Organization', name: 'HomeHeat' },
    publisher: { '@type': 'Organization', name: 'HomeHeat', url: BASE_URL },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: canonicalURL,
  });

  // County trend table
  let countyRows = '';
  const sortedCounties = [...countyData].sort((a, b) => {
    const aChange = parseFloat(a.stats.percent_change_6w) || 0;
    const bChange = parseFloat(b.stats.percent_change_6w) || 0;
    return aChange - bChange; // lowest (biggest drops) first
  });

  for (const cd of sortedCounties) {
    const median = formatPrice(cd.stats.median_price);
    const pct = cd.stats.percent_change_6w !== null ? parseFloat(cd.stats.percent_change_6w) : null;
    const verdict = getBuyVerdict(pct);
    const countySlug = slugify(cd.county);

    let changeDisplay = '—';
    if (pct !== null) {
      if (Math.abs(pct) < 2) {
        changeDisplay = `→ ${Math.abs(pct).toFixed(1)}%`;
      } else if (pct > 0) {
        changeDisplay = `↑ ${Math.abs(pct).toFixed(1)}%`;
      } else {
        changeDisplay = `↓ ${Math.abs(pct).toFixed(1)}%`;
      }
    }

    let verdictBadge = '';
    if (verdict.show) {
      verdictBadge = `<span class="${verdict.cssClass}" style="padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">${verdict.label}</span>`;
    }

    countyRows += `
                <tr>
                    <td><a href="/price-trend/${stateAbbrev}/${countySlug}">${cd.county}</a></td>
                    <td>${median}</td>
                    <td>${changeDisplay}</td>
                    <td>${verdictBadge}</td>
                </tr>`;
  }

  // State commentary
  let stateCommentary = '';
  if (stateStats.avg_trend !== null && stateStats.avg_trend !== undefined) {
    const avgTrend = parseFloat(stateStats.avg_trend);
    if (Math.abs(avgTrend) < 2) {
      stateCommentary = `<p>Overall, heating oil prices across ${stateName} have been <strong>relatively stable</strong>, with an average change of ${Math.abs(avgTrend).toFixed(1)}% across counties.</p>`;
    } else if (avgTrend > 0) {
      stateCommentary = `<p>Heating oil prices across ${stateName} are <strong>trending upward</strong>, with an average increase of ${Math.abs(avgTrend).toFixed(1)}% across counties.</p>`;
    } else {
      stateCommentary = `<p>Heating oil prices across ${stateName} are <strong>trending downward</strong>, with an average decrease of ${Math.abs(avgTrend).toFixed(1)}% across counties — a good sign for buyers.</p>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
<script src="${'../'.repeat(depth)}js/analytics.js"></script>

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-itunes-app" content="app-id=6747320571">
    <title>${title}</title>
    <meta name="description" content="${description}">

    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalURL}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaBreadcrumb}</script>
    <script type="application/ld+json">${schemaArticle}</script>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
            <a href="/learn/">Learn</a> → Price Trends in ${stateName}
        </p>

        <h1>Heating Oil Price Trends in ${stateName}</h1>

        ${stateCommentary}

        <h2>County Price Trends</h2>

        <p>6-week price change by county, sorted from largest drops to largest increases:</p>

        <div style="overflow-x: auto;">
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>County</th>
                        <th>Current Median</th>
                        <th>6-Week Change</th>
                        <th>Verdict</th>
                    </tr>
                </thead>
                <tbody>${countyRows}
                </tbody>
            </table>
        </div>

        <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">
            Updated: ${today}. Click a county for detailed weekly history.
        </p>

        <hr style="margin: 2.5rem 0; border: none; border-top: 1px solid var(--border-color);">

        <h3>Related</h3>
        <ul>
            <li><a href="/heating-cost/${stateAbbrev}/">Heating Costs in ${stateName}</a></li>
            <li><a href="/average-heating-bill/${stateAbbrev}/">Average Heating Bills in ${stateName}</a></li>
            <li><a href="/tools/heating-cost-calculator">Heating Cost Calculator</a></li>
            <li><a href="/prices/${stateAbbrev}/">${stateName} Oil Prices</a></li>
        </ul>
    </section>

    ${getFooterHTML(depth)}
</body>
</html>`;
}

// ── Sitemap URLs ─────────────────────────────────────────────────

function generateSitemapURLs(generatedPages) {
  const today = new Date().toISOString().split('T')[0];
  let urls = '';

  for (const state of generatedPages.states) {
    urls += `
  <url>
    <loc>${BASE_URL}/price-trend/${state.abbrev}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  }

  for (const county of generatedPages.counties) {
    urls += `
  <url>
    <loc>${BASE_URL}/price-trend/${county.stateAbbrev}/${county.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`;
  }

  return urls;
}

// ── Main ─────────────────────────────────────────────────────────

async function generatePriceTrendPages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    dryRun = cliDryRun,
  } = options;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HomeHeat Price Trend Page Generator');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    console.log('DRY RUN — no files will be written');
  }

  // Database connection
  const sequelize = externalSequelize || new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false,
      } : false,
    },
  });

  const shouldCloseConnection = !externalSequelize;

  try {
    if (!externalSequelize) {
      await sequelize.authenticate();
      console.log('Database connected');
    }

    const generatedPages = { states: [], counties: [] };
    let totalStatePages = 0;
    let totalCountyPages = 0;
    let skippedCount = 0;

    for (const [stateCode, stateInfo] of Object.entries(STATES)) {
      console.log(`\nProcessing ${stateInfo.name}...`);

      const countyStats = await getCountyOilStats(sequelize, stateCode);
      if (countyStats.length === 0) {
        console.log(`  Skipping ${stateCode} — no county price data`);
        continue;
      }

      const stateStats = await getStateOilStats(sequelize, stateCode);

      // Create state directory
      const stateDir = path.join(OUTPUT_DIR, stateInfo.abbrev);
      if (!dryRun) {
        await fs.mkdir(stateDir, { recursive: true });
        // Clean stale HTML files
        try {
          const existingFiles = await fs.readdir(stateDir);
          for (const file of existingFiles) {
            if (file.endsWith('.html')) {
              await fs.unlink(path.join(stateDir, file));
            }
          }
        } catch (e) {
          // Directory may not exist yet
        }
      }

      // Process each county
      const validCounties = [];
      for (const cs of countyStats) {
        const county = cs.county_name;
        const zipPrefixes = cs.zip_prefixes || [];

        const recentPrices = await getRecentPriceCount(sequelize, zipPrefixes);
        const eligibility = getCountyEligibility(cs, recentPrices);

        if (!eligibility.priceTrend) {
          skippedCount++;
          continue;
        }

        // Fetch weekly history
        const history = await getCountyWeeklyHistory(sequelize, county, stateCode);

        const html = generateCountyPageHTML(stateCode, stateInfo, county, cs, history, eligibility);
        const countySlug = slugify(county);
        const filePath = path.join(stateDir, `${countySlug}.html`);

        if (!dryRun) {
          await fs.writeFile(filePath, html, 'utf-8');
        }

        totalCountyPages++;
        validCounties.push({ county, stats: cs });
        generatedPages.counties.push({
          stateAbbrev: stateInfo.abbrev,
          county,
          slug: countySlug,
        });
      }

      if (validCounties.length === 0) {
        console.log(`  No counties passed thresholds for ${stateCode}`);
        continue;
      }

      // Generate state page
      const stateHtml = generateStatePageHTML(stateCode, stateInfo, stateStats, validCounties);
      const statePath = path.join(stateDir, 'index.html');
      if (!dryRun) {
        await fs.writeFile(statePath, stateHtml, 'utf-8');
      }

      console.log(`  ${stateInfo.abbrev}: ${validCounties.length} counties`);
      totalStatePages++;
      generatedPages.states.push({ abbrev: stateInfo.abbrev, name: stateInfo.name });
    }

    // Write sitemap fragment
    const sitemapURLs = generateSitemapURLs(generatedPages);
    const sitemapPath = path.join(OUTPUT_DIR, '_sitemap-fragment.xml');
    if (!dryRun) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await fs.writeFile(sitemapPath, sitemapURLs, 'utf-8');
    }

    console.log(`\n✅ Price Trend pages: ${totalStatePages} state, ${totalCountyPages} county (${skippedCount} skipped: weeks_available < 3)`);

    return { success: true, generatedPages, totalStatePages, totalCountyPages };

  } finally {
    if (shouldCloseConnection) {
      await sequelize.close();
    }
  }
}

// CLI entry point
if (require.main === module) {
  generatePriceTrendPages().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { generatePriceTrendPages };
