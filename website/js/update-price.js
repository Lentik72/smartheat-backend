/**
 * Supplier Price Update Page
 * Handles magic link token validation and price submission
 */

// State
let supplierData = null;
let token = null;

// DOM Elements
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const updateInterface = document.getElementById('update-interface');
const successState = document.getElementById('success-state');
const priceForm = document.getElementById('price-update-form');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    token = urlParams.get('token');

    if (!token) {
        showError('No access token provided. Please use the link from your email.');
        return;
    }

    // Store token and clean URL for security
    try {
        sessionStorage.setItem('supplier_token', token);
        window.history.replaceState({}, document.title, '/update-price.html');
    } catch (e) {
        // sessionStorage might fail in private browsing
    }

    // Validate token and get supplier info
    await validateToken();
}

async function validateToken() {
    try {
        const response = await fetch(`/api/supplier-update?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            showError(data.error || 'Invalid or expired link.');
            return;
        }

        supplierData = data.supplier;
        renderSupplierInfo(data);
        showUpdateInterface();

    } catch (error) {
        console.error('Validation error:', error);
        showError('Could not validate your link. Please try again later.');
    }
}

function renderSupplierInfo(data) {
    const { supplier, priceHistory } = data;

    // Header
    document.getElementById('supplier-name').textContent = supplier.name;
    document.getElementById('supplier-location').textContent =
        `${supplier.city}, ${supplier.state}`;

    // Engagement stats (only show if > 0)
    if (supplier.viewsLast7Days > 0) {
        document.getElementById('view-count').textContent = supplier.viewsLast7Days;
        document.getElementById('engagement-card').style.display = 'block';
    }

    // Current price
    const priceDisplay = document.getElementById('current-price-display');
    if (supplier.currentPrice) {
        const lastUpdated = supplier.lastUpdated
            ? new Date(supplier.lastUpdated).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              })
            : 'Unknown';

        priceDisplay.innerHTML = `
            <div class="price">$${supplier.currentPrice.toFixed(3)}</div>
            <div class="price-details">
                Min ${supplier.currentMinGallons || 100} gallons · Updated ${lastUpdated}
            </div>
        `;

        // Pre-fill form with current values
        document.getElementById('new-price').value = supplier.currentPrice.toFixed(3);
        if (supplier.currentMinGallons) {
            document.getElementById('min-gallons').value = supplier.currentMinGallons;
        }
    }

    // Price history
    if (priceHistory && priceHistory.length > 1) {
        const historyList = document.getElementById('price-history-list');
        historyList.innerHTML = priceHistory.slice(0, 5).map(p => {
            const date = new Date(p.date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric'
            });
            const sourceLabel = getSourceLabel(p.source);
            return `
                <div class="price-history-item">
                    <span class="price">$${p.price.toFixed(3)}</span>
                    <span>
                        <span class="date">${date}</span>
                        <span class="source">${sourceLabel}</span>
                    </span>
                </div>
            `;
        }).join('');
        document.getElementById('price-history').style.display = 'block';
    }
}

function getSourceLabel(source) {
    const labels = {
        'supplier_direct': 'You',
        'web_scrape': 'Auto',
        'manual': 'Admin',
        'api': 'API'
    };
    return labels[source] || '';
}

// Form submission
priceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    const price = parseFloat(document.getElementById('new-price').value);
    const minGallons = parseInt(document.getElementById('min-gallons').value);
    const notes = document.getElementById('notes').value.trim();

    // Validation
    if (isNaN(price) || price < 1.50 || price > 6.00) {
        alert('Price must be between $1.50 and $6.00');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Price';
        return;
    }

    try {
        const response = await fetch('/api/supplier-update/price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                price,
                minGallons,
                notes
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to update price');
        }

        // Show success
        document.getElementById('updated-price').textContent = `$${data.price.toFixed(2)}/gal`;
        showSuccessState();

    } catch (error) {
        console.error('Update error:', error);
        alert(error.message || 'Failed to update price. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Price';
    }
});

// UI State Management
function showError(message) {
    loadingState.style.display = 'none';
    updateInterface.style.display = 'none';
    successState.style.display = 'none';
    document.getElementById('error-message').textContent = message;
    errorState.style.display = 'block';
}

function showUpdateInterface() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    successState.style.display = 'none';
    updateInterface.style.display = 'block';
}

function showSuccessState() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    updateInterface.style.display = 'none';
    successState.style.display = 'block';
}

function showUpdateForm() {
    // Reset form
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').textContent = 'Update Price';

    // Re-validate and refresh data
    validateToken();
}

// Event listener for Update Again button (CSP-compliant)
document.getElementById('update-again-btn').addEventListener('click', showUpdateForm);
