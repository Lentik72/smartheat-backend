/**
 * Prices Page Personalization
 * - Welcome back for returning users
 * - IP-based location detection
 * - State tab highlighting
 */
(function() {
    const COVERED_STATES = {
        'NY': { name: 'New York', path: 'prices/ny/', suppliers: 91 },
        'CT': { name: 'Connecticut', path: 'prices/ct/', suppliers: 33 },
        'MA': { name: 'Massachusetts', path: 'prices/ma/', suppliers: 50 },
        'NJ': { name: 'New Jersey', path: 'prices/nj/', suppliers: 15 },
        'PA': { name: 'Pennsylvania', path: 'prices/pa/', suppliers: 10 },
        'NH': { name: 'New Hampshire', path: 'prices/nh/', suppliers: 19 },
        'RI': { name: 'Rhode Island', path: 'prices/ri/', suppliers: 6 },
        'ME': { name: 'Maine', path: 'prices/me/', suppliers: 5 },
        'MD': { name: 'Maryland', path: 'prices/md/', suppliers: 8 },
        'DE': { name: 'Delaware', path: 'prices/de/', suppliers: 3 },
        'VA': { name: 'Virginia', path: 'prices/va/', suppliers: 6 },
        'AK': { name: 'Alaska', path: 'prices/ak/', suppliers: 3 }
    };

    // Check for returning user with saved ZIP
    function checkLastSearch() {
        try {
            const lastSearch = localStorage.getItem('homeheat_last_zip');
            if (lastSearch) {
                const data = JSON.parse(lastSearch);
                if (data.zip && data.location) {
                    showWelcomeBack(data.zip, data.location, data.state);
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    // Show welcome back message
    function showWelcomeBack(zip, location, state) {
        const bar = document.getElementById('personalization-bar');
        const welcomeBack = document.getElementById('welcome-back');
        const lastZipLink = document.getElementById('last-zip-link');

        if (bar && welcomeBack && lastZipLink) {
            lastZipLink.textContent = `${zip} (${location})`;
            lastZipLink.href = `?zip=${zip}`;
            lastZipLink.onclick = function(e) {
                e.preventDefault();
                document.getElementById('zip-input').value = zip;
                document.getElementById('zip-form').dispatchEvent(new Event('submit'));
            };
            welcomeBack.style.display = 'inline-flex';
            bar.style.display = 'block';

            // Highlight state tab if known
            if (state && COVERED_STATES[state]) {
                highlightStateTab(state);
            }
        }
    }

    // Show near you message (IP-based)
    function showNearYou(state, region, supplierCount) {
        const bar = document.getElementById('personalization-bar');
        const nearYou = document.getElementById('near-you');
        const nearYouLink = document.getElementById('near-you-link');
        const nearYouCount = document.getElementById('near-you-count');

        if (bar && nearYou && nearYouLink) {
            nearYouLink.textContent = region || COVERED_STATES[state]?.name || state;
            nearYouLink.href = COVERED_STATES[state]?.path || '#';
            nearYouCount.textContent = supplierCount || COVERED_STATES[state]?.suppliers || '10+';
            nearYou.style.display = 'inline-flex';
            bar.style.display = 'block';

            highlightStateTab(state);
        }
    }

    // Highlight state tab
    function highlightStateTab(state) {
        const tabs = document.querySelectorAll('.state-tab');
        const stateInfo = COVERED_STATES[state];
        if (!stateInfo) return;

        tabs.forEach(tab => {
            if (tab.href.includes(stateInfo.path)) {
                tab.classList.add('active');
                // Scroll tab into view on mobile
                tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        });
    }

    // IP Geolocation (using free service, no API key needed)
    async function detectLocation() {
        try {
            // Use ipapi.co free tier (no API key, 1000 req/day)
            const response = await fetch('https://ipapi.co/json/', {
                timeout: 3000,
                cache: 'default'
            });
            if (!response.ok) return null;

            const data = await response.json();
            if (data.region_code && COVERED_STATES[data.region_code]) {
                return {
                    state: data.region_code,
                    city: data.city,
                    region: data.city
                };
            }
        } catch (e) {
            // Silently fail - personalization is optional
        }
        return null;
    }

    // Initialize personalization
    async function init() {
        // Priority 1: Check for returning user
        if (checkLastSearch()) {
            return;
        }

        // Priority 2: Try IP geolocation
        const location = await detectLocation();
        if (location) {
            showNearYou(location.state, location.city);
        }
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Save ZIP searches for returning user experience
    window.addEventListener('homeheat:zip-searched', function(e) {
        if (e.detail && e.detail.zip && e.detail.location) {
            try {
                localStorage.setItem('homeheat_last_zip', JSON.stringify({
                    zip: e.detail.zip,
                    location: e.detail.location,
                    state: e.detail.state,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }
    });

})();
