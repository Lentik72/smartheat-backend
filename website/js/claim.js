/**
 * Claim Page Frontend
 * Reads demand data from DOM data attributes (server-rendered).
 * Handles form validation, anti-bot timing, and claim submission.
 */
(function() {
  'use strict';

  const stats = document.getElementById('demand-stats');
  if (!stats) return;

  const slug = stats.dataset.slug;
  const renderTs = parseInt(stats.dataset.ts, 10) * 1000; // server ts in seconds → ms

  const form = document.getElementById('claim-form');
  if (!form) return; // Already claimed — no form rendered

  const submitBtn = document.getElementById('claim-submit');
  const errorEl = document.getElementById('form-error');
  const successEl = document.getElementById('claim-success');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Claim My Listing';
  }

  function hideError() {
    errorEl.style.display = 'none';
  }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    hideError();

    const name = form.claimantName.value.trim();
    const email = form.claimantEmail.value.trim();
    const phone = form.claimantPhone.value.trim();
    const role = form.claimantRole.value;
    const honeypot = form.website_url.value;

    // Validation
    if (!name) return showError('Please enter your name.');
    if (!email) return showError('Please enter your email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');

    // Anti-bot timing check
    const now = Date.now();
    const elapsed = now - renderTs;
    if (elapsed < 3000) return showError('Please wait a moment before submitting.');
    if (elapsed > 1800000) {
      return showError('This page has expired. Please refresh and try again.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/supplier-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          claimantName: name,
          claimantEmail: email,
          claimantPhone: phone || null,
          claimantRole: role,
          website_url: honeypot,
          ts: Math.floor(renderTs / 1000)
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Show success, hide form + benefits
        form.closest('.claim-form-card').style.display = 'none';
        const benefitsCard = document.querySelector('.claim-benefits-card');
        if (benefitsCard) benefitsCard.style.display = 'none';
        successEl.style.display = 'block';
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (res.status === 429) {
        showError('Too many attempts. Please try again tomorrow.');
      } else {
        showError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      showError('Connection error. Please check your internet and try again.');
    }
  });
})();
