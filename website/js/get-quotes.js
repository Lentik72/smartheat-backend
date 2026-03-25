// website/js/get-quotes.js
// "Get Quotes" form — consumer requests delivery quotes from local suppliers
// Part of Smart Quote Request system (heatingoil-h1fy)

(function () {
  'use strict';

  /**
   * Initialize the Get Quotes form.
   * @param {string} containerSelector - CSS selector for the container
   * @param {object} options
   * @param {string} options.zip - 5-digit ZIP code
   * @param {number} options.supplierCount - Number of available suppliers
   */
  window.initGetQuotesForm = function (containerSelector, options) {
    var container = document.querySelector(containerSelector);
    if (!container) return;

    var zip = options.zip || '';
    var supplierCount = options.supplierCount || 0;
    var mode = options.mode || 'routed'; // 'routed' = opted-in suppliers, 'cold' = no opted-in
    var coldFallbackPhones = options.fallback_phones || null;
    var formRenderedAt = Date.now();
    var requestId = null;

    // Check if after business hours (7am-7pm ET)
    var etHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hour12: false
    }));
    var isAfterHours = etHour < 7 || etHour >= 19;

    container.style.display = 'block';
    renderForm();

    function renderForm() {
      if (mode === 'cold') {
        renderColdForm();
      } else {
        renderRoutedForm();
      }
    }

    function renderRoutedForm() {
      var afterHoursBanner = isAfterHours
        ? '<div class="get-quotes-after-hours">' +
            'Outside business hours. Requests will be sent at 6 AM ET.' +
          '</div>'
        : '';

      container.innerHTML =
        '<div class="get-quotes-inner">' +
          afterHoursBanner +
          '<div class="get-quotes-title">Get quotes from ' + supplierCount + ' local supplier' + (supplierCount !== 1 ? 's' : '') + '</div>' +
          renderFormFields() +
          '<div class="get-quotes-meta">No spam, no account required.</div>' +
        '</div>';

      attachFormHandlers();
    }

    function renderColdForm() {
      var coldPhoneList = coldFallbackPhones ? buildPhoneList(coldFallbackPhones) : '';

      container.innerHTML =
        '<div class="get-quotes-inner">' +
          '<div class="get-quotes-title">Best available suppliers near you</div>' +
          coldPhoneList +
          '<div style="font-size:0.72rem; color:#999; margin:4px 0 16px;">Confirm prices when calling.</div>' +
          '<div style="border-top:1px solid #f0ebe7; padding-top:14px; margin-top:4px;">' +
            '<div style="font-size:0.85rem; color:#666; margin-bottom:8px;">Prefer to get calls instead? Leave your details below.</div>' +
            renderFormFields() +
          '</div>' +
        '</div>';

      attachFormHandlers();
    }

    function renderFormFields() {
      return '<form class="get-quotes-form">' +
            '<div class="get-quotes-fields">' +
              '<div class="get-quotes-field">' +
                '<label class="get-quotes-label">Your name</label>' +
                '<input type="text" class="get-quotes-name" maxlength="100" required autocomplete="name">' +
              '</div>' +
              '<div class="get-quotes-field">' +
                '<label class="get-quotes-label">Phone</label>' +
                '<input type="tel" class="get-quotes-phone" maxlength="14" required autocomplete="tel" ' +
                  'placeholder="(914) 555-1234" inputmode="tel">' +
              '</div>' +
              '<div class="get-quotes-field">' +
                '<label class="get-quotes-label">Approx. gallons</label>' +
                '<input type="number" class="get-quotes-gallons" min="75" max="500" value="150" required inputmode="numeric">' +
              '</div>' +
            '</div>' +
            '<div class="get-quotes-consent">' +
              '<label><input type="checkbox" class="get-quotes-consent-check" required> ' +
                'I consent to sharing my info with up to 3 local suppliers. ' +
                '<a href="/privacy" target="_blank">Privacy Policy</a>' +
              '</label>' +
            '</div>' +
            '<input type="text" name="website_url" style="display:none" tabindex="-1" autocomplete="off">' +
            '<div class="get-quotes-error" style="display:none;"></div>' +
            '<button type="submit" class="get-quotes-btn">' + (mode === 'cold' ? 'Submit Request &rarr;' : 'Get Quotes &rarr;') + '</button>' +
          '</form>';
    }

    function attachFormHandlers() {

      var form = container.querySelector('.get-quotes-form');
      form.addEventListener('submit', handleSubmit);

      // Auto-format phone as (XXX) XXX-XXXX while typing
      var phoneInput = container.querySelector('.get-quotes-phone');
      phoneInput.addEventListener('input', function () {
        var digits = this.value.replace(/\D/g, '');
        // Strip leading 1 (US country code)
        if (digits.length > 10 && digits[0] === '1') digits = digits.slice(1);
        // Cap at 10 digits
        if (digits.length > 10) digits = digits.slice(0, 10);
        // Format as (XXX) XXX-XXXX
        if (digits.length >= 7) {
          this.value = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
        } else if (digits.length >= 4) {
          this.value = '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
        } else if (digits.length > 0) {
          this.value = '(' + digits;
        }
      });

      // Track form engagement
      var formStarted = false;
      form.addEventListener('focusin', function (e) {
        if (!formStarted && e.target.tagName === 'INPUT') {
          formStarted = true;
          if (typeof gtag === 'function') {
            gtag('event', 'quote_form_started', { zip: zip });
          }
        }
      });
    }

    function handleSubmit(e) {
      e.preventDefault();
      var form = container.querySelector('.get-quotes-form');
      var errorEl = container.querySelector('.get-quotes-error');
      var btn = container.querySelector('.get-quotes-btn');
      errorEl.style.display = 'none';

      var name = container.querySelector('.get-quotes-name').value.trim();
      var phone = container.querySelector('.get-quotes-phone').value.trim();
      var gallons = container.querySelector('.get-quotes-gallons').value;
      var honeypot = form.querySelector('[name="website_url"]').value;
      var consentChecked = container.querySelector('.get-quotes-consent-check').checked;

      var tankLevel = 'not_sure';

      // Validation
      if (!name) return showError(errorEl, 'Please enter your name.');
      var phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length > 10 && phoneDigits[0] === '1') phoneDigits = phoneDigits.slice(1);
      if (phoneDigits.length !== 10) return showError(errorEl, 'Please enter a valid 10-digit US phone number.');
      // Block premium/toll numbers (900, 976) and non-geographic (555)
      var areaCode = phoneDigits.slice(0, 3);
      if (areaCode === '900' || areaCode === '976' || areaCode === '555') {
        return showError(errorEl, 'Please enter a standard US mobile or landline number.');
      }
      if (!gallons || parseInt(gallons) < 75) return showError(errorEl, 'Minimum 75 gallons.');
      if (!consentChecked) return showError(errorEl, 'Please agree to the terms to continue.');

      btn.disabled = true;
      btn.textContent = 'Sending code...';

      fetch('/api/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumer_name: name,
          consumer_phone: phone,
          consumer_zip: zip,
          gallons_requested: parseInt(gallons),
          tank_level: tankLevel,
          source_page: window.location.pathname + window.location.search,
          honeypot: honeypot,
          form_rendered_at: formRenderedAt
        })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok || result.data.error) {
            showError(errorEl, result.data.error || 'Something went wrong.');
            btn.disabled = false;
            btn.textContent = 'Get Quotes \u2192';
            return;
          }

          // No opted-in suppliers — show fallback phones directly
          if (result.data.no_suppliers_opted_in) {
            renderFallback(result.data.fallback_phones, result.data.message);
            return;
          }

          // Success — show OTP verification
          requestId = result.data.request_id;
          renderOTPForm(phone);

          if (typeof gtag === 'function') {
            gtag('event', 'quote_otp_sent', { zip: zip });
          }
        })
        .catch(function () {
          showError(errorEl, 'Network error. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Get Quotes \u2192';
        });
    }

    function renderOTPForm(phone) {
      var digits = phone.replace(/\D/g, '');
      var display = '(***) ***-' + digits.slice(-4);

      container.innerHTML =
        '<div class="get-quotes-inner">' +
          '<div class="get-quotes-title">Verify your phone</div>' +
          '<p class="get-quotes-otp-msg">We sent a 4-digit code to <strong>' + display + '</strong></p>' +
          '<form class="get-quotes-otp-form">' +
            '<div class="get-quotes-otp-input-wrap">' +
              '<input type="text" class="get-quotes-otp-input" maxlength="4" pattern="\\d{4}" ' +
                'inputmode="numeric" autocomplete="one-time-code" autofocus placeholder="0000">' +
            '</div>' +
            '<div class="get-quotes-error" style="display:none;"></div>' +
            '<button type="submit" class="get-quotes-btn">Verify &amp; Send to Suppliers</button>' +
          '</form>' +
          '<div class="get-quotes-meta">Code expires in 10 minutes.</div>' +
        '</div>';

      var otpForm = container.querySelector('.get-quotes-otp-form');
      otpForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var code = container.querySelector('.get-quotes-otp-input').value.trim();
        var errorEl = container.querySelector('.get-quotes-error');
        var btn = container.querySelector('.get-quotes-btn');
        errorEl.style.display = 'none';

        if (!code || !/^\d{4}$/.test(code)) {
          return showError(errorEl, 'Please enter the 4-digit code.');
        }

        btn.disabled = true;
        btn.textContent = 'Verifying...';

        fetch('/api/quote-request/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId, code: code })
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (result) {
            if (!result.ok || result.data.error) {
              showError(errorEl, result.data.error || 'Something went wrong.');
              btn.disabled = false;
              btn.textContent = 'Verify & Send to Suppliers';
              return;
            }

            // Zero suppliers — cold mode or after-hours
            if (result.data.suppliers_notified === 0) {
              // All paths go through renderConfirmation which handles n === 0 properly
              renderConfirmation(result.data);
              return;
            }

            // Success — show confirmation
            renderConfirmation(result.data);

            if (typeof gtag === 'function') {
              gtag('event', 'quote_dispatched', { zip: zip, suppliers_notified: result.data.suppliers_notified });
            }
          })
          .catch(function () {
            showError(errorEl, 'Network error. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Verify & Send to Suppliers';
          });
      });
    }

    function renderConfirmation(data) {
      var n = data.suppliers_notified;
      var directPhones = buildPhoneList(data.fallback_phones);

      // Cold ZIP: no suppliers dispatched, demand captured
      if (n === 0) {
        container.innerHTML =
          '<div class="get-quotes-inner">' +
            '<div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:10px; padding:16px; text-align:center; margin-bottom:12px;">' +
              '<div style="font-size:1.5rem; margin-bottom:4px;">✓</div>' +
              '<div style="font-weight:600; color:#16A34A;">Request received</div>' +
              '<div style="font-size:0.85rem; color:#666; margin-top:4px;">We\'ll notify local suppliers about demand in your area.</div>' +
            '</div>' +
            '<div style="font-weight:600; font-size:0.9rem; margin-bottom:4px;">Call suppliers directly:</div>' +
            directPhones +
          '</div>';
        return;
      }

      var notifyText = n === 1
        ? 'We\'ve notified the best available supplier in your area.'
        : 'We\'ve notified ' + n + ' local suppliers.';
      var expectText = n === 1
        ? 'Expect a call shortly.'
        : 'You may receive 1\u2013' + n + ' calls within 30\u201360 minutes.';

      if (data.is_business_hours) {
        container.innerHTML =
          '<div class="get-quotes-inner">' +
            '<div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:10px; padding:16px; text-align:center; margin-bottom:12px;">' +
              '<div style="font-size:1.5rem; margin-bottom:4px;">✓</div>' +
              '<div style="font-weight:600; color:#16A34A;">' + notifyText + '</div>' +
              '<div style="font-size:0.85rem; color:#666; margin-top:4px;">' + expectText + ' Suppliers may call from unknown numbers.</div>' +
            '</div>' +
            (directPhones ? '<div style="font-size:0.85rem; color:#666; margin-bottom:4px;">Or call directly:</div>' + directPhones : '') +
          '</div>';
      } else {
        renderAfterHours(data.fallback_phones);
      }
    }

    function renderAfterHours(phones) {
      var phoneList = buildPhoneList(phones);
      container.innerHTML =
        '<div class="get-quotes-inner get-quotes-after-hours-result">' +
          '<span class="get-quotes-check">&#10003;</span> ' +
          'It\'s currently outside business hours. Your request will be sent at 7 AM ET.' +
          '<div style="margin-top:12px; font-weight:600;">Need oil sooner? Call directly:</div>' +
          phoneList +
        '</div>';
    }

    function renderFallback(phones, message) {
      var phoneList = buildPhoneList(phones);
      container.innerHTML =
        '<div class="get-quotes-inner">' +
          '<div class="get-quotes-title">' + escapeHtml(message || 'Call suppliers directly') + '</div>' +
          phoneList +
        '</div>';
    }

    function buildPhoneList(phones) {
      if (!phones || phones.length === 0) return '';
      var html = '<div class="get-quotes-fallback-list">';
      phones.forEach(function (s) {
        var priceText = s.price ? ' — $' + Number(s.price).toFixed(2) + '/gal' : '';
        html += '<div class="get-quotes-fallback-item">' +
          '<strong>' + escapeHtml(s.name) + '</strong>' + priceText +
          '<br><a href="tel:' + escapeHtml(s.phone) + '">' + escapeHtml(s.phone) + '</a>' +
        '</div>';
      });
      html += '</div>';
      return html;
    }

    function showError(el, msg) {
      el.textContent = msg;
      el.style.display = 'block';
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };
})();
