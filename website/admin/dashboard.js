/**
 * SmartHeat Analytics Dashboard
 *
 * Frontend JavaScript for the admin analytics dashboard.
 */

// State
let authToken = sessionStorage.getItem('dashboardToken') || '';
let currentDays = 30;
let currentTab = 'command-center';  // Track active tab for period refresh
let suppliersPage = 0;
const suppliersLimit = 50;

// Charts
let nsSparklineChart = null;
let map = null;

// CC Intelligence + Coverage charts
let ccDemandTrendChart = null;
let ccChannelMixChart = null;
let ccPriceBandChart = null;
let coverageSpreadChart = null;
let ccRenderToken = 0;
let coverageRenderToken = 0;

// Per-period API cache — prevents duplicate calls between CC and Coverage
const apiCache = {};
async function cachedApi(path) {
  if (!apiCache[path]) {
    apiCache[path] = api(path).catch(err => {
      delete apiCache[path];
      throw err;
    });
  }
  return apiCache[path];
}
function clearApiCache() {
  Object.keys(apiCache).forEach(k => delete apiCache[k]);
}

// Empty state helper (non-destructive — preserves canvas for re-render)
function setEmptyState(canvasId, emptyId, message, show) {
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(emptyId);
  if (!canvas || !empty) return;
  empty.textContent = message || '';
  empty.classList.toggle('hidden', !show);
  canvas.classList.toggle('hidden', show);
}

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
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });

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

// Tab navigation handler (shared between tabs and sidebar)
function handleTabSwitch(target) {
  const validTabs = ['command-center','leaderboard','app-analytics','retention','growth','coverage','health','suppliers','claims','website','settings'];
  if (!validTabs.includes(target)) target = 'command-center';

  // Destroy intelligence charts on tab leave
  if (ccDemandTrendChart) { ccDemandTrendChart.destroy(); ccDemandTrendChart = null; }
  if (ccChannelMixChart) { ccChannelMixChart.destroy(); ccChannelMixChart = null; }
  if (ccPriceBandChart) { ccPriceBandChart.destroy(); ccPriceBandChart = null; }
  if (coverageSpreadChart) { coverageSpreadChart.destroy(); coverageSpreadChart = null; }

  currentTab = target;

  // Update active tab (legacy tabs)
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const legacyTab = document.querySelector(`.tab[data-tab="${target}"]`);
  if (legacyTab) legacyTab.classList.add('active');

  // Update active sidebar nav item
  document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));
  const sidebarNav = document.querySelector(`.sidebar .nav-item[data-tab="${target}"]`);
  if (sidebarNav) sidebarNav.classList.add('active');

  // Update page title in sticky header
  const pageTitle = document.getElementById('page-title');
  if (pageTitle && sidebarNav) {
    const label = sidebarNav.querySelector('.nav-item-label');
    pageTitle.textContent = label ? label.textContent : target;
  }

  // Show target panel
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`tab-${target}`);
  if (panel) panel.classList.add('active');

  // Close mobile sidebar after selection
  closeMobileSidebar();

  // Load tab-specific data
  if (target === 'command-center') loadCommandCenter();
  if (target === 'leaderboard') loadLeaderboard();
  if (target === 'app-analytics') loadAppAnalytics();
  if (target === 'growth') loadGrowth();
  if (target === 'coverage') loadCoverage();
  if (target === 'health') loadHealth();
  if (target === 'settings') loadSettings();
  if (target === 'website') loadWebsite();
  if (target === 'retention') loadRetention();
  if (target === 'suppliers') loadSuppliers();
  if (target === 'claims') loadClaims();
}

// Tab navigation (legacy)
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    handleTabSwitch(tab.dataset.tab);
  });
});

// Sidebar navigation
document.querySelectorAll('.sidebar .nav-item').forEach(navItem => {
  navItem.addEventListener('click', () => {
    const target = navItem.dataset.tab;
    if (target) handleTabSwitch(target);
  });
});

// Mobile sidebar toggle
function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
  document.body.style.overflow = '';
}

// Mobile menu button
document.getElementById('mobile-menu-btn')?.addEventListener('click', openMobileSidebar);

// Overlay click to close
document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);

// Collapsible section toggles (delegated — covers Suppliers and CC)
document.addEventListener('click', e => {
  const btn = e.target.closest('.section-toggle, .cc-collapse-toggle');
  if (!btn) return;
  const section = btn.closest('.supplier-section, .cc-collapsible');
  if (!section) return;
  section.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', !section.classList.contains('collapsed'));
});

// Update header metrics when data loads
function updateHeaderMetrics(unified) {
  const headerUsers = document.getElementById('header-users');
  const headerRevenue = document.getElementById('header-revenue');
  const headerDeliveries = document.getElementById('header-deliveries');

  if (headerUsers && unified?.totalUsers !== undefined) {
    headerUsers.textContent = unified.totalUsers.toLocaleString();
  }
  if (headerRevenue && unified?.revenue?.current !== undefined) {
    headerRevenue.textContent = '$' + unified.revenue.current.toLocaleString();
  }
  if (headerDeliveries && unified?.deliveries?.total !== undefined) {
    headerDeliveries.textContent = unified.deliveries.total.toLocaleString();
  }
}

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
    clearApiCache();
    // Destroy intelligence charts before re-render
    if (currentTab === 'command-center') {
      if (ccDemandTrendChart) { ccDemandTrendChart.destroy(); ccDemandTrendChart = null; }
      if (ccChannelMixChart) { ccChannelMixChart.destroy(); ccChannelMixChart = null; }
      if (ccPriceBandChart) { ccPriceBandChart.destroy(); ccPriceBandChart = null; }
    }
    if (currentTab === 'coverage') {
      if (coverageSpreadChart) { coverageSpreadChart.destroy(); coverageSpreadChart = null; }
    }
    loadDashboard();
    reloadCurrentTab();
  });
});

// Reload current tab (called when period changes)
function reloadCurrentTab() {
  switch (currentTab) {
    case 'command-center': loadCommandCenter(); break;
    case 'leaderboard': loadLeaderboard(); break;
    case 'app-analytics': loadAppAnalytics(); break;
    case 'growth': loadGrowth(); break;
    case 'coverage': loadCoverage(); break;
    case 'website': loadWebsite(); break;
    case 'retention': loadRetention(); break;
    case 'health': loadHealth(); break;
  }
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
      tbody.innerHTML = '<tr><td colspan="6" class="no-data">No suppliers found matching your criteria</td></tr>';
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
        const location = [s.city, s.state].filter(Boolean).join(', ') || '--';

        // Build website display text
        let websiteHtml = '';
        if (s.website && typeof s.website === 'string') {
          const displayUrl = s.website.replace(/^https?:\/\//, '').substring(0, 30);
          const safeUrl = s.website.startsWith('http') ? s.website : `https://${s.website}`;
          websiteHtml = `<div class="supplier-website"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="website-link">${displayUrl}</a></div>`;
        }

        row.innerHTML = `
          <td>
            <div class="supplier-name">${s.name}</div>
            <div class="supplier-meta">${location}</div>
            ${websiteHtml}
          </td>
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
    document.getElementById('page-info').textContent = `Page ${suppliersPage + 1} of ${totalPages}`;
    document.getElementById('prev-page').disabled = suppliersPage === 0;
    document.getElementById('next-page').disabled = suppliersPage >= totalPages - 1;

    // Load collapsible sub-sections
    await loadMissingSuppliers();
    await loadAliases();

  } catch (error) {
    console.error('Failed to load suppliers:', error);
    const tbody = document.getElementById('suppliers-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="error-message">Failed to load suppliers. Please try again.</td></tr>';
    }
  }
}

// Supplier map
let supplierMap = null;
let supplierMarkers = [];

async function loadSupplierMap() {
  const mapContainer = document.getElementById('supplier-map');
  if (!mapContainer) return;

  try {
    // Initialize map if not already done
    if (!supplierMap) {
      supplierMap = L.map('supplier-map').setView([41.2, -73.7], 8); // Center on Westchester

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
      }).addTo(supplierMap);
    }

    // Clear existing markers
    supplierMarkers.forEach(m => supplierMap.removeLayer(m));
    supplierMarkers = [];

    // Fetch supplier locations
    const data = await api('/suppliers/map');

    if (!data.suppliers || data.suppliers.length === 0) {
      console.log('No supplier locations available');
      return;
    }

    // Add markers (skip suppliers without coordinates)
    data.suppliers.forEach(supplier => {
      if (!supplier.lat || !supplier.lng) return;

      const color = !supplier.active ? '#9ca3af' : supplier.price ? '#22c55e' : '#f59e0b';

      const marker = L.circleMarker([supplier.lat, supplier.lng], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      });

      const priceHtml = supplier.price
        ? `<span class="supplier-price">$${supplier.price.toFixed(2)}/gal</span>`
        : '<span class="supplier-no-price">No price</span>';

      marker.bindPopup(`
        <strong>${supplier.name}</strong><br>
        ${supplier.city}, ${supplier.state}<br>
        ${priceHtml}
      `);

      marker.addTo(supplierMap);
      supplierMarkers.push(marker);
    });

    // Fit bounds to show all markers
    if (supplierMarkers.length > 0) {
      const group = L.featureGroup(supplierMarkers);
      supplierMap.fitBounds(group.getBounds().pad(0.1));
    }

    console.log(`Loaded ${data.mapped} suppliers on map (${data.needsGeocoding} pending geocoding)`);
  } catch (error) {
    console.error('Failed to load supplier map:', error);
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

    // Hours & Availability
    document.getElementById('edit-hours-weekday').value = s.hours_weekday || '';
    document.getElementById('edit-hours-saturday').value = s.hours_saturday || '';
    document.getElementById('edit-hours-sunday').value = s.hours_sunday || '';
    document.getElementById('edit-weekend-delivery').value = s.weekend_delivery || 'unknown';
    document.getElementById('edit-emergency-delivery').value = s.emergency_delivery || 'unknown';
    document.getElementById('edit-emergency-phone').value = s.emergency_phone || '';
    document.getElementById('edit-hours-notes').value = s.hours_notes || '';
    document.getElementById('edit-hours-verified').checked = !!s.hours_verified_at;

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
    manual_price: priceValue ? parseFloat(priceValue) : null,
    // Hours & Availability
    hours_weekday: document.getElementById('edit-hours-weekday').value || null,
    hours_saturday: document.getElementById('edit-hours-saturday').value || null,
    hours_sunday: document.getElementById('edit-hours-sunday').value || null,
    weekend_delivery: document.getElementById('edit-weekend-delivery').value,
    emergency_delivery: document.getElementById('edit-emergency-delivery').value,
    emergency_phone: document.getElementById('edit-emergency-phone').value || null,
    hours_notes: document.getElementById('edit-hours-notes').value || null,
    hours_verified: document.getElementById('edit-hours-verified').checked
  };

  try {
    await api(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    document.getElementById('supplier-modal').classList.add('hidden');
    loadSuppliers();
    alert('Supplier updated successfully');
  } catch (error) {
    console.error('Failed to update supplier:', error);
    alert('Failed to update supplier');
  }
});



// Load missing suppliers - suppliers users mention that we don't have
async function loadMissingSuppliers() {
  try {
    const data = await api(`/missing-suppliers?days=${currentDays}`);

    // Update counts
    document.getElementById('missing-count').textContent = data.summary.totalMissing;
    document.getElementById('near-match-count').textContent = data.summary.totalNearMatches;

    // Missing suppliers table
    const missingBody = document.getElementById('missing-suppliers-body');
    missingBody.innerHTML = '';

    if (data.missing.length > 0) {
      data.missing.forEach(s => {
        const row = document.createElement('tr');
        const typeLabel = s.wasFromDirectory
          ? '<span class="flag-badge warning" title="Was marked from_directory but not found">Bug?</span>'
          : '<span class="flag-badge">New Lead</span>';
        row.innerHTML = `
          <td><strong>${s.name}</strong></td>
          <td>${s.mentions}</td>
          <td>${s.uniqueUsers}</td>
          <td>${timeAgo(s.lastMentioned)}</td>
          <td>${typeLabel}</td>
          <td><button class="btn-small btn-search-supplier" data-name="${s.name.replace(/"/g, '&quot;')}">Search</button></td>
        `;
        missingBody.appendChild(row);
      });
    } else {
      missingBody.innerHTML = '<tr><td colspan="6" class="no-data">No missing suppliers</td></tr>';
    }

    // Near matches table
    const nearMatchBody = document.getElementById('near-matches-body');
    if (!nearMatchBody) return;
    nearMatchBody.innerHTML = '';

    if (data.nearMatches.length > 0) {
      data.nearMatches.forEach(s => {
        const row = document.createElement('tr');
        const suggestions = s.suggestions.map(sg => `${sg.name} (${sg.city}, ${sg.state})`).join('<br>');
        row.innerHTML = `
          <td><strong>${s.name}</strong></td>
          <td>${s.mentions}</td>
          <td>${suggestions || 'No suggestions'}</td>
          <td><button class="btn-small btn-add-alias" data-name="${s.name.replace(/"/g, '&quot;')}">Add Alias</button></td>
        `;
        nearMatchBody.appendChild(row);
      });
    } else {
      nearMatchBody.innerHTML = '<tr><td colspan="4" class="no-data">No near matches</td></tr>';
    }

  } catch (error) {
    console.error('Failed to load missing suppliers:', error);
  }
}

// Helper to search for supplier (opens Google search)
function searchSupplier(name) {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(name + ' heating oil')}`, '_blank');
}

