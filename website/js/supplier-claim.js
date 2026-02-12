/**
 * For Suppliers Page - Personalized Claim Experience
 * Handles ?supplier= parameter to show supplier-specific messaging
 */
(function() {
    const params = new URLSearchParams(window.location.search);
    const supplierSlug = params.get('supplier');

    if (supplierSlug) {
        // Convert slug to display name (domino-fuel -> Domino Fuel)
        const displayName = supplierSlug
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        // Show personalized section
        const personalized = document.getElementById('claim-personalized');
        const nameEl = document.getElementById('supplier-display-name');
        const profileLink = document.getElementById('profile-link');

        if (personalized && nameEl && profileLink) {
            nameEl.textContent = displayName;
            profileLink.href = '/supplier/' + supplierSlug;
            personalized.classList.remove('hidden');
        }

        // Update page title
        document.title = 'Claim ' + displayName + ' - HomeHeat';
    }
})();
