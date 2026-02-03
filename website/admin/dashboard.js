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

// Trend arrow helper - returns HTML for trend indicator
function trendArrow(trend) {
  if (!trend || trend.direction === 'flat') {
    return '<span class="trend flat">—</span>';
  }
  const arrow = trend.direction === 'up' ? '↑' : '↓';
  const colorClass = trend.direction === 'up' ? 'trend-up' : 'trend-down';
  return `<span class="trend ${colorClass}">${arrow} ${trend.display}</span>`;
}

// Data source connection status banner
function updateDataSourceBanner(unified) {
  const banner = document.getElementById('data-source-warnings');
  const textEl = document.getElementById('data-source-text');
  const detailsEl = document.getElementById('data-source-details');

  if (!banner) return;

  const ga4Connected = unified?.dataSources?.ga4 === true;
  const firebaseConnected = unified?.dataSources?.firebase === true;
  const dbConnected = unified?.dataSources?.database !== false;

  // Check if banner was dismissed this session
  const dismissed = sessionStorage.getItem('dataSourceBannerDismissed');

  // Show banner if any service is not connected
  if (!ga4Connected || !firebaseConnected) {
    if (dismissed) {
      banner.classList.add('hidden');
      return;
    }

    const disconnected = [];
    if (!ga4Connected) disconnected.push('GA4');
    if (!firebaseConnected) disconnected.push('Firebase');

    const allDisconnected = !ga4Connected && !firebaseConnected;

    textEl.textContent = allDisconnected
      ? 'Analytics services not connected'
      : `${disconnected.join(' & ')} not connected`;

    // Build details tags
    let tags = '';
    tags += `<span class="banner-tag ${ga4Connected ? 'connected' : 'disconnected'}">
      ${ga4Connected ? '✓' : '✗'} GA4 (Website)
    </span>`;
    tags += `<span class="banner-tag ${firebaseConnected ? 'connected' : 'disconnected'}">
      ${firebaseConnected ? '✓' : '✗'} Firebase (iOS)
    </span>`;
    tags += `<span class="banner-tag ${dbConnected ? 'connected' : 'disconnected'}">
      ${dbConnected ? '✓' : '✗'} Database
    </span>`;

    detailsEl.innerHTML = tags;
    banner.classList.remove('hidden');
    banner.classList.toggle('error', allDisconnected);
  } else {
    banner.classList.add('hidden');
  }
}

// Dismiss banner handler
document.getElementById('dismiss-banner')?.addEventListener('click', () => {
  document.getElementById('data-source-warnings')?.classList.add('hidden');
  sessionStorage.setItem('dataSourceBannerDismissed', 'true');
});

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
    // Scope 18 tabs (new primary navigation)
    if (target === 'leaderboard') loadLeaderboard();
    if (target === 'app-analytics') loadAppAnalytics();
    if (target === 'growth') loadGrowth();
    if (target === 'coverage') loadCoverage();
    if (target === 'settings') loadSettings();
    // Legacy tabs (kept for backward compatibility)
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

// Make showTab globally accessible for onclick handlers
window.showTab = showTab;

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

    // Show data source connection warnings
    updateDataSourceBanner(unified);

    // Get trend data
    const trends = unified?.trends || {};

    // Card 1: Total Users (iOS MAU + Website unique visitors)
    // Try unified data first (GA4/Firebase), fallback to database estimates
    const ga4Available = unified?.dataSources?.ga4;
    const iosUsersCount = unified?.app?.summary?.totalUsers || unified?.app?.uniqueUsers || data.users?.ios || 0;
    const webUsers = ga4Available
      ? (unified?.website?.activeUsers || 0)
      : (data.users?.website || 0);
    const totalUsers = iosUsersCount + webUsers;

    document.getElementById('total-users').textContent = totalUsers || '--';
    document.getElementById('users-breakdown').innerHTML = `${iosUsersCount} iOS / ${webUsers} website`;
    // Show data source with trend
    if (totalUsers > 0) {
      const usersTrend = trends.iosUsers || trends.websiteUsers;
      document.getElementById('users-freshness').innerHTML = (ga4Available ? 'via GA4' : 'unique searches') +
        (usersTrend ? ' ' + trendArrow(usersTrend) : '');
    } else {
      document.getElementById('users-freshness').textContent = 'No activity yet';
    }

    // Card 2: Deliveries Logged (using saves from app data as proxy)
    const deliveries = unified?.app?.deliveries?.total || unified?.app?.saves || 0;
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
    const clicksTrend = trends.clicks;
    document.getElementById('revenue-freshness').innerHTML = (revenueFreshness ? timeAgo(revenueFreshness) : '') +
      (clicksTrend ? ' ' + trendArrow(clicksTrend) : '');

    // Card 4: Android Waitlist
    document.getElementById('waitlist-total').textContent = data.waitlist.total;
    const waitlistTrend = trends.waitlist;
    document.getElementById('waitlist-recent').innerHTML = `+${data.waitlist.last7Days} this week` +
      (waitlistTrend ? ' ' + trendArrow(waitlistTrend) : '');
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

// Activity state
let activityState = {
  page: 1,
  totalPages: 1,
  sortColumn: 'timestamp',
  sortDirection: 'desc'
};

