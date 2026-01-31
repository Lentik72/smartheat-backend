/**
 * SmartHeat Analytics Dashboard
 *
 * Frontend JavaScript for the admin analytics dashboard.
 */

// State
let authToken = sessionStorage.getItem('dashboardToken') || '';
let currentDays = 30;
let suppliersPage = 0;
const suppliersLimit = 50;

// Charts
let clicksChart = null;
let pageSourceChart = null;
let deviceChart = null;
let priceChart = null;
let spreadChart = null;
let map = null;

// API base
const API_BASE = '/api/dashboard';

// Helpers
function formatPrice(price) {
  if (!price) return '--';
  return '$' + parseFloat(price).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// API wrapper
async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Token invalid, show login
      sessionStorage.removeItem('dashboardToken');
      authToken = '';
      showLogin();
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'API error');
    }

    return await response.json();
  } catch (error) {
    console.error('API error:', error);
    throw error;
  }
}

// Auth
function showLogin() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadDashboard();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  authToken = password;

  try {
    // Test auth with meta endpoint
    await api('/meta');
    sessionStorage.setItem('dashboardToken', password);
    showDashboard();
  } catch (error) {
    document.getElementById('login-error').textContent = 'Invalid password';
  }
});

// Tab navigation
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    // Update active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Show target panel
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${target}`).classList.add('active');

    // Load tab-specific data
    if (target === 'recommendations') loadRecommendations();
    if (target === 'website') loadWebsite();
    if (target === 'ios-app') loadIOSApp();
    if (target === 'android') loadAndroidSignals();
    if (target === 'retention') loadRetention();
    if (target === 'acquisition') loadAcquisition();
    if (target === 'overview') loadOverviewTab();
    if (target === 'searches') loadSearches();
    if (target === 'clicks') loadClicks();
    if (target === 'prices') loadPrices();
    if (target === 'map') loadMap();
    if (target === 'scrapers') loadScrapers();
    if (target === 'suppliers') loadSuppliers();
  });
});

// Show tab function
function showTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) tab.click();
}

// Priority alert view details button
document.getElementById('priority-view-details')?.addEventListener('click', () => {
  showTab('recommendations');
});

// Period selector
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentDays = parseInt(btn.dataset.days);
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadDashboard();
  });
});

// Load overview (top cards)
async function loadOverview() {
  try {
    const data = await api(`/overview?days=${currentDays}`);

    // Get unified data for combined metrics
    let unified = null;
    try {
      unified = await api(`/unified?days=${currentDays}`);
    } catch (e) {
      console.log('Unified data not available');
    }

    // Card 1: Total Users (iOS MAU + Website unique visitors)
    const iosUsers = unified?.app?.uniqueUsers || 0;
    const webUsers = unified?.website?.users || data.website?.uniqueUsers || 0;
    const totalUsers = iosUsers + webUsers;
    document.getElementById('total-users').textContent = totalUsers || '--';
    document.getElementById('users-breakdown').textContent = `${iosUsers} iOS / ${webUsers} website`;
    document.getElementById('users-freshness').textContent = '';

    // Card 2: Deliveries Logged (using saves from app data as proxy)
    const deliveries = unified?.app?.saves || 0;
    document.getElementById('total-deliveries').textContent = deliveries || '--';
    document.getElementById('deliveries-breakdown').textContent = deliveries > 0
      ? `~$${(deliveries * 500).toLocaleString()} in orders`
      : 'Real orders tracked';
    document.getElementById('deliveries-freshness').textContent = '';

    // Card 3: Est. Revenue (from supplier clicks)
    const totalClicks = data.website.totalClicks || 0;
    // Assume 3% of clicks convert to $500 avg order, 5% referral = $7.50 per conversion
    const estRevenue = Math.round(totalClicks * 0.03 * 7.50);
    document.getElementById('est-revenue').textContent = estRevenue > 0 ? `~$${estRevenue}` : '--';
    document.getElementById('revenue-breakdown').textContent =
      `${totalClicks} clicks @ 3% conv`;
    const revenueFreshness = data.dataFreshness?.supplier_clicks;
    document.getElementById('revenue-freshness').textContent = revenueFreshness ? timeAgo(revenueFreshness) : '';

    // Card 4: Android Waitlist
    document.getElementById('waitlist-total').textContent = data.waitlist.total;
    document.getElementById('waitlist-recent').textContent = `+${data.waitlist.last7Days} this week`;
    const waitlistFreshness = data.waitlist?.lastUpdated;
    document.getElementById('waitlist-freshness').textContent = waitlistFreshness ? timeAgo(waitlistFreshness) : '';

    // Top supplier (for Overview tab)
    if (data.website.topSupplier) {
      document.getElementById('top-supplier').textContent =
        `${data.website.topSupplier.name} (${data.website.topSupplier.clicks} clicks)`;
    }

    // Coverage gaps breakdown (with defensive checks)
    const coverage = data.coverage || {};
    const trueCoverageGaps = coverage.trueCoverageGaps || 0;
    const engagementGaps = coverage.engagementGaps || 0;
    const totalSearched = coverage.totalSearched || 0;

    document.getElementById('true-coverage-gaps').textContent = `${trueCoverageGaps} ZIPs`;
    document.getElementById('engagement-gaps').textContent = `${engagementGaps} ZIPs`;
    document.getElementById('total-searched').textContent = `${totalSearched} ZIPs`;

    // Click handlers to show ZIP details
    document.getElementById('panel-no-suppliers').onclick = () => showCoverageDetails('no-suppliers');
    document.getElementById('panel-low-engagement').onclick = () => showCoverageDetails('low-engagement');

    // Alert banner - prioritize true coverage gaps
    if (trueCoverageGaps > 5) {
      document.getElementById('alert-banner').classList.remove('hidden');
      document.getElementById('alert-text').textContent =
        `${trueCoverageGaps} ZIPs have demand but NO suppliers - add coverage!`;
      document.getElementById('alert-action').textContent = 'View Map';
      document.getElementById('alert-action').onclick = () => switchTab('map');
    } else if (engagementGaps > 20) {
      document.getElementById('alert-banner').classList.remove('hidden');
      document.getElementById('alert-text').textContent =
        `${engagementGaps} ZIPs have suppliers but no clicks - check pricing/visibility`;
      document.getElementById('alert-action').textContent = 'View Clicks';
      document.getElementById('alert-action').onclick = () => switchTab('clicks');
    }

  } catch (error) {
    console.error('Failed to load overview:', error);
  }
}

// Load Overview tab (different from top cards)
async function loadOverviewTab() {
  // This just triggers the existing supplier signals and conversion loading
  await Promise.all([
    loadSupplierSignals(),
    loadConversion(),
    loadPriceAlerts()
  ]);
}

// Charts for Website tab
let webTrafficChart = null;
let webDailyChart = null;

// Load Website tab
async function loadWebsite() {
  try {
    // Fetch unified data for GA4 metrics and clicks data
    const [unified, clicks] = await Promise.all([
      api(`/unified?days=${currentDays}`).catch(() => null),
      api(`/clicks?days=${currentDays}`)
    ]);

    const website = unified?.website || {};
    const hasGA4 = unified?.dataSources?.ga4 === true;

    // Summary stats
    if (hasGA4) {
      document.getElementById('web-sessions').textContent = website.sessions?.toLocaleString() || '--';
      document.getElementById('web-users').textContent = website.activeUsers?.toLocaleString() || '--';
      document.getElementById('web-bounce').textContent = website.bounceRate ? `${website.bounceRate}%` : '--%';
      document.getElementById('web-duration').textContent = website.avgSessionDuration || '--';
      document.getElementById('web-ga4-setup').style.display = 'none';
    } else {
      document.getElementById('web-sessions').textContent = '--';
      document.getElementById('web-users').textContent = '--';
      document.getElementById('web-bounce').textContent = '--%';
      document.getElementById('web-duration').textContent = '--';
      document.getElementById('web-ga4-setup').style.display = 'block';
    }

    // Supplier clicks (from PostgreSQL - always available)
    const totalClicks = clicks.daily?.reduce((sum, d) => sum + d.calls + d.websites, 0) || 0;
    const callClicks = clicks.daily?.reduce((sum, d) => sum + d.calls, 0) || 0;
    const websiteClicks = clicks.daily?.reduce((sum, d) => sum + d.websites, 0) || 0;

    document.getElementById('web-total-clicks').textContent = totalClicks;
    document.getElementById('web-call-clicks').textContent = callClicks;
    document.getElementById('web-website-clicks').textContent = websiteClicks;

    // Traffic sources chart
    if (hasGA4 && website.trafficSources?.length > 0) {
      const ctx = document.getElementById('web-traffic-chart').getContext('2d');
      if (webTrafficChart) webTrafficChart.destroy();

      webTrafficChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: website.trafficSources.map(s => s.channel),
          datasets: [{
            label: 'Sessions',
            data: website.trafficSources.map(s => s.sessions),
            backgroundColor: ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          scales: { x: { beginAtZero: true } }
        }
      });
      document.getElementById('web-traffic-note').textContent = '';
    } else {
      document.getElementById('web-traffic-note').textContent =
        hasGA4 ? 'No traffic data in period' : 'Enable GA4 API for traffic sources';
    }

    // Daily activity chart (use clicks data)
    const dailyNote = document.getElementById('web-daily-note');
    if (clicks.daily?.length > 0) {
      const ctx = document.getElementById('web-daily-chart').getContext('2d');
      if (webDailyChart) webDailyChart.destroy();

      webDailyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: clicks.daily.map(d => d.date),
          datasets: [
            {
              label: 'Phone Calls',
              data: clicks.daily.map(d => d.calls),
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              fill: true
            },
            {
              label: 'Website Clicks',
              data: clicks.daily.map(d => d.websites),
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
      dailyNote.textContent = '';
    } else {
      dailyNote.textContent = 'No click data for selected period';
    }

    // Top pages (from GA4 if available)
    const pagesBody = document.getElementById('web-pages-body');
    pagesBody.innerHTML = '';

    if (hasGA4 && website.topPages?.length > 0) {
      website.topPages.slice(0, 10).forEach(p => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${p.path}</td>
          <td>${p.views?.toLocaleString()}</td>
        `;
        pagesBody.appendChild(row);
      });
    } else {
      pagesBody.innerHTML = '<tr><td colspan="2" class="no-data">Enable GA4 for page data</td></tr>';
    }

    // Load recent activity feed
    loadRecentActivity();

  } catch (error) {
    console.error('Failed to load website data:', error);
  }
}

