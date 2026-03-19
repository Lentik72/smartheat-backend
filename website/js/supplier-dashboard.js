/**
 * Supplier Dashboard Frontend
 * Fetches /api/supplier-dashboard?token=XXX and renders 5 panels
 * based on mode (full/growth) and state (no-price/zero-traffic/stale/revoked)
 */

let token = null;
let dashData = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Extract token from URL → sessionStorage → strip from URL
  const params = new URLSearchParams(window.location.search);
  token = params.get('token');

  if (!token) {
    try { token = sessionStorage.getItem('dash_token'); } catch (e) {}
  }

  if (!token) {
    showError('No access token provided. Please use the link from your email.');
    return;
  }

  try {
    sessionStorage.setItem('dash_token', token);
    window.history.replaceState({}, document.title, '/supplier-dashboard');
  } catch (e) { /* private browsing */ }

  await loadDashboard();
}

async function loadDashboard() {
  try {
    const resp = await fetch('/api/supplier-dashboard?token=' + encodeURIComponent(token));
    const data = await resp.json();

    if (!resp.ok || !data.success) {
      if (data.status === 'revoked') {
        showError(data.error || 'Your listing claim has been removed.', 'Claim Removed');
      } else if (resp.status === 429) {
        showError('Too many requests. Please wait a few minutes and refresh.', 'Slow Down');
      } else if (resp.status >= 500) {
        showError('Our server is temporarily unavailable. Please refresh in a moment.', 'Temporary Issue');
      } else {
        showError(data.error || 'Invalid or expired link.');
      }
      return;
    }

    dashData = data;
    renderDashboard(data);

  } catch (err) {
    console.error('Dashboard load error:', err);
    showError('Could not load dashboard. Please try again later.');
  }
}