// Load supplier aliases
async function loadAliases() {
  try {
    const data = await api('/aliases');

    document.getElementById('alias-count').textContent = data.count;

    const aliasBody = document.getElementById('aliases-body');
    aliasBody.innerHTML = '';

    if (data.aliases.length > 0) {
      data.aliases.forEach(a => {
        const row = document.createElement('tr');
        const scope = a.scopeState || a.scopeZipPrefix
          ? `${a.scopeState || ''}${a.scopeZipPrefix ? ' ' + a.scopeZipPrefix + 'xx' : ''}`
          : 'Global';
        row.innerHTML = `
          <td><strong>${a.aliasName}</strong></td>
          <td>${a.canonicalName}</td>
          <td>${a.supplierCity || ''}, ${a.supplierState || ''}</td>
          <td>${scope}</td>
          <td><button class="btn-small danger btn-delete-alias" data-id="${a.id}" data-name="${a.aliasName.replace(/"/g, '&quot;')}">Delete</button></td>
        `;
        aliasBody.appendChild(row);
      });
    } else {
      aliasBody.innerHTML = '<tr><td colspan="5" class="no-data">No aliases configured</td></tr>';
    }
  } catch (error) {
    console.error('Failed to load aliases:', error);
    document.getElementById('aliases-body').innerHTML = '<tr><td colspan="5" class="no-data">Failed to load aliases</td></tr>';
  }
}

// Add alias manually - prompts for alias name first
async function addAliasManual() {
  const aliasName = prompt('Enter the alias name (what users type):\n\nExample: "Castle Fuel"');
  if (!aliasName || !aliasName.trim()) return;
  await addAlias(aliasName.trim());
}

// V2.35.22: Attach event listeners (CSP blocks inline onclick)
document.getElementById('add-alias-btn')?.addEventListener('click', addAliasManual);

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  // Search supplier button (missing suppliers table)
  if (e.target.classList.contains('btn-search-supplier')) {
    const name = e.target.dataset.name;
    if (name) searchSupplier(name);
  }
  // Add alias button (near matches table)
  if (e.target.classList.contains('btn-add-alias')) {
    const name = e.target.dataset.name;
    if (name) addAlias(name);
  }
  // Delete alias button (aliases table)
  if (e.target.classList.contains('btn-delete-alias')) {
    const id = e.target.dataset.id;
    const name = e.target.dataset.name;
    if (id && name) deleteAlias(id, name);
  }
  // Show settings tab button (coverage gaps)
  if (e.target.classList.contains('btn-show-settings')) {
    showTab('settings');
  }
});