// Load recent click activity with filters and pagination
async function loadRecentActivity() {
  const tbody = document.getElementById('activity-body');

  // Get filter values
  const days = document.getElementById('activity-date-filter')?.value || '30';
  const action = document.getElementById('activity-action-filter')?.value || '';
  const pageSource = document.getElementById('activity-source-filter')?.value || '';
  const supplier = document.getElementById('activity-supplier-search')?.value || '';

  // Build query string
  const params = new URLSearchParams();
  params.append('limit', '50');
  params.append('page', activityState.page);
  if (days) params.append('days', days);
  if (action) params.append('action', action);
  if (pageSource) params.append('pageSource', pageSource);
  if (supplier) params.append('supplier', supplier);

  try {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Loading...</td></tr>';
    const data = await api(`/activity?${params.toString()}`);

    // Update summary stats
    if (data.summary) {
      document.getElementById('activity-today').textContent = data.summary.today;
      document.getElementById('activity-week').textContent = data.summary.thisWeek;
      document.getElementById('activity-calls').textContent = data.summary.callsThisWeek;
      document.getElementById('activity-websites').textContent = data.summary.websitesThisWeek;
      document.getElementById('activity-top-supplier').textContent = data.summary.topSupplier || '--';

      const trendEl = document.getElementById('activity-trend');
      const trend = data.summary.trend;
      trendEl.textContent = (trend > 0 ? '+' : '') + trend + '%';
      trendEl.className = 'summary-value trend-' + data.summary.trendDirection;
    }

    // Update pagination
    activityState.totalPages = data.totalPages || 1;
    updateActivityPagination();

    if (!data.activity || data.activity.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No activity found</td></tr>';
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

      // Action icons
      const actionIcons = {
        'call': '📞 Call',
        'text': '💬 Text',
        'email': '✉️ Email',
        'website': '🌐 Website',
        'view': '👁️ View',
        'save': '⭐ Save',
        'request_quote': '📋 Quote'
      };
      const actionDisplay = actionIcons[a.action] || a.action;

      // Page source display
      const pageSourceDisplay = {
        'prices': 'Prices',
        'seo-city': 'City',
        'seo-county': 'County',
        'seo-state': 'State',
        'seo-region': 'Region',
        'ios_app': '📱 iOS'
      };
      const sourceDisplay = pageSourceDisplay[a.pageSource] || a.pageSource || '--';

      row.innerHTML = `
        <td>${timeStr}</td>
        <td>${a.supplier}${a.supplierLocation ? '<br><small class="hint">' + a.supplierLocation + '</small>' : ''}</td>
        <td>${actionDisplay}</td>
        <td>${a.userZip || '--'}</td>
        <td>${sourceDisplay}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Failed to load activity:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">Failed to load activity</td></tr>';
  }
}

// Update pagination controls
function updateActivityPagination() {
  const prevBtn = document.getElementById('activity-prev');
  const nextBtn = document.getElementById('activity-next');
  const pageInfo = document.getElementById('activity-page-info');

  if (prevBtn) prevBtn.disabled = activityState.page <= 1;
  if (nextBtn) nextBtn.disabled = activityState.page >= activityState.totalPages;
  if (pageInfo) pageInfo.textContent = `Page ${activityState.page} of ${activityState.totalPages}`;
}

// Initialize activity filters and pagination
function initActivityControls() {
  // Filter change handlers
  ['activity-date-filter', 'activity-action-filter', 'activity-source-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        activityState.page = 1;
        loadRecentActivity();
      });
    }
  });

  // Supplier search with debounce
  const searchInput = document.getElementById('activity-supplier-search');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        activityState.page = 1;
        loadRecentActivity();
      }, 300);
    });
  }

  // Pagination buttons
  const prevBtn = document.getElementById('activity-prev');
  const nextBtn = document.getElementById('activity-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (activityState.page > 1) {
        activityState.page--;
        loadRecentActivity();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (activityState.page < activityState.totalPages) {
        activityState.page++;
        loadRecentActivity();
      }
    });
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

// Sorting state for suppliers
let suppliersSort = 'clicks';
let suppliersOrder = 'desc';

// Load suppliers tab
async function loadSuppliers() {
  try {
    const stateEl = document.getElementById('filter-state');
    const priceEl = document.getElementById('filter-price');
    const scrapeEl = document.getElementById('filter-scrape');
    const activeEl = document.getElementById('filter-active');
    const searchEl = document.getElementById('filter-search');

    const state = stateEl?.value || '';
    const hasPrice = priceEl?.value || '';
    const scrape = scrapeEl?.value || '';
    const active = activeEl?.value || '';
    const search = searchEl?.value || '';

    let url = `/suppliers?limit=${suppliersLimit}&offset=${suppliersPage * suppliersLimit}`;
    url += `&sort=${suppliersSort}&order=${suppliersOrder}`;
    if (state) url += `&state=${state}`;
    if (hasPrice) url += `&hasPrice=${hasPrice}`;
    if (scrape) url += `&scrapeStatus=${scrape}`;
    if (active) url += `&active=${active}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const data = await api(url);

    // Update sort indicators
    document.querySelectorAll('#suppliers-table th.sortable').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (th.dataset.sort === suppliersSort) {
        icon.textContent = suppliersOrder === 'asc' ? '↑' : '↓';
        th.classList.add('sorted');
      } else {
        icon.textContent = '↕';
        th.classList.remove('sorted');
      }
    });

    // Populate state filter if empty
    if (stateEl && stateEl.options.length === 1) {
      // Fetch all states from a separate request
      try {
        const allData = await api('/suppliers?limit=500&offset=0');
        const states = [...new Set(allData.suppliers.map(s => s.state).filter(Boolean))].sort();
        states.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          stateEl.appendChild(opt);
        });
      } catch (e) {
        console.warn('Could not load all states:', e);
      }
    }

    // Update results count
    const resultsCount = document.getElementById('results-count');
    if (resultsCount) {
      resultsCount.textContent = `Showing ${data.suppliers.length} of ${data.pagination.total} suppliers`;
    }

    // Show bulk actions if results
    const bulkActions = document.getElementById('bulk-actions');
    if (bulkActions) {
      bulkActions.classList.toggle('hidden', data.suppliers.length === 0);
    }

    // Table
    const tbody = document.getElementById('suppliers-body');
    tbody.innerHTML = '';

    if (data.suppliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data">No suppliers found matching your criteria</td></tr>';
    } else {
      data.suppliers.forEach(s => {
        // Status badges
        const statusBadges = [];
        if (s.isActive) {
          statusBadges.push('<span class="badge badge-success">Active</span>');
        } else {
          statusBadges.push('<span class="badge badge-error">Inactive</span>');
        }
        if (s.scrapingEnabled) {
          statusBadges.push('<span class="badge badge-info">Fresh</span>');
        } else if (s.currentPrice) {
          statusBadges.push('<span class="badge badge-warning">Stale</span>');
        } else {
          statusBadges.push('<span class="badge badge-muted">No Price</span>');
        }

        // Click indicator
        const clickIndicator = s.recentClicks > 10 ? '🔥' : s.recentClicks > 0 ? '📊' : '—';

        const row = document.createElement('tr');
        row.className = !s.isActive ? 'row-inactive' : (s.scrapingEnabled ? '' : 'row-stale');
        row.innerHTML = `
          <td>
            <div class="supplier-name">${s.name}</div>
            <div class="supplier-meta">${s.city || ''}</div>
          </td>
          <td>${s.state || '--'}</td>
          <td class="${s.currentPrice ? 'price-value' : 'no-price'}">${formatPrice(s.currentPrice)}</td>
          <td class="${s.scrapingEnabled ? '' : 'stale-date'}">${timeAgo(s.priceUpdatedAt)}</td>
          <td class="clicks-cell">${clickIndicator} ${s.recentClicks}</td>
          <td class="status-badges">${statusBadges.join('')}</td>
          <td class="actions-cell">
            <button class="btn-small btn-edit edit-supplier-btn" data-id="${s.id}">Edit</button>
          </td>
        `;
        tbody.appendChild(row);
      });

      // Attach event listeners for edit buttons
      tbody.querySelectorAll('.edit-supplier-btn').forEach(btn => {
        btn.addEventListener('click', () => editSupplier(btn.dataset.id));
      });
    }

    // Pagination
    const totalPages = Math.ceil(data.pagination.total / suppliersLimit);
    document.getElementById('page-info').textContent =
      `Page ${suppliersPage + 1} of ${totalPages}`;
    document.getElementById('prev-page').disabled = suppliersPage === 0;
    document.getElementById('next-page').disabled = suppliersPage >= totalPages - 1;

  } catch (error) {
    console.error('Failed to load suppliers:', error);
    const tbody = document.getElementById('suppliers-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="error-message">Failed to load suppliers. Please try again.</td></tr>';
    }
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

// Clear filters
document.getElementById('filter-clear')?.addEventListener('click', () => {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-state').value = '';
  document.getElementById('filter-price').value = '';
  document.getElementById('filter-scrape').value = '';
  const activeFilter = document.getElementById('filter-active');
  if (activeFilter) activeFilter.value = '';
  suppliersPage = 0;
  loadSuppliers();
});

// Search on Enter key
document.getElementById('filter-search')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    suppliersPage = 0;
    loadSuppliers();
  }
});