function renderDashboard(data) {
  document.getElementById('dash-loading').style.display = 'none';
  document.getElementById('dash-main').style.display = 'block';

  // Header
  document.getElementById('dash-name').textContent = data.supplier.name;
  document.getElementById('dash-location').textContent = data.supplier.city + ', ' + data.supplier.state;
  document.getElementById('dash-refreshed').textContent = relativeTime(data.generatedAt);

  // Price badge in header
  const priceBadge = document.getElementById('dash-price-badge');
  if (data.price && data.price.comparisonPrice) {
    const staleDot = data.price.stale ? 'stale' : 'fresh';
    const updated = data.price.lastUpdated
      ? new Date(data.price.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    priceBadge.innerHTML = '<span class="stale-dot ' + staleDot + '"></span>' +
      '<span class="price-badge">Your price: $' + data.price.comparisonPrice.toFixed(2) +
      (updated ? ' (set ' + updated + ')' : '') + '</span>';
  } else {
    priceBadge.innerHTML = '<span class="price-badge" style="color:#6b7280;">No price set</span>';
  }

  // Urgency banner
  if (data.urgency && data.urgency.pricesChangedToday) {
    const el = document.getElementById('dash-urgency');
    el.innerHTML = '&#9889; ' + data.urgency.areaCompetitorPriceDrops +
      ' competitor' + (data.urgency.areaCompetitorPriceDrops > 1 ? 's' : '') +
      ' dropped prices in your area today.';
    el.style.display = 'block';
  }

  // Price impact callout
  if (data.priceImpact) {
    renderPriceImpact(data.priceImpact);
  }

  // First visit welcome
  if (data.isFirstVisit && data.state !== 'zero-traffic') {
    document.getElementById('dash-welcome').style.display = 'block';
  }

  // Stale banner
  if (data.state === 'stale-price' || (data.price && data.price.stale)) {
    const el = document.getElementById('dash-stale-banner');
    el.innerHTML = '&#9888;&#65039; Your price is marked as stale &mdash; homeowners see a warning dot next to it. <strong>Update now</strong> to show a fresh price.';
    el.style.display = 'block';
  }

  // Seasonal context
  if (data.seasonalContext && data.seasonalContext.active) {
    const el = document.getElementById('dash-seasonal');
    el.textContent = data.seasonalContext.message;
    el.style.display = 'block';
  }

  // Zero-traffic state: show welcome, hide panels
  if (data.state === 'zero-traffic') {
    document.getElementById('dash-zero-traffic').style.display = 'block';
    document.getElementById('dash-panels').style.display = 'none';
    // Still show price panel separately for zero-traffic
    const pricePanel = document.getElementById('panel-price');
    pricePanel.style.display = 'block';
    pricePanel.style.maxWidth = '860px';
    pricePanel.style.margin = '24px auto';
    document.getElementById('dash-zero-traffic').after(pricePanel);
    renderPricePanel(data);
    return;
  }

  // Render panels
  renderPerformancePanel(data);
  renderCompetitivePanel(data);
  renderOpportunityPanel(data);
  renderPricePanel(data);

  // Log panel views
  logEvent('panel_viewed', { panels: ['performance', 'competitive', 'opportunity', 'price'] });
}

// ─── Panel Renderers ──────────────────────────────────────

function renderPerformancePanel(data) {
  const el = document.getElementById('performance-content');
  const d = data.demand;
  const cs = data.clickShare;

  if (!d) {
    el.innerHTML = '<p style="color:#9ca3af;">Temporarily unavailable &mdash; refresh to retry.</p>';
    return;
  }

  let html = '';

  // Demand metrics grid
  html += '<div class="demand-metrics">';
  html += '<div class="demand-metric">' +
    '<div class="demand-metric-value">' + formatNumber(d.areaSearches) + '</div>' +
    '<div class="demand-metric-label">Searches</div></div>';
  html += '<div class="demand-metric">' +
    '<div class="demand-metric-value">' + d.clicksLast30Days + '</div>' +
    '<div class="demand-metric-label">Clicks' + trendBadge(d.clicksTrend, d.clicksTrendRaw) + '</div></div>';
  html += '<div class="demand-metric">' +
    '<div class="demand-metric-value">' + (d.calls + d.websites) + '</div>' +
    '<div class="demand-metric-label">Leads</div></div>';
  html += '</div>';

  // Lead breakdown
  html += '<div class="demand-breakdown">';
  html += '<span>' + d.calls + ' calls</span>';
  html += '<span>' + d.websites + ' website visits</span>';
  html += '</div>';

  // Click share + rank (merged from position panel)
  if (cs) {
    html += '<div class="perf-divider"></div>';
    var isWinning = cs.rank === 1;
    html += '<div class="rank-badge' + (isWinning ? ' winning' : '') + '">' +
      'Rank #' + cs.rank + ' of ' + cs.totalRanked + '</div>';

    html += '<div class="share-bar-container">';
    html += '<div class="share-bar-track"><div class="share-bar-fill" style="width:' + cs.sharePercent + '%;"></div></div>';
    html += '<div class="share-bar-labels"><span>You: ' + cs.sharePercent + '%</span>';
    if (!isWinning && cs.leaderSharePercent) {
      html += '<span>Leader: ' + cs.leaderSharePercent + '%</span>';
    }
    html += '</div></div>';

    if (!isWinning && cs.captureVsLeader && cs.captureVsLeader < 100) {
      html += '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Capturing ' +
        cs.captureVsLeader + '% of leader traffic</div>';
    }
  }

  // Gallons estimate (full mode only)
  if (data.mode === 'full' && d.estGallonsPerWeek) {
    html += '<div class="estimate-note">Est. ~' + formatNumber(d.estGallonsPerWeek) +
      ' gal/wk (5% of clicks &#8594; orders &#215; 175 gal)</div>';
  }

  el.innerHTML = html;
}

function renderCompetitivePanel(data) {
  const el = document.getElementById('competitive-content');
  const c = data.competitive;

  if (!c) {
    el.innerHTML = '<p style="color:#9ca3af;">Temporarily unavailable &mdash; refresh to retry.</p>';
    return;
  }

  // No-price state
  if (!c.currentPrice) {
    el.innerHTML = '<div class="no-price-cta">' +
      '<p>Set your price to see how you compare to other suppliers in your area.</p>' +
      '<a href="#panel-price" style="color:#FF6B35;font-weight:600;font-size:14px;">Set your price below &#8595;</a>' +
      '</div>';
    return;
  }

  let html = '<div class="price-compare">';
  html += priceRow('Your price', '$' + c.currentPrice.toFixed(2), true);

  if (!c.isOnlySupplier) {
    if (c.lowestInArea !== null) html += priceRow('Lowest', '$' + c.lowestInArea.toFixed(2));
    if (c.avgInArea !== null) html += priceRow('Average', '$' + c.avgInArea.toFixed(2));
    if (c.priceSpread !== null) html += priceRow('Spread', '$' + c.priceSpread.toFixed(2));
  }
  html += '</div>';

  if (c.deltaFromLowest > 0 && !c.isOnlySupplier) {
    html += '<div style="font-size:14px;font-weight:600;color:#EA580C;margin-bottom:8px;">' +
      'You are $' + c.deltaFromLowest.toFixed(2) + ' above lowest</div>';
  }

  if (c.qualitativeNudge) {
    html += '<div class="competitive-nudge">' + escapeHtml(c.qualitativeNudge) + '</div>';
  }

  // Locked teaser for exact numbers
  if (c.ifMatchLowest && c.ifMatchLowest.estClickIncrease && c.deltaFromLowest > 0) {
    html += '<div style="margin-top:10px;font-size:12px;color:#9ca3af;cursor:pointer;" data-preview="projections" class="locked-teaser">' +
      '&#128274; See exact impact numbers</div>';
  }

  html += '<div class="competitive-note">Prices compared at 150-gal minimum</div>';

  el.innerHTML = html;
}

function renderOpportunityPanel(data) {
  const el = document.getElementById('opportunity-content');
  const panel = document.getElementById('panel-opportunity');
  const mv = data.missedVolume;
  const c = data.competitive;

  // Hide panel when winning or only supplier
  if (c && (c.isLowest || c.isOnlySupplier)) {
    panel.style.display = 'none';
    return;
  }

  // Growth mode: hide — search count already shown in performance panel
  if (data.mode === 'growth') {
    panel.style.display = 'none';
    return;
  }

  if (!mv) {
    panel.style.display = 'none';
    return;
  }

  let html = '';
  html += '<div class="missed-headline">' + formatNumber(mv.missedClicks) + '</div>';
  html += '<div class="missed-label">' + escapeHtml(mv.missedClicksLabel) + '</div>';

  if (mv.estGalPerWeek) {
    html += '<div class="stat-row"><span class="stat-label">Est. volume</span>';
    html += '<span class="stat-value">~' + formatNumber(mv.estGalPerWeek) + ' gal/wk</span></div>';
    html += '<div class="estimate-note">' + escapeHtml(mv.estFormula) + '</div>';
  } else {
    html += '<div class="estimate-note">Update your price to see revenue estimates.</div>';
  }

  // Confidence badge
  if (mv.confidence) {
    html += '<div class="confidence-badge"><span class="dot ' + mv.confidence + '"></span>' +
      mv.confidence.toUpperCase() + ' (' + escapeHtml(mv.confidenceBasis) + ')</div>';
  }

  el.innerHTML = html;
}

function renderPricePanel(data) {
  const priceForm = document.getElementById('price-form');
  const gapAlert = document.getElementById('price-gap-alert');
  const c = data.competitive;
  const p = data.price;

  // Price gap alert
  if (c && c.deltaFromLowest > 0 && !c.isOnlySupplier) {
    gapAlert.innerHTML = '&#9888;&#65039; You are <strong>$' + c.deltaFromLowest.toFixed(2) +
      ' above lowest</strong> in your area.';
    gapAlert.style.display = 'block';
  } else if (c && c.isLowest) {
    gapAlert.innerHTML = '&#9989; <strong>You\'re the lowest in your area.</strong> Keep your price current to stay on top.';
    gapAlert.style.display = 'block';
    gapAlert.style.background = '#F0FDF4';
    gapAlert.style.color = '#166534';
  }

  // Current price status + last updated
  var statusEl = document.getElementById('price-status');
  if (p && p.tiers && p.tiers.length > 0) {
    var firstTier = p.tiers[0];
    var priceInput = priceForm.querySelector('.tier-price');
    var galInput = priceForm.querySelector('.tier-mingal');
    if (priceInput) priceInput.value = firstTier.price.toFixed(3);
    if (galInput) galInput.value = firstTier.minGallons;

    var updated = firstTier.lastUpdated
      ? new Date(firstTier.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
    var source = firstTier.source === 'supplier_direct' ? 'by you' :
      firstTier.source === 'supplier_sms' ? 'via SMS' : 'auto-scraped';

    if (p.stale) {
      statusEl.innerHTML = '<span class="price-status-stale">Your price ($' + firstTier.price.toFixed(2) +
        ') is stale &mdash; last updated ' + updated + ' (' + source + '). Homeowners see a warning on your listing.</span>';
      statusEl.style.display = 'block';
      if (priceInput) priceInput.classList.add('stale-highlight');
    } else if (updated) {
      statusEl.innerHTML = '<span class="price-status-fresh">Current: $' + firstTier.price.toFixed(2) +
        '/gal &middot; Updated ' + updated + ' (' + source + ')</span>';
      statusEl.style.display = 'block';
    }
  } else {
    // No price at all — expired or never set
    statusEl.innerHTML = '<span class="price-status-expired">You have no active price. Your listing is not showing a price to homeowners. Set one below to go live.</span>';
    statusEl.style.display = 'block';
  }

  // Form submission
  priceForm.addEventListener('submit', handlePriceSubmit);


  // Focus tracking
  priceForm.addEventListener('focusin', function (e) {
    if (e.target.classList.contains('tier-price')) {
      logEvent('price_form_focused');
    }
  });
}

function renderPriceImpact(impact) {
  const el = document.getElementById('dash-impact');
  const dir = impact.direction;

  el.className = 'dash-impact ' + dir;

  const date = new Date(impact.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const priceFmt = '$' + impact.priceAfter.toFixed(2);

  let clickDelta = '';
  if (impact.clicksBefore7d > 0) {
    const pct = Math.round(((impact.clicksAfter7d - impact.clicksBefore7d) / impact.clicksBefore7d) * 100);
    clickDelta = (pct >= 0 ? '+' : '') + pct + '% clicks';
  } else if (impact.clicksAfter7d > 0) {
    clickDelta = impact.clicksAfter7d + ' clicks';
  }

  const callDelta = impact.callsAfter7d - impact.callsBefore7d;
  const callStr = callDelta !== 0 ? ', ' + (callDelta > 0 ? '+' : '') + callDelta + ' calls' : '';

  const verb = dir === 'drop' ? 'dropped to' : 'raised to';
  el.innerHTML = (dir === 'drop' ? '&#9989; ' : '') +
    'You ' + verb + ' <strong>' + priceFmt + '</strong> on ' + date +
    '. Since then: <strong>' + clickDelta + callStr + '</strong>';

  el.style.display = 'block';
}

// ─── Price Form Handling ──────────────────────────────────

async function handlePriceSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('price-submit-btn');
  const errEl = document.getElementById('price-form-error');
  const successEl = document.getElementById('price-form-success');

  errEl.style.display = 'none';
  successEl.style.display = 'none';

  const priceInput = document.querySelector('.tier-price');
  const galInput = document.querySelector('.tier-mingal');

  const price = parseFloat(priceInput.value);
  const minGallons = parseInt(galInput.value) || 100;

  // Inline validation
  if (isNaN(price) || price < 1.50 || price > 8.00) {
    errEl.textContent = 'Price must be between $1.50 and $8.00';
    errEl.style.display = 'block';
    return;
  }

  if (minGallons < 50 || minGallons > 500) {
    errEl.textContent = 'Minimum gallons must be between 50 and 500';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const resp = await fetch('/api/supplier-update/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, price, minGallons })
    });

    const result = await resp.json();

    if (!resp.ok || !result.success) {
      throw new Error(result.error || 'Failed to update price');
    }

    successEl.textContent = 'Price updated to $' + result.price.toFixed(2) + '/gal. Your listing is now showing the fresh price.';
    successEl.style.display = 'block';

    // Update header price badge
    const badge = document.getElementById('dash-price-badge');
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    badge.innerHTML = '<span class="stale-dot fresh"></span>' +
      '<span class="price-badge">Your price: $' + result.price.toFixed(2) + ' (set ' + today + ')</span>';

    // Remove stale styling
    priceInput.classList.remove('stale-highlight');
    document.getElementById('dash-stale-banner').style.display = 'none';

    btn.textContent = 'Updated!';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Update Price';
    }, 3000);

  } catch (err) {
    errEl.textContent = err.message || 'Network error. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Update Price';
  }
}

