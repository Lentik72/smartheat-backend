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
      throw new Error(error.error || 'API error');
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
    if (target === 'searches') loadSearches();
    if (target === 'clicks') loadClicks();
    if (target === 'ios-app') loadIOSApp();
    if (target === 'prices') loadPrices();
    if (target === 'map') loadMap();
    if (target === 'scrapers') loadScrapers();
    if (target === 'suppliers') loadSuppliers();
  });
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

// Load overview
async function loadOverview() {
  try {
    const data = await api(`/overview?days=${currentDays}`);

    // Cards
    document.getElementById('total-clicks').textContent = data.website.totalClicks;
    document.getElementById('clicks-breakdown').textContent =
      `${data.website.callClicks} calls / ${data.website.websiteClicks} websites`;
    document.getElementById('clicks-freshness').textContent = timeAgo(data.dataFreshness.supplier_clicks);

    document.getElementById('scraper-status').textContent =
      `${data.scraping.suppliersWithPrices}/${data.scraping.suppliersTotal}`;
    document.getElementById('scraper-stale').textContent = `${data.scraping.staleCount} stale`;
    document.getElementById('scraper-freshness').textContent = timeAgo(data.dataFreshness.scrape_runs);

    if (data.scraping.staleCount > 5) {
      document.getElementById('card-scraper').classList.add('status-warning');
    }

    document.getElementById('waitlist-total').textContent = data.waitlist.total;
    document.getElementById('waitlist-recent').textContent = `+${data.waitlist.last7Days} this week`;
    document.getElementById('waitlist-freshness').textContent = timeAgo(data.dataFreshness.supplier_clicks);

    document.getElementById('pwa-installs').textContent = data.pwa.installs;
    document.getElementById('pwa-rate').textContent = `${data.pwa.conversionRate}% conversion`;
    document.getElementById('pwa-freshness').textContent = timeAgo(data.dataFreshness.supplier_clicks);

    // Top supplier
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
    document.getElementById('edit-price').value = formatPrice(s.current_price);
    document.getElementById('edit-price-date').value = timeAgo(s.price_updated_at);

    // Click stats
    const stats = data.clickStats;
    document.getElementById('edit-click-stats').innerHTML = `
      Total: ${stats.total} | Last 7d: ${stats.last7Days} | Calls: ${stats.calls} | Websites: ${stats.websites}
    `;

    document.getElementById('supplier-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load supplier:', error);
    alert('Failed to load supplier details');
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
  const updates = {
    name: document.getElementById('edit-name').value,
    phone: document.getElementById('edit-phone').value,
    website: document.getElementById('edit-website').value,
    state: document.getElementById('edit-state').value,
    city: document.getElementById('edit-city').value,
    is_active: document.getElementById('edit-active').checked,
    allow_price_display: document.getElementById('edit-price-display').checked,
    scraping_enabled: document.getElementById('edit-scraping').checked
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
    const data = await api(`/ios-app?days=${currentDays}`);

    // Summary stats
    document.getElementById('ios-total').textContent = data.summary.totalEngagements.toLocaleString();
    document.getElementById('ios-users').textContent = data.summary.uniqueUsers.toLocaleString();
    document.getElementById('ios-calls').textContent = data.summary.calls.toLocaleString();
    document.getElementById('ios-views').textContent = data.summary.views.toLocaleString();

    // Daily chart
    const ctx = document.getElementById('ios-chart').getContext('2d');
    if (iosChart) iosChart.destroy();

    iosChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.daily.map(d => d.date),
        datasets: [{
          label: 'Engagements',
          data: data.daily.map(d => d.engagements),
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

    // Top suppliers table
    const tbody = document.getElementById('ios-suppliers-body');
    tbody.innerHTML = '';

    if (data.bySupplier.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No app engagement data yet</td></tr>';
    } else {
      data.bySupplier.forEach(s => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${s.name}</td>
          <td>${s.views}</td>
          <td>${s.calls}</td>
          <td>${s.engagements}</td>
        `;
        tbody.appendChild(row);
      });
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

// Load dashboard
async function loadDashboard() {
  await Promise.all([
    loadOverview(),
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