// Add alias - prompts for supplier ID then creates alias
async function addAlias(aliasName, suggestedSupplierId = null) {
  // First, search for possible suppliers
  let supplierId = suggestedSupplierId;

  if (!supplierId) {
    // Prompt for supplier name to search
    const searchTerm = prompt(`Search for supplier to link "${aliasName}" to:\n\n(Enter partial name to search)`, aliasName.substring(0, 10));
    if (!searchTerm) return;

    try {
      // Search for suppliers
      const response = await fetch(`/api/v1/suppliers?name=${encodeURIComponent(searchTerm)}`);
      const result = await response.json();

      if (!result.data || result.data.length === 0) {
        alert(`No suppliers found matching "${searchTerm}"`);
        return;
      }

      // Show supplier options
      const options = result.data.slice(0, 5).map((s, i) =>
        `${i + 1}. ${s.name} (${s.city || ''}, ${s.state || ''})`
      ).join('\n');

      const selection = prompt(`Select supplier for alias "${aliasName}":\n\n${options}\n\nEnter number (1-${Math.min(5, result.data.length)}):`);

      if (!selection || isNaN(parseInt(selection))) return;

      const index = parseInt(selection) - 1;
      if (index < 0 || index >= result.data.length) {
        alert('Invalid selection');
        return;
      }

      supplierId = result.data[index].id;
    } catch (error) {
      console.error('Supplier search failed:', error);
      alert('Failed to search suppliers');
      return;
    }
  }

  // Create the alias
  try {
    const response = await fetch('/api/dashboard/aliases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('dashboardToken')}`
      },
      body: JSON.stringify({
        aliasName: aliasName,
        supplierId: supplierId
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(`Created alias: "${aliasName}" → "${result.alias.canonicalName}"`);
      await loadAliases();
      await loadMissingSuppliers(); // Refresh near-matches
    } else {
      alert('Failed to create alias: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Create alias failed:', error);
    alert('Failed to create alias');
  }
}

// Delete alias
async function deleteAlias(aliasId, aliasName) {
  if (!confirm(`Delete alias "${aliasName}"?`)) return;

  try {
    const response = await fetch(`/api/dashboard/aliases/${aliasId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('dashboardToken')}`
      }
    });

    const result = await response.json();

    if (result.success) {
      await loadAliases();
    } else {
      alert('Failed to delete alias: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Delete alias failed:', error);
    alert('Failed to delete alias');
  }
}

// Create new supplier
async function createSupplier(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const statusDiv = document.getElementById('add-supplier-status');
  const submitBtn = document.getElementById('add-supplier-btn');

  // Show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<span style="color: var(--gray-500);">Creating supplier...</span>';

  const fuelType = formData.get('fuelType');
  const fuelTypes = fuelType === 'both'
    ? ['heating_oil', 'propane']
    : [fuelType];

  const supplierData = {
    name: formData.get('name'),
    state: formData.get('state').toUpperCase(),
    city: formData.get('city') || null,
    phone: formData.get('phone') || null,
    website: formData.get('website') || null,
    email: formData.get('email') || null,
    addressLine1: formData.get('addressLine1') || null,
    notes: formData.get('notes') || null,
    fuelTypes: fuelTypes,
    active: formData.get('active') === 'on',
    allowPriceDisplay: formData.get('allowPriceDisplay') === 'on'
  };

  try {
    const response = await fetch('/api/dashboard/suppliers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminPassword}`
      },
      body: JSON.stringify(supplierData)
    });

    const result = await response.json();

    if (result.success) {
      statusDiv.innerHTML = `<span style="color: var(--success);">✓ Created: ${result.supplier.name} (${result.supplier.state})</span>`;
      form.reset();
      // Re-check the default checkboxes
      form.querySelector('[name="active"]').checked = true;
      form.querySelector('[name="allowPriceDisplay"]').checked = true;
      // Refresh suppliers list if on that tab
      if (typeof loadSuppliers === 'function') {
        await loadSuppliers();
      }
    } else {
      statusDiv.innerHTML = `<span style="color: var(--danger);">✗ Failed: ${result.error || 'Unknown error'}</span>`;
    }
  } catch (error) {
    console.error('Create supplier failed:', error);
    statusDiv.innerHTML = `<span style="color: var(--danger);">✗ Error: ${error.message}</span>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Supplier';
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

// Load Command Center tab (default landing)
async function loadCommandCenter() {
  const loadingEl = document.getElementById('cc-loading');
  const contentEl = document.getElementById('cc-content');
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (contentEl) contentEl.classList.add('hidden');

  try {
    const data = await api('/command-center');
    const ns = data.northStar || {};
    const lc = data.lifecycle || { states: {}, total: 0 };
    const anomalies = data.anomalies || [];
    const actions = data.actionItems || [];
    const movers = data.movers || { up: [], down: [] };
    const diagnosis = data.diagnosis || {};
    const stability = data.stability || { score: 0, components: {} };
    const mp = data.marketPulse || {};
    const liquidity = data.liquidity || null;

    // ── HERO ──
    document.getElementById('cc-ns-value').textContent = ns.today ?? 0;
    document.getElementById('cc-ns-yesterday').textContent = ns.yesterday ?? 0;
    document.getElementById('cc-ns-avg7d').textContent = ns.avg7d ?? 0;
    const changeEl = document.getElementById('cc-ns-change');
    if (ns.change > 0) {
      changeEl.textContent = `+${ns.change}%`;
      changeEl.className = 'cc-ns-change up';
    } else if (ns.change < 0) {
      changeEl.textContent = `${ns.change}%`;
      changeEl.className = 'cc-ns-change down';
    } else {
      changeEl.textContent = 'on par';
      changeEl.className = 'cc-ns-change flat';
    }
    ccRenderSystemState(diagnosis, anomalies);
    ccRenderTrajectory(ns.trajectory);
    ccRenderForecast(ns.forecast);
    ccRenderHeroChart(ns.trend || []);
    ccRenderStability(stability);
    ccRenderDiagnosis(diagnosis);
    ccRenderTiles(data);

    // ── MIDDLE ──
    ccRenderMarketplacePulse(liquidity, anomalies);
    ccRenderPipeline(lc);
    ccRenderDemandDensity(liquidity);
    ccRenderCommunityDeliveries(liquidity);

    // ── BOTTOM ──
    ccRenderActions(actions.slice(0, 4));
    ccRenderMovers(movers);

    const genEl = document.getElementById('cc-generated');
    if (genEl && data.generatedAt) genEl.textContent = 'Updated ' + timeAgo(data.generatedAt);

    // Surface conversion stat from existing CC data
    const convEl = document.getElementById('cc-conversion-stat');
    if (convEl && liquidity?.wow?.matchSoft7d) {
      const rate = liquidity.wow.matchSoft7d.current;
      const delta = liquidity.wow.matchSoft7d.delta;
      convEl.textContent = `7d Search\u2192Click: ${rate}%`;
      if (delta !== null && Math.abs(delta) >= 0.5) {
        convEl.textContent += ` (${delta > 0 ? '+' : ''}${delta}pp)`;
      }
    }

    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    // Fire intelligence charts (3 parallel API calls)
    loadCCIntelligence();
  } catch (error) {
    console.error('Failed to load command center:', error);
    if (loadingEl) loadingEl.innerHTML = 'Failed to load Command Center.';
  }
}

function ccRenderSystemState(diagnosis, anomalies) {
  const el = document.getElementById('cc-system-state');
  if (!el) return;
  if (!diagnosis || diagnosis.status === 'normal') {
    el.textContent = 'ALL SYSTEMS NORMAL';
    el.className = 'cc-system-state state-healthy';
    return;
  }
  // Derive label from primary anomaly category
  const labels = {
    supply: 'SUPPLY CONSTRAINED',
    supplier: 'SUPPLIER DEGRADED',
    demand: 'DEMAND SUPPRESSED',
    traffic: 'TRAFFIC ANOMALY',
    conversion: 'CONVERSION LEAK'
  };
  const cat = diagnosis.category || (anomalies[0] && anomalies[0].category);
  const label = labels[cat] || 'SYSTEM DEGRADED';
  el.textContent = label;
  el.className = 'cc-system-state ' + (diagnosis.status === 'critical' ? 'state-critical' : 'state-warning');
}

function ccRenderHeroChart(trend) {
  const canvas = document.getElementById('cc-ns-sparkline');
  if (!canvas || !trend.length) return;
  if (nsSparklineChart) nsSparklineChart.destroy();

  const ctx = canvas.getContext('2d');
  // Use container height for gradient (300px), not canvas.height which is unreliable before render
  const containerH = canvas.parentElement ? canvas.parentElement.clientHeight : 300;
  const gradient = ctx.createLinearGradient(0, 0, 0, containerH);
  gradient.addColorStop(0, 'rgba(59,130,246,0.32)');
  gradient.addColorStop(0.5, 'rgba(59,130,246,0.12)');
  gradient.addColorStop(1, 'rgba(59,130,246,0.02)');

  nsSparklineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: trend.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [{
        data: trend.map(d => d.qualityConnections),
        borderColor: '#3b82f6',
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#3b82f6',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: '#1e293b',
          titleFont: { size: 11 },
          bodyFont: { size: 12, weight: '600' },
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            label: function(ctx) { return ctx.parsed.y + ' quality clicks'; }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#94a3b8', maxRotation: 0 }
        },
        y: {
          display: false,
          beginAtZero: true,
          grace: '10%'
        }
      },
      interaction: { mode: 'index', intersect: false }
    }
  });
}

function ccRenderTrajectory(trajectory) {
  const el = document.getElementById('cc-ns-trajectory');
  if (!el || !trajectory) { if (el) el.textContent = ''; return; }
  const pct = Math.abs(trajectory.pct);
  const cls = trajectory.direction === 'up' ? 'up' : trajectory.direction === 'down' ? 'down' : 'flat';
  const sign = trajectory.direction === 'up' ? '+' : trajectory.direction === 'down' ? '-' : '';
  el.innerHTML = `30d: <strong class="${cls}">${sign}${pct}%</strong> <span class="cc-trajectory-detail">${trajectory.prevAvg || '--'} → ${trajectory.recentAvg || '--'}/day</span>`;
}

function ccRenderForecast(forecast) {
  const el = document.getElementById('cc-ns-forecast');
  if (!el) return;
  if (!forecast || forecast.projected === null) { el.textContent = ''; return; }
  el.innerHTML = `Forecast: <strong>${forecast.projected}</strong> tomorrow <span class="cc-forecast-conf">(${forecast.confidence})</span>`;
}

function ccRenderStability(stability) {
  const scoreEl = document.getElementById('cc-stability-score');
  const subEl = document.getElementById('cc-stab-sub');
  const compEl = document.getElementById('cc-stability-components');
  if (scoreEl) {
    scoreEl.textContent = stability.score;
    scoreEl.className = 'cc-stab-badge' +
      (stability.score >= 70 ? ' good' : stability.score >= 40 ? ' warn' : ' bad');
  }
  if (subEl) {
    const label = stability.score >= 70 ? 'Healthy' : stability.score >= 40 ? 'Degraded' : 'Critical';
    subEl.textContent = label;
  }
  if (compEl && stability.components) {
    const c = stability.components;
    const compColor = (v) => v >= 70 ? 'comp-good' : v >= 40 ? 'comp-warn' : 'comp-bad';
    compEl.innerHTML = [
      { label: 'Supply', val: c.supplyFreshness },
      { label: 'Uptime', val: c.scraperUptime },
      { label: 'Conv', val: c.conversionRate },
      { label: 'Demand', val: c.demandVelocity }
    ].map(r => `<span class="cc-comp-pill">${r.label} <strong class="${r.val != null ? compColor(r.val) : ''}">${r.val ?? '--'}</strong></span>`).join('');
  }
}

function ccRenderDiagnosis(diagnosis) {
  const wrap = document.getElementById('cc-diagnosis');
  const iconEl = document.getElementById('cc-diagnosis-icon');
  const summaryEl = document.getElementById('cc-diagnosis-summary');
  const confEl = document.getElementById('cc-diagnosis-confidence');
  if (!wrap) return;
  if (!diagnosis || diagnosis.status === 'normal') {
    wrap.className = 'cc-diagnosis normal';
    if (iconEl) iconEl.textContent = '\u2713';
    if (summaryEl) summaryEl.textContent = 'All systems operating normally';
    if (confEl) confEl.textContent = '';
    return;
  }
  wrap.className = 'cc-diagnosis ' + diagnosis.status;
  if (iconEl) iconEl.textContent = diagnosis.status === 'critical' ? '!' : '\u26A0';
  if (summaryEl) summaryEl.textContent = diagnosis.summary;
  if (confEl) confEl.innerHTML = diagnosis.confidence
    ? `<span class="cc-conf-badge"><span class="conf-num">${diagnosis.confidence}%</span></span>` : '';
}

function ccRenderTiles(data) {
  const anomalies = data.anomalies || [];
  const lc = data.lifecycle || { states: {}, total: 0 };
  const ns = data.northStar || {};
  const trend = ns.trend || [];
  const s = lc.states || {};

  // Clicks Today
  const todayEntry = trend.find(d => d.date === new Date().toISOString().split('T')[0]);
  document.getElementById('cc-stat-clicks').textContent = todayEntry ? todayEntry.totalClicks : 0;
  ccSetDot('cc-dot-clicks', anomalies.find(a => a.category === 'traffic'));

  // Live Prices — pipeline suppliers with fresh <48h price
  document.getElementById('cc-stat-live').textContent = s.live || 0;
  ccSetDot('cc-dot-live', anomalies.find(a => a.category === 'supply'));

  // Stale / Failing — pipeline suppliers with degraded or failing scrapes
  const issueCount = (s.stale || 0) + (s.failing || 0);
  document.getElementById('cc-stat-issues').textContent = issueCount;
  ccSetDot('cc-dot-issues', issueCount > 0 ? { severity: issueCount > 10 ? 'high' : 'medium' } : null);

  // Blocked — pipeline suppliers not being scraped
  const blockedCount = s.blocked || 0;
  document.getElementById('cc-stat-blocked').textContent = blockedCount;
  ccSetDot('cc-dot-blocked', blockedCount > 0 ? { severity: blockedCount > 5 ? 'high' : 'medium' } : null);
}

function ccSetDot(id, anomaly) {
  const dot = document.getElementById(id);
  if (!dot) return;
  if (!anomaly) { dot.className = 'cc-tile-dot green'; return; }
  dot.className = 'cc-tile-dot ' + (anomaly.severity === 'high' ? 'red' : 'yellow');
}

function ccRenderMarketplacePulse(liquidity, anomalies) {
  // Anomaly strip
  const stripEl = document.getElementById('cc-anomaly-strip');
  if (stripEl) {
    if (anomalies && anomalies.length > 0) {
      const a = anomalies[0];
      const arrow = a.direction === 'up' ? '\u2191' : '\u2193';
      const sevCls = a.severity === 'high' ? 'cc-anomaly-high' : 'cc-anomaly-med';
      stripEl.innerHTML = `<span class="${sevCls}">${a.title} ${arrow} ${Math.abs(a.deviation)}% vs 7d avg` +
        (a.severity === 'high' ? ' (high confidence)' : '') + '</span>';
      stripEl.classList.remove('hidden');
    } else {
      stripEl.classList.add('hidden');
    }
  }

  // Stale check
  const staleEl = document.getElementById('cc-liq-stale');
  if (staleEl && liquidity) {
    const now = new Date();
    const etStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const etDate = new Date(etStr + 'T00:00:00');
    etDate.setDate(etDate.getDate() - 1);
    const yesterdayET = etDate.toISOString().split('T')[0];
    if (liquidity.day < yesterdayET) {
      staleEl.textContent = 'stale data';
      staleEl.classList.remove('hidden');
    }
  }

  if (!liquidity) {
    document.querySelectorAll('.cc-liq-value').forEach(function(el) { el.textContent = 'awaiting snapshot'; el.style.fontSize = '0.7rem'; });
    return;
  }

  var p = liquidity.pulse;
  var pipe = p.pipelineSuppliers;

  function pct(num, den) { return den > 0 ? Math.round((num / den) * 100) + '%' : '\u2014'; }

  document.getElementById('cc-liq-util-soft-7d').textContent = pct(p.suppliersClicked7d, pipe);
  document.getElementById('cc-liq-util-soft-30d').textContent = pct(p.suppliersClicked30d, pipe);
  document.getElementById('cc-liq-util-hard-7d').textContent = pct(p.suppliersCalled7d, pipe);
  document.getElementById('cc-liq-util-hard-30d').textContent = pct(p.suppliersCalled30d, pipe);

  var searchZipDays = p.searchZipDays;
  var lowSample = searchZipDays < 5;
  var matchSoftVal = pct(p.zipDaysWithClick7d, searchZipDays);
  var matchHardVal = pct(p.zipDaysWithCall7d, searchZipDays);
  document.getElementById('cc-liq-match-soft').textContent = matchSoftVal;
  document.getElementById('cc-liq-match-hard').textContent = matchHardVal;
  if (lowSample) {
    document.getElementById('cc-liq-match-soft').classList.add('cc-liq-muted');
    document.getElementById('cc-liq-match-hard').classList.add('cc-liq-muted');
  }

  var totalEngagements = p.calls7d + p.websiteClicks7d;
  document.getElementById('cc-liq-call-share').textContent = pct(p.calls7d, totalEngagements);
  document.getElementById('cc-liq-coverage').textContent = pct(p.zipsWithCall7d, p.searchZips);

  // WoW delta badges
  if (liquidity.wow) {
    var wowMap = [
      ['cc-liq-util-soft-7d',  'utilizationSoft7d'],
      ['cc-liq-util-soft-30d', 'utilizationSoft30d'],
      ['cc-liq-util-hard-7d',  'utilizationHard7d'],
      ['cc-liq-util-hard-30d', 'utilizationHard30d'],
      ['cc-liq-match-soft',    'matchSoft7d'],
      ['cc-liq-match-hard',    'matchHard7d'],
      ['cc-liq-call-share',    'callShare7d'],
      ['cc-liq-coverage',      'coverage7d']
    ];
    wowMap.forEach(function(pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      var d = liquidity.wow[pair[1]];
      if (!d) return;
      var old = el.parentElement.querySelector('.cc-wow-delta');
      if (old) old.remove();
      var span = document.createElement('span');
      span.className = 'cc-wow-delta ';
      if (d.delta > 0.5) {
        span.className += 'cc-wow-up';
        span.textContent = '\u2191 +' + d.delta.toFixed(1) + 'pp';
      } else if (d.delta < -0.5) {
        span.className += 'cc-wow-down';
        span.textContent = '\u2193 ' + d.delta.toFixed(1) + 'pp';
      } else {
        span.className += 'cc-wow-flat';
        span.textContent = '0.0pp';
      }
      el.parentElement.appendChild(span);
    });
  }
}

function ccRenderDemandDensity(liquidity) {
  var tbody = document.getElementById('cc-density-tbody');
  if (!tbody) return;
  if (!liquidity || !liquidity.demandDensity || !liquidity.demandDensity.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="cc-diag-empty">Awaiting first snapshot</td></tr>';
    return;
  }

  tbody.innerHTML = liquidity.demandDensity.map(function(d) {
    var freshPct = d.suppliers > 0 ? (d.fresh ? 100 : 0) : 0;
    var freshCls = freshPct >= 70 ? 'cc-fresh-good' : (freshPct >= 40 ? 'cc-fresh-amber' : 'cc-fresh-bad');
    var freshLabel = d.fresh ? 'Yes' : 'No';
    var gapHtml = '';
    if (d.gap === 'undersupplied') {
      gapHtml = '<span class="cc-gap-pill cc-gap-undersupplied">Undersupplied</span>';
    } else if (d.gap === 'healthy') {
      gapHtml = '<span class="cc-gap-pill cc-gap-healthy">Healthy</span>';
    }
    return '<tr>' +
      '<td class="cc-diag-metric">' + d.zip + '</td>' +
      '<td>' + d.clicks + '</td>' +
      '<td>' + d.calls + '</td>' +
      '<td class="cc-density-score">' + d.score + '</td>' +
      '<td>' + d.days + '</td>' +
      '<td>' + d.suppliers + '</td>' +
      '<td class="' + freshCls + '">' + freshLabel + '</td>' +
      '<td>' + gapHtml + '</td>' +
      '</tr>';
  }).join('');
}

function ccRenderCommunityDeliveries(liquidity) {
  if (!liquidity) return;
  var c = liquidity.community;

  document.getElementById('cc-comm-7d').textContent = c.deliveries7d;
  document.getElementById('cc-comm-30d').textContent = c.deliveries30d;
  document.getElementById('cc-comm-oil').textContent = c.oil30d;
  document.getElementById('cc-comm-propane').textContent = c.propane30d;

  // Propane growth
  var growthEl = document.getElementById('cc-comm-growth');
  if (growthEl) {
    var prev = Math.max(1, c.propanePrev30d);
    var growthPct = Math.round(((c.propane30d - c.propanePrev30d) / prev) * 100);
    var arrow = growthPct > 0 ? '\u2191' : (growthPct < 0 ? '\u2193' : '');
    var cls = growthPct > 0 ? 'cc-growth-up' : (growthPct < 0 ? 'cc-growth-down' : 'cc-growth-flat');
    growthEl.innerHTML = '<span class="cc-comm-label">Propane Growth</span> ' +
      '<span class="' + cls + '">' + arrow + ' ' + Math.abs(growthPct) + '%</span>';
  }

  // Low sample guard
  var sampleEl = document.getElementById('cc-comm-sample');
  if (sampleEl) {
    if (c.deliveries30d < 10) {
      sampleEl.classList.remove('hidden');
    }
  }

  // Top ZIPs
  var topEl = document.getElementById('cc-comm-topzips');
  if (topEl && c.topZips && c.topZips.length) {
    topEl.innerHTML = c.topZips.map(function(z) {
      return '<div class="cc-comm-zip-row">' +
        '<span class="cc-comm-zip-code">' + z.zip + '</span>' +
        '<span class="cc-comm-zip-counts">' + z.oil + ' oil / ' + z.propane + ' propane</span>' +
        '<span class="cc-comm-zip-total">' + z.total + '</span>' +
        '</div>';
    }).join('');
  } else if (topEl) {
    topEl.innerHTML = '<div class="cc-diag-empty">No deliveries</div>';
  }
}

function ccRenderDiagTable(anomalies) {
  const tbody = document.getElementById('cc-diag-tbody');
  if (!tbody) return;
  if (!anomalies.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="cc-diag-empty">No anomalies detected</td></tr>';
    return;
  }
  tbody.innerHTML = anomalies.map(a => {
    const arrow = a.direction === 'up' ? '\u2191' : '\u2193';
    const sevCls = a.severity === 'high' ? 'red' : 'yellow';
    const deltaCls = (a.category === 'supplier' ? (a.direction === 'up' ? 'bad' : 'good') : (a.direction === 'up' ? 'good' : 'bad'));
    return `<tr>
      <td class="cc-diag-metric">${a.title}</td>
      <td class="cc-diag-val">${a.today}</td>
      <td class="cc-diag-val muted">${a.avg7d}</td>
      <td class="cc-diag-delta ${deltaCls}">${arrow} ${Math.abs(a.deviation)}%</td>
      <td><span class="cc-sev-dot ${sevCls}"></span></td>
    </tr>`;
  }).join('');
}

function ccRenderPipeline(lifecycle) {
  const states = lifecycle.states || {};
  const total = lifecycle.total || 0;
  const pipelineTotal = lifecycle.pipelineTotal || 0;
  const directoryTotal = lifecycle.directoryTotal || 0;
  const minimalTotal = lifecycle.minimalTotal || 0;
  const healthPct = lifecycle.healthPct || 0;
  const transitions = lifecycle.transitions || [];

  // Header: total + health badge
  const totalEl = document.getElementById('cc-health-total');
  if (totalEl) totalEl.textContent = total + ' suppliers';
  const badge = document.getElementById('cc-health-badge');
  if (badge) {
    badge.textContent = healthPct + '%';
    badge.className = 'cc-health-badge ' + (healthPct >= 80 ? 'good' : healthPct >= 50 ? 'warn' : 'bad');
  }

  // Pipeline bar (live/stale/failing/blocked)
  const pipelineStages = [
    { key: 'live', label: 'Live', color: '#16a34a' },
    { key: 'stale', label: 'Stale', color: '#d97706' },
    { key: 'failing', label: 'Failing', color: '#ea580c' },
    { key: 'blocked', label: 'Blocked', color: '#dc2626' }
  ];
  ccRenderBar('cc-pipeline-bar', 'cc-pipeline-legend', pipelineStages, states, pipelineTotal);
  const pipeCount = document.getElementById('cc-pipeline-count');
  if (pipeCount) pipeCount.textContent = pipelineTotal;

  // Database bar (pipeline/directory/minimal)
  const dbStages = [
    { key: '_pipeline', label: 'Pipeline', color: '#3b82f6', count: pipelineTotal },
    { key: '_directory', label: 'Directory', color: '#8b5cf6', count: directoryTotal },
    { key: '_minimal', label: 'Minimal', color: '#9ca3af', count: minimalTotal }
  ];
  ccRenderBar('cc-database-bar', 'cc-database-legend', dbStages, {}, total, true);
  const dbCount = document.getElementById('cc-database-count');
  if (dbCount) dbCount.textContent = total;

  // Attention items
  ccRenderAttention(states);

  // Transitions
  const transEl = document.getElementById('cc-machine-transitions');
  if (transEl) {
    if (transitions.length) {
      transEl.innerHTML = '<span class="cc-trans-label">This week:</span> ' +
        transitions.map(t => {
          const cls = t.direction === 'up' ? 'good' : 'bad';
          return `<span class="cc-trans-pill ${cls}">${t.label}</span>`;
        }).join(' ');
    } else {
      transEl.innerHTML = '<span class="cc-trans-label">This week:</span> <span class="cc-trans-none">No changes</span>';
    }
  }
}

function ccRenderBar(barId, legendId, stages, states, total, useCountProp) {
  const bar = document.getElementById(barId);
  if (bar && total > 0) {
    bar.innerHTML = stages
      .filter(s => {
        const count = useCountProp ? s.count : (states[s.key] || 0);
        return count > 0;
      })
      .map(s => {
        const count = useCountProp ? s.count : (states[s.key] || 0);
        const pct = ((count / total) * 100).toFixed(0);
        const label = count > total * 0.05 ? count : '';
        return `<div class="cc-bar-seg" style="flex:${count};background:${s.color}" title="${s.label}: ${count} (${pct}%)"><span>${label}</span></div>`;
      }).join('');
  }
  const legend = document.getElementById(legendId);
  if (legend) {
    legend.innerHTML = stages.map(s => {
      const count = useCountProp ? s.count : (states[s.key] || 0);
      return `<div class="cc-legend-item"><div class="cc-legend-dot" style="background:${s.color}"></div>${s.label}: <span class="cc-legend-count">${count}</span></div>`;
    }).join('');
  }
}

function ccRenderAttention(states) {
  const el = document.getElementById('cc-attention');
  if (!el) return;
  const items = [];
  if ((states.blocked || 0) > 0) {
    items.push({ severity: 'red', icon: '\uD83D\uDD34', text: `${states.blocked} suppliers blocked from scraping`, action: 'Check scraper config or site changes' });
  }
  if ((states.failing || 0) > 0) {
    items.push({ severity: 'orange', icon: '\uD83D\uDFE0', text: `${states.failing} suppliers failing to scrape`, action: 'Investigate before next scrape cycle' });
  }
  if ((states.stale || 0) > 5) {
    items.push({ severity: 'yellow', icon: '\uD83D\uDFE1', text: `${states.stale} stale prices (>48h)`, action: 'May be suppressing conversions' });
  }
  if (items.length === 0) {
    el.innerHTML = '<div class="cc-attn-clear">No issues detected</div>';
    return;
  }
  el.innerHTML = items.map(i =>
    `<div class="cc-attn-item cc-attn-${i.severity}"><span class="cc-attn-icon">${i.icon}</span> <span class="cc-attn-text">${i.text}</span> <span class="cc-attn-action">${i.action}</span></div>`
  ).join('');
}

function ccRenderActions(actions) {
  const list = document.getElementById('cc-priority-list');
  if (!list) return;
  if (!actions.length) {
    list.innerHTML = '<div class="cc-command-empty">No actions needed</div>';
    return;
  }
  list.innerHTML = actions.map((a, i) => {
    const details = a.details || [];
    const detailRows = details.map(d => {
      const link = d.website ? `<a href="${d.website}" target="_blank" class="cc-detail-link">${d.name}</a>` : `<span>${d.name}</span>`;
      return `<div class="cc-detail-row">
        ${link}
        <span class="cc-detail-loc">${d.location || ''}</span>
        ${d.note ? `<span class="cc-detail-note">${d.note}</span>` : ''}
      </div>`;
    }).join('');
    const hasDetails = details.length > 0;
    return `<div class="cc-command-card ${a.priority}">
      <div class="cc-command-body">
        <div class="cc-command-header${hasDetails ? ' cc-expandable' : ''}">
          <div class="cc-command-text">${a.text}</div>
          <div class="cc-command-meta">
            <span class="cc-command-label">${a.label || a.priority.toUpperCase()}</span>
            ${hasDetails ? '<span class="cc-command-toggle">&#9662;</span>' : ''}
          </div>
        </div>
        ${hasDetails ? `<div class="cc-command-details">${detailRows}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Attach expand/collapse listeners (CSP blocks inline onclick)
  list.querySelectorAll('.cc-expandable').forEach(header => {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('expanded');
    });
  });
}

function ccRenderMovers(movers) {
  const upEl = document.getElementById('cc-movers-up');
  const downEl = document.getElementById('cc-movers-down');
  if (upEl) {
    upEl.innerHTML = movers.up.length
      ? movers.up.slice(0, 5).map(m => `
          <div class="cc-mover-row">
            <span class="cc-mover-name">${m.name}</span>
            <span class="cc-mover-delta up">+$${m.change.toFixed(2)}</span>
            <span class="cc-mover-price">$${m.currentPrice.toFixed(2)}</span>
          </div>`).join('')
      : '<div class="cc-movers-none">None</div>';
  }
  if (downEl) {
    downEl.innerHTML = movers.down.length
      ? movers.down.slice(0, 5).map(m => `
          <div class="cc-mover-row">
            <span class="cc-mover-name">${m.name}</span>
            <span class="cc-mover-delta down">-$${Math.abs(m.change).toFixed(2)}</span>
            <span class="cc-mover-price">$${m.currentPrice.toFixed(2)}</span>
          </div>`).join('')
      : '<div class="cc-movers-none">None</div>';
  }
}

// Leaderboard sort state
let lbSuppliers = [];
let lbSortKey = null;
let lbSortDesc = true;

function lbGetSortValue(s, key) {
  switch (key) {
    case 'engagementScore': return s.engagementScore || 0;
    case 'calls': return s.clicks?.calls || 0;
    case 'clicks': return s.clicks?.websites || 0;
    case 'saves': return s.conversions?.saves || 0;
    case 'quotes': return s.conversions?.quotes || 0;
    case 'orders': return s.conversions?.orders || 0;
    case 'price': return s.price?.current || 0;
    case 'delta': return s.price?.delta || 0;
    case 'opportunity': return s.opportunity?.galPerWeek || 0;
    default: return 0;
  }
}

function renderLeaderboardRows() {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';

  const sorted = [...lbSuppliers];
  if (lbSortKey) {
    sorted.sort((a, b) => {
      const av = lbGetSortValue(a, lbSortKey);
      const bv = lbGetSortValue(b, lbSortKey);
      return lbSortDesc ? bv - av : av - bv;
    });
  }

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--gray-500);padding:2rem;">No engagement data for this period</td></tr>';
    return;
  }

  const signalBadges = {
    converter: '<span class="signal converter">✅ Converter</span>',
    missing_price: '<span class="signal data-gap">⚠️ No Price</span>',
    brand_power: '<span class="signal brand">🔥 Brand</span>',
    price_leader: '<span class="signal price-leader">💰 Price Leader</span>',
    rising_star: '<span class="signal rising">🆕 Rising</span>',
    local_favorite: '<span class="signal local">📍 Local</span>',
    underperformer: '<span class="signal underperformer">📉 Hidden</span>',
    standard: '<span class="signal normal">—</span>'
  };

  sorted.forEach((s, i) => {
    const vsMarket = s.price?.delta != null ? (s.price.delta > 0 ? '+' : '') + formatPrice(s.price.delta) : '--';
    const displayRank = lbSortKey ? i + 1 : s.rank;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="rank">${displayRank}</td>
      <td><strong>${s.name}</strong><br><span class="supplier-location">${s.city || ''}, ${s.state || ''}</span></td>
      <td class="score-col"><strong>${s.engagementScore}</strong></td>
      <td>${s.clicks?.calls > 0 ? s.clicks.calls : '-'}</td>
      <td>${s.clicks?.websites > 0 ? s.clicks.websites : '-'}</td>
      <td>${s.conversions?.saves > 0 ? s.conversions.saves : '-'}</td>
      <td>${s.conversions?.quotes > 0 ? s.conversions.quotes : '-'}</td>
      <td class="${s.conversions?.orders > 0 ? 'has-orders' : ''}">${s.conversions?.orders > 0 ? s.conversions.orders : '-'}</td>
      <td>${s.price ? formatPrice(s.price.current) : '--'}</td>
      <td class="${s.price?.delta > 0 ? 'above-market' : s.price?.delta < 0 ? 'below-market' : ''}">${vsMarket}</td>
      <td class="${s.opportunity?.galPerWeek >= 300 ? 'opp-high' : s.opportunity?.galPerWeek >= 100 ? 'opp-med' : 'opp-low'}">${s.opportunity?.galPerWeek || 0}${s.opportunity?.clickShare != null ? '<br><span class="click-share">' + s.opportunity.clickShare + '% share</span>' : ''}</td>
      <td>${signalBadges[s.primarySignal] || signalBadges.standard}</td>
    `;
    tbody.appendChild(row);
  });
}