// Load recent click activity
async function loadRecentActivity() {
  const tbody = document.getElementById('activity-body');
  try {
    const data = await api('/activity?limit=25');

    if (!data.activity || data.activity.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No clicks recorded yet</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.activity.forEach(a => {
      const row = document.createElement('tr');
      const time = new Date(a.timestamp);
      const timeStr = time.toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
      const actionIcon = a.action === 'call' ? '📞' : '🌐';
      const deviceIcon = a.device === 'mobile' ? '📱' : '💻';

      row.innerHTML = `
        <td>${timeStr}</td>
        <td>${a.supplier}${a.supplierLocation ? '<br><small class="hint">' + a.supplierLocation + '</small>' : ''}</td>
        <td>${actionIcon} ${a.action === 'call' ? 'Called' : 'Website'}</td>
        <td>${a.userZip || '--'}</td>
        <td>${deviceIcon} ${a.platform || a.device || '--'}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Failed to load activity:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Failed to load activity</td></tr>';
  }
}

// Load supplier signals for overview
async function loadSupplierSignals() {
  try {
    const data = await api(`/clicks?days=${currentDays}`);
    const tbody = document.getElementById('supplier-signals-body');
    tbody.innerHTML = '';

    data.bySupplierWithPrice.slice(0, 10).forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${s.name}</td>
        <td>${s.clicks}</td>
        <td>${formatPrice(s.currentPrice)}</td>
        <td>${s.priceDelta ? (s.priceDelta > 0 ? '+' : '') + formatPrice(s.priceDelta) : '--'}</td>
        <td>${s.estRevenueLost !== null ? '$' + s.estRevenueLost : 'Unknown'}</td>
        <td><span class="signal signal-${s.signal}">${formatSignal(s.signal)}</span></td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Failed to load supplier signals:', error);
  }
}

function formatSignal(signal) {
  const signals = {
    brand_strength: 'Brand Strength',
    visibility_issue: 'Visibility Gap',
    data_gap: 'Needs Scraping',
    normal: 'Normal'
  };
  return signals[signal] || signal;
}

// Load clicks tab
async function loadClicks() {
  try {
    const data = await api(`/clicks?days=${currentDays}`);

    // Daily chart
    const ctx = document.getElementById('clicks-chart').getContext('2d');
    if (clicksChart) clicksChart.destroy();

    clicksChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.daily.map(d => d.date),
        datasets: [
          {
            label: 'Calls',
            data: data.daily.map(d => d.calls),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true
          },
          {
            label: 'Websites',
            data: data.daily.map(d => d.websites),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

    // Page source chart
    const pageCtx = document.getElementById('page-source-chart').getContext('2d');
    if (pageSourceChart) pageSourceChart.destroy();

    pageSourceChart = new Chart(pageCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(data.byPage),
        datasets: [{
          data: Object.values(data.byPage),
          backgroundColor: ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // Device chart
    const deviceCtx = document.getElementById('device-chart').getContext('2d');
    if (deviceChart) deviceChart.destroy();

    deviceChart = new Chart(deviceCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(data.byDevice),
        datasets: [{
          data: Object.values(data.byDevice),
          backgroundColor: ['#2563eb', '#22c55e']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // Top suppliers table
    const tbody = document.getElementById('clicks-by-supplier-body');
    tbody.innerHTML = '';
    data.bySupplier.forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${s.name}</td>
        <td>${s.calls}</td>
        <td>${s.websites}</td>
        <td>${s.calls + s.websites}</td>
      `;
      tbody.appendChild(row);
    });

  } catch (error) {
    console.error('Failed to load clicks:', error);
  }
}

// Load prices tab
async function loadPrices() {
  try {
    const data = await api(`/prices?days=${currentDays}`);

    // Price trend chart
    const ctx = document.getElementById('price-chart').getContext('2d');
    if (priceChart) priceChart.destroy();

    priceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.trends.map(t => t.date),
        datasets: [
          {
            label: 'Avg Price',
            data: data.trends.map(t => t.avgPrice),
            borderColor: '#2563eb',
            fill: false
          },
          {
            label: 'Min Price',
            data: data.trends.map(t => t.minPrice),
            borderColor: '#22c55e',
            fill: false,
            borderDash: [5, 5]
          },
          {
            label: 'Max Price',
            data: data.trends.map(t => t.maxPrice),
            borderColor: '#ef4444',
            fill: false,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false
          }
        }
      }
    });

    // Price spread chart
    const spreadCtx = document.getElementById('spread-chart').getContext('2d');
    if (spreadChart) spreadChart.destroy();

    spreadChart = new Chart(spreadCtx, {
      type: 'bar',
      data: {
        labels: data.priceSpread.map(p => p.state),
        datasets: [{
          label: 'Price Spread',
          data: data.priceSpread.map(p => p.spread),
          backgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Spread ($)'
            }
          }
        }
      }
    });

    // Prices table
    const tbody = document.getElementById('prices-body');
    tbody.innerHTML = '';
    data.bySupplier.forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${s.name}</td>
        <td>${s.state}</td>
        <td>${formatPrice(s.currentPrice)}</td>
        <td>${timeAgo(s.lastUpdated)}</td>
      `;
      tbody.appendChild(row);
    });

  } catch (error) {
    console.error('Failed to load prices:', error);
  }
}

// Load map
async function loadMap() {
  try {
    const data = await api(`/geographic?days=${currentDays}`);

    // Initialize map if needed
    if (!map) {
      map = L.map('map-container').setView([40.7, -74.0], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    // Clear existing markers
    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add demand heatmap (blue circles)
    const demandData = data.demandHeatmap || [];
    const maxDemand = Math.max(...demandData.map(c => c.count), 1);
    demandData.forEach(c => {
      const radius = 6 + (c.count / maxDemand) * 18;
      L.circleMarker([c.lat, c.lng], {
        radius: radius,
        fillColor: '#2563eb',
        color: '#1d4ed8',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.4
      })
      .bindPopup(`<b>${c.city || 'Unknown'}, ${c.state || ''}</b><br>ZIP: ${c.zip}<br>Searches: ${c.count}`)
      .addTo(map);
    });

    // Add coverage gaps (red circles) on top
    const gapData = data.coverageGaps || [];
    gapData.forEach(c => {
      const radius = 8 + (c.count / maxDemand) * 16;
      L.circleMarker([c.lat, c.lng], {
        radius: radius,
        fillColor: '#ef4444',
        color: '#dc2626',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.6
      })
      .bindPopup(`<b>⚠️ COVERAGE GAP</b><br>${c.city || 'Unknown'}, ${c.state || ''}<br>ZIP: ${c.zip}<br>Searches: ${c.count}<br><i>No suppliers serve this area!</i>`)
      .addTo(map);
    });

    // Fit bounds if we have points
    const allPoints = [...demandData, ...gapData];
    if (allPoints.length > 0) {
      const bounds = allPoints.map(c => [c.lat, c.lng]);
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    // Update stats
    const stats = data.stats || {};
    document.getElementById('map-stats').innerHTML = `
      <span class="stat-item"><span class="dot blue"></span> Demand: ${stats.totalDemandZips || 0} ZIPs</span>
      <span class="stat-item"><span class="dot red"></span> Coverage Gaps: ${stats.totalGapZips || 0} ZIPs</span>
      <span class="stat-item">Supplier Coverage: ${stats.coveredZips || 0} ZIPs</span>
    `;

    // Populate clicks table
    const tbody = document.getElementById('geo-clicks-body');
    tbody.innerHTML = '';
    const allClicks = data.allClicks || [];

    if (allClicks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No click data yet</td></tr>';
    } else {
      allClicks.forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${c.zip || '--'}</td>
          <td>${c.city || '--'}</td>
          <td>${c.county || '--'}</td>
          <td>${c.state || '--'}</td>
          <td>${c.count}</td>
        `;
        tbody.appendChild(row);
      });
    }

  } catch (error) {
    console.error('Failed to load map:', error);
  }
}

