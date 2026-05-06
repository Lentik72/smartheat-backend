/**
 * Prices Page Personalization
 * - Welcome back for returning users
 * - IP-based location detection
 * - State tab highlighting
 */
(function() {
    // Covered states for IP-geo gating + state-tab highlighting + state-page links.
    // The hardcoded supplier counts that previously lived here were removed in heatingoil-e56z —
    // they drifted from live values and the bar mislabeled state-level counts as if they were
    // the displayed county's count. The bar now just confirms area, no count.
    const COVERED_STATES = {
        'NY': { name: 'New York', path: 'prices/ny/' },
        'CT': { name: 'Connecticut', path: 'prices/ct/' },
        'MA': { name: 'Massachusetts', path: 'prices/ma/' },
        'NJ': { name: 'New Jersey', path: 'prices/nj/' },
        'PA': { name: 'Pennsylvania', path: 'prices/pa/' },
        'NH': { name: 'New Hampshire', path: 'prices/nh/' },
        'RI': { name: 'Rhode Island', path: 'prices/ri/' },
        'ME': { name: 'Maine', path: 'prices/me/' },
        'MD': { name: 'Maryland', path: 'prices/md/' },
        'DE': { name: 'Delaware', path: 'prices/de/' },
        'VA': { name: 'Virginia', path: 'prices/va/' },
        'AK': { name: 'Alaska', path: 'prices/ak/' }
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

    // Pre-search IP-geo mode — "Prices near {county}" (no count, see e56z note above).
    function showNearYou(state, region) {
        const bar = document.getElementById('personalization-bar');
        const nearYou = document.getElementById('near-you');

        if (!bar || !nearYou) return;

        if (region) {
            var countyDisplayNames = {
                'New York County': 'Manhattan',
                'Kings County': 'Brooklyn',
                'Queens County': 'Queens',
                'Bronx County': 'The Bronx',
                'Richmond County': 'Staten Island'
            };
            region = countyDisplayNames[region] || region.replace(/\s+County$/i, '').trim();
        }

        const areaName = region || COVERED_STATES[state]?.name || state;
        const areaHref = COVERED_STATES[state]?.path || '#';
        renderNearYou('Prices near ', { text: areaName, href: areaHref });

        nearYou.style.display = 'inline-flex';
        bar.style.display = 'block';

        highlightStateTab(state);
    }

    // Post-search mode — confirms what the user actually searched, not what we guessed.
    // detail: { zip, city, county, count, covered }
    function showSearchResult(detail) {
        const bar = document.getElementById('personalization-bar');
        const nearYou = document.getElementById('near-you');
        const welcomeBack = document.getElementById('welcome-back');

        if (!bar || !nearYou || !detail || !detail.zip) return;

        if (welcomeBack) welcomeBack.style.display = 'none';

        if (!detail.covered) {
            // Acknowledge the search even when nothing was found — hiding feels like a bug.
            renderNearYou('No suppliers found in ', { text: detail.zip, href: null }, ' yet');
        } else {
            const cityZip = detail.city
                ? `${detail.city} (${detail.zip})`
                : `ZIP ${detail.zip}`;
            // Link target: if we know the searched ZIP's state, link to that state page;
            // otherwise let the link be inert (no useful destination).
            const state = detail.state || guessStateFromZip(detail.zip);
            const href = state && COVERED_STATES[state]
                ? '/' + COVERED_STATES[state].path
                : null;
            renderNearYou('Showing prices for ', { text: cityZip, href: href });
            if (state) highlightStateTab(state);
        }

        nearYou.style.display = 'inline-flex';
        bar.style.display = 'block';
    }

    // Build the #near-you content safely (no innerHTML / XSS risk).
    function renderNearYou(prefix, link, postfix) {
        const nearYou = document.getElementById('near-you');
        if (!nearYou) return;
        nearYou.replaceChildren();

        const pin = document.createElement('span');
        pin.textContent = '📍';

        const wrapper = document.createElement('span');
        wrapper.append(document.createTextNode(prefix));

        if (link.href) {
            const a = document.createElement('a');
            a.id = 'near-you-link';
            a.href = link.href;
            a.textContent = link.text;
            wrapper.append(a);
        } else {
            const strong = document.createElement('strong');
            strong.textContent = link.text;
            wrapper.append(strong);
        }

        if (postfix) {
            wrapper.append(document.createTextNode(postfix));
        }

        nearYou.append(pin, wrapper);
    }

    // Quick ZIP-prefix → state guess, mirrors the (more comprehensive) map in home.js.
    // Sufficient for picking a state-page link for the bar's anchor.
    function guessStateFromZip(zip) {
        if (!zip || zip.length < 3) return null;
        const p3 = zip.substring(0, 3);
        if (['028','029'].includes(p3)) return 'RI';
        if (['197','198','199'].includes(p3)) return 'DE';
        const map = {
            '01':'MA','02':'MA','03':'NH','04':'ME','05':'VT','06':'CT',
            '07':'NJ','08':'NJ','10':'NY','11':'NY','12':'NY','13':'NY',
            '14':'NY','15':'PA','16':'PA','17':'PA','18':'PA','19':'PA',
            '20':'DC','21':'MD','22':'VA','23':'VA'
        };
        return map[zip.substring(0, 2)] || null;
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
                const tabContainer = tab.closest('.state-tabs');
                if (tabContainer) {
                    const targetLeft = tab.offsetLeft - tabContainer.offsetWidth / 2 + tab.offsetWidth / 2;
                    tabContainer.scrollTo({ left: targetLeft, behavior: 'smooth' });
                }
            }
        });
    }

    // IP Geolocation (uses Cloudflare headers via our API - no external calls)
    // Returns county for more accurate display (IP geolocation is imprecise at city level)
    async function detectLocation() {
        try {
            const response = await fetch('/api/geo');
            if (!response.ok) return null;

            const data = await response.json();
            if (data.supported && data.state && COVERED_STATES[data.state]) {
                return {
                    state: data.state,
                    county: data.county,
                    region: data.county  // Display county instead of city
                };
            }
        } catch (e) {
            // Silently fail - personalization is optional
        }
        return null;
    }

    // Initialize personalization
    async function init() {
        // If the URL carries an explicit ?zip=, the user has already told us what
        // they want to see — the search results below answer "what's near my ZIP."
        // Skipping personalization here prevents the IP-geo bar from contradicting
        // the search (e.g., ?zip=10001 with the visitor IP geolocating to
        // Westchester would render "Prices near Westchester · 91 suppliers" above
        // 18 actual results from the NYC metro). heatingoil-rzmk.
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('zip')) {
            return;
        }

        // Priority 1: Check for returning user
        if (checkLastSearch()) {
            return;
        }

        // Priority 2: Try IP geolocation
        const location = await detectLocation();
        if (location) {
            showNearYou(location.state, location.county);
        }
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // After a ZIP submit on /prices, prices.js dispatches this event so the bar
    // confirms what the user actually searched (heatingoil-nb3h) and so we can
    // remember their last search for the welcome-back flow.
    window.addEventListener('homeheat:zip-searched', function(e) {
        if (!e.detail || !e.detail.zip) return;

        // Update the bar to reflect the user's explicit search.
        showSearchResult(e.detail);

        // Persist for returning-user welcome-back next visit.
        // Prefer "city, state" if we have it; fall back to county or empty.
        try {
            const locationLabel = e.detail.city && e.detail.state
                ? `${e.detail.city}, ${e.detail.state}`
                : (e.detail.county || e.detail.location || '');
            localStorage.setItem('homeheat_last_zip', JSON.stringify({
                zip: e.detail.zip,
                location: locationLabel,
                state: e.detail.state,
                timestamp: Date.now()
            }));
        } catch (err) {}
    });

})();