function initLeaderboardSort() {
  document.querySelectorAll('#leaderboard-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (lbSortKey === key) {
        lbSortDesc = !lbSortDesc;
      } else {
        lbSortKey = key;
        lbSortDesc = true;
      }
      // Update header indicators
      document.querySelectorAll('#leaderboard-table th.sortable').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(lbSortDesc ? 'sort-desc' : 'sort-asc');
      renderLeaderboardRows();
    });
  });
}

// Load Leaderboard tab - Uses weighted engagement scoring
async function loadLeaderboard() {
  const loadingEl = document.getElementById('leaderboard-loading');
  const contentEl = document.getElementById('leaderboard-content');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');

  try {
    // Use leaderboard endpoint with weighted engagement scoring
    const data = await api(`/leaderboard?days=${currentDays}`);
    const suppliers = data.leaderboard || [];

    // Summary stats
    const totalScore = suppliers.reduce((sum, s) => sum + (s.engagementScore || 0), 0);
    const totalOrders = suppliers.reduce((sum, s) => sum + (s.conversions?.orders || 0), 0);
    const totalQuotes = suppliers.reduce((sum, s) => sum + (s.conversions?.quotes || 0), 0);
    const totalSaves = suppliers.reduce((sum, s) => sum + (s.conversions?.saves || 0), 0);
    const marketAvg = data.summary?.marketAvg || 0;
    const top3Score = suppliers.slice(0, 3).reduce((sum, s) => sum + (s.engagementScore || 0), 0);
    const top3Pct = totalScore > 0 ? ((top3Score / totalScore) * 100).toFixed(0) : 0;

    document.getElementById('lb-total-suppliers').textContent = suppliers.length;
    document.getElementById('lb-total-clicks').textContent = `${totalScore} pts (${totalOrders} orders, ${totalQuotes} quotes, ${totalSaves} saves)`;
    document.getElementById('lb-market-avg').textContent = marketAvg > 0 ? formatPrice(marketAvg) : '--';
    document.getElementById('lb-top3-pct').textContent = `${top3Pct}%`;
    document.getElementById('lb-total-opportunity').textContent = data.summary?.totalOpportunity != null ? `${data.summary.totalOpportunity.toLocaleString()}` : '--';

    // Quick wins from API
    const quickWinsList = document.getElementById('quick-wins-list');
    quickWinsList.innerHTML = '';

    if (data.quickWins && data.quickWins.length > 0) {
      data.quickWins.forEach(win => {
        const priorityClass = win.priority === 'high' ? 'urgent' : '';
        const supplierList = win.suppliers?.length ? ` (${win.suppliers.join(', ')})` : '';
        quickWinsList.innerHTML += `<div class="quick-win ${priorityClass}">${win.title}: ${win.insight}${supplierList}</div>`;
      });
    } else {
      quickWinsList.innerHTML = '<div class="quick-win success">✅ No urgent issues detected</div>';
    }

    // Leaderboard table with weighted engagement scoring + sorting
    lbSuppliers = suppliers;
    lbSortKey = null;
    lbSortDesc = true;
    document.querySelectorAll('#leaderboard-table th.sortable').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    renderLeaderboardRows();
    initLeaderboardSort();

    // Export CSV button
    document.getElementById('lb-export-csv').onclick = () => {
      const csv = ['Rank,Supplier,City,State,Score,Calls,Clicks,Saves,Quotes,Orders,Price,vs Market,Opp (gal/wk),Click Share %,Signal'];
      suppliers.forEach((s) => {
        csv.push(`${s.rank},"${s.name}","${s.city || ''}","${s.state || ''}",${s.engagementScore || 0},${s.clicks?.calls || 0},${s.clicks?.websites || 0},${s.conversions?.saves || 0},${s.conversions?.quotes || 0},${s.conversions?.orders || 0},${s.price?.current || ''},${s.price?.delta || ''},${s.opportunity?.galPerWeek || 0},${s.opportunity?.clickShare || 0},${s.primarySignal || ''}`);
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

    // User Journey Funnel
    const userJourney = unified?.userJourney || {};
    if (userJourney.available && userJourney.hasData) {
      renderUserJourney(userJourney);
    } else {
      document.getElementById('journey-insight').textContent =
        '💡 User journey data will appear once you have visitor and engagement activity.';
    }

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

// Render User Journey Funnel
function renderUserJourney(journey) {
  const web = journey.web || {};
  const app = journey.app || {};

  // Helper to set element text safely
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  // Helper to set bar width
  const setBarWidth = (id, users, maxUsers) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.max(8, (users / maxUsers) * 100)}%`;
  };

  // Web Journey
  if (web.steps && web.steps.length > 0) {
    const s = web.steps;
    const maxUsers = Math.max(...s.map(x => x.users || 0), 1);

    // Step 1: Visits
    setText('wj-visits', s[0]?.users?.toLocaleString() || '--');
    setBarWidth('wj-visits-bar', s[0]?.users || 0, maxUsers);

    // Dropoff 1
    setText('wj-drop-1', s[1]?.dropoff || '--%');

    // Step 2: Views
    setText('wj-views', s[1]?.users?.toLocaleString() || '--');
    setText('wj-views-rate', s[1]?.rate || '--%');
    setBarWidth('wj-views-bar', s[1]?.users || 0, maxUsers);

    // Dropoff 2
    setText('wj-drop-2', s[2]?.dropoff || '--%');

    // Step 3: Clicks
    setText('wj-clicks', s[2]?.users?.toLocaleString() || '--');
    setText('wj-clicks-rate', s[2]?.rate || '--%');
    setText('wj-calls', s[2]?.breakdown?.call?.toLocaleString() || '0');
    setText('wj-websites', s[2]?.breakdown?.website?.toLocaleString() || '0');
    setBarWidth('wj-clicks-bar', s[2]?.users || 0, maxUsers);

    // Dropoff 3
    setText('wj-drop-3', s[3]?.dropoff || '--%');

    // Step 4: Install App
    setText('wj-deliveries', s[3]?.users?.toLocaleString() || '--');
    setText('wj-deliveries-rate', s[3]?.rate || '--%');
    const iosCount = s[3]?.breakdown?.ios ?? 0;
    const pwaCount = s[3]?.breakdown?.pwa ?? 0;
    setText('wj-ios', iosCount.toLocaleString());
    setText('wj-pwa', pwaCount.toLocaleString());
    setBarWidth('wj-deliveries-bar', s[3]?.users || 0, maxUsers);

    // Overall
    setText('wj-overall', web.overallConversion || '--%');
  }

  // App Journey
  if (app.steps && app.steps.length > 0) {
    const s = app.steps;
    const maxUsers = Math.max(...s.map(x => x.users || 0), 1);

    // Step 1: Opens
    setText('aj-opens', s[0]?.users?.toLocaleString() || '--');
    setBarWidth('aj-opens-bar', s[0]?.users || 0, maxUsers);

    // Dropoff 1
    setText('aj-drop-1', s[1]?.dropoff || '--%');

    // Step 2: Searches
    setText('aj-searches', s[1]?.users?.toLocaleString() || '--');
    setText('aj-searches-rate', s[1]?.rate || '--%');
    setBarWidth('aj-searches-bar', s[1]?.users || 0, maxUsers);

    // Dropoff 2
    setText('aj-drop-2', s[2]?.dropoff || '--%');

    // Step 3: Saves
    setText('aj-saves', s[2]?.users?.toLocaleString() || '--');
    setText('aj-saves-rate', s[2]?.rate || '--%');
    setBarWidth('aj-saves-bar', s[2]?.users || 0, maxUsers);

    // Dropoff 3
    setText('aj-drop-3', s[3]?.dropoff || '--%');

    // Step 4: Deliveries
    setText('aj-deliveries', s[3]?.users?.toLocaleString() || '--');
    setText('aj-deliveries-rate', s[3]?.rate || '--%');
    setBarWidth('aj-deliveries-bar', s[3]?.users || 0, maxUsers);

    // Overall
    setText('aj-overall', app.overallConversion || '--%');
  }

  // Generate insight
  const insights = [];

  // Find the biggest web dropoff
  if (web.biggestDropoff && parseFloat(web.biggestDropoff.rate) > 50) {
    const dropoffStep = web.biggestDropoff.to;
    const dropoffName = {
      'engaged': 'engaging (bounce rate)',
      'contact': 'contacting supplier',
      'install': 'installing app'
    }[dropoffStep] || dropoffStep;
    insights.push(`Web: ${web.biggestDropoff.rate} drop-off before ${dropoffName}`);
  }

  // Find the biggest app dropoff
  if (app.biggestDropoff && parseFloat(app.biggestDropoff.rate) > 50) {
    const dropoffStep = app.biggestDropoff.to;
    const dropoffName = {
      'search': 'searching directory',
      'save': 'saving a supplier',
      'delivery': 'logging deliveries'
    }[dropoffStep] || dropoffStep;
    insights.push(`App: ${app.biggestDropoff.rate} drop-off before ${dropoffName}`);
  }

  // Overall insight
  const webConv = parseFloat(web.overallConversion) || 0;
  const appConv = parseFloat(app.overallConversion) || 0;

  if (webConv > 0 || appConv > 0) {
    if (webConv > appConv && webConv > 0.5) {
      insights.push(`Website converts ${webConv.toFixed(2)}% - better than app`);
    } else if (appConv > webConv && appConv > 0.5) {
      insights.push(`App converts ${appConv.toFixed(2)}% - better than web`);
    }
  }

  // Set insight text
  const insightEl = document.getElementById('journey-insight');
  if (insights.length > 0) {
    insightEl.innerHTML = '💡 ' + insights.join(' | ');
  } else {
    insightEl.textContent = '💡 Track more user activity to see conversion insights.';
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
    const geoHeatmap = unified?.geoHeatmap || {};
    const geoStats = geoHeatmap?.data?.summary || {};
    const stateBreakdown = geoHeatmap?.data?.stateBreakdown || [];
    const topLocations = geoHeatmap?.data?.topLocations || [];

    // Debug: log geo data status
    console.log('[Coverage] geoHeatmap:', {
      available: geoHeatmap.available,
      hasData: geoHeatmap.hasData,
      error: geoHeatmap.error,
      pointsCount: geoHeatmap?.data?.points?.length || 0
    });

    // Calculate unique states from both sources
    const allPoints = [...(geographic.demandHeatmap || []), ...(geographic.coverageGaps || [])];
    const uniqueStates = new Set(allPoints.map(p => p.state).filter(Boolean));
    const statesCount = stateBreakdown.length || uniqueStates.size || 0;

    // Summary cards - use geographic data for gaps to match map display
    document.getElementById('cov-suppliers').textContent = overview.scraping?.suppliersTotal || '--';
    document.getElementById('cov-states').textContent = statesCount || '--';
    document.getElementById('cov-active-zips').textContent = geoStats.totalZips || (geoHeatmap.error ? 'Error' : '--');
    document.getElementById('cov-gaps').textContent = geographic.coverageGaps?.length || overview.coverage?.trueCoverageGaps || '--';

    // Show error if geoHeatmap failed
    if (geoHeatmap.error) {
      console.error('[Coverage] GeoHeatmap error:', geoHeatmap.error);
    }

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
          <td><button class="btn-small btn-show-settings">Add Supplier</button></td>
        `;
        gapsBody.appendChild(row);
      });
    }

    // Setup map view toggle
    setupMapViewToggle();

    // Load map with current view
    loadCoverageMapWithView(currentMapView);

    // Price Spread chart
    loadCoverageSpread();

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
    // Show coverage gaps (red) and limited coverage (yellow)
    const gapData = geographic.coverageGaps || [];
    const limitedData = geographic.limitedCoverage || [];
    const gapsWithCoords = gapData.filter(c => c.lat && c.lng);
    const limitedWithCoords = limitedData.filter(c => c.lat && c.lng);

    // Show total counts with note if some ZIPs lack coordinates
    const gapsMissing = gapData.length - gapsWithCoords.length;
    const limitedMissing = limitedData.length - limitedWithCoords.length;
    const gapLabel = gapsMissing > 0 ? `${gapsWithCoords.length} of ${gapData.length} ZIPs` : `${gapData.length} ZIPs`;
    const limitedLabel = limitedMissing > 0 ? `${limitedWithCoords.length} of ${limitedData.length} ZIPs` : `${limitedData.length} ZIPs`;
    statsEl.innerHTML = `<span style="color: #ef4444">●</span> Coverage Gaps (${gapLabel}) &nbsp; <span style="color: #eab308">●</span> Limited Coverage (${limitedLabel})`;

    // Draw limited coverage first (yellow) so gaps appear on top
    limitedWithCoords.forEach(c => {
      L.circleMarker([c.lat, c.lng], {
        radius: 9,
        fillColor: '#eab308',
        color: '#ca8a04',
        weight: 2,
        fillOpacity: 0.7
      })
      .bindPopup(`<b>⚠️ LIMITED COVERAGE</b><br>${c.city || '--'}, ${c.state || ''}<br>ZIP: ${c.zip}<br>Searches: ${c.count}<br>Suppliers: ${c.supplierCount || '1-2'}`)
      .addTo(map);
    });

    // Draw coverage gaps on top (red)
    gapsWithCoords.forEach(c => {
      L.circleMarker([c.lat, c.lng], {
        radius: 10,
        fillColor: '#ef4444',
        color: '#dc2626',
        weight: 2,
        fillOpacity: 0.7
      })
      .bindPopup(`<b>🚫 NO COVERAGE</b><br>${c.city || '--'}, ${c.state || ''}<br>ZIP: ${c.zip}<br>Searches: ${c.count}<br>Suppliers: 0`)
      .addTo(map);
    });

    const allPoints = [...gapsWithCoords, ...limitedWithCoords];
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }

  } else if (view === 'suppliers') {
    // Show supplier locations
    statsEl.innerHTML = `<span style="color: #22c55e">●</span> Has Price &nbsp; <span style="color: #f59e0b">●</span> No Price &nbsp; <span style="color: #9ca3af">●</span> Inactive`;

    // Fetch supplier locations
    api('/suppliers/map').then(data => {
      if (!data.suppliers || data.suppliers.length === 0) {
        statsEl.innerHTML += ' &nbsp; (No geocoded suppliers yet)';
        return;
      }

      data.suppliers.forEach(supplier => {
        const color = !supplier.active ? '#9ca3af' : supplier.price ? '#22c55e' : '#f59e0b';

        const marker = L.circleMarker([supplier.lat, supplier.lng], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        });

        const priceHtml = supplier.price
          ? `$${supplier.price.toFixed(2)}/gal`
          : 'No price';

        marker.bindPopup(`
          <strong>${supplier.name}</strong><br>
          ${supplier.city}, ${supplier.state}<br>
          ${priceHtml}
        `);

        marker.addTo(map);
      });

      // Fit bounds to show all suppliers
      const validSuppliers = data.suppliers.filter(s => s.lat && s.lng);
      if (validSuppliers.length > 0) {
        const bounds = L.latLngBounds(validSuppliers.map(s => [s.lat, s.lng]));
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      statsEl.innerHTML = `<span style="color: #22c55e">●</span> Has Price &nbsp; <span style="color: #f59e0b">●</span> No Price &nbsp; <span style="color: #9ca3af">●</span> Inactive &nbsp; (${data.mapped} suppliers mapped)`;
    }).catch(err => {
      console.error('Failed to load supplier locations:', err);
      statsEl.innerHTML += ' &nbsp; (Error loading suppliers)';
    });
  }
}

