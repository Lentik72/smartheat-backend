/**
 * Price Review Portal - JavaScript
 * V2.10.2: Magic link authentication support
 */

// Get token from URL (magic link or legacy token)
const urlParams = new URLSearchParams(window.location.search);
const MAGIC_TOKEN = urlParams.get('mltoken');  // New magic link format
const LEGACY_TOKEN = urlParams.get('token');   // Legacy format
const STORED_TOKEN = localStorage.getItem('reviewToken');

// Prefer magic link token, then legacy, then stored
const TOKEN = MAGIC_TOKEN || LEGACY_TOKEN || STORED_TOKEN || '';

// Store token for session (but magic links shouldn't be reused after expiry)
if (TOKEN && !MAGIC_TOKEN) {
  localStorage.setItem('reviewToken', TOKEN);
}

// Clear URL params after reading (cleaner URL, prevents accidental sharing)
if (MAGIC_TOKEN && window.history.replaceState) {
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

const API_BASE = window.location.origin;
const headers = { 'X-Review-Token': TOKEN, 'Content-Type': 'application/json' };

let reviewItems = [];

// Reason labels
const reasonLabels = {
  suspicious_price: 'Suspicious Price',
  scrape_blocked: 'Scrape Blocked',
  stale_price: 'Stale Data'
};

// Format relative time (e.g., "3 days ago", "2 hours ago")
function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  // Format as date for older entries
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format full timestamp
function formatTimestamp(dateString) {
  if (!dateString) return 'No data';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Load review items
async function loadItems() {
  // Check if we have a token
  if (!TOKEN) {
    document.getElementById('review-list').innerHTML = `
      <div class="empty-state">
        <h2>Authentication Required</h2>
        <p>Please use the link from your email to access this page.</p>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/price-review?token=${TOKEN}`);
    const data = await res.json();

    // Handle auth errors specifically
    if (res.status === 401) {
      let message = data.error || 'Authentication failed';
      if (message.includes('expired')) {
        message = 'This link has expired. Please check your email for a newer link.';
      }
      document.getElementById('review-list').innerHTML = `
        <div class="empty-state">
          <h2>Access Denied</h2>
          <p>${message}</p>
        </div>
      `;
      // Clear stored token if it's invalid
      localStorage.removeItem('reviewToken');
      return;
    }

    if (!data.success) {
      document.getElementById('review-list').innerHTML = `<div class="empty-state"><h2>Error</h2><p>${data.error}</p></div>`;
      return;
    }

    reviewItems = data.items;
    updateStats();
    renderItems();

  } catch (err) {
    document.getElementById('review-list').innerHTML = `<div class="empty-state"><h2>Error</h2><p>${err.message}</p></div>`;
  }
}

function updateStats() {
  document.getElementById('stat-total').textContent = reviewItems.length;
  document.getElementById('stat-suspicious').textContent = reviewItems.filter(i => i.reviewReason === 'suspicious_price').length;
  document.getElementById('stat-blocked').textContent = reviewItems.filter(i => i.reviewReason === 'scrape_blocked').length;
  document.getElementById('stat-stale').textContent = reviewItems.filter(i => i.reviewReason === 'stale_price').length;
}

function renderItems() {
  const container = document.getElementById('review-list');

  if (reviewItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>All Clear!</h2>
        <p>No sites need manual review right now.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = reviewItems.map((item, idx) => `
    <div class="review-item" id="item-${idx}">
      <div class="review-header">
        <div>
          <div class="supplier-name">${item.name}</div>
          <div class="supplier-location">${item.city}, ${item.state}</div>
        </div>
        <span class="reason-badge reason-${item.reviewReason}">${reasonLabels[item.reviewReason]}</span>
      </div>
      <div class="price-row">
        ${item.currentPrice ? `<span class="current-price">Current: <strong>$${item.currentPrice.toFixed(3)}</strong></span>` : '<span class="current-price no-price">No price on file</span>'}
        <span class="last-updated" title="${formatTimestamp(item.lastScraped)}">Updated: ${formatRelativeTime(item.lastScraped)}</span>
      </div>
      <div class="input-row">
        <a href="${item.website}" target="_blank" class="website-link">
          <span>Visit Site</span>
        </a>
        <input type="text"
               class="price-input"
               id="price-${idx}"
               placeholder="X.XXX"
               data-supplier-id="${item.supplierId}"
               data-idx="${idx}">
        <button class="submit-btn" data-idx="${idx}">Submit</button>
      </div>
    </div>
  `).join('');

  // V2.10.4: Use event listeners instead of inline onclick (CSP compliance)
  document.querySelectorAll('.submit-btn[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => submitSingle(parseInt(btn.dataset.idx)));
  });

  document.getElementById('submit-all').style.display = 'block';
}

// Submit single price
async function submitSingle(idx) {
  const input = document.getElementById(`price-${idx}`);
  const price = parseFloat(input.value);
  const supplierId = input.dataset.supplierId;

  if (isNaN(price) || price < 1.5 || price > 6) {
    showToast('Enter a valid price ($1.50 - $6.00)', 'error');
    return;
  }

  const btn = input.nextElementSibling;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch(`${API_BASE}/api/price-review/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prices: [{ supplierId, price }] })
    });
    const data = await res.json();

    if (data.success && data.results[0].success) {
      btn.textContent = 'Done';
      btn.classList.add('submitted');
      input.disabled = true;
      showToast(`Updated ${reviewItems[idx].name}: $${price.toFixed(3)}`, 'success');
    } else {
      btn.textContent = 'Submit';
      btn.disabled = false;
      showToast(data.results[0]?.error || 'Failed', 'error');
    }
  } catch (err) {
    btn.textContent = 'Submit';
    btn.disabled = false;
    showToast(err.message, 'error');
  }
}

// Submit all prices
async function submitAll() {
  const prices = [];
  document.querySelectorAll('.price-input').forEach(input => {
    const price = parseFloat(input.value);
    if (!isNaN(price) && price >= 1.5 && price <= 6 && !input.disabled) {
      prices.push({ supplierId: input.dataset.supplierId, price });
    }
  });

  if (prices.length === 0) {
    showToast('No valid prices to submit', 'error');
    return;
  }

  const btn = document.getElementById('submit-all');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const res = await fetch(`${API_BASE}/api/price-review/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prices })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Updated ${data.submitted}/${data.total} prices`, 'success');
      // Mark submitted inputs
      data.results.forEach(r => {
        if (r.success) {
          const input = document.querySelector(`[data-supplier-id="${r.supplierId}"]`);
          if (input) {
            input.disabled = true;
            const btn = input.nextElementSibling;
            btn.textContent = 'Done';
            btn.classList.add('submitted');
          }
        }
      });
    } else {
      showToast('Some prices failed', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Submit All Prices';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Submit All Prices';
    showToast(err.message, 'error');
  }
}

document.getElementById('submit-all').addEventListener('click', submitAll);

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Load on start
loadItems();