// Export CSV
document.getElementById('export-csv')?.addEventListener('click', async () => {
  try {
    const state = document.getElementById('filter-state')?.value || '';
    const hasPrice = document.getElementById('filter-price')?.value || '';
    const search = document.getElementById('filter-search')?.value || '';

    let url = '/suppliers?limit=1000&offset=0&format=csv';
    if (state) url += `&state=${state}`;
    if (hasPrice) url += `&hasPrice=${hasPrice}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const response = await fetch(`/api/dashboard${url}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `suppliers-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Failed to export CSV:', error);
    alert('Failed to export CSV');
  }
});

// Sortable column headers
document.querySelectorAll('#suppliers-table th.sortable').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    const newSort = th.dataset.sort;
    if (suppliersSort === newSort) {
      // Toggle order if same column
      suppliersOrder = suppliersOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // New column - default to desc for clicks/price, asc for name/state
      suppliersSort = newSort;
      suppliersOrder = ['clicks', 'price', 'updated'].includes(newSort) ? 'desc' : 'asc';
    }
    suppliersPage = 0;
    loadSuppliers();
  });
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

// Load retention data with Day 1/7/30 cohort analysis
async function loadRetention() {
  try {
    // Fetch unified data which contains cohortRetention
    const unified = await api(`/unified?days=${currentDays}`);
    const cohortData = unified?.cohortRetention || {};
    const legacyData = await api('/retention').catch(() => null);

    // Check if we have any data
    const hasCohortData = cohortData.available && cohortData.hasData;
    const hasLegacyData = legacyData?.available && legacyData?.hasData;

    if (!hasCohortData && !hasLegacyData) {
      showRetentionNoData('Retention requires repeat user visits. Data will appear as users return.');
      return;
    }

    // Use new cohort data if available
    if (hasCohortData && cohortData.data) {
      const summary = cohortData.data.summary || {};
      const cohorts = cohortData.data.cohorts || [];
      const curve = cohortData.data.curve || [];

      // Day 1/7/30 retention cards
      const day1El = document.getElementById('day1-retention');
      const day7El = document.getElementById('day7-retention');
      const day30El = document.getElementById('day30-retention');

      if (day1El) {
        const day1Rate = parseFloat(summary.day1Rate) || 0;
        day1El.textContent = `${day1Rate}%`;
        day1El.className = 'stat-large retention-stat ' + (day1Rate >= 40 ? 'good' : day1Rate >= 20 ? 'warning' : 'poor');
      }

      if (day7El) {
        const day7Rate = parseFloat(summary.day7Rate) || 0;
        day7El.textContent = `${day7Rate}%`;
        day7El.className = 'stat-large retention-stat ' + (day7Rate >= 20 ? 'good' : day7Rate >= 10 ? 'warning' : 'poor');
      }

      if (day30El) {
        const day30Rate = parseFloat(summary.day30Rate) || 0;
        day30El.textContent = `${day30Rate}%`;
        day30El.className = 'stat-large retention-stat ' + (day30Rate >= 10 ? 'good' : day30Rate >= 5 ? 'warning' : 'poor');
      }

      // Total users
      document.getElementById('cohort-size').textContent = summary.totalUsers || '0';

      // Cohort table
      const cohortBody = document.getElementById('cohort-table-body');
      if (cohortBody) {
        cohortBody.innerHTML = '';
        cohorts.slice(0, 14).forEach(c => { // Last 14 days
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${formatDate(c.date)}</td>
            <td>${c.size}</td>
            <td class="rate-cell ${getRateClass(c.day1.rate, 40, 20)}">${c.day1.rate}%</td>
            <td class="rate-cell ${getRateClass(c.day7.rate, 20, 10)}">${c.day7.rate}%</td>
            <td class="rate-cell ${getRateClass(c.day30.rate, 10, 5)}">${c.day30.rate}%</td>
          `;
          cohortBody.appendChild(row);
        });
      }

      // Retention curve chart
      if (curve.length > 0) {
        const ctx = document.getElementById('retention-curve-chart');
        if (ctx) {
          if (retentionChart) retentionChart.destroy();
          retentionChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: curve.map(d => `Day ${d.day}`),
              datasets: [{
                label: 'Retention %',
                data: curve.map(d => parseFloat(d.rate)),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.3
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  title: { display: true, text: 'Retention %' }
                },
                x: {
                  ticks: {
                    maxTicksLimit: 10
                  }
                }
              }
            }
          });
        }
      }
    }

    // Behavior retention table (from legacy data)
    if (legacyData?.data?.behaviorRetention) {
      const behaviorBody = document.getElementById('behavior-retention-body');
      if (behaviorBody) {
        behaviorBody.innerHTML = '';

        const behaviorInsights = {
          made_call: 'Users who call stay much longer',
          saved_supplier: 'Saving = investment in app',
          browsed_only: 'Need to drive action',
          logged_delivery: 'High engagement behavior',
          set_up_tank: 'Shows app investment',
          searched_supplier: 'Active user signal'
        };

        const behaviors = legacyData.data.behaviorRetention || [];
        if (behaviors.length === 0) {
          behaviorBody.innerHTML = '<tr><td colspan="4" class="no-data">No behavior data available</td></tr>';
        } else {
          behaviors.forEach(b => {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td>${formatBehavior(b.behavior)}</td>
              <td>${b.userCount}</td>
              <td>${(b.avgActiveDays || 0).toFixed(1)} days</td>
              <td>${behaviorInsights[b.behavior] || '--'}</td>
            `;
            behaviorBody.appendChild(row);
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to load retention:', error);
    showRetentionNoData('Error loading retention data');
  }
}

function getRateClass(rate, goodThreshold, warnThreshold) {
  const r = parseFloat(rate) || 0;
  if (r >= goodThreshold) return 'rate-good';
  if (r >= warnThreshold) return 'rate-warning';
  return 'rate-poor';
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showRetentionNoData(reason) {
  const day1El = document.getElementById('day1-retention');
  const day7El = document.getElementById('day7-retention');
  const day30El = document.getElementById('day30-retention');
  if (day1El) day1El.textContent = 'N/A';
  if (day7El) day7El.textContent = 'N/A';
  if (day30El) day30El.textContent = 'N/A';
  document.getElementById('cohort-size').textContent = '0';

  const cohortBody = document.getElementById('cohort-table-body');
  if (cohortBody) {
    cohortBody.innerHTML = `<tr><td colspan="5" class="no-data">${reason}</td></tr>`;
  }

  const behaviorBody = document.getElementById('behavior-retention-body');
  if (behaviorBody) {
    behaviorBody.innerHTML = `
      <tr><td colspan="4" class="no-data">
        <div class="no-data-message">
          <p><strong>No retention data available</strong></p>
          <p class="hint">${reason}</p>
          <p class="hint">Retention tracking requires user engagement data.</p>
        </div>
      </td></tr>
    `;
  }
}

function formatBehavior(behavior) {
  const names = {
    made_call: 'Made a Call',
    saved_supplier: 'Saved a Supplier',
    browsed_only: 'Browsed Only',
    logged_delivery: 'Logged Delivery',
    set_up_tank: 'Set Up Tank',
    searched_supplier: 'Searched Suppliers'
  };
  return names[behavior] || behavior.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

// ========================================
// SCOPE 18: NEW TAB LOAD FUNCTIONS
// ========================================

// Load Leaderboard tab (default tab) - Consolidated from unified endpoint
async function loadLeaderboard() {
  const loadingEl = document.getElementById('leaderboard-loading');
  const contentEl = document.getElementById('leaderboard-content');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');

  try {
    // Use unified endpoint which combines web + app data
    const data = await api(`/unified?days=${currentDays}`);
    const suppliers = data.topSuppliers || [];

    // Summary stats
    const totalCalls = suppliers.reduce((sum, s) => sum + (s.calls || 0), 0);
    const totalSiteClicks = suppliers.reduce((sum, s) => sum + (s.websiteClicks || 0), 0);
    const totalFromWeb = suppliers.reduce((sum, s) => sum + (s.fromWeb || 0), 0);
    const totalFromApp = suppliers.reduce((sum, s) => sum + (s.fromApp || 0), 0);
    const totalClicks = suppliers.reduce((sum, s) => sum + (s.totalClicks || 0), 0);
    const marketAvg = suppliers.length > 0 && suppliers[0].marketAvg
      ? suppliers[0].marketAvg
      : 0;
    const top3Clicks = suppliers.slice(0, 3).reduce((sum, s) => sum + (s.totalClicks || 0), 0);
    const top3Pct = totalClicks > 0 ? ((top3Clicks / totalClicks) * 100).toFixed(0) : 0;

    document.getElementById('lb-total-suppliers').textContent = suppliers.length;
    document.getElementById('lb-total-clicks').textContent = `${totalClicks} (📞${totalCalls} + 🔗${totalSiteClicks})`;
    document.getElementById('lb-market-avg').textContent = marketAvg > 0 ? formatPrice(marketAvg) : '--';
    document.getElementById('lb-top3-pct').textContent = `${top3Pct}%`;

    // Quick wins
    const quickWinsList = document.getElementById('quick-wins-list');
    quickWinsList.innerHTML = '';

    const dataGaps = suppliers.filter(s => s.signal === 'data_gap').slice(0, 3);
    const visibilityIssues = suppliers.filter(s => s.signal === 'visibility_issue').slice(0, 3);

    if (dataGaps.length > 0) {
      quickWinsList.innerHTML += `<div class="quick-win">⚠️ <strong>${dataGaps.length} suppliers</strong> getting clicks but no price data - add scraping</div>`;
    }
    if (visibilityIssues.length > 0) {
      quickWinsList.innerHTML += `<div class="quick-win">👀 <strong>${visibilityIssues.length} suppliers</strong> have competitive prices but low visibility</div>`;
    }
    if (dataGaps.length === 0 && visibilityIssues.length === 0) {
      quickWinsList.innerHTML = '<div class="quick-win success">✅ No urgent issues detected</div>';
    }

    // Leaderboard table - consolidated with web + app data
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    if (suppliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--gray-500);padding:2rem;">No engagement data for this period</td></tr>';
    } else {
      suppliers.forEach((s) => {
        const vsMarket = s.priceDelta != null ? (s.priceDelta > 0 ? '+' : '') + formatPrice(s.priceDelta) : '--';

        const signalBadge = {
          brand_strength: '<span class="signal brand">💪 Brand</span>',
          visibility_issue: '<span class="signal visibility">👀 Hidden</span>',
          data_gap: '<span class="signal data-gap">⚠️ No Price</span>',
          normal: '<span class="signal normal">—</span>'
        };

        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="rank">${s.rank}</td>
          <td>${s.name}</td>
          <td>${s.location || '--'}</td>
          <td class="users-col">${s.uniqueUsers ?? '--'}</td>
          <td>${s.calls > 0 ? s.calls : '-'}</td>
          <td>${s.websiteClicks > 0 ? s.websiteClicks : '-'}</td>
          <td class="total-col">${s.totalClicks}</td>
          <td class="web-col">${s.fromWeb > 0 ? s.fromWeb : '-'}</td>
          <td class="app-col">${s.fromApp > 0 ? s.fromApp : '-'}</td>
          <td>${s.price ? formatPrice(s.price) : '--'}</td>
          <td class="${s.priceDelta > 0 ? 'above-market' : s.priceDelta < 0 ? 'below-market' : ''}">${vsMarket}</td>
          <td>${signalBadge[s.signal] || signalBadge.normal}</td>
        `;
        tbody.appendChild(row);
      });
    }

    // Export CSV button
    document.getElementById('lb-export-csv').onclick = () => {
      const csv = ['Rank,Supplier,Location,Unique Users,Calls,Site Clicks,Total,From Web,From App,Price,vs Market,Signal'];
      suppliers.forEach((s) => {
        csv.push(`${s.rank},"${s.name}","${s.location || ''}",${s.uniqueUsers || 0},${s.calls || 0},${s.websiteClicks || 0},${s.totalClicks || 0},${s.fromWeb || 0},${s.fromApp || 0},${s.price || ''},${s.priceDelta || ''},${s.signal || ''}`);
      });
      const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leaderboard-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    };

    contentEl.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
    loadingEl.textContent = 'Failed to load leaderboard';
  } finally {
    loadingEl.classList.add('hidden');
  }
}

