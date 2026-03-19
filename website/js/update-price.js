/**
 * Supplier Price Update Page — Redirect to Dashboard
 *
 * This page has been superseded by supplier-dashboard.html.
 * Any supplier visiting the old update-price.html URL (bookmarks, old emails)
 * gets redirected to the dashboard with their token preserved.
 */

document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
        window.location.replace('/supplier-dashboard.html?token=' + encodeURIComponent(token));
    } else {
        // No token — show the error state that's already in the HTML
        var loading = document.getElementById('loading-state');
        var errorEl = document.getElementById('error-state');
        var errorMsg = document.getElementById('error-message');
        if (loading) loading.style.display = 'none';
        if (errorMsg) errorMsg.textContent = 'No access token provided. Please use the link from your email.';
        if (errorEl) errorEl.style.display = 'block';
    }
});