// Load scrapers tab
async function loadScrapers() {
  try {
    const data = await api('/scraper-health');

    document.getElementById('last-scrape').textContent = timeAgo(data.lastRun);
    document.getElementById('suppliers-scraped').textContent =
      `${data.withPrices}/${data.totalSuppliers} (${data.suppliersScrapedToday} today)`;

    // Stale suppliers table
    const tbody = document.getElementById('stale-body');
    tbody.innerHTML = '';

    if (data.stale.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No stale suppliers</td></tr>';
    } else {
      data.stale.forEach(s => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${s.name}</td>
          <td>${formatPrice(s.lastPrice)}</td>
          <td>${timeAgo(s.lastUpdated)}</td>
          <td><a href="${s.website}" target="_blank">${s.website || '--'}</a></td>
          <td><button class="btn edit-supplier-btn" data-id="${s.id}">Edit</button></td>
        `;
        tbody.appendChild(row);
      });
      // Attach event listeners
      tbody.querySelectorAll('.edit-supplier-btn').forEach(btn => {
        btn.addEventListener('click', () => editSupplier(btn.dataset.id));
      });
    }

  } catch (error) {
    console.error('Failed to load scrapers:', error);
  }
}

// Load suppliers tab
async function loadSuppliers() {
  try {
    const state = document.getElementById('filter-state').value;
    const hasPrice = document.getElementById('filter-price').value;
    const scrape = document.getElementById('filter-scrape').value;
    const search = document.getElementById('filter-search').value;

    let url = `/suppliers?limit=${suppliersLimit}&offset=${suppliersPage * suppliersLimit}`;
    if (state) url += `&state=${state}`;
    if (hasPrice) url += `&hasPrice=${hasPrice}`;
    if (scrape) url += `&scrapeStatus=${scrape}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const data = await api(url);

    // Populate state filter if empty
    const stateSelect = document.getElementById('filter-state');
    if (stateSelect.options.length === 1) {
      const states = new Set(data.suppliers.map(s => s.state).filter(Boolean));
      states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        stateSelect.appendChild(opt);
      });
    }

    // Table
    const tbody = document.getElementById('suppliers-body');
    tbody.innerHTML = '';

    data.suppliers.forEach(s => {
      const status = [];
      if (s.isActive) status.push('<span class="status-ok">Active</span>');
      else status.push('<span class="status-error">Inactive</span>');
      if (s.scrapingEnabled) status.push('<span class="status-ok">Scrape</span>');

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${s.name}</td>
        <td>${s.state || '--'}</td>
        <td>${formatPrice(s.currentPrice)}</td>
        <td>${timeAgo(s.priceUpdatedAt)}</td>
        <td>${s.recentClicks}</td>
        <td>${status.join(' ')}</td>
        <td><button class="edit-supplier-btn" data-id="${s.id}">Edit</button></td>
      `;
      tbody.appendChild(row);
    });

    // Attach event listeners for edit buttons
    tbody.querySelectorAll('.edit-supplier-btn').forEach(btn => {
      btn.addEventListener('click', () => editSupplier(btn.dataset.id));
    });

    // Pagination
    const totalPages = Math.ceil(data.pagination.total / suppliersLimit);
    document.getElementById('page-info').textContent =
      `Page ${suppliersPage + 1} of ${totalPages} (${data.pagination.total} total)`;
    document.getElementById('prev-page').disabled = suppliersPage === 0;
    document.getElementById('next-page').disabled = suppliersPage >= totalPages - 1;

  } catch (error) {
    console.error('Failed to load suppliers:', error);
  }
}

// Supplier pagination
document.getElementById('prev-page').addEventListener('click', () => {
  if (suppliersPage > 0) {
    suppliersPage--;
    loadSuppliers();
  }
});

document.getElementById('next-page').addEventListener('click', () => {
  suppliersPage++;
  loadSuppliers();
});

document.getElementById('filter-apply').addEventListener('click', () => {
  suppliersPage = 0;
  loadSuppliers();
});

// Edit supplier
async function editSupplier(id) {
  console.log('[Dashboard] editSupplier called with id:', id);
  if (!id || id === 'undefined' || id === 'null') {
    alert('Invalid supplier ID');
    return;
  }
  try {
    const data = await api(`/suppliers/${id}`);
    console.log('[Dashboard] Supplier data received:', data);
    const s = data.supplier;

    document.getElementById('edit-supplier-id').value = s.id;
    document.getElementById('edit-supplier-name').textContent = s.name;
    document.getElementById('edit-name').value = s.name || '';
    document.getElementById('edit-phone').value = s.phone || '';
    document.getElementById('edit-website').value = s.website || '';
    document.getElementById('edit-state').value = s.state || '';
    document.getElementById('edit-city').value = s.city || '';
    document.getElementById('edit-active').checked = s.is_active;
    document.getElementById('edit-price-display').checked = s.allow_price_display;
    document.getElementById('edit-scraping').checked = s.scraping_enabled;

    // Price info - allow manual entry
    const priceEl = document.getElementById('edit-price');
    priceEl.value = s.current_price ? parseFloat(s.current_price).toFixed(2) : '';
    document.getElementById('edit-price-date').value = s.price_updated_at ? timeAgo(s.price_updated_at) : 'Never';
    document.getElementById('edit-price-source').value = s.price_source || 'Not set';

    // Click stats - improved display
    const stats = data.clickStats;
    document.getElementById('edit-click-stats').innerHTML = `
      <div class="stat-item">
        <div class="stat-value">${stats.total || 0}</div>
        <div class="stat-label">Total Clicks</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.last7Days || 0}</div>
        <div class="stat-label">Last 7 Days</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.calls || 0}</div>
        <div class="stat-label">Phone Calls</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.websites || 0}</div>
        <div class="stat-label">Website Visits</div>
      </div>
    `;

    document.getElementById('supplier-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load supplier:', error);
    alert('Failed to load supplier details: ' + (error.message || 'Unknown error'));
  }
}

// Make editSupplier available globally
window.editSupplier = editSupplier;

// Cancel edit
document.getElementById('cancel-edit').addEventListener('click', () => {
  document.getElementById('supplier-modal').classList.add('hidden');
});

// Save supplier
document.getElementById('supplier-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('edit-supplier-id').value;
  const priceValue = document.getElementById('edit-price').value;

  const updates = {
    name: document.getElementById('edit-name').value,
    phone: document.getElementById('edit-phone').value,
    website: document.getElementById('edit-website').value,
    state: document.getElementById('edit-state').value,
    city: document.getElementById('edit-city').value,
    is_active: document.getElementById('edit-active').checked,
    allow_price_display: document.getElementById('edit-price-display').checked,
    scraping_enabled: document.getElementById('edit-scraping').checked,
    manual_price: priceValue ? parseFloat(priceValue) : null
  };

  try {
    await api(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    document.getElementById('supplier-modal').classList.add('hidden');
    loadSuppliers();
    loadScrapers();
    alert('Supplier updated successfully');
  } catch (error) {
    console.error('Failed to update supplier:', error);
    alert('Failed to update supplier');
  }
});

// Charts for new tabs
let searchesChart = null;
let peakHoursChart = null;
let iosChart = null;

// Load conversion funnel
async function loadConversion() {
  try {
    const data = await api(`/conversion?days=${currentDays}`);

    document.getElementById('funnel-searches').textContent = data.funnel.searches.toLocaleString();
    document.getElementById('funnel-clicks').textContent = data.funnel.clicks.toLocaleString();
    document.getElementById('funnel-rate').textContent = data.funnel.conversionRate + '%';

    // Adjust bar widths proportionally
    const maxWidth = 200;
    const clicksWidth = data.funnel.searches > 0
      ? Math.max(30, (data.funnel.clicks / data.funnel.searches) * maxWidth)
      : 30;
    document.getElementById('funnel-clicks-bar').style.width = clicksWidth + 'px';

  } catch (error) {
    console.error('Failed to load conversion:', error);
  }
}

// Load price alerts
async function loadPriceAlerts() {
  try {
    const data = await api('/price-alerts');
    const panel = document.getElementById('price-alerts-panel');
    const content = document.getElementById('price-alerts-content');

    if (data.alerts && data.alerts.length > 0) {
      panel.style.display = 'block';
      content.innerHTML = data.alerts.map(a => `
        <div class="price-alert-item ${a.direction}">
          <div>
            <span class="price-alert-supplier">${a.supplierName}</span>
            <span style="color: var(--gray-500); margin-left: 0.5rem;">
              $${a.previousPrice.toFixed(2)} → $${a.currentPrice.toFixed(2)}
            </span>
          </div>
          <span class="price-alert-change ${a.direction}">
            ${a.direction === 'up' ? '↑' : '↓'} ${a.changePercent}%
          </span>
        </div>
      `).join('');
    } else {
      panel.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to load price alerts:', error);
  }
}

// Load searches tab
async function loadSearches() {
  try {
    const data = await api(`/searches?days=${currentDays}`);

    // Summary stats
    document.getElementById('searches-total').textContent = data.summary.totalSearches.toLocaleString();
    document.getElementById('searches-avg').textContent = `${data.summary.avgPerDay} avg/day`;
    document.getElementById('searches-zips').textContent = data.summary.uniqueZips;

    // Daily chart
    const ctx = document.getElementById('searches-chart').getContext('2d');
    if (searchesChart) searchesChart.destroy();

    searchesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.daily.map(d => d.date),
        datasets: [{
          label: 'Searches',
          data: data.daily.map(d => d.searches),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });

    // Peak hours chart
    const peakCtx = document.getElementById('peak-hours-chart').getContext('2d');
    if (peakHoursChart) peakHoursChart.destroy();

    peakHoursChart = new Chart(peakCtx, {
      type: 'bar',
      data: {
        labels: data.hourly.map(h => `${h.hour}:00`),
        datasets: [{
          label: 'Searches',
          data: data.hourly.map(h => h.searches),
          backgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });

    // Top ZIPs table
    const tbody = document.getElementById('top-zips-body');
    tbody.innerHTML = '';
    data.topZips.slice(0, 15).forEach(z => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${z.zip}</td>
        <td>${z.city}</td>
        <td>${z.state}</td>
        <td>${z.searches}</td>
      `;
      tbody.appendChild(row);
    });

  } catch (error) {
    console.error('Failed to load searches:', error);
  }
}