// Load Health tab
async function loadHealth() {
  const loadingEl = document.getElementById('health-loading');
  const contentEl = document.getElementById('health-content');

  try {
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    const health = await api('/supplier-health');

    // Stat cards
    document.getElementById('h-active').textContent = health.backoff.active;
    document.getElementById('h-cooldown').textContent = health.backoff.cooldown;
    document.getElementById('h-phone-only').textContent = health.backoff.phoneOnly;
    document.getElementById('h-success-rate').textContent = health.successRate + '%';
    document.getElementById('h-scraped-today').textContent = health.scrapedToday;

    // Color code cooldown/phone-only
    const cooldownEl = document.getElementById('h-cooldown');
    if (health.backoff.cooldown > 0) cooldownEl.style.color = 'var(--warning)';
    else cooldownEl.style.color = '';
    const phoneOnlyEl = document.getElementById('h-phone-only');
    if (health.backoff.phoneOnly > 0) phoneOnlyEl.style.color = 'var(--danger)';
    else phoneOnlyEl.style.color = '';

    // Success rate color
    const rateEl = document.getElementById('h-success-rate');
    if (health.successRate >= 90) rateEl.style.color = 'var(--success)';
    else if (health.successRate >= 70) rateEl.style.color = 'var(--warning)';
    else rateEl.style.color = 'var(--danger)';

    // Price freshness bar
    renderFreshnessBar(health.priceFreshness);

    // Failure breakdown
    document.getElementById('h-total-failures').textContent = health.recentFailures.total;
    document.getElementById('h-suppliers-affected').textContent = health.recentFailures.suppliersWithFailures;
    document.getElementById('h-last-scrape').textContent = timeAgo(health.lastScrapeAt);

    // Alerts
    renderHealthAlerts(health.newCooldowns, health.atRisk);

    // Stale suppliers table
    renderStaleSuppliers(health.staleSuppliers);

    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load health:', error);
    if (loadingEl) loadingEl.innerHTML = 'Failed to load health data.';
  }
}