// DAU Chart instance
let dauChart = null;

// Render Daily Active Users chart
function renderDAUChart(dau) {
  const canvas = document.getElementById('dau-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (dauChart) {
    dauChart.destroy();
  }

  // Sort by date and format labels
  // BigQuery returns dates as YYYYMMDD strings (e.g., "20260103")
  const parseDate = (dateStr) => {
    if (!dateStr) return new Date(NaN);
    const str = String(dateStr);
    if (str.length === 8 && /^\d{8}$/.test(str)) {
      // YYYYMMDD format from BigQuery
      return new Date(`${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}`);
    }
    return new Date(dateStr);
  };

  const sortedDAU = [...dau].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const labels = sortedDAU.map(d => {
    const date = parseDate(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const data = sortedDAU.map(d => d.users);

  dauChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Active Users',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              return `${context.parsed.y} users`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            callback: function(value) {
              if (Number.isInteger(value)) {
                return value;
              }
            }
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
}

// Load App Analytics tab
async function loadAppAnalytics() {
  const loadingEl = document.getElementById('app-analytics-loading');
  const contentEl = document.getElementById('app-analytics-content');
  const dataSourceEl = document.getElementById('app-data-source');
  const legacyEl = document.getElementById('legacy-engagement');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  dataSourceEl?.classList.add('hidden');

  try {
    // Fetch unified data and app-specific data
    const [unified, appData] = await Promise.all([
      api(`/unified?days=${currentDays}`).catch(() => null),
      api(`/ios-app?days=${currentDays}`).catch(() => null)
    ]);

    const app = unified?.app || {};
    const appSource = unified?.appSource || 'none';
    const isBigQuery = appSource === 'bigquery';

    // Show data source indicator
    if (dataSourceEl && isBigQuery) {
      dataSourceEl.classList.remove('hidden');
    }

    // Toggle legacy engagement section
    if (legacyEl) {
      legacyEl.classList.toggle('hidden', isBigQuery);
    }

    if (isBigQuery && app.summary) {
      // BigQuery data available - show real iOS metrics
      const summary = app.summary;
      const retention = app.retention || {};
      const dau = app.dailyActiveUsers || [];
      const topEvents = app.topEvents || [];
      const topScreens = app.topScreens || [];

      // Summary cards
      document.getElementById('aa-users').textContent = summary.totalUsers || '--';
      document.getElementById('aa-users-sub').textContent = `${currentDays}d period`;

      document.getElementById('aa-sessions').textContent = summary.totalSessions || '--';
      document.getElementById('aa-sessions-sub').textContent = summary.avgSessionDuration
        ? `Avg ${summary.avgSessionDuration}s`
        : '--';

      document.getElementById('aa-day1').textContent = retention.day1Rate ? `${retention.day1Rate}%` : '--%';
      document.getElementById('aa-day1-sub').textContent = retention.day1
        ? `${retention.day1} of ${retention.newUsers} retained`
        : '--';

      document.getElementById('aa-day7').textContent = retention.day7Rate ? `${retention.day7Rate}%` : '--%';
      document.getElementById('aa-day7-sub').textContent = retention.day7
        ? `${retention.day7} of ${retention.newUsers} retained`
        : '--';

      // DAU Chart
      if (dau.length > 0) {
        renderDAUChart(dau);
        const avgDAU = Math.round(dau.reduce((sum, d) => sum + d.users, 0) / dau.length);
        const peakDAU = Math.max(...dau.map(d => d.users));
        document.getElementById('dau-avg').textContent = avgDAU;
        document.getElementById('dau-peak').textContent = peakDAU;
      }

      // Onboarding Funnel - use dedicated funnel data or calculate from topEvents
      const funnel = appData?.onboardingFunnel;
      let funnelData;

      if (funnel && funnel.steps) {
        funnelData = funnel;
      } else if (topEvents.length > 0) {
        // Calculate from topEvents as fallback
        const getEventUsers = (name) => topEvents.find(e => e.name === name)?.uniqueUsers || 0;
        const installs = getEventUsers('first_open');
        const onboarding = getEventUsers('onboarding_step');
        const directory = getEventUsers('directory_viewed');
        const forecast = getEventUsers('forecast_viewed');
        const tank = getEventUsers('tank_reading');
        const fva = Math.max(directory, forecast, tank);

        funnelData = {
          steps: [
            { name: 'Install', count: installs, percent: 100 },
            { name: 'Start Onboarding', count: onboarding, percent: installs > 0 ? Math.round((onboarding / installs) * 100) : 0 },
            { name: 'Complete Onboarding', count: onboarding, percent: installs > 0 ? Math.round((onboarding / installs) * 100) : 0 },
            { name: 'First Value Action', count: fva, percent: installs > 0 ? Math.round((fva / installs) * 100) : 0 }
          ],
          summary: {
            installs,
            onboardingRate: installs > 0 ? ((onboarding / installs) * 100).toFixed(1) : 0,
            activationRate: installs > 0 ? ((fva / installs) * 100).toFixed(1) : 0
          }
        };
      }

      if (funnelData && funnelData.steps) {
        const steps = funnelData.steps;
        // Install
        document.getElementById('funnel-install-count').textContent = steps[0]?.count ?? 0;
        document.getElementById('funnel-install-pct').textContent = '100%';
        document.getElementById('funnel-install').style.width = '100%';
        // Start Onboarding
        document.getElementById('funnel-onboard-count').textContent = steps[1]?.count ?? 0;
        document.getElementById('funnel-onboard-pct').textContent = `${steps[1]?.percent ?? 0}%`;
        document.getElementById('funnel-onboard').style.width = `${Math.max(steps[1]?.percent ?? 0, 5)}%`;
        // Complete Onboarding
        document.getElementById('funnel-complete-count').textContent = steps[2]?.count ?? 0;
        document.getElementById('funnel-complete-pct').textContent = `${steps[2]?.percent ?? 0}%`;
        document.getElementById('funnel-complete').style.width = `${Math.max(steps[2]?.percent ?? 0, 5)}%`;
        // First Value Action
        document.getElementById('funnel-fva-count').textContent = steps[3]?.count ?? 0;
        document.getElementById('funnel-fva-pct').textContent = `${steps[3]?.percent ?? 0}%`;
        document.getElementById('funnel-fva').style.width = `${Math.max(steps[3]?.percent ?? 0, 5)}%`;

        // Update insight
        const onboardingRate = parseFloat(funnelData.summary?.onboardingRate) || 0;
        const activationRate = parseFloat(funnelData.summary?.activationRate) || 0;
        const insight = document.getElementById('funnel-insight');
        if (onboardingRate < 20) {
          insight.textContent = `💡 Only ${onboardingRate}% complete onboarding - consider simplifying the flow`;
        } else if (activationRate < 30) {
          insight.textContent = `💡 ${activationRate}% reach first value action - improve time-to-value`;
        } else {
          insight.textContent = `💡 ${activationRate}% activation rate - healthy user funnel!`;
        }
      }

      // Top Events table
      const eventsBody = document.getElementById('top-events-body');
      if (eventsBody) {
        eventsBody.innerHTML = topEvents.length > 0
          ? topEvents.slice(0, 10).map(e => `
              <tr>
                <td><span class="event-name">${e.name}</span></td>
                <td class="count-cell">${e.count.toLocaleString()}</td>
                <td>${e.uniqueUsers}</td>
              </tr>
            `).join('')
          : '<tr><td colspan="3" class="no-data">No events recorded</td></tr>';
      }

      // Top Screens table
      const screensBody = document.getElementById('top-screens-body');
      if (screensBody) {
        screensBody.innerHTML = topScreens.length > 0
          ? topScreens.slice(0, 10).map(s => `
              <tr>
                <td>${s.name || 'Unknown'}</td>
                <td class="count-cell">${s.views.toLocaleString()}</td>
                <td>${s.uniqueUsers}</td>
              </tr>
            `).join('')
          : '<tr><td colspan="3" class="no-data">No screen views recorded</td></tr>';
      }

    } else {
      // Fallback to legacy engagement data
      const engagement = appData?.engagement || {};

      const sessions = app.sessions || app.totalEngagements || engagement.totalSessions || 0;
      document.getElementById('aa-sessions').textContent = sessions || '--';
      document.getElementById('aa-sessions-sub').textContent = sessions > 0 ? `${currentDays}d period` : 'No data';

      document.getElementById('aa-users').textContent = app.uniqueUsers || '--';
      document.getElementById('aa-users-sub').textContent = 'From database';

      document.getElementById('aa-day1').textContent = '--%';
      document.getElementById('aa-day1-sub').textContent = 'BigQuery required';
      document.getElementById('aa-day7').textContent = '--%';
      document.getElementById('aa-day7-sub').textContent = 'BigQuery required';

      // Legacy engagement tiers
      const powerPct = engagement.powerUsers || 0;
      const engagedPct = engagement.engaged || 0;
      const casualPct = engagement.casual || 0;
      const browsePct = engagement.browseOnly || 100 - powerPct - engagedPct - casualPct;

      document.getElementById('aa-power').textContent = `${powerPct}%`;
      document.getElementById('aa-engaged').textContent = `${engagedPct}%`;
      document.getElementById('aa-browse').textContent = `${browsePct}%`;

      document.getElementById('bar-power').style.width = `${powerPct}%`;
      document.getElementById('bar-power-val').textContent = `${powerPct}%`;
      document.getElementById('bar-engaged').style.width = `${engagedPct}%`;
      document.getElementById('bar-engaged-val').textContent = `${engagedPct}%`;
      document.getElementById('bar-casual').style.width = `${casualPct}%`;
      document.getElementById('bar-casual-val').textContent = `${casualPct}%`;
      document.getElementById('bar-browse').style.width = `${browsePct}%`;
      document.getElementById('bar-browse-val').textContent = `${browsePct}%`;

      // Clear BigQuery sections
      document.getElementById('top-events-body').innerHTML = '<tr><td colspan="3" class="no-data">BigQuery not configured</td></tr>';
      document.getElementById('top-screens-body').innerHTML = '<tr><td colspan="3" class="no-data">BigQuery not configured</td></tr>';
    }

    // Use unified.app for these metrics (not appData from /ios-app)
    const unifiedApp = unified?.app || {};

    // Delivery patterns
    const deliveryData = unifiedApp.deliveries || {};
    const deliveryTotal = deliveryData.total || 0;
    document.getElementById('dp-total').textContent = deliveryTotal || '0';
    document.getElementById('dp-value').textContent = deliveryTotal > 0 ? `~$${(deliveryTotal * 500).toLocaleString()}` : '$0';
    document.getElementById('dp-repeat').textContent = deliveryData.repeatRate || '0%';
    document.getElementById('dp-directory').textContent = deliveryData.fromDirectory || '0%';
    document.getElementById('dp-ontime').textContent = deliveryData.onTime || '0%';
    document.getElementById('dp-late').textContent = deliveryData.late || '0%';
    document.getElementById('dp-overdue').textContent = deliveryData.overdue || '0';
    document.getElementById('dp-insight').textContent = deliveryTotal > 0
      ? '💡 Users who log deliveries have higher retention'
      : '💡 Encourage first delivery logging to boost retention';

    // FVE (First Value Event)
    const fve = unifiedApp.fve || {};
    document.getElementById('fve-rate').textContent = fve.completionRate || '--%';
    document.getElementById('fve-72h').textContent = fve.within72h || '--%';
    document.getElementById('fve-retention').textContent = fve.userRetention || '--%';
    document.getElementById('fve-non-retention').textContent = fve.nonUserRetention || '--%';
    document.getElementById('fve-multiplier').textContent = fve.multiplier || '--×';
    document.getElementById('fve-insight').textContent = fve.completionRate && fve.completionRate !== '--%'
      ? '💡 Users who complete FVE retain significantly better'
      : '💡 Track first value events to measure user activation';

    // Confidence score
    const confidence = unifiedApp.confidence || {};
    document.getElementById('cs-avg').textContent = confidence.avg || '--';
    document.getElementById('cs-high-bar').style.width = `${confidence.highPct || 0}%`;
    document.getElementById('cs-med-bar').style.width = `${confidence.medPct || 0}%`;
    document.getElementById('cs-low-bar').style.width = `${confidence.lowPct || 0}%`;
    document.getElementById('cs-high-pct').textContent = `${confidence.highPct || 0}%`;
    document.getElementById('cs-med-pct').textContent = `${confidence.medPct || 0}%`;
    document.getElementById('cs-low-pct').textContent = `${confidence.lowPct || 0}%`;

    const factorsEl = document.getElementById('confidence-factors');
    factorsEl.innerHTML = '';
    if (confidence.factors) {
      Object.entries(confidence.factors).forEach(([factor, score]) => {
        factorsEl.innerHTML += `<div class="factor"><span>${factor}</span><span>${score}</span></div>`;
      });
    }
    document.getElementById('cs-insight').textContent = confidence.avg && confidence.avg !== '--'
      ? '💡 Higher confidence = more likely to order through app'
      : '💡 Confidence builds as users engage more';

    // Fuel type breakdown
    const fuel = unifiedApp.fuelType || {};
    document.getElementById('fuel-oil-users').textContent = `${fuel.oil?.users ?? '--'} users`;
    document.getElementById('fuel-oil-pct').textContent = `${fuel.oil?.pct ?? '--'}%`;
    document.getElementById('fuel-propane-users').textContent = `${fuel.propane?.users ?? '--'} users`;
    document.getElementById('fuel-propane-pct').textContent = `${fuel.propane?.pct ?? '--'}%`;

    const propaneSignals = document.getElementById('propane-signal-list');
    propaneSignals.innerHTML = fuel.propane?.users > 0
      ? `<div class="signal-item">📊 ${fuel.propane.users} propane users tracked - expansion opportunity</div>`
      : '<div class="signal-item hint">No propane demand signals yet</div>';

    // Correlation Analysis
    const correlations = unified?.correlations || {};

    // Price correlation
    const priceCorr = correlations.price || {};
    const priceCorrValue = document.getElementById('price-corr-value');
    const priceCorrMarker = document.getElementById('price-corr-marker');
    const priceCorrInsight = document.getElementById('price-corr-insight');

    if (priceCorr.correlation !== null && priceCorr.correlation !== undefined) {
      priceCorrValue.textContent = priceCorr.correlation.toFixed(2);
      // Position marker: -1 = 0%, 0 = 50%, +1 = 100%
      const markerPosition = ((priceCorr.correlation + 1) / 2) * 100;
      priceCorrMarker.style.left = `${markerPosition}%`;

      // Color code based on correlation strength
      if (priceCorr.correlation < -0.3) {
        priceCorrValue.style.color = '#22c55e'; // green - good inverse
      } else if (priceCorr.correlation > 0.3) {
        priceCorrValue.style.color = '#ef4444'; // red - might indicate price driving demand
      } else {
        priceCorrValue.style.color = 'var(--gray-600)'; // neutral
      }
    } else {
      priceCorrValue.textContent = '--';
    }
    priceCorrInsight.textContent = priceCorr.insight || 'No correlation data available';

    // Weather correlation
    const weatherCorr = correlations.weather || {};
    const weatherTemp = document.getElementById('weather-temp');
    const weatherConditions = document.getElementById('weather-conditions');
    const weatherInsight = document.getElementById('weather-insight');

    if (weatherCorr.available && weatherCorr.currentTemp) {
      weatherTemp.textContent = `${weatherCorr.currentTemp}°F`;
      weatherConditions.textContent = weatherCorr.conditions || '--';
      weatherInsight.textContent = weatherCorr.insight || 'Weather data loaded';
    } else {
      weatherTemp.textContent = '--°F';
      weatherConditions.textContent = weatherCorr.message || 'Weather API not configured';
      weatherInsight.textContent = weatherCorr.message || 'Set OPENWEATHER_API_KEY to enable weather correlation';
    }

    // Render correlation chart (Price + Clicks + Weather over time)
    if (priceCorr.dailyData && priceCorr.dailyData.length > 0) {
      // Merge weather data into price data
      const weatherData = weatherCorr.dailyData || [];
      const mergedData = priceCorr.dailyData.map(p => {
        const weather = weatherData.find(w => w.date === p.date);
        return {
          ...p,
          temperature: weather?.temperature || null
        };
      });
      renderCorrelationChart(mergedData);
    }

    contentEl.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load app analytics:', error);
    loadingEl.textContent = 'Failed to load app analytics';
  } finally {
    loadingEl.classList.add('hidden');
  }
}

// Correlation chart instance
let correlationChart = null;

// Render Price, Clicks & Weather correlation chart
function renderCorrelationChart(data) {
  const canvas = document.getElementById('correlation-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (correlationChart) {
    correlationChart.destroy();
  }

  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const prices = data.map(d => d.avgPrice ? parseFloat(d.avgPrice) : null);
  const clicks = data.map(d => d.totalClicks || 0);
  const users = data.map(d => d.uniqueUsers || 0);
  const temps = data.map(d => d.temperature || null);
  const hasWeatherData = temps.some(t => t !== null);

  const datasets = [
    {
      label: 'Avg Price ($)',
      data: prices,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      yAxisID: 'y-price',
      tension: 0.3,
      pointRadius: 2
    },
    {
      label: 'Daily Clicks',
      data: clicks,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      yAxisID: 'y-clicks',
      tension: 0.3,
      pointRadius: 2
    },
    {
      label: 'Unique Users',
      data: users,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      yAxisID: 'y-clicks',  // Share axis with clicks
      tension: 0.3,
      pointRadius: 2,
      borderDash: [3, 3]
    }
  ];

  // Add temperature line if we have weather data
  if (hasWeatherData) {
    datasets.push({
      label: 'Temperature (°F)',
      data: temps,
      borderColor: '#f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.1)',
      yAxisID: 'y-temp',
      tension: 0.3,
      pointRadius: 2,
      borderDash: [5, 5]
    });
  }

  const scales = {
    'y-price': {
      type: 'linear',
      position: 'left',
      title: { display: true, text: 'Price ($)', color: '#22c55e' },
      grid: { display: false },
      ticks: { color: '#22c55e' }
    },
    'y-clicks': {
      type: 'linear',
      position: 'right',
      title: { display: true, text: 'Clicks', color: '#3b82f6' },
      grid: { drawOnChartArea: false },
      ticks: { color: '#3b82f6' }
    }
  };

  // Add temperature axis if we have weather data
  if (hasWeatherData) {
    scales['y-temp'] = {
      type: 'linear',
      position: 'right',
      title: { display: true, text: 'Temp (°F)', color: '#f97316' },
      grid: { display: false },
      ticks: { color: '#f97316' },
      // Offset from clicks axis
      offset: true
    };
  }

  correlationChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === 'Avg Price ($)') {
                return `Price: $${ctx.raw?.toFixed(2) || '--'}`;
              } else if (ctx.dataset.label === 'Temperature (°F)') {
                return `Temp: ${ctx.raw?.toFixed(0) || '--'}°F`;
              } else if (ctx.dataset.label === 'Unique Users') {
                return `Users: ${ctx.raw || 0}`;
              }
              return `Clicks: ${ctx.raw || 0}`;
            }
          }
        }
      }
    }
  });
}

