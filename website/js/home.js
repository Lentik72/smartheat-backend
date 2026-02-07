/**
 * HomeHeat Homepage Scripts
 * - Android waitlist form
 * - Live stats from API
 * - Hero CTA tracking
 * - Screenshot scroll behavior
 */
(function() {
    // Android waitlist form
    var androidForm = document.getElementById('android-waitlist-form');
    if (androidForm) {
        androidForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var email = document.getElementById('android-email').value;
            var zip_code = document.getElementById('android-zip').value;
            var form = document.getElementById('android-waitlist-form');
            var success = document.getElementById('android-waitlist-success');

            try {
                var res = await fetch('/api/waitlist/android', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, zip_code: zip_code })
                });

                if (res.ok) {
                    form.style.display = 'none';
                    success.style.display = 'block';
                    if (typeof gtag === 'function') {
                        gtag('event', 'android_waitlist_signup', { zip: zip_code || 'none' });
                    }
                }
            } catch (err) {}
        });
    }

    // Fetch live stats from /api/market/pulse
    async function fetchLiveStats() {
        try {
            var res = await fetch('/api/market/pulse');
            if (res.ok) {
                var data = await res.json();
                if (data.supplierCount) {
                    document.getElementById('stat-suppliers').textContent = data.supplierCount + '+';
                }
                if (data.stateCount) {
                    document.getElementById('stat-states').textContent = data.stateCount;
                }
                if (data.priceAvg) {
                    var avg = '$' + parseFloat(data.priceAvg).toFixed(2);
                    document.getElementById('stat-avg-price').textContent = avg;
                    document.getElementById('teaser-avg-price').textContent = avg;
                }
            }
        } catch (e) {}
    }
    fetchLiveStats();

    // Track hero App Store download click
    var heroDownload = document.getElementById('hero-download-cta');
    if (heroDownload) {
        heroDownload.addEventListener('click', function() {
            if (typeof gtag === 'function') {
                gtag('event', 'app_download_click', { location: 'hero' });
            }
        });
    }

    // Track "See prices in your area" click
    var pricesCta = document.getElementById('prices-cta');
    if (pricesCta) {
        pricesCta.addEventListener('click', function() {
            if (typeof gtag === 'function') {
                gtag('event', 'prices_cta_click', { location: 'prices_teaser' });
            }
        });
    }

    // Screenshot scroll - drag to scroll on desktop + fade indicators
    var scrollContainer = document.getElementById('screenshot-scroll');
    var scrollWrapper = document.getElementById('screenshot-wrapper');

    if (scrollContainer && scrollWrapper) {
        var isDown = false;
        var startX;
        var scrollLeft;

        function updateFades() {
            var maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
            if (scrollContainer.scrollLeft > 10) {
                scrollWrapper.classList.add('scrolled-left');
            } else {
                scrollWrapper.classList.remove('scrolled-left');
            }
            if (scrollContainer.scrollLeft >= maxScroll - 10) {
                scrollWrapper.classList.add('scrolled-right');
            } else {
                scrollWrapper.classList.remove('scrolled-right');
            }
        }

        scrollContainer.addEventListener('scroll', updateFades);
        updateFades();

        scrollContainer.addEventListener('mousedown', function(e) {
            isDown = true;
            startX = e.pageX - scrollContainer.offsetLeft;
            scrollLeft = scrollContainer.scrollLeft;
        });

        scrollContainer.addEventListener('mouseleave', function() { isDown = false; });
        scrollContainer.addEventListener('mouseup', function() { isDown = false; });

        scrollContainer.addEventListener('mousemove', function(e) {
            if (!isDown) return;
            e.preventDefault();
            var x = e.pageX - scrollContainer.offsetLeft;
            var walk = (x - startX) * 1.5;
            scrollContainer.scrollLeft = scrollLeft - walk;
        });
    }
})();
