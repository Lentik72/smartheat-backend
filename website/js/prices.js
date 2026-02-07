// HomeHeat Price Lookup - prices.js
// Fetches and displays heating oil prices for a given ZIP code

(function() {
  'use strict';

  // Configuration
  const API_BASE = 'https://smartheat-backend-production.up.railway.app';
  const API_ENDPOINT = '/api/v1/suppliers';

  // ZIP to County mapping (common counties for share text)
  const ZIP_COUNTY_MAP = {
    // Westchester County, NY
    '10501': 'Westchester County', '10502': 'Westchester County', '10503': 'Westchester County',
    '10504': 'Westchester County', '10505': 'Westchester County', '10506': 'Westchester County',
    '10507': 'Westchester County', '10509': 'Westchester County', '10510': 'Westchester County',
    '10514': 'Westchester County', '10516': 'Westchester County', '10517': 'Westchester County',
    '10518': 'Westchester County', '10519': 'Westchester County', '10520': 'Westchester County',
    '10521': 'Westchester County', '10522': 'Westchester County', '10523': 'Westchester County',
    '10524': 'Westchester County', '10526': 'Westchester County', '10527': 'Westchester County',
    '10528': 'Westchester County', '10530': 'Westchester County', '10532': 'Westchester County',
    '10533': 'Westchester County', '10535': 'Westchester County', '10536': 'Westchester County',
    '10537': 'Westchester County', '10538': 'Westchester County', '10540': 'Westchester County',
    '10541': 'Westchester County', '10543': 'Westchester County', '10545': 'Westchester County',
    '10546': 'Westchester County', '10547': 'Westchester County', '10548': 'Westchester County',
    '10549': 'Westchester County', '10550': 'Westchester County', '10552': 'Westchester County',
    '10553': 'Westchester County', '10560': 'Westchester County', '10562': 'Westchester County',
    '10566': 'Westchester County', '10567': 'Westchester County', '10570': 'Westchester County',
    '10573': 'Westchester County', '10576': 'Westchester County', '10577': 'Westchester County',
    '10578': 'Westchester County', '10580': 'Westchester County', '10583': 'Westchester County',
    '10588': 'Westchester County', '10589': 'Westchester County', '10590': 'Westchester County',
    '10591': 'Westchester County', '10594': 'Westchester County', '10595': 'Westchester County',
    '10597': 'Westchester County', '10598': 'Westchester County', '10601': 'Westchester County',
    '10603': 'Westchester County', '10604': 'Westchester County', '10605': 'Westchester County',
    '10606': 'Westchester County', '10607': 'Westchester County', '10701': 'Westchester County',
    '10703': 'Westchester County', '10704': 'Westchester County', '10705': 'Westchester County',
    '10706': 'Westchester County', '10707': 'Westchester County', '10708': 'Westchester County',
    '10709': 'Westchester County', '10710': 'Westchester County', '10801': 'Westchester County',
    '10803': 'Westchester County', '10804': 'Westchester County', '10805': 'Westchester County',
    // Suffolk County, NY (Long Island)
    '11701': 'Suffolk County', '11702': 'Suffolk County', '11703': 'Suffolk County',
    '11704': 'Suffolk County', '11705': 'Suffolk County', '11706': 'Suffolk County',
    '11713': 'Suffolk County', '11715': 'Suffolk County', '11716': 'Suffolk County',
    '11717': 'Suffolk County', '11718': 'Suffolk County', '11719': 'Suffolk County',
    '11720': 'Suffolk County', '11721': 'Suffolk County', '11722': 'Suffolk County',
    '11724': 'Suffolk County', '11725': 'Suffolk County', '11726': 'Suffolk County',
    '11727': 'Suffolk County', '11729': 'Suffolk County', '11730': 'Suffolk County',
    '11731': 'Suffolk County', '11733': 'Suffolk County', '11738': 'Suffolk County',
    '11739': 'Suffolk County', '11740': 'Suffolk County', '11741': 'Suffolk County',
    '11742': 'Suffolk County', '11743': 'Suffolk County', '11746': 'Suffolk County',
    '11747': 'Suffolk County', '11749': 'Suffolk County', '11751': 'Suffolk County',
    '11752': 'Suffolk County', '11754': 'Suffolk County', '11755': 'Suffolk County',
    '11757': 'Suffolk County', '11758': 'Suffolk County', '11763': 'Suffolk County',
    '11764': 'Suffolk County', '11766': 'Suffolk County', '11767': 'Suffolk County',
    '11768': 'Suffolk County', '11769': 'Suffolk County', '11770': 'Suffolk County',
    '11772': 'Suffolk County', '11776': 'Suffolk County', '11777': 'Suffolk County',
    '11778': 'Suffolk County', '11779': 'Suffolk County', '11780': 'Suffolk County',
    '11782': 'Suffolk County', '11784': 'Suffolk County', '11786': 'Suffolk County',
    '11787': 'Suffolk County', '11788': 'Suffolk County', '11789': 'Suffolk County',
    '11790': 'Suffolk County', '11792': 'Suffolk County', '11794': 'Suffolk County',
    '11795': 'Suffolk County', '11796': 'Suffolk County', '11798': 'Suffolk County',
    // Nassau County, NY
    '11001': 'Nassau County', '11002': 'Nassau County', '11003': 'Nassau County',
    '11010': 'Nassau County', '11020': 'Nassau County', '11021': 'Nassau County',
    '11023': 'Nassau County', '11024': 'Nassau County', '11030': 'Nassau County',
    '11040': 'Nassau County', '11042': 'Nassau County', '11050': 'Nassau County',
    '11096': 'Nassau County', '11501': 'Nassau County', '11507': 'Nassau County',
    '11509': 'Nassau County', '11510': 'Nassau County', '11514': 'Nassau County',
    '11516': 'Nassau County', '11518': 'Nassau County', '11520': 'Nassau County',
    '11530': 'Nassau County', '11542': 'Nassau County', '11545': 'Nassau County',
    '11548': 'Nassau County', '11549': 'Nassau County', '11550': 'Nassau County',
    '11552': 'Nassau County', '11553': 'Nassau County', '11554': 'Nassau County',
    '11556': 'Nassau County', '11557': 'Nassau County', '11558': 'Nassau County',
    '11559': 'Nassau County', '11560': 'Nassau County', '11561': 'Nassau County',
    '11563': 'Nassau County', '11565': 'Nassau County', '11566': 'Nassau County',
    '11568': 'Nassau County', '11569': 'Nassau County', '11570': 'Nassau County',
    '11572': 'Nassau County', '11575': 'Nassau County', '11576': 'Nassau County',
    '11577': 'Nassau County', '11579': 'Nassau County', '11580': 'Nassau County',
    '11581': 'Nassau County', '11590': 'Nassau County', '11596': 'Nassau County',
    '11598': 'Nassau County', '11599': 'Nassau County',
    // Fairfield County, CT
    '06601': 'Fairfield County', '06604': 'Fairfield County', '06605': 'Fairfield County',
    '06606': 'Fairfield County', '06607': 'Fairfield County', '06608': 'Fairfield County',
    '06610': 'Fairfield County', '06611': 'Fairfield County', '06612': 'Fairfield County',
    '06614': 'Fairfield County', '06615': 'Fairfield County', '06776': 'Fairfield County',
    '06801': 'Fairfield County', '06804': 'Fairfield County', '06807': 'Fairfield County',
    '06810': 'Fairfield County', '06811': 'Fairfield County', '06812': 'Fairfield County',
    '06820': 'Fairfield County', '06824': 'Fairfield County', '06825': 'Fairfield County',
    '06828': 'Fairfield County', '06830': 'Fairfield County', '06831': 'Fairfield County',
    '06840': 'Fairfield County', '06850': 'Fairfield County', '06851': 'Fairfield County',
    '06853': 'Fairfield County', '06854': 'Fairfield County', '06855': 'Fairfield County',
    '06856': 'Fairfield County', '06857': 'Fairfield County', '06858': 'Fairfield County',
    '06870': 'Fairfield County', '06877': 'Fairfield County', '06878': 'Fairfield County',
    '06880': 'Fairfield County', '06883': 'Fairfield County', '06888': 'Fairfield County',
    '06889': 'Fairfield County', '06896': 'Fairfield County', '06897': 'Fairfield County'
  };

  // DOM Elements
  const zipForm = document.getElementById('zip-form');
  const zipInput = document.getElementById('zip-input');
  const checkBtn = document.getElementById('check-btn');
  const loadingState = document.getElementById('loading-state');
  const resultsSection = document.getElementById('results-section');
  const emptyState = document.getElementById('empty-state');
  const errorState = document.getElementById('error-state');
  const appCta = document.getElementById('app-cta');
  const shareBtn = document.getElementById('share-btn');
  const shareFeedback = document.getElementById('share-feedback');
  const retryBtn = document.getElementById('retry-btn');
  const bookmarkHint = document.getElementById('bookmark-hint');
  const priceMovement = document.getElementById('price-movement');
  const pricesTrust = document.getElementById('prices-trust');
  const defaultLeaderboard = document.getElementById('default-leaderboard');
  const pulseSuppliers = document.getElementById('pulse-suppliers');
  const pulseStates = document.getElementById('pulse-states');

  // State
  let currentZip = '';
  let currentSuppliers = [];
  let pageLoadTime = Date.now();
  let lastClickTime = 0; // For debouncing click tracking

  // Fetch Market Pulse data (live supplier stats)
  async function fetchMarketPulse() {
    try {
      const res = await fetch(`${API_BASE}/api/market/pulse`);
      if (!res.ok) return;

      const data = await res.json();

      if (pulseSuppliers && data.supplierCount) {
        pulseSuppliers.textContent = data.supplierCount + '+';
      }
      if (pulseStates && data.stateCount) {
        pulseStates.textContent = data.stateCount;
      }

      // Update trust line with actual count
      if (pricesTrust && data.supplierCount) {
        pricesTrust.textContent = 'Tracking prices from ' + data.supplierCount + '+ active heating oil suppliers in our network.';
      }
    } catch (err) {
      // Silently fail - fallback to static values in HTML
    }
  }

  // V2.17.0: Fetch live leaderboard data (state averages + top deals)
  async function fetchLeaderboard() {
    try {
      const res = await fetch(`${API_BASE}/api/market/leaderboard`);
      if (!res.ok) return;

      const data = await res.json();

      // Update leaderboard date
      const leaderboardDate = document.getElementById('leaderboard-date');
      if (leaderboardDate && data.generatedAt) {
        leaderboardDate.textContent = 'Updated ' + data.generatedAt;
      }

      // Update state averages table
      const stateTable = document.querySelector('.averages-table tbody');
      if (stateTable && data.stateAverages && data.stateAverages.length > 0) {
        const stateRows = data.stateAverages.map(function(s) {
          const stateSlug = s.stateName.toLowerCase().replace(/\s+/g, '-');
          const stateAbbrev = s.state.toLowerCase();
          return '<tr>' +
            '<td><a href="prices/' + stateAbbrev + '/">' + escapeHtml(s.stateName) + '</a></td>' +
            '<td>$' + s.avgPrice.toFixed(2) + ' avg</td>' +
            '<td>' + s.supplierCount + ' suppliers</td>' +
            '<td><a href="prices/' + stateAbbrev + '/">See all →</a></td>' +
            '</tr>';
        }).join('\n');
        stateTable.innerHTML = stateRows;
      }

      // Update top deals list
      const dealsList = document.querySelector('.deals-list');
      if (dealsList && data.topDeals && data.topDeals.length > 0) {
        const dealItems = data.topDeals.map(function(d) {
          return '<li class="deal-item">' +
            '<span class="deal-price">$' + d.price + '/gal</span>' +
            '<span class="deal-supplier">' + escapeHtml(d.supplierName) + '</span>' +
            '<span class="deal-location">' + escapeHtml(d.city) + ', ' + d.state + '</span>' +
            '</li>';
        }).join('\n');
        dealsList.innerHTML = dealItems;
      }

    } catch (err) {
      // Silently fail - keep static values from HTML
    }
  }

  // Format leaderboard date (e.g., "Updated today", "Updated yesterday")
  function formatLeaderboardDate(isoDate) {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Updated today';
    if (diffDays === 1) return 'Updated yesterday';
    if (diffDays < 7) return `Updated ${diffDays} days ago`;

    return `Updated ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  // Initialize
  function init() {
    // Fetch live Market Pulse data
    fetchMarketPulse();

    // V2.17.0: Fetch live leaderboard data (state averages + top deals)
    fetchLeaderboard();

    // Track page view and return visits
    trackPageView();

    // Track time on page when leaving
    window.addEventListener('beforeunload', trackTimeOnPage);
    // Check for ZIP in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const zipParam = urlParams.get('zip');

    // Or load from localStorage
    const savedZip = localStorage.getItem('homeheat_last_zip');

    if (zipParam && /^\d{5}$/.test(zipParam)) {
      zipInput.value = zipParam;
      lookupPrices(zipParam);
    } else if (savedZip && /^\d{5}$/.test(savedZip)) {
      zipInput.value = savedZip;
    }

    // Event listeners
    zipForm.addEventListener('submit', handleSubmit);
    shareBtn.addEventListener('click', handleShare);
    retryBtn.addEventListener('click', handleRetry);

    // Format ZIP input
    zipInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
    });
  }

  // Handle form submission
  function handleSubmit(e) {
    e.preventDefault();
    const zip = zipInput.value.trim();

    if (!/^\d{5}$/.test(zip)) {
      showError('Please enter a valid 5-digit ZIP code.');
      return;
    }

    lookupPrices(zip);
  }

  // Handle retry button
  function handleRetry() {
    if (currentZip) {
      lookupPrices(currentZip);
    }
  }

  // Main lookup function
  async function lookupPrices(zip) {
    currentZip = zip;

    // Save to localStorage
    localStorage.setItem('homeheat_last_zip', zip);

    // Update URL without reload
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('zip', zip);
    window.history.replaceState({}, '', newUrl);

    // Show loading state
    showState('loading');
    checkBtn.disabled = true;
    checkBtn.textContent = 'Loading...';

    try {
      const response = await fetch(`${API_BASE}${API_ENDPOINT}?zip=${zip}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.data && data.data.length > 0) {
        // Separate priced and unpriced suppliers
        const suppliersWithPrices = data.data.filter(s => s.currentPrice && s.currentPrice.pricePerGallon);
        const suppliersWithoutPrices = data.data.filter(s => !s.currentPrice || !s.currentPrice.pricePerGallon);

        if (suppliersWithPrices.length > 0) {
          currentSuppliers = suppliersWithPrices;
          renderResults(zip, suppliersWithPrices, suppliersWithoutPrices);
          showState('results');

          // Log empty ZIPs for analytics (without prices)
          logAnalytics('price_lookup', { zip, count: suppliersWithPrices.length, unpricedCount: suppliersWithoutPrices.length });
        } else if (suppliersWithoutPrices.length > 0) {
          // No priced suppliers but have unpriced ones - show them
          currentSuppliers = [];
          renderResultsUnpricedOnly(zip, suppliersWithoutPrices);
          showState('results');
          logAnalytics('price_lookup_unpriced_only', { zip, count: suppliersWithoutPrices.length });
        } else {
          // Suppliers found but no prices
          showEmpty(zip);
          logAnalytics('price_lookup_empty', { zip, reason: 'no_prices' });
        }
      } else {
        // No suppliers found
        showEmpty(zip);
        logAnalytics('price_lookup_empty', { zip, reason: 'no_suppliers' });
      }
    } catch (error) {
      console.error('Price lookup failed:', error);
      showError('We couldn\'t load prices right now. Please try again.');
      logAnalytics('price_lookup_error', { zip, error: error.message });
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check Prices';
    }
  }

  // Render results
  function renderResults(zip, suppliers, unpricedSuppliers = []) {
    // Sort by price
    suppliers.sort((a, b) => a.currentPrice.pricePerGallon - b.currentPrice.pricePerGallon);

    const prices = suppliers.map(s => s.currentPrice.pricePerGallon);
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const spread = highestPrice - lowestPrice;
    const savings = Math.round(spread * 200); // Savings on 200 gallons

    // Get location name
    const county = ZIP_COUNTY_MAP[zip];
    const locationName = county ? `${county} (${zip})` : `ZIP ${zip}`;

    // Update summary
    document.getElementById('result-location').textContent = locationName;
    document.getElementById('lowest-price').textContent = `$${lowestPrice.toFixed(2)}`;
    document.getElementById('highest-price').textContent = `$${highestPrice.toFixed(2)}`;

    // Update savings
    const savingsEl = document.getElementById('savings-potential');
    if (savings > 0) {
      savingsEl.innerHTML = `Save up to <strong>$${savings}</strong> on 200 gallons`;
      savingsEl.style.display = 'block';
    } else {
      savingsEl.style.display = 'none';
    }

    // Update freshness
    const freshestDate = suppliers.reduce((latest, s) => {
      const scraped = s.currentPrice.scrapedAt ? new Date(s.currentPrice.scrapedAt) : null;
      return scraped && scraped > latest ? scraped : latest;
    }, new Date(0));

    document.getElementById('freshness').textContent = formatRelativeTime(freshestDate);

    // Render supplier cards (priced)
    const cardsContainer = document.getElementById('supplier-cards');
    let cardsHtml = suppliers.map(s => createSupplierCard(s)).join('');

    // Add unpriced suppliers section if any
    if (unpricedSuppliers.length > 0) {
      cardsHtml += `
        <div class="unpriced-section">
          <h3 class="unpriced-heading">Other Suppliers in Your Area</h3>
          <p class="unpriced-subtitle">Call for current pricing</p>
          ${unpricedSuppliers.map(s => createUnpricedSupplierCard(s)).join('')}
        </div>
      `;
    }

    cardsContainer.innerHTML = cardsHtml;

    // Show bookmark hint (once per session)
    if (!sessionStorage.getItem('homeheat_bookmark_shown')) {
      bookmarkHint.style.display = 'block';
      sessionStorage.setItem('homeheat_bookmark_shown', 'true');
    }

    // v1.1 Features
    priceMovement.style.display = 'none'; // Reset before showing
    showPriceMovement(zip, lowestPrice);
    updateAuthorityLine(suppliers.length);
    updateSchemaMarkup(zip, suppliers);

    // Show PWA install banner after user has seen value (Android only)
    if (typeof window.showPwaInstallBanner === 'function') {
      setTimeout(() => window.showPwaInstallBanner(), 1500);
    }
  }

  // Render results when only unpriced suppliers exist
  function renderResultsUnpricedOnly(zip, unpricedSuppliers) {
    const county = ZIP_COUNTY_MAP[zip];
    const locationName = county ? `${county} (${zip})` : `ZIP ${zip}`;

    // Update summary for unpriced-only view
    document.getElementById('result-location').textContent = locationName;
    document.getElementById('lowest-price').textContent = 'Call';
    document.getElementById('highest-price').textContent = 'Call';

    const savingsEl = document.getElementById('savings-potential');
    savingsEl.innerHTML = `<strong>${unpricedSuppliers.length}</strong> supplier${unpricedSuppliers.length > 1 ? 's' : ''} serve this area`;
    savingsEl.style.display = 'block';

    document.getElementById('freshness').textContent = 'Call for prices';

    // Render unpriced supplier cards
    const cardsContainer = document.getElementById('supplier-cards');
    cardsContainer.innerHTML = `
      <div class="unpriced-notice">
        <p>We don't have current pricing for suppliers in this area yet. Contact them directly for quotes.</p>
      </div>
      ${unpricedSuppliers.map(s => createUnpricedSupplierCard(s)).join('')}
    `;

    // Show bookmark hint
    if (!sessionStorage.getItem('homeheat_bookmark_shown')) {
      bookmarkHint.style.display = 'block';
      sessionStorage.setItem('homeheat_bookmark_shown', 'true');
    }
  }

  // Create supplier card HTML
  function createSupplierCard(supplier) {
    const price = supplier.currentPrice;
    const phone = supplier.phone || '';
    const phoneHref = phone.replace(/\D/g, '');
    const scrapedAt = price.scrapedAt ? new Date(price.scrapedAt) : null;
    const freshness = formatCardFreshness(scrapedAt);
    const hasValidWebsite = supplier.website && supplier.website.startsWith('https://');

    // V2.15.0: Link to supplier profile page if slug available
    const hasSlug = supplier.slug;

    return `
      <div class="supplier-card">
        <div class="supplier-info">
          <div class="supplier-name">
            ${hasSlug ? `<a href="/supplier/${supplier.slug}.html" class="supplier-profile-link">${escapeHtml(supplier.name)}</a>` : escapeHtml(supplier.name)}
          </div>
          <div class="supplier-location">${escapeHtml(supplier.city || '')}, ${escapeHtml(supplier.state || '')}</div>
          <div class="supplier-actions">
            ${phone ? `<a href="tel:${phoneHref}" class="supplier-phone" data-track-supplier-id="${supplier.id}" data-track-supplier-name="${escapeHtml(supplier.name)}" data-track-action="call">Call ${escapeHtml(phone)}</a>` : ''}
            ${hasValidWebsite ? `<a href="${escapeHtml(supplier.website)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" class="supplier-website-btn" data-track-supplier-id="${supplier.id}" data-track-supplier-name="${escapeHtml(supplier.name)}" data-track-action="website">Visit Website</a>` : ''}
          </div>
        </div>
        <div class="supplier-price">
          <div class="price-amount">$${price.pricePerGallon.toFixed(2)}</div>
          <div class="price-unit">per gallon</div>
          ${price.minGallons ? `<div class="price-min">${price.minGallons}+ gal min</div>` : ''}
          <div class="price-freshness">${freshness}</div>
        </div>
      </div>
    `;
  }

  // Create unpriced supplier card HTML (call for price)
  function createUnpricedSupplierCard(supplier) {
    const phone = supplier.phone || '';
    const phoneHref = phone.replace(/\D/g, '');
    const hasValidWebsite = supplier.website && supplier.website.startsWith('https://');
    const hasSlug = supplier.slug;

    return `
      <div class="supplier-card supplier-card-unpriced">
        <div class="supplier-info">
          <div class="supplier-name">
            ${hasSlug ? `<a href="/supplier/${supplier.slug}.html" class="supplier-profile-link">${escapeHtml(supplier.name)}</a>` : escapeHtml(supplier.name)}
          </div>
          <div class="supplier-location">${escapeHtml(supplier.city || '')}, ${escapeHtml(supplier.state || '')}</div>
          <div class="supplier-actions">
            ${phone ? `<a href="tel:${phoneHref}" class="supplier-phone" data-track-supplier-id="${supplier.id}" data-track-supplier-name="${escapeHtml(supplier.name)}" data-track-action="call">Call ${escapeHtml(phone)}</a>` : ''}
            ${hasValidWebsite ? `<a href="${escapeHtml(supplier.website)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" class="supplier-website-btn" data-track-supplier-id="${supplier.id}" data-track-supplier-name="${escapeHtml(supplier.name)}" data-track-action="website">Visit Website</a>` : ''}
          </div>
        </div>
        <div class="supplier-price supplier-price-unpriced">
          <div class="price-amount">Call</div>
          <div class="price-unit">for price</div>
        </div>
      </div>
    `;
  }

  // Format freshness for individual supplier cards (compact format)
  function formatCardFreshness(date) {
    if (!date || date.getTime() === 0) return 'Updated recently';

    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return 'Updated now';
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Handle share button - uses native share on mobile, clipboard on desktop
  async function handleShare() {
    if (currentSuppliers.length === 0) return;

    const prices = currentSuppliers.map(s => s.currentPrice.pricePerGallon);
    const low = Math.min(...prices).toFixed(2);
    const high = Math.max(...prices).toFixed(2);

    const county = ZIP_COUNTY_MAP[currentZip];
    const location = county ? `${county} (${currentZip})` : `near ${currentZip}`;

    const shareText = `Heating oil in ${location} is $${low}–$${high} today. Check your ZIP: gethomeheat.com/prices.html?zip=${currentZip}`;
    const shareUrl = `https://gethomeheat.com/prices.html?zip=${currentZip}`;

    // Try native share first (mobile)
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({
          title: `Heating Oil Prices in ${location}`,
          text: shareText,
          url: shareUrl
        });
        logAnalytics('share_native', { zip: currentZip });
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    // Fallback to clipboard
    navigator.clipboard.writeText(shareText).then(() => {
      shareFeedback.textContent = 'Copied!';
      shareFeedback.style.display = 'inline';
      setTimeout(() => {
        shareFeedback.style.display = 'none';
      }, 2000);

      logAnalytics('share_clipboard', { zip: currentZip });
    }).catch(() => {
      shareFeedback.textContent = 'Copy failed';
      shareFeedback.style.display = 'inline';
    });
  }

  // Show different states
  function showState(state) {
    loadingState.style.display = 'none';
    resultsSection.style.display = 'none';
    emptyState.style.display = 'none';
    errorState.style.display = 'none';
    appCta.style.display = 'none';

    switch (state) {
      case 'loading':
        loadingState.style.display = 'block';
        // SMOOTH HANDOFF: Keep leaderboard visible during loading
        // This prevents "flash of empty content" while API loads
        break;
      case 'results':
        resultsSection.style.display = 'block';
        appCta.style.display = 'block';
        // Hide leaderboard when showing ZIP-specific results
        if (defaultLeaderboard) {
          defaultLeaderboard.style.opacity = '0';
          setTimeout(() => { defaultLeaderboard.style.display = 'none'; }, 300);
        }
        break;
      case 'empty':
        emptyState.style.display = 'block';
        appCta.style.display = 'block';
        // Hide leaderboard when showing empty state
        if (defaultLeaderboard) {
          defaultLeaderboard.style.opacity = '0';
          setTimeout(() => { defaultLeaderboard.style.display = 'none'; }, 300);
        }
        break;
      case 'error':
        errorState.style.display = 'block';
        // Hide leaderboard on error
        if (defaultLeaderboard) {
          defaultLeaderboard.style.opacity = '0';
          setTimeout(() => { defaultLeaderboard.style.display = 'none'; }, 300);
        }
        break;
    }
  }

  // Show empty state
  function showEmpty(zip) {
    document.getElementById('empty-zip').textContent = zip;
    showNearbyZips(zip);
    showState('empty');
  }

  // Show error
  function showError(message) {
    document.getElementById('error-message').textContent = message;
    showState('error');
  }

  // Format relative time
  function formatRelativeTime(date) {
    if (!date || date.getTime() === 0) return 'Updated recently';

    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return 'Updated just now';
    if (hours === 1) return 'Updated 1 hour ago';
    if (hours < 24) return `Updated ${hours} hours ago`;
    if (days === 1) return 'Updated yesterday';
    if (days < 7) return `Updated ${days} days ago`;

    return `Updated ${date.toLocaleDateString()}`;
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Analytics logging via GA4 gtag
  function logAnalytics(event, data) {
    if (typeof gtag === 'function') {
      gtag('event', event, data || {});
    }
  }

  // Track page view and return visits
  function trackPageView() {
    const visitKey = 'homeheat_visits';
    const lastVisitKey = 'homeheat_last_visit';

    const visits = parseInt(localStorage.getItem(visitKey) || '0', 10) + 1;
    const lastVisit = localStorage.getItem(lastVisitKey);
    const now = Date.now();

    localStorage.setItem(visitKey, visits.toString());
    localStorage.setItem(lastVisitKey, now.toString());

    const isReturn = lastVisit && (now - parseInt(lastVisit, 10)) > (24 * 60 * 60 * 1000); // > 24 hours

    logAnalytics('page_view', {
      visits,
      isReturn,
      daysSinceLastVisit: lastVisit ? Math.round((now - parseInt(lastVisit, 10)) / (24 * 60 * 60 * 1000)) : null
    });
  }

  // Track time on page when leaving
  function trackTimeOnPage() {
    const timeOnPage = Math.round((Date.now() - pageLoadTime) / 1000);
    logAnalytics('page_exit', { timeOnPageSeconds: timeOnPage, zip: currentZip || null });
  }

  // Generate nearby ZIP suggestions based on ZIP prefix patterns
  function getNearbyZips(zip) {
    const prefix = zip.substring(0, 3);
    const num = parseInt(zip, 10);

    // Generate some nearby ZIPs by incrementing/decrementing
    const candidates = new Set();

    // Same prefix, different suffixes
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const nearby = (num + i).toString().padStart(5, '0');
      if (nearby.startsWith(prefix) && nearby !== zip) {
        candidates.add(nearby);
      }
    }

    // Adjacent prefixes
    const prefixNum = parseInt(prefix, 10);
    [prefixNum - 1, prefixNum + 1].forEach(adjPrefix => {
      if (adjPrefix >= 0 && adjPrefix <= 999) {
        const adjZip = adjPrefix.toString().padStart(3, '0') + zip.substring(3);
        if (adjZip !== zip) {
          candidates.add(adjZip);
        }
      }
    });

    // Return up to 4 suggestions, prioritizing those in our county map
    const sorted = Array.from(candidates).sort((a, b) => {
      const aKnown = ZIP_COUNTY_MAP[a] ? 1 : 0;
      const bKnown = ZIP_COUNTY_MAP[b] ? 1 : 0;
      return bKnown - aKnown; // Known ZIPs first
    });

    return sorted.slice(0, 4);
  }

  // Show nearby ZIP suggestions in empty state
  function showNearbyZips(zip) {
    const nearbyZips = getNearbyZips(zip);
    const container = document.getElementById('nearby-zips');
    const buttonsContainer = document.getElementById('nearby-zip-buttons');

    if (nearbyZips.length > 0 && container && buttonsContainer) {
      buttonsContainer.innerHTML = nearbyZips.map(z =>
        `<button class="nearby-zip-btn" data-nearby-zip="${z}">${z}</button>`
      ).join('');
      container.style.display = 'block';
    }
  }

  // Expose lookup function for nearby ZIP buttons
  window.lookupZip = function(zip) {
    zipInput.value = zip;
    lookupPrices(zip);
  };

  // ========================================
  // v1.1 FEATURES
  // ========================================

  // Price movement - compare to cached previous price
  function showPriceMovement(zip, currentLowest) {
    const cacheKey = `homeheat_price_${zip}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const { price, timestamp } = JSON.parse(cached);
        const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

        // Only show movement if cached data is 1-14 days old
        if (ageInDays >= 1 && ageInDays <= 14) {
          const diff = currentLowest - price;
          const diffCents = Math.abs(Math.round(diff * 100));

          if (diffCents >= 2) { // Only show if 2+ cents difference
            const movementIcon = document.getElementById('movement-icon');
            const movementText = document.getElementById('movement-text');

            if (diff > 0) {
              // Prices went up
              priceMovement.className = 'price-movement movement-up';
              movementIcon.textContent = '↑';
              movementText.textContent = `Prices up ${diffCents}¢ since last check`;
            } else {
              // Prices went down
              priceMovement.className = 'price-movement movement-down';
              movementIcon.textContent = '↓';
              movementText.textContent = `Prices down ${diffCents}¢ since last check`;
            }

            priceMovement.style.display = 'flex';
            logAnalytics('price_movement_shown', { zip, diff: diffCents, direction: diff > 0 ? 'up' : 'down' });
          } else {
            // Prices flat
            priceMovement.className = 'price-movement movement-flat';
            document.getElementById('movement-icon').textContent = '→';
            document.getElementById('movement-text').textContent = 'Prices stable since last check';
            priceMovement.style.display = 'flex';
          }
        }
      } catch (e) {
        console.error('Error parsing cached price:', e);
      }
    }

    // Always update cache with current price
    localStorage.setItem(cacheKey, JSON.stringify({
      price: currentLowest,
      timestamp: Date.now()
    }));
  }

  // Update authority line with supplier count
  function updateAuthorityLine(supplierCount) {
    if (pricesTrust && supplierCount > 0) {
      pricesTrust.textContent = `Based on live pricing from ${supplierCount} verified supplier${supplierCount > 1 ? 's' : ''} in your area.`;
    }
  }

  // Update schema markup for SEO
  function updateSchemaMarkup(zip, suppliers) {
    const schemaEl = document.getElementById('schema-markup');
    if (!schemaEl || suppliers.length === 0) return;

    const county = ZIP_COUNTY_MAP[zip] || '';
    const locationName = county ? `${county} (${zip})` : `ZIP ${zip}`;

    // V2.1.0: Use Service + PriceSpecification instead of Offer
    // to avoid Google's e-commerce field requirements (hasMerchantReturnPolicy, shippingDetails)
    // V2.1.1: Added image field (required by Google for rich results)
    const itemListElements = suppliers.slice(0, 10).map((s, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Service",
        "name": `Heating Oil Delivery from ${s.name}`,
        "description": `Heating oil delivery service from ${s.name}. Current price: $${s.currentPrice.pricePerGallon.toFixed(2)} per gallon.`,
        "image": "https://www.gethomeheat.com/images/app-icon.png",
        "serviceType": "Heating Oil Delivery",
        "areaServed": locationName,
        "provider": {
          "@type": "LocalBusiness",
          "name": s.name,
          "image": "https://www.gethomeheat.com/images/app-icon.png",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": s.city || '',
            "addressRegion": s.state || ''
          },
          "telephone": s.phone || '',
          "priceRange": `$${s.currentPrice.pricePerGallon.toFixed(2)}/gal`
        },
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": s.currentPrice.pricePerGallon.toFixed(2),
          "priceCurrency": "USD",
          "unitCode": "GLL",
          "unitText": "gallon"
        }
      }
    }));

    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `Heating Oil Prices in ${locationName}`,
      "description": `Compare current heating oil prices from ${suppliers.length} local suppliers in ${locationName}.`,
      "publisher": {
        "@type": "Organization",
        "name": "HomeHeat",
        "url": "https://gethomeheat.com"
      },
      "mainEntity": {
        "@type": "ItemList",
        "name": `Heating Oil Prices in ${locationName}`,
        "description": `Current heating oil prices from local suppliers serving ${locationName}`,
        "numberOfItems": suppliers.length,
        "itemListElement": itemListElements
      }
    };

    schemaEl.textContent = JSON.stringify(schema);
  }

  // ========================================
  // CLICK TRACKING (Dual logging: backend + Firebase)
  // ========================================

  // Track website button clicks
  window.trackWebsiteClick = function(supplierId, supplierName) {
    // Debounce: ignore clicks within 500ms
    const now = Date.now();
    if (now - lastClickTime < 500) return;
    lastClickTime = now;

    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    // 1. Log to backend (source of truth) - use sendBeacon for Safari compatibility
    const data = JSON.stringify({
      supplierId: supplierId,
      supplierName: supplierName,
      action: 'website',
      zipCode: currentZip || null,
      pageSource: 'prices',
      deviceType: isMobile ? 'mobile' : 'desktop',
      platform: isAndroid ? 'android' : (isMobile ? 'ios' : 'web')
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + '/api/log-action', new Blob([data], { type: 'application/json' }));
    } else {
      fetch(API_BASE + '/api/log-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(function(err) { console.error('[Tracking] Website click failed:', err); });
    }

    // 2. Log to Firebase Analytics (via gtag)
    if (typeof gtag === 'function') {
      gtag('event', 'supplier_outbound_click', {
        supplier_id: supplierId,
        supplier_name: supplierName,
        zip_code: currentZip || ''
      });
    }
  };

  // Track call button clicks
  window.trackCallClick = function(supplierId, supplierName) {
    // Debounce: ignore clicks within 500ms
    const now = Date.now();
    if (now - lastClickTime < 500) return;
    lastClickTime = now;

    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    // 1. Log to backend (source of truth) - use sendBeacon for Safari compatibility
    const data = JSON.stringify({
      supplierId: supplierId,
      supplierName: supplierName,
      action: 'call',
      zipCode: currentZip || null,
      pageSource: 'prices',
      deviceType: isMobile ? 'mobile' : 'desktop',
      platform: isAndroid ? 'android' : (isMobile ? 'ios' : 'web')
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + '/api/log-action', new Blob([data], { type: 'application/json' }));
    } else {
      fetch(API_BASE + '/api/log-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(function(err) { console.error('[Tracking] Call click failed:', err); });
    }

    // 2. Log to Firebase Analytics (via gtag)
    if (typeof gtag === 'function') {
      gtag('event', 'supplier_call_click', {
        supplier_id: supplierId,
        supplier_name: supplierName,
        zip_code: currentZip || ''
      });
    }
  };

  // ========================================
  // EVENT DELEGATION (CSP compliant - no inline handlers)
  // ========================================

  document.addEventListener('click', function(e) {
    // Track supplier clicks (call/website buttons)
    var trackLink = e.target.closest('a[data-track-supplier-id]');
    if (trackLink) {
      var supplierId = trackLink.getAttribute('data-track-supplier-id');
      var supplierName = trackLink.getAttribute('data-track-supplier-name');
      var action = trackLink.getAttribute('data-track-action');

      if (supplierId && supplierName && action) {
        if (action === 'call') {
          window.trackCallClick(supplierId, supplierName);
        } else if (action === 'website') {
          window.trackWebsiteClick(supplierId, supplierName);
        }
      }
      return;
    }

    // Nearby ZIP buttons
    var zipBtn = e.target.closest('button[data-nearby-zip]');
    if (zipBtn) {
      var zip = zipBtn.getAttribute('data-nearby-zip');
      if (zip) {
        window.lookupZip(zip);
      }
    }
  });

  // ========================================
  // ANDROID DETECTION
  // ========================================

  function hideIOSElementsOnAndroid() {
    if (/Android/i.test(navigator.userAgent)) {
      document.querySelectorAll('.ios-only').forEach(function(el) {
        el.style.display = 'none';
      });
    }
  }

  // Start
  init();

  // Hide iOS elements on Android
  hideIOSElementsOnAndroid();
})();