function renderFreshnessBar(freshness) {
  const bar = document.getElementById('freshness-bar');
  const legend = document.getElementById('freshness-legend');
  if (!bar || !legend) return;

  const total = freshness.fresh + freshness.aging + freshness.stale + freshness.expired;
  if (total === 0) {
    bar.innerHTML = '<div class="freshness-segment empty" style="flex:1">No data</div>';
    legend.innerHTML = '';
    return;
  }

  const segments = [
    { key: 'fresh', label: '<24h', count: freshness.fresh, color: 'var(--success)' },
    { key: 'aging', label: '24-48h', count: freshness.aging, color: 'var(--warning)' },
    { key: 'stale', label: '48h-7d', count: freshness.stale, color: '#f97316' },
    { key: 'expired', label: '>7d', count: freshness.expired, color: 'var(--danger)' }
  ];

  bar.innerHTML = segments
    .filter(s => s.count > 0)
    .map(s => {
      const pct = ((s.count / total) * 100).toFixed(1);
      return `<div class="freshness-segment" style="flex:${s.count};background:${s.color}" title="${s.label}: ${s.count}">${s.count}</div>`;
    })
    .join('');

  legend.innerHTML = segments
    .map(s => `<span class="freshness-legend-item"><span class="freshness-dot" style="background:${s.color}"></span>${s.label}: ${s.count}</span>`)
    .join('');
}