// Load iOS App tab
async function loadIOSApp() {
  try {
    // Get unified data for iOS/app metrics
    const unified = await api(`/unified?days=${currentDays}`);
    const app = unified?.app || {};
    const retention = unified?.retention || {};
    const hasFirebase = unified?.dataSources?.firebase === true;

    // Show/hide Firebase setup guide
    const setupGuide = document.getElementById('ios-firebase-setup');
    if (setupGuide) {
      setupGuide.style.display = hasFirebase ? 'none' : 'block';
    }

    // Summary stats from our database
    // Note: Full install counts require Firebase Analytics API
    const uniqueUsers = app.uniqueUsers || 0;
    document.getElementById('ios-installs').textContent = hasFirebase ? (app.installs || '--') : '--';
    document.getElementById('ios-mau').textContent = uniqueUsers || '--';

    if (hasFirebase && app.installs && uniqueUsers) {
      const mauPercent = ((uniqueUsers / app.installs) * 100).toFixed(0);
      document.getElementById('ios-mau-percent').textContent = `${mauPercent}% of installs`;
    } else {
      document.getElementById('ios-mau-percent').textContent = uniqueUsers > 0 ? 'Active users' : '--% of installs';
    }

    // Retention from retention data
    const retentionEl = document.getElementById('ios-retention');
    const week1Rate = retention?.summary?.week1RetentionRate;
    if (week1Rate) {
      retentionEl.textContent = `${week1Rate}%`;
      retentionEl.classList.toggle('good', parseFloat(week1Rate) >= 30);
    } else {
      retentionEl.textContent = '--%';
    }

    // Deliveries - this is tracked in our database via supplier_engagements or could be separate
    document.getElementById('ios-deliveries').textContent = app.saves || '--';

    // Event breakdown from our database
    document.getElementById('ios-event-supplier').textContent = app.views || '--';
    document.getElementById('ios-event-price').textContent = '--'; // Not tracked separately
    document.getElementById('ios-event-search').textContent = '--'; // Would need Firebase
    document.getElementById('ios-event-noresults').textContent = '--'; // Would need Firebase

    // Also try to get local iOS engagement data
    let localData = null;
    try {
      localData = await api(`/ios-app?days=${currentDays}`);
    } catch (e) {
      console.log('Local iOS data not available');
    }

    // Daily chart
    const ctx = document.getElementById('ios-chart').getContext('2d');
    if (iosChart) iosChart.destroy();

    if (localData?.daily?.length > 0) {
      iosChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: localData.daily.map(d => d.date),
          datasets: [{
            label: 'Engagements',
            data: localData.daily.map(d => d.engagements),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
    }

    // Top suppliers table
    const tbody = document.getElementById('ios-suppliers-body');
    tbody.innerHTML = '';

    if (localData?.bySupplier?.length > 0) {
      localData.bySupplier.forEach(s => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${s.name}</td>
          <td>${s.views}</td>
          <td>${s.calls}</td>
          <td>${s.engagements}</td>
        `;
        tbody.appendChild(row);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="no-data">No app engagement data yet</td></tr>';
    }

  } catch (error) {
    console.error('Failed to load iOS app data:', error);
  }
}

// Show coverage gap ZIP details
async function showCoverageDetails(type) {
  const modal = document.getElementById('zip-details-modal');
  const title = document.getElementById('zip-details-title');
  const content = document.getElementById('zip-details-content');

  // Set title based on type
  if (type === 'no-suppliers') {
    title.textContent = 'ZIPs With No Supplier Coverage';
  } else if (type === 'low-engagement') {
    title.textContent = 'ZIPs With Low Engagement (No Clicks)';
  }

  content.innerHTML = '<p>Loading...</p>';
  modal.classList.remove('hidden');

  try {
    const data = await api(`/coverage-details?type=${type}&days=${currentDays}`);

    if (data.zips.length === 0) {
      content.innerHTML = '<p>No ZIPs found for this category.</p>';
      return;
    }

    // Build table
    let html = `
      <p style="margin-bottom: 1rem; color: var(--gray-500);">
        ${data.count} ZIPs found in the last ${data.period}
      </p>
      <table>
        <thead>
          <tr>
            <th>ZIP</th>
            <th>City</th>
            <th>County</th>
            <th>State</th>
            <th>Searches</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.zips.forEach(z => {
      html += `
        <tr>
          <td>${z.zip}</td>
          <td>${z.city}</td>
          <td>${z.county}</td>
          <td>${z.state}</td>
          <td>${z.searches}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    content.innerHTML = html;
  } catch (error) {
    console.error('Failed to load coverage details:', error);
    content.innerHTML = `<p class="error">Failed to load data: ${error.message}</p>`;
  }
}

// Close ZIP details modal
document.getElementById('close-zip-details').addEventListener('click', () => {
  document.getElementById('zip-details-modal').classList.add('hidden');
});

// Close modal when clicking outside
document.getElementById('zip-details-modal').addEventListener('click', (e) => {
  if (e.target.id === 'zip-details-modal') {
    document.getElementById('zip-details-modal').classList.add('hidden');
  }
});

// Helper to switch tabs programmatically
function switchTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) tab.click();
}

// ========================================
// INTELLIGENCE DASHBOARD FUNCTIONS
// ========================================

// Charts for intelligence tabs
let retentionChart = null;
let trafficSourcesChart = null;
let acquisitionFunnelChart = null;
let androidTrendChart = null;

// Load recommendations
async function loadRecommendations() {
  const loadingEl = document.getElementById('recommendations-loading');
  const contentEl = document.getElementById('recommendations-content');
  const noRecsEl = document.getElementById('no-recommendations');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  noRecsEl.classList.add('hidden');

  try {
    const data = await api(`/recommendations?days=${currentDays}`);

    // Group recommendations by priority
    const high = data.recommendations.filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH');
    const medium = data.recommendations.filter(r => r.priority === 'MEDIUM');
    const low = data.recommendations.filter(r => r.priority === 'LOW' || r.priority === 'OPPORTUNITY');

    // Show top priority alert
    if (data.summary.topPriority) {
      document.getElementById('top-priority-alert').classList.remove('hidden');
      document.getElementById('priority-title').textContent = data.summary.topPriority.title;
      const topRec = data.recommendations[0];
      document.getElementById('priority-insight').textContent = topRec?.insight || '';
    }

    // Render cards
    renderRecommendationCards('cards-high', high);
    renderRecommendationCards('cards-medium', medium);
    renderRecommendationCards('cards-low', low);

    // Show/hide sections
    document.getElementById('section-high').style.display = high.length > 0 ? 'block' : 'none';
    document.getElementById('section-medium').style.display = medium.length > 0 ? 'block' : 'none';
    document.getElementById('section-low').style.display = low.length > 0 ? 'block' : 'none';

    if (data.recommendations.length === 0) {
      noRecsEl.classList.remove('hidden');
    } else {
      contentEl.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Failed to load recommendations:', error);
    loadingEl.textContent = 'Failed to load recommendations';
  } finally {
    loadingEl.classList.add('hidden');
  }
}

function renderRecommendationCards(containerId, recommendations) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  recommendations.forEach(rec => {
    const card = document.createElement('div');
    card.className = `recommendation-card ${rec.priority.toLowerCase()}`;

    const actions = rec.actions?.map(a =>
      `<li>${a.text || a}</li>`
    ).join('') || '';

    const metricsHtml = rec.metrics ? `
      <div class="rec-metrics">
        ${Object.entries(rec.metrics).map(([k, v]) =>
          `<span><strong>${k}:</strong> ${typeof v === 'object' ? JSON.stringify(v) : v}</span>`
        ).join(' | ')}
      </div>
    ` : '';

    card.innerHTML = `
      <div class="rec-header">
        <div class="rec-title">${rec.title}</div>
        <span class="rec-category">${rec.category}</span>
      </div>
      <div class="rec-insight">${rec.insight}</div>
      <ul class="rec-actions">${actions}</ul>
      ${metricsHtml}
    `;

    container.appendChild(card);
  });
}

// Load retention data
async function loadRetention() {
  try {
    const data = await api('/retention');

    if (!data.available) {
      console.log('Retention data not available:', data.reason);
      showRetentionNoData(data.reason || 'Data not available');
      return;
    }

    // Check if there's actual data
    if (!data.hasData) {
      showRetentionNoData(data.reason || 'No engagement data tracked yet');
      return;
    }

    // Week 1 retention
    const week1Rate = data.data?.summary?.week1RetentionRate;
    const week1El = document.getElementById('week1-retention');
    if (week1Rate) {
      week1El.textContent = `${week1Rate}%`;
      week1El.classList.toggle('good', parseFloat(week1Rate) >= 30);
    } else {
      week1El.textContent = 'N/A';
    }

    // Cohort size
    const cohortSize = data.data?.summary?.totalCohortSize;
    document.getElementById('cohort-size').textContent = cohortSize || '0';

    // Behavior retention table
    const behaviorBody = document.getElementById('behavior-retention-body');
    behaviorBody.innerHTML = '';

    const behaviorInsights = {
      made_call: 'Users who call stay much longer',
      saved_supplier: 'Saving = investment in app',
      browsed_only: 'Need to drive action'
    };

    const behaviors = data.data?.behaviorRetention || [];
    if (behaviors.length === 0) {
      behaviorBody.innerHTML = '<tr><td colspan="4" class="no-data">No behavior data available</td></tr>';
    } else {
      behaviors.forEach(b => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${formatBehavior(b.behavior)}</td>
          <td>${b.userCount}</td>
          <td>${b.avgActiveDays.toFixed(1)} days</td>
          <td>${behaviorInsights[b.behavior] || '--'}</td>
        `;
        behaviorBody.appendChild(row);
      });
    }

    // Retention chart
    const cohorts = data.data?.cohorts || [];
    if (cohorts.length > 0) {
      const weeks = [...new Set(cohorts.map(c => c.week_number))].sort((a, b) => a - b);
      const chartData = weeks.map(w => {
        const cohort = cohorts.find(c => parseInt(c.week_number) === w);
        return cohort ? parseFloat(cohort.retention_rate) : null;
      });

      const ctx = document.getElementById('retention-chart').getContext('2d');
      if (retentionChart) retentionChart.destroy();

      retentionChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: weeks.map(w => `Week ${w}`),
          datasets: [{
            label: 'Retention %',
            data: chartData,
            backgroundColor: chartData.map(v =>
              v >= 30 ? '#22c55e' : v >= 15 ? '#f59e0b' : '#ef4444'
            )
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('Failed to load retention:', error);
  }
}

function showRetentionNoData(reason) {
  document.getElementById('week1-retention').textContent = 'N/A';
  document.getElementById('cohort-size').textContent = '0';
  document.getElementById('behavior-retention-body').innerHTML = `
    <tr><td colspan="4" class="no-data">
      <div class="no-data-message">
        <p><strong>No retention data available</strong></p>
        <p class="hint">${reason}</p>
        <p class="hint">Retention tracking requires iOS app engagement data with user IDs.</p>
      </div>
    </td></tr>
  `;
}

function formatBehavior(behavior) {
  const names = {
    made_call: 'Made a Call',
    saved_supplier: 'Saved a Supplier',
    browsed_only: 'Browsed Only'
  };
  return names[behavior] || behavior;
}

// Load acquisition data
async function loadAcquisition() {
  try {
    const data = await api(`/acquisition?days=${currentDays}`);

    if (!data.available) {
      console.log('Acquisition data not available:', data.reason);
      return;
    }

    // Summary stats
    if (data.data?.websiteTraffic) {
      document.getElementById('acq-sessions').textContent = data.data.websiteTraffic.sessions || '--';
      document.getElementById('acq-organic').textContent = `${data.data.websiteTraffic.organicPercent || 0}%`;
    } else {
      document.getElementById('acq-sessions-source').textContent = 'GA4 not configured';
    }

    // Conversion rate from funnel
    const funnel = data.data?.conversionFunnel?.daily || [];
    if (funnel.length > 0) {
      const totalSearches = funnel.reduce((sum, d) => sum + d.searches, 0);
      const totalClicks = funnel.reduce((sum, d) => sum + d.clicks, 0);
      const rate = totalSearches > 0 ? ((totalClicks / totalSearches) * 100).toFixed(1) : 0;
      document.getElementById('acq-conversion').textContent = `${rate}%`;
    }

    // Traffic sources chart
    if (data.data?.websiteTraffic?.trafficSources) {
      const sources = data.data.websiteTraffic.trafficSources;
      const ctx = document.getElementById('traffic-sources-chart').getContext('2d');
      if (trafficSourcesChart) trafficSourcesChart.destroy();

      trafficSourcesChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sources.map(s => s.channel),
          datasets: [{
            label: 'Sessions',
            data: sources.map(s => s.sessions),
            backgroundColor: '#2563eb'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y'
        }
      });
    } else {
      document.getElementById('traffic-sources-note').textContent =
        'Configure GA4 API to see traffic sources';
    }

    // Daily funnel chart
    if (funnel.length > 0) {
      const ctx = document.getElementById('acquisition-funnel-chart').getContext('2d');
      if (acquisitionFunnelChart) acquisitionFunnelChart.destroy();

      acquisitionFunnelChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: funnel.map(d => d.date),
          datasets: [
            {
              label: 'Searches',
              data: funnel.map(d => d.searches),
              borderColor: '#2563eb',
              fill: false
            },
            {
              label: 'Clicks',
              data: funnel.map(d => d.clicks),
              borderColor: '#22c55e',
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
    }

    // Top converting locations table
    const locationsBody = document.getElementById('converting-locations-body');
    locationsBody.innerHTML = '';

    (data.data?.topConvertingLocations || []).slice(0, 15).forEach(loc => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${loc.zip}</td>
        <td>${loc.city}</td>
        <td>${loc.searches}</td>
        <td>${loc.clicks}</td>
        <td>${loc.conversionRate}%</td>
      `;
      locationsBody.appendChild(row);
    });
  } catch (error) {
    console.error('Failed to load acquisition:', error);
  }
}

// Load Android decision signals
async function loadAndroidSignals() {
  try {
    // Use unified endpoint which has more reliable GA4 data
    const unified = await api('/unified?days=30');
    const signals = unified.android;

    if (!signals) {
      console.log('Android signals not available');
      return;
    }

    // Decision status
    const statusEl = document.getElementById('android-status');
    statusEl.textContent = signals.recommendation?.status || 'WAIT';
    statusEl.className = 'decision-status ' + (signals.recommendation?.status || 'wait').toLowerCase();

    document.getElementById('android-message').textContent =
      signals.recommendation?.message || 'Loading...';

    // Key metrics
    document.getElementById('android-waitlist').textContent = signals.waitlist?.total ?? '--';
    document.getElementById('android-growth').textContent = `${signals.waitlist?.growthRate ?? 0}%`;
    document.getElementById('android-pwa').textContent = signals.pwa?.installs ?? '--';

    // PWA conversion rate
    const pwaRate = signals.pwa?.conversionRate;
    const pwaRateEl = document.getElementById('android-pwa-rate');
    if (pwaRateEl) {
      pwaRateEl.textContent = pwaRate ? `${pwaRate}% conversion` : '--% conversion';
    }

    // PWA Funnel
    const pwaPrompts = document.getElementById('pwa-prompts');
    const pwaInstallsDetail = document.getElementById('pwa-installs-detail');
    const pwaLaunches = document.getElementById('pwa-launches');

    if (pwaPrompts) pwaPrompts.textContent = signals.pwa?.prompts ?? '--';
    if (pwaInstallsDetail) pwaInstallsDetail.textContent = signals.pwa?.installs ?? '--';
    if (pwaLaunches) pwaLaunches.textContent = signals.pwa?.launches ?? '--';

    // Thresholds
    const thresholdsGrid = document.getElementById('thresholds-grid');
    thresholdsGrid.innerHTML = '';

    if (signals.thresholds) {
      Object.entries(signals.thresholds).forEach(([key, threshold]) => {
        const item = document.createElement('div');
        item.className = 'threshold-item';
        item.innerHTML = `
          <div class="threshold-icon">${threshold.met ? '✅' : '⏳'}</div>
          <div class="threshold-content">
            <div class="threshold-label">${formatThresholdKey(key)}</div>
            <div class="threshold-value">${threshold.current}</div>
            <div class="threshold-target">Target: ${threshold.value}</div>
          </div>
        `;
        thresholdsGrid.appendChild(item);
      });
    }

    // Platform breakdown
    if (signals.platformBreakdown) {
      const pb = signals.platformBreakdown;
      document.getElementById('platform-ios').textContent = `${pb.ios?.percent || 0}%`;
      document.getElementById('platform-ios-users').textContent = `${pb.ios?.users || 0} users`;
      document.getElementById('platform-android').textContent = `${pb.android?.percent || 0}%`;
      document.getElementById('platform-android-users').textContent = `${pb.android?.users || 0} users`;
      document.getElementById('platform-desktop').textContent = `${pb.desktop?.percent || 0}%`;
      document.getElementById('platform-desktop-users').textContent = `${pb.desktop?.users || 0} users`;
      document.getElementById('platform-note').textContent = '';
    } else {
      document.getElementById('platform-note').textContent = 'GA4 not configured - enable for platform data';
    }

    // Projections
    document.getElementById('weeks-to-200').textContent =
      signals.projection?.weeksTo200 || 'N/A';
    document.getElementById('expected-users').textContent =
      signals.projection?.expectedConversion || '--';

    // Trend chart
    const trend = signals.weeklyTrend || [];
    if (trend.length > 0) {
      const ctx = document.getElementById('android-trend-chart').getContext('2d');
      if (androidTrendChart) androidTrendChart.destroy();

      androidTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trend.map(t => new Date(t.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
          datasets: [{
            label: 'Weekly Signups',
            data: trend.map(t => t.signups),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  } catch (error) {
    console.error('Failed to load Android signals:', error);
  }
}

function formatThresholdKey(key) {
  const names = {
    waitlist: 'Waitlist Size',
    growthRate: 'Weekly Growth',
    pwaAdoption: 'PWA Installs'
  };
  return names[key] || key;
}

// Load dashboard
async function loadDashboard() {
  await Promise.all([
    loadOverview(),
    loadSupplierSignals(),
    loadConversion(),
    loadPriceAlerts(),
    loadRecommendations()
  ]);
}

// Initialize
if (authToken) {
  // Try to validate existing token
  api('/meta')
    .then(() => showDashboard())
    .catch(() => showLogin());
} else {
  showLogin();
}
