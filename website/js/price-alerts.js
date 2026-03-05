// website/js/price-alerts.js
// Price alert email capture — shared by prices.html and elite pages

(function () {
  'use strict';

  var DISPOSABLE_DOMAINS = [
    'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
    'throwaway.email', 'yopmail.com', 'sharklasers.com', 'guerrillamail.info',
    'grr.la', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net',
    'trashmail.com', 'trashmail.me', 'trashmail.net', 'dispostable.com',
    'maildrop.cc', 'mailnesia.com', 'tempail.com', 'tempmailaddress.com',
    'getairmail.com', 'fakeinbox.com', 'mailcatch.com', 'mintemail.com'
  ];

  function isDisposableEmail(email) {
    var domain = email.toLowerCase().split('@')[1];
    return DISPOSABLE_DOMAINS.indexOf(domain) !== -1;
  }

  function getUrlParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function storageKey(zip) {
    return 'homeheat_alert_set_' + zip;
  }

  function getSavedAlert(zip) {
    try {
      var raw = localStorage.getItem(storageKey(zip));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveAlert(zip, threshold) {
    try {
      localStorage.setItem(storageKey(zip), JSON.stringify({ threshold: threshold, ts: Date.now() }));
    } catch (e) { /* ignore */ }
  }

  function calcSavings(currentPrice, threshold) {
    var diff = currentPrice - threshold;
    if (diff <= 0) return null;
    return Math.round(diff * 275);
  }

  /**
   * Initialize the price alert form.
   * @param {string} containerSelector - CSS selector for the container element
   * @param {object} options
   * @param {string} options.zip - 5-digit ZIP code (or 3-digit prefix for elite pages)
   * @param {number} options.lowestPrice - Current lowest price in the area
   * @param {number} [options.defaultThreshold] - Default threshold price
   */
  window.initPriceAlertForm = function (containerSelector, options) {
    var container = document.querySelector(containerSelector);
    if (!container) return;

    var zip = options.zip || '';
    var lowestPrice = options.lowestPrice;
    var defaultThreshold = options.defaultThreshold || Math.max((lowestPrice - 0.15), 1.50);
    var isPartialZip = zip.length < 5;
    var isUpdateMode = getUrlParam('update_alert') === '1';

    // Don't show form if no price data
    if (!lowestPrice || lowestPrice <= 0) return;

    // Check if returning visitor with existing alert
    var saved = !isPartialZip ? getSavedAlert(zip) : null;

    if (saved && !isUpdateMode) {
      // Show "alert active" state
      container.innerHTML =
        '<div class="price-alert-inner">' +
          '<span class="price-alert-check">&#10003;</span> ' +
          'Price alert active for ' + zip + '. ' +
          '<a href="#" class="price-alert-update-link">Update threshold &rarr;</a>' +
        '</div>';
      container.style.display = '';
      container.querySelector('.price-alert-update-link').addEventListener('click', function (e) {
        e.preventDefault();
        renderForm(container, zip, lowestPrice, saved.threshold, isPartialZip);
      });
      return;
    }

    renderForm(container, zip, lowestPrice, isUpdateMode && saved ? saved.threshold : defaultThreshold, isPartialZip);

    // Auto-scroll if update_alert=1
    if (isUpdateMode) {
      setTimeout(function () { container.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    }
  };

  function renderForm(container, zip, lowestPrice, threshold, isPartialZip) {
    var roundedThreshold = Math.round(threshold * 100) / 100;
    var savings = calcSavings(lowestPrice, roundedThreshold);

    container.innerHTML =
      '<div class="price-alert-inner">' +
        '<div class="price-alert-title">Get alerted when prices drop</div>' +
        '<form class="price-alert-form">' +
          (isPartialZip
            ? '<div class="price-alert-row">' +
                '<label class="price-alert-label">ZIP code</label>' +
                '<input type="text" class="price-alert-zip" maxlength="5" pattern="\\d{5}" placeholder="' + zip + 'XX" value="' + zip + '" required>' +
              '</div>'
            : '<input type="hidden" class="price-alert-zip" value="' + zip + '">') +
          '<div class="price-alert-row">' +
            '<label class="price-alert-label">Alert me below</label>' +
            '<div class="price-alert-input-wrap">' +
              '<span class="price-alert-dollar">$</span>' +
              '<input type="number" class="price-alert-threshold" step="0.01" min="2.00" max="6.00" value="' + roundedThreshold.toFixed(2) + '" required>' +
            '</div>' +
          '</div>' +
          '<div class="price-alert-row">' +
            '<input type="email" class="price-alert-email" placeholder="your@email.com" required>' +
          '</div>' +
          '<button type="submit" class="price-alert-btn">Set Alert &rarr;</button>' +
        '</form>' +
        '<div class="price-alert-meta">' +
          (savings ? 'Save ~$' + savings + ' on a 275-gal fill &middot; ' : '') +
          'No spam, only price drops.' +
        '</div>' +
        '<div class="price-alert-error" style="display:none;"></div>' +
        '<div class="price-alert-warning" style="display:none;"></div>' +
      '</div>';

    container.style.display = '';

    var form = container.querySelector('.price-alert-form');
    var thresholdInput = container.querySelector('.price-alert-threshold');
    var metaEl = container.querySelector('.price-alert-meta');
    var warningEl = container.querySelector('.price-alert-warning');
    var errorEl = container.querySelector('.price-alert-error');

    // Dynamic savings estimate
    thresholdInput.addEventListener('input', function () {
      var val = parseFloat(thresholdInput.value);
      if (isNaN(val)) return;
      var s = calcSavings(lowestPrice, val);
      var parts = [];
      if (s && s > 0) parts.push('Save ~$' + s + ' on a 275-gal fill');
      parts.push('No spam, only price drops.');
      metaEl.textContent = parts.join(' \u00b7 ');

      // Soft warning for unrealistic thresholds
      if (val < lowestPrice - 1.00) {
        warningEl.textContent = "That price hasn't been seen in this area recently \u2014 we'll still save your alert.";
        warningEl.style.display = '';
      } else {
        warningEl.style.display = 'none';
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.style.display = 'none';

      var emailInput = container.querySelector('.price-alert-email');
      var zipInput = container.querySelector('.price-alert-zip');
      var email = emailInput.value.trim();
      var formZip = zipInput.value.trim();
      var formThreshold = parseFloat(thresholdInput.value);

      // Client-side validation
      if (!/^\d{5}$/.test(formZip)) {
        showError(errorEl, 'Please enter a valid 5-digit ZIP code.');
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        showError(errorEl, 'Please enter a valid email address.');
        return;
      }
      if (isDisposableEmail(email)) {
        showError(errorEl, 'Please use a non-disposable email address.');
        return;
      }
      if (isNaN(formThreshold) || formThreshold < 2.00 || formThreshold > 6.00) {
        showError(errorEl, 'Threshold must be between $2.00 and $6.00.');
        return;
      }

      var btn = container.querySelector('.price-alert-btn');
      btn.disabled = true;
      btn.textContent = 'Setting alert...';

      fetch('/api/price-alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          zip_code: formZip,
          threshold_price: formThreshold,
          source_page: window.location.pathname,
          utm_source: getUrlParam('utm_source'),
          utm_campaign: getUrlParam('utm_campaign')
        })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.ok && result.data.success) {
            saveAlert(formZip, formThreshold);
            container.innerHTML =
              '<div class="price-alert-inner price-alert-success">' +
                '<span class="price-alert-check">&#10003;</span> Alert set for ZIP ' + formZip +
                ' &mdash; we\'ll email you when prices drop below $' + formThreshold.toFixed(2) + '.' +
                '<div class="price-alert-meta">We check prices daily. No spam, no newsletters.</div>' +
              '</div>';
          } else {
            showError(errorEl, result.data.error || 'Something went wrong. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Set Alert \u2192';
          }
        })
        .catch(function () {
          showError(errorEl, 'Network error. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Set Alert \u2192';
        });
    });
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = '';
  }

  // Auto-init for elite pages that use data attributes
  document.addEventListener('DOMContentLoaded', function () {
    var cards = document.querySelectorAll('.price-alert-card[data-price]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var price = parseFloat(card.getAttribute('data-price'));
      var cardZip = card.getAttribute('data-zip') || '';
      if (price > 0) {
        // Give each card a unique ID for targeting
        var id = 'price-alert-' + i;
        card.id = id;
        window.initPriceAlertForm('#' + id, {
          zip: cardZip,
          lowestPrice: price,
          defaultThreshold: Math.max(price - 0.15, 1.50)
        });
      }
    }
  });
})();