// ─── Utilities ────────────────────────────────────────────

function trendBadge(trend, raw) {
  if (!trend && raw) {
    // Low-volume: show raw numbers instead of percentage
    return ' <span class="trend trend-flat">(' + raw.thisWeek + ' this wk, ' + raw.lastWeek + ' last)</span>';
  }
  if (!trend) return '';

  if (trend === 'new') return ' <span class="trend trend-up">&#8593; new</span>';

  const isUp = trend.startsWith('+');
  const isDown = trend.startsWith('-');
  const cls = isUp ? 'trend-up' : isDown ? 'trend-down' : 'trend-flat';
  const arrow = isUp ? '&#8593;' : isDown ? '&#8595;' : '';

  return ' <span class="trend ' + cls + '">' + arrow + ' ' + escapeHtml(trend) + '</span>';
}

function priceRow(label, value, highlight) {
  return '<div class="price-compare-row">' +
    '<span class="label">' + label + '</span>' +
    '<span class="value' + (highlight ? ' highlight' : '') + '">' + value + '</span>' +
    '</div>';
}

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  return n.toLocaleString('en-US');
}

function relativeTime(iso) {
  if (!iso) return 'just now';
  var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function escapeHtml(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showError(message, title) {
  document.getElementById('dash-loading').style.display = 'none';
  document.getElementById('dash-main').style.display = 'none';
  document.getElementById('dash-error').style.display = 'block';
  document.getElementById('dash-error-message').textContent = message;
  if (title) document.getElementById('dash-error-title').textContent = title;
}

function logEvent(event, data) {
  if (!token) return;
  try {
    fetch('/api/supplier-dashboard/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, event: event, data: data || {} })
    }).catch(function () { /* fire-and-forget */ });
  } catch (e) { /* ignore */ }
}

// Locked preview click tracking + toast
document.addEventListener('click', function (e) {
  var card = e.target.closest('.locked-card');
  var teaser = e.target.closest('.locked-teaser');
  var preview = (card && card.dataset.preview) || (teaser && teaser.dataset.preview);

  if (preview) {
    logEvent('locked_preview_clicked', { preview: preview });

    // Show toast
    var existing = document.querySelector('.dash-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'dash-toast';
    toast.textContent = 'Coming soon — we\'ll notify you when this is available.';
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }
});
