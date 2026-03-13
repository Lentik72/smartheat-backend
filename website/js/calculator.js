/**
 * Heating Cost Calculator — client-side logic
 * Calls /api/v1/heating-cost?zip=XXXXX and renders results.
 */
(function () {
  'use strict';

  const zipInput = document.getElementById('calc-zip');
  const submitBtn = document.getElementById('calc-submit');
  const errorEl = document.getElementById('calc-error');
  const loadingEl = document.getElementById('calc-loading');
  const resultsEl = document.getElementById('calc-results');
  const relatedEl = document.getElementById('calc-related');
  const locationEl = document.getElementById('calc-location');
  const verdictEl = document.getElementById('calc-verdict');
  const tableBody = document.getElementById('calc-table-body');
  const paybackEl = document.getElementById('calc-payback');
  const ctaOilLink = document.getElementById('calc-cta-oil-link');
  const featuresEl = document.getElementById('calc-features');
  const emailInput = document.getElementById('calc-email');
  const emailBtn = document.getElementById('calc-email-submit');
  const emailStatus = document.getElementById('calc-email-status');
  const honeypot = document.getElementById('calc-hp');

  if (!zipInput || !submitBtn) return;

  var lastOilPrice = null; // stored from most recent calculation

  // Fuel display config — order determines table row order
  const FUEL_ORDER = ['heating-oil', 'natural-gas', 'heat-pump', 'electric-baseboard'];
  const FUEL_ICONS = {
    'heating-oil': '\uD83D\uDEE2\uFE0F',
    'natural-gas': '\uD83D\uDD25',
    'heat-pump': '\u2744\uFE0F',
    'electric-baseboard': '\u26A1',
    'propane': '\uD83D\uDD35',
  };

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    loadingEl.hidden = true;
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function formatDollars(n) {
    return '$' + n.toLocaleString('en-US');
  }

  async function calculate() {
    const zip = zipInput.value.trim();
    if (!/^\d{5}$/.test(zip)) {
      showError('Please enter a valid 5-digit ZIP code.');
      return;
    }

    clearError();
    resultsEl.hidden = true;
    relatedEl.hidden = true;
    if (featuresEl) featuresEl.hidden = true;
    loadingEl.hidden = false;
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/v1/heating-cost?zip=' + encodeURIComponent(zip));
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Unable to calculate for this ZIP code.');
        return;
      }

      render(data);
    } catch (e) {
      showError('Network error. Please try again.');
    } finally {
      loadingEl.hidden = true;
      submitBtn.disabled = false;
    }
  }

  function render(data) {
    // Location header
    locationEl.innerHTML = '<strong>' + esc(data.county) + ' County, ' + esc(data.state) + '</strong>' +
      ' <span class="calc-hdd">' + data.hdd.toLocaleString() + ' heating degree days/year</span>';

    // Store oil price for email signup
    lastOilPrice = data.fuels['heating-oil'] ? data.fuels['heating-oil'].price : null;

    // Table rows
    tableBody.innerHTML = '';
    var cheapestKey = data.cheapest;
    var fuels = data.fuels;

    FUEL_ORDER.forEach(function (key) {
      var f = fuels[key];
      if (!f) return;
      var isCheapest = key === cheapestKey;
      var tr = document.createElement('tr');
      if (isCheapest) tr.className = 'calc-row-cheapest';

      tr.innerHTML =
        '<td class="calc-fuel-name">' +
          (FUEL_ICONS[key] || '') + ' ' + esc(f.label) +
          (isCheapest ? ' <span class="calc-badge">Cheapest</span>' : '') +
        '</td>' +
        '<td>' + formatPrice(f.price, f.unit) + '</td>' +
        '<td><strong>' + formatDollars(f.annualCost) + '</strong>/yr</td>' +
        '<td>' + formatDollars(f.monthlyCost) + '/mo</td>' +
        '<td>$' + f.costPerMMBTU.toFixed(1) + '</td>';
      tableBody.appendChild(tr);
    });

    // Verdict
    if (cheapestKey && fuels[cheapestKey]) {
      var cheapest = fuels[cheapestKey];
      verdictEl.innerHTML =
        '<div class="calc-verdict-inner">' +
          '<span class="calc-verdict-label">Cheapest option for ' + esc(data.county) + ' County</span>' +
          '<span class="calc-verdict-fuel">' + (FUEL_ICONS[cheapestKey] || '') + ' ' + esc(cheapest.label) + '</span>' +
          '<span class="calc-verdict-cost">' + formatDollars(cheapest.annualCost) + '/year estimated</span>' +
        '</div>';
      verdictEl.hidden = false;
    } else {
      verdictEl.hidden = true;
    }

    // Payback
    if (data.payback && data.payback.years) {
      var oilCost = fuels['heating-oil'] ? fuels['heating-oil'].annualCost : 0;
      var hpCost = fuels['heat-pump'] ? fuels['heat-pump'].annualCost : 0;
      var annualSavings = oilCost - hpCost;
      var defaultInstall = 11000;

      function renderPayback(installCost) {
        var years = annualSavings > 0 ? (installCost / annualSavings) : null;
        var yearsText = years !== null ? years.toFixed(1) + ' years' : 'N/A';
        var yearsClass = years !== null && years <= 7 ? 'calc-payback-good' : years !== null && years <= 12 ? 'calc-payback-ok' : 'calc-payback-long';

        paybackEl.innerHTML =
          '<h3>Heat Pump Payback Period</h3>' +
          '<p>Switching from heating oil to a heat pump (mini-split) could save approximately <strong>' +
          formatDollars(Math.round(annualSavings)) + '/year</strong> in your area.</p>' +
          '<div class="calc-slider-row">' +
            '<label for="calc-install-slider">Installed cost (equipment + labor):</label>' +
            '<div class="calc-slider-controls">' +
              '<input type="range" id="calc-install-slider" min="5000" max="20000" step="500" value="' + installCost + '">' +
              '<span id="calc-install-value" class="calc-slider-value">' + formatDollars(installCost) + '</span>' +
            '</div>' +
          '</div>' +
          '<p>Estimated payback: <span class="calc-payback-years ' + yearsClass + '">' + yearsText + '</span></p>' +
          '<p class="calc-note">Federal tax credits (up to $2,000) and state rebates can reduce your out-of-pocket cost significantly.</p>';

        var slider = document.getElementById('calc-install-slider');
        if (slider) {
          slider.addEventListener('input', function() {
            renderPayback(parseInt(this.value, 10));
          });
        }
      }

      renderPayback(defaultInstall);
      paybackEl.hidden = false;
    } else {
      paybackEl.hidden = true;
    }

    // CTA link
    var stateSlug = data.state ? data.state.toLowerCase() : '';
    if (stateSlug) {
      ctaOilLink.href = '/prices/' + stateSlug + '/';
    }

    resultsEl.hidden = false;
    relatedEl.hidden = false;

    // Track calculator usage
    if (window.gtag) {
      window.gtag('event', 'calculator_used', {
        event_category: 'engagement',
        event_label: data.zip,
        value: data.fuels['heating-oil'] ? data.fuels['heating-oil'].annualCost : 0,
      });
    }
  }

  function formatPrice(price, unit) {
    return '$' + price.toFixed(2) + '/' + esc(unit);
  }

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s || '';
    return el.innerHTML;
  }

  // Event listeners
  submitBtn.addEventListener('click', calculate);
  zipInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') calculate();
  });

  // Email capture
  if (emailBtn) {
    emailBtn.addEventListener('click', function () {
      if (honeypot && honeypot.value) return; // bot trap

      var email = emailInput.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailStatus.textContent = 'Please enter a valid email address.';
        emailStatus.className = 'calc-email-status calc-email-error';
        emailStatus.hidden = false;
        return;
      }

      var zip = zipInput.value.trim();
      var threshold = lastOilPrice || 4.00;

      fetch('/api/price-alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          zip_code: zip,
          threshold_price: threshold,
          source_page: 'calculator'
        }),
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Failed'); });
        emailStatus.textContent = 'Thanks! We\'ll notify you when oil prices drop in your area.';
        emailStatus.className = 'calc-email-status calc-email-success';
        emailStatus.hidden = false;
        emailBtn.disabled = true;
      }).catch(function (err) {
        emailStatus.textContent = err.message || 'Something went wrong. Try again later.';
        emailStatus.className = 'calc-email-status calc-email-error';
        emailStatus.hidden = false;
      });
    });
  }

  // Auto-fill ZIP from URL param
  var params = new URLSearchParams(window.location.search);
  var urlZip = params.get('zip');
  if (urlZip && /^\d{5}$/.test(urlZip)) {
    zipInput.value = urlZip;
    calculate();
  }
})();