// Load Growth tab
async function loadGrowth() {
  const loadingEl = document.getElementById('growth-loading');
  const contentEl = document.getElementById('growth-content');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');

  try {
    const [unified, retention, recommendations] = await Promise.all([
      api(`/unified?days=${currentDays}`),
      api('/retention').catch(() => ({ available: false })),
      api(`/recommendations?days=${currentDays}`).catch(() => ({ recommendations: [] }))
    ]);

    // Platform comparison
    const ios = unified?.app || {};
    const android = unified?.android || {};
    const website = unified?.website || {};

    // iOS users: check both BigQuery structure (summary.totalUsers) and database structure (uniqueUsers)
    const iosUsers = ios.summary?.totalUsers || ios.uniqueUsers || 0;
    const iosDeliveries = ios.deliveries?.total || ios.saves || 0;

    document.getElementById('p-ios-users').textContent = iosUsers ?? '--';
    document.getElementById('p-ios-deliveries').textContent = iosDeliveries ?? '--';
    document.getElementById('p-ios-retention').textContent = retention?.data?.summary?.week1RetentionRate
      ? `${retention.data.summary.week1RetentionRate}%`
      : '--%';

    document.getElementById('p-android-status').textContent = android?.recommendation?.status || 'WAIT';
    document.getElementById('p-android-waitlist').textContent = android?.waitlist?.total ?? '--';
    document.getElementById('p-android-pwa').textContent = android?.pwa?.installs ?? '--';
    document.getElementById('p-android-launches').textContent = android?.pwa?.launches ?? '--';

    document.getElementById('p-web-visitors').textContent = website.activeUsers || website.users || '--';
    document.getElementById('p-web-clicks').textContent = website.totalClicks ?? '--';
    document.getElementById('p-web-calls').textContent = website.callClicks ?? '--';

    // Platform insight
    const platformInsight = document.getElementById('platform-insight');
    if (iosUsers > 0 && website.activeUsers > 0) {
      const iosRatio = iosUsers / (iosUsers + website.activeUsers) * 100;
      platformInsight.textContent = `💡 iOS represents ${iosRatio.toFixed(0)}% of active users`;
    } else {
      platformInsight.textContent = '💡 Track both platforms to compare engagement';
    }

    // Android Decision Matrix
    const waitlistTotal = android?.waitlist?.total || 0;
    const pwaInstalls = android?.pwa?.installs || 0;
    const week1Retention = parseFloat(retention?.data?.summary?.week1RetentionRate) || 0;

    const badge = document.getElementById('android-badge');
    const message = document.getElementById('android-message');

    const goConditions = waitlistTotal >= 200 && pwaInstalls >= 50 && week1Retention >= 20;
    const nogoConditions = week1Retention < 20 && week1Retention > 0;

    if (goConditions) {
      badge.textContent = 'GO';
      badge.className = 'decision-badge go';
      message.textContent = 'All conditions met - Android development recommended';
    } else if (nogoConditions) {
      badge.textContent = 'NO-GO';
      badge.className = 'decision-badge nogo';
      message.textContent = 'Fix iOS retention first - don\'t scale a leaky bucket';
    } else {
      badge.textContent = 'WAIT';
      badge.className = 'decision-badge wait';
      message.textContent = 'Monitor thresholds - continue with PWA';
    }

    // Conditions
    updateCondition('cond-waitlist', waitlistTotal >= 200, `${waitlistTotal}/200`);
    updateCondition('cond-pwa', pwaInstalls >= 50, `${pwaInstalls}/50`);
    updateCondition('cond-retention', week1Retention >= 20, `${week1Retention}%`);

    // Retention by action
    const behaviors = retention?.data?.behaviorRetention || [];
    const retentionMap = {};
    behaviors.forEach(b => {
      retentionMap[b.behavior] = b.avgActiveDays;
    });

    const maxDays = Math.max(...Object.values(retentionMap), 1);
    setRetentionBar('rba-delivery', retentionMap.logged_delivery, maxDays);
    setRetentionBar('rba-tank', retentionMap.set_up_tank, maxDays);
    setRetentionBar('rba-search', retentionMap.searched_supplier, maxDays);
    setRetentionBar('rba-browse', retentionMap.browsed_only, maxDays);

    // Top recommendation
    const topRec = recommendations.recommendations?.[0];
    if (topRec) {
      document.getElementById('rec-title').textContent = topRec.title;
      document.getElementById('rec-insight').textContent = topRec.insight || '';

      const secondaryList = document.getElementById('rec-secondary-list');
      secondaryList.innerHTML = '';
      recommendations.recommendations.slice(1, 4).forEach(r => {
        secondaryList.innerHTML += `<li>${r.title}</li>`;
      });
    } else {
      document.getElementById('rec-title').textContent = 'All systems healthy';
      document.getElementById('rec-insight').textContent = 'No urgent recommendations';
    }

    contentEl.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load growth:', error);
    loadingEl.textContent = 'Failed to load growth data';
  } finally {
    loadingEl.classList.add('hidden');
  }
}