function renderHealthAlerts(cooldowns, atRisk) {
  const container = document.getElementById('health-alerts');
  if (!container) return;

  const items = [];

  if (cooldowns.length > 0) {
    cooldowns.forEach(s => {
      const statusLabel = s.status === 'phone_only' ? 'Phone-only' : 'Cooldown';
      items.push(`<div class="alert-item alert-danger">
        <span class="alert-icon">&#9888;</span>
        <span><strong>${s.name}</strong> (${s.city}, ${s.state}) entered ${statusLabel} &mdash; ${s.consecutiveFailures} consecutive failures</span>
      </div>`);
    });
  }

  if (atRisk.length > 0) {
    atRisk.forEach(s => {
      items.push(`<div class="alert-item alert-warning">
        <span class="alert-icon">&#9888;</span>
        <span><strong>${s.name}</strong> (${s.city}, ${s.state}) at risk &mdash; 1 failure from cooldown</span>
      </div>`);
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="alert-empty"><span class="alert-check">&#10003;</span> All clear — no new cooldowns or at-risk suppliers</div>';
  } else {
    container.innerHTML = items.join('');
  }
}

function renderStaleSuppliers(stale) {
  const tbody = document.getElementById('stale-suppliers-body');
  const countEl = document.getElementById('h-stale-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = stale.length;

  if (stale.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No stale suppliers</td></tr>';
    return;
  }

  tbody.innerHTML = stale.map(s => `<tr>
    <td>${s.name}</td>
    <td>${s.city}, ${s.state}</td>
    <td>${s.lastPrice ? '$' + s.lastPrice.toFixed(2) : '--'}</td>
    <td>${formatDate(s.lastUpdated)}</td>
    <td>${s.daysSinceUpdate}d</td>
    <td>${s.website ? '<a href="' + s.website + '" target="_blank" rel="noopener">Visit</a>' : '--'}</td>
  </tr>`).join('');
}

// Load Settings tab
async function loadSettings() {
  try {
    const scraperHealth = await api('/scraper-health');

    // Data health summary
    document.getElementById('health-last-scrape').textContent = timeAgo(scraperHealth.lastRun);
    document.getElementById('health-prices').textContent = `${scraperHealth.withPrices}/${scraperHealth.totalSuppliers}`;
    document.getElementById('health-stale').textContent = scraperHealth.stale?.length || 0;

  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// ── CC Intelligence — single orchestrator, 3 parallel calls ──
async function loadCCIntelligence() {
  if (currentTab !== 'command-center') return;
  if (typeof Chart === 'undefined') return;
  const token = ++ccRenderToken;
  await Promise.all([
    loadCCDemandTrend(token),
    loadCCChannelMix(token),
    loadCCPriceIntel(token)
  ]);
}

async function loadCCDemandTrend(token) {
  try {
    if (currentTab !== 'command-center') return;
    const data = await cachedApi(`/searches?days=${currentDays}`);
    if (currentTab !== 'command-center' || token !== ccRenderToken) return;
    const ctx = document.getElementById('cc-demand-trend-chart');
    if (!ctx || !ctx.isConnected) return;
    if (!data || !Array.isArray(data.daily) || !data.daily.length) {
      setEmptyState('cc-demand-trend-chart', 'cc-demand-empty', 'No search data for selected period', true);
      return;
    }
    setEmptyState('cc-demand-trend-chart', 'cc-demand-empty', '', false);
    if (ccDemandTrendChart) ccDemandTrendChart.destroy();
    const periodEl = document.getElementById('cc-demand-period');
    if (periodEl) periodEl.textContent = `${currentDays}d`;
    ccDemandTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.daily.map(d => d.date),
        datasets: [{
          label: 'Searches',
          data: data.daily.map(d => d.searches),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    });
  } catch (e) { console.error('[CC] Demand trend error:', e.message); }
}

async function loadCCChannelMix(token) {
  try {
    if (currentTab !== 'command-center') return;
    const data = await cachedApi(`/clicks?days=${currentDays}`);
    if (currentTab !== 'command-center' || token !== ccRenderToken) return;
    const ctx = document.getElementById('cc-channel-mix-chart');
    if (!ctx || !ctx.isConnected) return;
    if (!data || !Array.isArray(data.daily) || !data.daily.length) {
      setEmptyState('cc-channel-mix-chart', 'cc-channel-empty', 'No click data for selected period', true);
      return;
    }
    setEmptyState('cc-channel-mix-chart', 'cc-channel-empty', '', false);
    if (ccChannelMixChart) ccChannelMixChart.destroy();
    const periodEl = document.getElementById('cc-channel-period');
    if (periodEl) periodEl.textContent = `${currentDays}d`;
    const totalCalls = data.daily.reduce((s, d) => s + (Number(d.calls) || 0), 0);
    const totalWeb = data.daily.reduce((s, d) => s + (Number(d.websites) || 0), 0);
    const callShare = totalCalls + totalWeb > 0 ? ((totalCalls / (totalCalls + totalWeb)) * 100).toFixed(1) : '0';
    const statsEl = document.getElementById('cc-channel-stats');
    if (statsEl) statsEl.textContent = `Call Share: ${callShare}%`;
    ccChannelMixChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.daily.map(d => d.date),
        datasets: [
          { label: 'Calls', data: data.daily.map(d => d.calls), borderColor: '#8b5cf6', fill: false, pointRadius: 0, borderWidth: 2 },
          { label: 'Website', data: data.daily.map(d => d.websites), borderColor: '#2563eb', fill: false, pointRadius: 0, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
      }
    });
  } catch (e) { console.error('[CC] Channel mix error:', e.message); }
}

async function loadCCPriceIntel(token) {
  try {
    if (currentTab !== 'command-center') return;
    const data = await cachedApi(`/prices?days=${currentDays}`);
    if (currentTab !== 'command-center' || token !== ccRenderToken) return;
    const ctx = document.getElementById('cc-price-band-chart');
    if (!ctx || !ctx.isConnected) return;
    if (!data || !Array.isArray(data.trends) || !data.trends.length) {
      setEmptyState('cc-price-band-chart', 'cc-price-empty', 'No price data for selected period', true);
      return;
    }
    setEmptyState('cc-price-band-chart', 'cc-price-empty', '', false);
    if (ccPriceBandChart) ccPriceBandChart.destroy();
    const latest = data.trends[data.trends.length - 1];
    const spread = latest ? (latest.maxPrice - latest.minPrice).toFixed(2) : '--';
    const statsEl = document.getElementById('cc-price-intel-stats');
    if (statsEl) statsEl.innerHTML = `<span class="cc-price-stat">Avg: <strong>$${latest?.avgPrice?.toFixed(2) || '--'}</strong></span><span class="cc-price-stat">Spread: <strong>$${spread}</strong></span>`;
    ccPriceBandChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.trends.map(t => t.date),
        datasets: [
          { label: 'Min', data: data.trends.map(t => t.minPrice), borderColor: '#22c55e', fill: false, borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5 },
          { label: 'Max', data: data.trends.map(t => t.maxPrice), borderColor: '#ef4444', backgroundColor: 'rgba(0,0,0,0.04)', fill: '-1', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5 },
          { label: 'Avg', data: data.trends.map(t => t.avgPrice), borderColor: '#2563eb', fill: false, pointRadius: 0, borderWidth: 2.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: false } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
      }
    });
  } catch (e) { console.error('[CC] Price intel error:', e.message); }
}

// Price Spread by State (Coverage tab)
async function loadCoverageSpread() {
  const token = ++coverageRenderToken;
  try {
    if (currentTab !== 'coverage') return;
    const data = await cachedApi(`/prices?days=${currentDays}`);
    if (currentTab !== 'coverage' || token !== coverageRenderToken) return;
    const ctx = document.getElementById('coverage-spread-chart');
    if (!ctx || !ctx.isConnected) return;
    if (!data || !Array.isArray(data.priceSpread) || !data.priceSpread.length) {
      setEmptyState('coverage-spread-chart', 'coverage-spread-empty', 'No price spread data available', true);
      return;
    }
    setEmptyState('coverage-spread-chart', 'coverage-spread-empty', '', false);
    if (coverageSpreadChart) coverageSpreadChart.destroy();
    const sorted = [...data.priceSpread].sort((a, b) => b.spread - a.spread);
    coverageSpreadChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(p => `${p.state} (${p.supplierCount})`),
        datasets: [{ label: 'Spread ($)', data: sorted.map(p => p.spread), backgroundColor: '#2563eb' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        scales: { x: { beginAtZero: true, title: { display: true, text: 'Price Spread ($)' } } }
      }
    });
  } catch (e) { console.error('[Coverage] Price spread error:', e.message); }
}

// Load dashboard
async function loadDashboard() {
  await Promise.all([
    loadCommandCenter(),
    updateClaimsBadge()
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

// Initialize form event listeners (CSP-compliant)
document.addEventListener('DOMContentLoaded', function() {
  const addSupplierForm = document.getElementById('add-supplier-form');
  if (addSupplierForm) {
    addSupplierForm.addEventListener('submit', createSupplier);
  }
});

// ========================================
// CLAIMS TAB
// ========================================

let claimsCurrentStatus = 'pending';
let claimsData = [];
let claimsPendingRejectId = null;
let claimsExpandedRow = null;

// Simple toast notification for claims tab
function showToast(message, type) {
  const existing = document.querySelector('.claims-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'claims-toast';
  toast.style.cssText = `position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;color:#fff;background:${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// Claims API helper (uses /api/admin/supplier-claims, not dashboard API)
async function claimsApi(path) {
  const res = await fetch(`/api/admin/supplier-claims${path}`, {
    headers: {
      'X-Admin-Token': authToken,
      'Authorization': `Bearer ${authToken}`
    }
  });
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

// Fetch pending badge count on dashboard load
async function updateClaimsBadge() {
  try {
    const data = await claimsApi('?status=pending');
    const pending = data?.counts?.pending || 0;
    const badge = document.getElementById('claims-badge');
    if (badge) {
      badge.textContent = pending;
      badge.style.display = pending > 0 ? 'inline-flex' : 'none';
    }
  } catch (e) {
    // Non-critical
  }
}

async function loadClaims() {
  const loading = document.getElementById('claims-loading');
  const table = document.getElementById('claims-table');
  const empty = document.getElementById('claims-empty');
  if (!loading) return;

  loading.style.display = 'block';
  if (table) table.style.display = 'none';
  if (empty) empty.style.display = 'none';

  try {
    const data = await claimsApi(`?status=${claimsCurrentStatus}`);

    if (!data.success) throw new Error(data.error || 'Failed to load claims');

    claimsData = data.claims || [];
    const counts = data.counts || {};

    // Update status tab counts
    const pendingEl = document.getElementById('claims-count-pending');
    const verifiedEl = document.getElementById('claims-count-verified');
    const rejectedEl = document.getElementById('claims-count-rejected');
    if (pendingEl) pendingEl.textContent = counts.pending || 0;
    if (verifiedEl) verifiedEl.textContent = counts.verified || 0;
    if (rejectedEl) rejectedEl.textContent = counts.rejected || 0;

    // Update sidebar badge
    const badge = document.getElementById('claims-badge');
    if (badge) {
      const p = counts.pending || 0;
      badge.textContent = p;
      badge.style.display = p > 0 ? 'inline-flex' : 'none';
    }

    loading.style.display = 'none';

    if (claimsData.length === 0) {
      if (empty) empty.style.display = 'block';
    } else {
      renderClaimsTable();
      if (table) table.style.display = 'table';
    }

    // Load funnel metrics
    loadClaimsFunnel();

  } catch (error) {
    console.error('Claims load error:', error);
    loading.style.display = 'none';
    if (empty) {
      empty.textContent = 'Failed to load claims';
      empty.style.display = 'block';
    }
  }
}

async function loadClaimsFunnel() {
  const el = document.getElementById('claims-funnel');
  if (!el) return;

  try {
    const data = await claimsApi('/funnel').catch(() => null);

    if (!data || !data.success) {
      // Funnel endpoint not available — show counts from claim data instead
      el.innerHTML = '<span class="funnel-loading">Funnel metrics available after first claims</span>';
      return;
    }

    const { views, submits, verifies } = data;

    if (views === 0 && submits === 0 && verifies === 0) {
      el.innerHTML = '<span class="funnel-loading">No claim funnel data yet</span>';
      return;
    }

    const submitRate = views > 0 ? Math.round((submits / views) * 100) : 0;
    const approvalRate = submits > 0 ? Math.round((verifies / submits) * 100) : 0;

    el.innerHTML = `
      <span>Claims:</span>
      <span class="funnel-stat">${views} page views</span>
      <span class="funnel-sep">&rarr;</span>
      <span class="funnel-stat">${submits} submitted</span>
      <span class="funnel-sep">&rarr;</span>
      <span class="funnel-stat">${verifies} verified</span>
      ${submitRate > 0 ? `<span class="funnel-rate">(${submitRate}% submit, ${approvalRate}% approval)</span>` : ''}
      <span style="color:var(--gray-400)">Last 30 days</span>
    `;
  } catch (e) {
    el.innerHTML = '<span class="funnel-loading">Funnel data unavailable</span>';
  }
}

function renderClaimsTable() {
  const tbody = document.getElementById('claims-body');
  if (!tbody) return;

  claimsExpandedRow = null;

  tbody.innerHTML = claimsData.map(claim => {
    const date = new Date(claim.submittedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });

    let actionsHtml = '';
    if (claimsCurrentStatus === 'pending') {
      actionsHtml = `
        <button class="btn-verify" data-action="verify" data-claim-id="${claim.id}">&#10003; Verify</button>
        <button class="btn-reject" data-action="reject" data-claim-id="${claim.id}">&#10007; Reject</button>
      `;
    } else if (claimsCurrentStatus === 'verified') {
      actionsHtml = `
        <button class="btn-regen" data-action="regenerate" data-claim-id="${claim.id}">&#128279; New Link</button>
        <button class="btn-revoke" data-action="revoke" data-claim-id="${claim.id}">&#9888; Revoke</button>
      `;
    } else if (claimsCurrentStatus === 'rejected') {
      const reason = claim.rejectionReason || 'No reason provided';
      actionsHtml = `<span style="color:var(--gray-500); font-size:12px;">${reason}</span>`;
    }

    const slug = claim.supplier?.slug || '';

    return `
      <tr class="claim-row" data-claim-id="${claim.id}">
        <td>
          <span class="claim-supplier-name">${claim.supplier.name}</span><br>
          <span class="claim-supplier-loc">${claim.supplier.city || ''}, ${claim.supplier.state || ''}</span>
        </td>
        <td class="claim-phone">
          ${claim.supplier.phone ? `<a href="tel:${claim.supplier.phone}">${claim.supplier.phone}</a>` : '<span style="color:var(--gray-400)">No phone</span>'}
        </td>
        <td>
          <span class="claim-claimant-name">${claim.claimant.name}</span><br>
          <span class="claim-claimant-email">${claim.claimant.email}</span>
          ${claim.claimant.phone ? `<br><span class="claim-claimant-email">${claim.claimant.phone}</span>` : ''}
          <br><span class="claim-claimant-role">${claim.claimant.role || 'Not specified'}</span>
        </td>
        <td>${date}</td>
        <td class="claim-actions">${actionsHtml}</td>
      </tr>
    `;
  }).join('');
}

// Claim actions
async function claimsVerify(claimId) {
  if (!confirm('Verify this claim? This will generate a magic link and email it to the supplier.')) return;

  try {
    const data = await fetch(`/api/admin/supplier-claims/${claimId}/verify`, {
      method: 'POST',
      headers: { 'X-Admin-Token': authToken, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
    }).then(r => r.json());

    if (!data.success) throw new Error(data.error || 'Failed to verify');

    // Log audit event
    try {
      await fetch('/api/admin/supplier-claims/' + claimId + '/audit', {
        method: 'POST',
        headers: { 'X-Admin-Token': authToken, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_verified' })
      }).catch(() => {});
    } catch (e) {}

    showToast(`Verified! ${data.magicLinkSent ? 'Email sent.' : 'Email failed - copy link manually.'}`, 'success');
    if (data.magicLinkUrl) console.log('Magic link:', data.magicLinkUrl);
    loadClaims();
  } catch (error) {
    showToast(error.message || 'Failed to verify claim', 'error');
  }
}

function claimsOpenRejectModal(claimId) {
  claimsPendingRejectId = claimId;
  const modal = document.getElementById('claims-reject-modal');
  const textarea = document.getElementById('claims-reject-reason');
  if (modal) modal.classList.remove('hidden');
  if (textarea) textarea.value = '';
}

function claimsCloseRejectModal() {
  claimsPendingRejectId = null;
  const modal = document.getElementById('claims-reject-modal');
  if (modal) modal.classList.add('hidden');
}

async function claimsConfirmReject() {
  if (!claimsPendingRejectId) return;
  const reason = document.getElementById('claims-reject-reason')?.value.trim();
  if (!reason) {
    showToast('A rejection reason is required', 'error');
    return;
  }

  try {
    const data = await fetch(`/api/admin/supplier-claims/${claimsPendingRejectId}/reject`, {
      method: 'POST',
      headers: { 'X-Admin-Token': authToken, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    }).then(r => r.json());

    if (!data.success) throw new Error(data.error || 'Failed to reject');
    claimsCloseRejectModal();
    showToast('Claim rejected', 'success');
    loadClaims();
  } catch (error) {
    showToast(error.message || 'Failed to reject claim', 'error');
  }
}

async function claimsRevoke(claimId) {
  if (!confirm('Revoke the magic link? The supplier will no longer be able to update prices.')) return;

  try {
    const data = await fetch(`/api/admin/supplier-claims/${claimId}/revoke`, {
      method: 'POST',
      headers: { 'X-Admin-Token': authToken, 'Authorization': `Bearer ${authToken}` }
    }).then(r => r.json());

    if (!data.success) throw new Error(data.error || 'Failed to revoke');
    showToast(`Revoked ${data.revokedCount} link(s)`, 'success');
    loadClaims();
  } catch (error) {
    showToast(error.message || 'Failed to revoke link', 'error');
  }
}

async function claimsRegenerate(claimId) {
  if (!confirm('Generate a new magic link? This will invalidate the old link.')) return;

  try {
    const data = await fetch(`/api/admin/supplier-claims/${claimId}/regenerate`, {
      method: 'POST',
      headers: { 'X-Admin-Token': authToken, 'Authorization': `Bearer ${authToken}` }
    }).then(r => r.json());

    if (!data.success) throw new Error(data.error || 'Failed to regenerate');
    showToast(`New link generated. ${data.magicLinkSent ? 'Email sent.' : 'Email failed.'}`, 'success');
    if (data.magicLinkUrl) console.log('New magic link:', data.magicLinkUrl);
  } catch (error) {
    showToast(error.message || 'Failed to regenerate link', 'error');
  }
}

// Event delegation for claims tab
document.addEventListener('DOMContentLoaded', function() {
  // Status tabs
  const statusTabs = document.getElementById('claims-status-tabs');
  if (statusTabs) {
    statusTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.claims-status-tab');
      if (!tab || !tab.dataset.status) return;
      claimsCurrentStatus = tab.dataset.status;
      document.querySelectorAll('.claims-status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadClaims();
    });
  }

  // Action buttons (event delegation)
  const claimsBody = document.getElementById('claims-body');
  if (claimsBody) {
    claimsBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const claimId = btn.dataset.claimId;
      switch (action) {
        case 'verify': claimsVerify(claimId); break;
        case 'reject': claimsOpenRejectModal(claimId); break;
        case 'regenerate': claimsRegenerate(claimId); break;
        case 'revoke': claimsRevoke(claimId); break;
      }
    });
  }

  // Reject modal buttons
  const rejectCancel = document.getElementById('claims-reject-cancel');
  const rejectConfirm = document.getElementById('claims-reject-confirm');
  if (rejectCancel) rejectCancel.addEventListener('click', claimsCloseRejectModal);
  if (rejectConfirm) rejectConfirm.addEventListener('click', claimsConfirmReject);

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') claimsCloseRejectModal();
  });
});
