/**
 * HomeHeat Homepage Scripts
 * - ZIP code form with state routing + expansion email capture
 * - Live stats from /api/market/pulse (hero, composite, stats bar, teaser)
 * - Screenshot scroll behavior
 */
(function() {
    // ── ZIP → State routing (mirrors src/routes/community.js:getStateFromZip) ──
    function getStateFromZip(zip) {
        if (!zip || zip.length < 2) return null;
        var p3 = zip.substring(0, 3);
        if (['028','029'].includes(p3)) return 'ri';
        if (['197','198','199'].includes(p3)) return 'de';
        var map = {
            '01':'ma','02':'ma','03':'nh','04':'me','05':'vt','06':'ct',
            '07':'nj','08':'nj','10':'ny','11':'ny','12':'ny','13':'ny',
            '14':'ny','15':'pa','16':'pa','17':'pa','18':'pa','19':'pa',
            '20':'dc','21':'md','22':'va','23':'va'
        };
        return map[zip.substring(0, 2)] || null;
    }

    // Full US ZIP prefix → state name (for expansion messaging)
    var ZIP_STATE_NAMES = {
        '00':'Puerto Rico','01':'Massachusetts','02':'Massachusetts','03':'New Hampshire',
        '04':'Maine','05':'Vermont','06':'Connecticut','07':'New Jersey','08':'New Jersey',
        '09':'Military','10':'New York','11':'New York','12':'New York','13':'New York',
        '14':'New York','15':'Pennsylvania','16':'Pennsylvania','17':'Pennsylvania',
        '18':'Pennsylvania','19':'Pennsylvania','20':'Washington DC','21':'Maryland',
        '22':'Virginia','23':'Virginia','24':'West Virginia','25':'West Virginia',
        '26':'West Virginia','27':'North Carolina','28':'North Carolina','29':'South Carolina',
        '30':'Georgia','31':'Georgia','32':'Florida','33':'Florida','34':'Florida',
        '35':'Alabama','36':'Alabama','37':'Tennessee','38':'Tennessee','39':'Mississippi',
        '40':'Kentucky','41':'Kentucky','42':'Kentucky','43':'Ohio','44':'Ohio','45':'Ohio',
        '46':'Indiana','47':'Indiana','48':'Michigan','49':'Michigan','50':'Iowa',
        '51':'Iowa','52':'Iowa','53':'Wisconsin','54':'Wisconsin','55':'Minnesota',
        '56':'Montana','57':'South Dakota','58':'North Dakota','59':'Montana',
        '60':'Illinois','61':'Illinois','62':'Illinois','63':'Missouri','64':'Missouri',
        '65':'Missouri','66':'Kansas','67':'Kansas','68':'Nebraska','69':'Nebraska',
        '70':'Louisiana','71':'Louisiana','72':'Arkansas','73':'Oklahoma','74':'Oklahoma',
        '75':'Texas','76':'Texas','77':'Texas','78':'Texas','79':'Texas',
        '80':'Colorado','81':'Colorado','82':'Wyoming','83':'Idaho','84':'Utah',
        '85':'Arizona','86':'Arizona','87':'New Mexico','88':'New Mexico',
        '89':'Nevada','90':'California','91':'California','92':'California',
        '93':'California','94':'California','95':'California','96':'Hawaii',
        '97':'Oregon','98':'Washington','99':'Alaska'
    };

    // ── ZIP form handler ──
    var zipForm = document.getElementById('hero-zip-form');
    var zipInput = document.getElementById('hero-zip-input');
    var zipError = document.getElementById('hero-zip-error');
    var zipExpand = document.getElementById('hero-zip-expand');
    var expandMsg = document.getElementById('expand-msg');

    if (zipForm) {
        zipForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var zip = (zipInput.value || '').trim();
            if (!/^\d{5}$/.test(zip)) {
                zipError.textContent = 'Please enter a 5-digit ZIP code.';
                zipError.style.display = 'block';
                return;
            }
            zipError.style.display = 'none';

            var state = getStateFromZip(zip);
            var stateName = ZIP_STATE_NAMES[zip.substring(0, 2)] || 'your area';
            var covered = !!state;

            // Track
            if (typeof gtag === 'function') {
                gtag('event', 'hero_zip_submit', {
                    state: state || stateName,
                    zip_prefix: zip.substring(0, 3),
                    covered: covered
                });
            }

            if (covered) {
                // Redirect to dynamic prices page filtered by ZIP
                window.location.href = '/prices?zip=' + zip;
            } else {
                // Show expansion email capture
                zipForm.style.display = 'none';
                expandMsg.textContent = "We're not in " + stateName + " yet — get notified when we launch.";
                zipExpand.style.display = 'block';
                zipExpand.dataset.zip = zip;
                zipExpand.dataset.state = stateName;
            }
        });
    }

    // ── Expansion email capture ──
    var expandForm = document.getElementById('hero-expand-form');
    var expandEmail = document.getElementById('hero-expand-email');
    var expandSuccess = document.getElementById('expand-success');

    if (expandForm) {
        expandForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var email = (expandEmail.value || '').trim();
            if (!email) return;

            var zip = zipExpand.dataset.zip || '';
            var state = zipExpand.dataset.state || '';

            fetch('/api/waitlist/expansion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, zip: zip, state: state })
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                expandForm.style.display = 'none';
                expandSuccess.textContent = data.message || "We'll notify you when we launch in your area.";
                expandSuccess.style.display = 'block';

                if (typeof gtag === 'function') {
                    gtag('event', 'hero_expansion_signup', { state: state, zip_prefix: zip.substring(0, 3) });
                }
            })
            .catch(function() {
                expandForm.style.display = 'none';
                expandSuccess.textContent = "We'll notify you when we launch in your area.";
                expandSuccess.style.display = 'block';
            });
        });
    }

    // ── Fetch live stats with timeout + fallback ──
    var FALLBACKS = { supplierCount: '500', stateCount: '12', priceAvg: '3.50' };

    function setDynamic(id, value) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = value;
            el.classList.remove('loading-pulse');
        }
    }

    function applyData(data) {
        var count = (data.supplierCount || FALLBACKS.supplierCount) + '+';
        var states = data.stateCount || FALLBACKS.stateCount;
        var avg = '$' + parseFloat(data.priceAvg || FALLBACKS.priceAvg).toFixed(2);

        // Hero proof line (supplier count only — states not repeated here)
        setDynamic('hero-supplier-count', count);
        // Composite card
        setDynamic('composite-avg-price', avg);
        setDynamic('composite-supplier-count', count);
        // Stats bar
        setDynamic('stat-suppliers', count);
        setDynamic('stat-states', states);
        setDynamic('stat-avg-price', avg);
    }

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 3000);

    fetch('/api/market/pulse', { signal: controller.signal })
        .then(function(res) { clearTimeout(timeout); return res.json(); })
        .then(applyData)
        .catch(function() { applyData(FALLBACKS); });

    // ── Track hero CTA clicks ──
    var heroDownload = document.getElementById('hero-download-cta');
    if (heroDownload) {
        heroDownload.addEventListener('click', function() {
            if (typeof gtag === 'function') {
                gtag('event', 'app_download_click', { location: 'hero' });
            }
        });
    }

    // ── Screenshot scroll — drag to scroll on desktop + fade indicators ──
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