function updateCondition(id, met, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.cond-check').textContent = met ? '✅' : '⏳';
  el.querySelector('.cond-value').textContent = value;
  el.classList.toggle('met', met);
}

function setRetentionBar(id, value, max) {
  const bar = document.getElementById(id);
  const valEl = document.getElementById(id + '-val');
  if (!bar || !valEl) return;

  if (value !== undefined) {
    const pct = (value / max) * 100;
    bar.style.width = `${pct}%`;
    valEl.textContent = `${value.toFixed(1)} days`;
  } else {
    bar.style.width = '0%';
    valEl.textContent = '--';
  }
}

// Store coverage data globally for map view switching
let coverageData = { geographic: null, geoHeatmap: null, overview: null };
let currentMapView = 'engagement';

// Load Coverage tab
async function loadCoverage() {
  try {
    const [overview, geographic, unified] = await Promise.all([
      api(`/overview?days=${currentDays}`),
      api(`/geographic?days=${currentDays}`),
      api(`/unified?days=${currentDays}`)
    ]);

    // Store for map view switching
    coverageData = {
      geographic,
      geoHeatmap: unified?.geoHeatmap?.data || null,
      overview
    };

    // Get geo stats from unified data
    const geoStats = unified?.geoHeatmap?.data?.summary || {};
    const stateBreakdown = unified?.geoHeatmap?.data?.stateBreakdown || [];
    const topLocations = unified?.geoHeatmap?.data?.topLocations || [];

    // Calculate unique states from both sources
    const allPoints = [...(geographic.demandHeatmap || []), ...(geographic.coverageGaps || [])];
    const uniqueStates = new Set(allPoints.map(p => p.state).filter(Boolean));
    const statesCount = stateBreakdown.length || uniqueStates.size || 0;

    // Summary cards
    document.getElementById('cov-suppliers').textContent = overview.scraping?.suppliersTotal || '--';
    document.getElementById('cov-states').textContent = statesCount || '--';
    document.getElementById('cov-active-zips').textContent = geoStats.totalZips || '--';
    document.getElementById('cov-gaps').textContent = overview.coverage?.trueCoverageGaps || '--';

    // State breakdown table
    const stateBody = document.getElementById('state-breakdown-body');
    if (stateBody) {
      stateBody.innerHTML = '';
      if (stateBreakdown.length === 0) {
        stateBody.innerHTML = '<tr><td colspan="4" class="no-data">No state data</td></tr>';
      } else {
        stateBreakdown.forEach(s => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><strong>${s.state}</strong></td>
            <td>${s.zips}</td>
            <td>${(s.searches || 0).toLocaleString()}</td>
            <td>${(s.engagements || 0).toLocaleString()}</td>
          `;
          stateBody.appendChild(row);
        });
      }
    }

    // Top locations table
    const locBody = document.getElementById('top-locations-body');
    if (locBody) {
      locBody.innerHTML = '';
      if (topLocations.length === 0) {
        locBody.innerHTML = '<tr><td colspan="3" class="no-data">No location data</td></tr>';
      } else {
        topLocations.slice(0, 15).forEach(loc => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${loc.city || '--'}, ${loc.state || '--'}</td>
            <td>${loc.zip}</td>
            <td>${(loc.intensity || 0).toLocaleString()}</td>
          `;
          locBody.appendChild(row);
        });
      }
    }

    // Coverage gaps table
    const gapsBody = document.getElementById('coverage-gaps-body');
    gapsBody.innerHTML = '';

    const gaps = geographic.coverageGaps || [];
    if (gaps.length === 0) {
      gapsBody.innerHTML = '<tr><td colspan="4" class="no-data">No coverage gaps detected</td></tr>';
    } else {
      gaps.slice(0, 20).forEach(g => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${g.zip}</td>
          <td>${g.city || '--'}, ${g.state || '--'}</td>
          <td>${g.count}</td>
          <td><button class="btn-small" onclick="showTab('settings')">Add Supplier</button></td>
        `;
        gapsBody.appendChild(row);
      });
    }

    // Setup map view toggle
    setupMapViewToggle();

    // Load map with current view
    loadCoverageMapWithView(currentMapView);

  } catch (error) {
    console.error('Failed to load coverage:', error);
  }
}

function setupMapViewToggle() {
  document.querySelectorAll('.map-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMapView = btn.dataset.view;
      loadCoverageMapWithView(currentMapView);
    });
  });
}

function loadCoverageMapWithView(view) {
  const { geographic, geoHeatmap, overview } = coverageData;

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

  // Update legend
  const statsEl = document.getElementById('map-stats');

  if (view === 'engagement' && geoHeatmap?.points) {
    // Show engagement heatmap
    const points = geoHeatmap.points || [];
    const maxIntensity = Math.max(...points.map(p => p.intensity), 1);

    statsEl.innerHTML = `<span style="color: #22c55e">●</span> Low &nbsp; <span style="color: #f59e0b">●</span> Medium &nbsp; <span style="color: #ef4444">●</span> High Engagement`;

    points.forEach(p => {
      const ratio = p.intensity / maxIntensity;
      const radius = 6 + ratio * 18;
      const color = ratio > 0.7 ? '#ef4444' : ratio > 0.4 ? '#f59e0b' : '#22c55e';

      L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor: color,
        color: '#fff',
        weight: 1,
        fillOpacity: 0.7
      })
      .bindPopup(`<b>${p.city || '--'}, ${p.state || '--'}</b><br>ZIP: ${p.zip}<br>Searches: ${p.searches}<br>Engagements: ${p.engagements}`)
      .addTo(map);
    });

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [20, 20] });
    }

  } else if (view === 'demand' && geographic) {
    // Show demand heatmap (searches)
    const demandData = geographic.demandHeatmap || [];
    const maxDemand = Math.max(...demandData.map(c => c.count), 1);

    statsEl.innerHTML = `<span style="color: #2563eb">●</span> User Searches`;

    demandData.forEach(c => {
      const radius = 6 + (c.count / maxDemand) * 18;
      L.circleMarker([c.lat, c.lng], {
        radius,
        fillColor: '#2563eb',
        color: '#1d4ed8',
        weight: 1,
        fillOpacity: 0.5
      })
      .bindPopup(`<b>${c.city || '--'}, ${c.state || ''}</b><br>ZIP: ${c.zip}<br>Searches: ${c.count}`)
      .addTo(map);
    });

  } else if (view === 'gaps' && geographic) {
    // Show only coverage gaps
    const gapData = geographic.coverageGaps || [];
    const gapsWithCoords = gapData.filter(c => c.lat && c.lng);

    statsEl.innerHTML = `<span style="color: #ef4444">●</span> Coverage Gaps (${gapsWithCoords.length} ZIPs)`;

    gapsWithCoords.forEach(c => {
      L.circleMarker([c.lat, c.lng], {
        radius: 10,
        fillColor: '#ef4444',
        color: '#dc2626',
        weight: 2,
        fillOpacity: 0.7
      })
      .bindPopup(`<b>⚠️ COVERAGE GAP</b><br>${c.city || '--'}, ${c.state || ''}<br>ZIP: ${c.zip}<br>Searches: ${c.count}`)
      .addTo(map);
    });

    if (gapsWithCoords.length > 0) {
      const bounds = L.latLngBounds(gapsWithCoords.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }
}

// Load Settings tab
async function loadSettings() {
  try {
    const [scraperHealth, suppliers] = await Promise.all([
      api('/scraper-health'),
      api(`/suppliers?limit=50&offset=0`)
    ]);

    // Data health summary
    document.getElementById('health-last-scrape').textContent = timeAgo(scraperHealth.lastRun);
    document.getElementById('health-prices').textContent = `${scraperHealth.withPrices}/${scraperHealth.totalSuppliers}`;
    document.getElementById('health-stale').textContent = scraperHealth.stale?.length || 0;

    // Stale suppliers table
    const staleBody = document.getElementById('stale-body');
    staleBody.innerHTML = '';

    if (!scraperHealth.stale || scraperHealth.stale.length === 0) {
      staleBody.innerHTML = '<tr><td colspan="4" class="no-data">All suppliers have fresh prices!</td></tr>';
    } else {
      scraperHealth.stale.forEach(s => {
        const row = document.createElement('tr');
        row.className = 'row-stale';
        row.innerHTML = `
          <td>
            <div class="supplier-name">${s.name}</div>
            <div class="supplier-meta">${s.website ? new URL(s.website).hostname : '--'}</div>
          </td>
          <td class="price-value">${formatPrice(s.lastPrice)}</td>
          <td class="stale-date">${timeAgo(s.lastUpdated)}</td>
          <td>
            <button class="btn-small btn-warning stale-fix-btn" data-id="${s.id}">Fix</button>
          </td>
        `;
        staleBody.appendChild(row);
      });

      // Attach event listeners for Fix buttons
      staleBody.querySelectorAll('.stale-fix-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          console.log('[Dashboard] Stale Fix button clicked, id:', id);
          editSupplier(id);
        });
      });
    }

    // Load suppliers (uses existing loadSuppliers function)
    loadSuppliers();

  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load dashboard
async function loadDashboard() {
  await Promise.all([
    loadOverview(),
    loadLeaderboard(),  // Load default tab
    loadSupplierSignals(),
    loadConversion(),
    loadPriceAlerts()
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

// Initialize activity controls (filters, pagination)
initActivityControls();
