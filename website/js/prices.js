// HomeHeat Price Lookup - prices.js
// Fetches and displays heating oil prices for a given ZIP code

(function() {
  'use strict';

  // Configuration
  const API_BASE = '';
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
  const priceMovement = document.getElementById('price-movement');
  const defaultLeaderboard = document.getElementById('default-leaderboard');
  const lowestPriceCard = document.getElementById('lowest-price-card');
  const pulseSuppliers = document.getElementById('pulse-suppliers');
  const pulseStates = document.getElementById('pulse-states');

  // State
  let currentZip = '';
  let currentSuppliers = [];
  let pageLoadTime = Date.now();
  let lastClickTime = 0; // For debouncing click tracking
  let leaderboardData = null; // Cached leaderboard for empty state context

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
      // Also update leaderboard trust line
      var lbSuppliers = document.getElementById('leaderboard-suppliers');
      var lbStates = document.getElementById('leaderboard-states');
      if (lbSuppliers && data.supplierCount) lbSuppliers.textContent = data.supplierCount;
      if (lbStates && data.stateCount) lbStates.textContent = data.stateCount;
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

      // Cache for empty state context
      leaderboardData = data;

      // Update leaderboard date
      const leaderboardDate = document.getElementById('leaderboard-date');
      if (leaderboardDate && data.generatedAt) {
        leaderboardDate.textContent = 'Updated ' + data.generatedAt;
      }

      // Update state averages table
      const stateTable = document.querySelector('.averages-table-v2 tbody');
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
      const dealsList = document.querySelector('.deals-list-v2');
      if (dealsList && data.topDeals && data.topDeals.length > 0) {
        const dealItems = data.topDeals.map(function(d) {
          return '<li>' +
            '<span class="deal-price">$' + d.price + '/gal</span>' +
            '<div class="deal-info">' +
            '<div class="deal-supplier">' + escapeHtml(d.supplierName) + '</div>' +
            '<div class="deal-location">' + escapeHtml(d.city) + ', ' + d.state + '</div>' +
            '</div>' +
            '</li>';
        }).join('\n');
        dealsList.innerHTML = dealItems;
      }

      // Update "Lowest Price Today" card with freshest data
      if (data.topDeals && data.topDeals.length > 0) {
        var best = data.topDeals[0];
        var lowestCard = document.getElementById('lowest-price-card');
        if (lowestCard) {
          var avgPrice = data.stateAverages && data.stateAverages.length > 0
            ? data.stateAverages.reduce(function(sum, s) { return sum + s.avgPrice; }, 0) / data.stateAverages.length
            : 0;
          var delta = avgPrice > 0 ? (avgPrice - parseFloat(best.price)).toFixed(2) : null;
          lowestCard.innerHTML =
            '<p class="lowest-label">Lowest Heating Oil Price Today</p>' +
            '<span class="lowest-value">$' + best.price + '/gal</span>' +
            (delta && parseFloat(delta) > 0 ? '<span class="lowest-vs-avg">$' + delta + ' below Northeast average</span>' : '') +
            '<p class="lowest-supplier">' + escapeHtml(best.supplierName) + ' — ' + escapeHtml(best.city) + ', ' + best.state + (best.zip ? ' (' + best.zip + ')' : '') + '</p>';
        }
      }

      // Seed default alert form with national lowest price + remembered ZIP
      if (data.topDeals && data.topDeals.length > 0 && typeof window.initPriceAlertForm === 'function') {
        var nationalLowest = parseFloat(data.topDeals[0].price);
        if (nationalLowest > 0) {
          var rememberedZip = '';
          try { rememberedZip = localStorage.getItem('homeheat_last_zip') || ''; } catch (e) {}
          if (!/^\d{5}$/.test(rememberedZip)) rememberedZip = '';
          window.initPriceAlertForm('#default-alert-container', {
            zip: rememberedZip,
            lowestPrice: nationalLowest,
            defaultThreshold: Math.max(nationalLowest - 0.20, 1.50)
          });
        }
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
      // Fire supplier search and quote availability in parallel
      const supplierPromise = fetch(`${API_BASE}${API_ENDPOINT}?zip=${zip}`);
      const availPromise = (typeof window.initGetQuotesForm === 'function')
        ? fetch('/api/quote-request/availability?zip=' + zip).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null);

      const response = await supplierPromise;

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const [data, availData] = await Promise.all([response.json(), availPromise]);
      const meta = data.meta || {};

      if (data.data && data.data.length > 0) {
        // Separate priced and unpriced suppliers
        const suppliersWithPrices = data.data.filter(s => s.currentPrice && s.currentPrice.pricePerGallon);
        const suppliersWithoutPrices = data.data.filter(s => !s.currentPrice || !s.currentPrice.pricePerGallon);

        if (suppliersWithPrices.length > 0) {
          currentSuppliers = suppliersWithPrices;
          renderResults(zip, suppliersWithPrices, suppliersWithoutPrices, availData);
          showState('results');
          dispatchZipSearchedEvent(zip, meta, true);

          // Log empty ZIPs for analytics (without prices)
          logAnalytics('price_lookup', { zip, count: suppliersWithPrices.length, unpricedCount: suppliersWithoutPrices.length });
        } else if (suppliersWithoutPrices.length > 0) {
          // No priced suppliers but have unpriced ones - show them
          currentSuppliers = [];
          renderResultsUnpricedOnly(zip, suppliersWithoutPrices);
          showState('results');
          dispatchZipSearchedEvent(zip, meta, true);
          logAnalytics('price_lookup_unpriced_only', { zip, count: suppliersWithoutPrices.length });
        } else {
          // Suppliers found but no prices
          showEmpty(zip);
          dispatchZipSearchedEvent(zip, meta, false);
          logAnalytics('price_lookup_empty', { zip, reason: 'no_prices' });
        }
      } else {
        // No suppliers found
        showEmpty(zip);
        dispatchZipSearchedEvent(zip, meta, false);
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

  // Inform other scripts (currently personalization.js's bar) that a ZIP search
  // completed, so they can reflect the user's explicit action instead of stale
  // IP-geo guesses. heatingoil-nb3h.
  function dispatchZipSearchedEvent(zip, meta, covered) {
    const detail = {
      zip: zip,
      city: meta && meta.userCity ? meta.userCity : null,
      county: meta && meta.userCounty ? meta.userCounty : null,
      state: null,  // personalization.js derives state from ZIP prefix when needed
      count: meta && typeof meta.count === 'number' ? meta.count : 0,
      pricedCount: meta && typeof meta.pricedCount === 'number' ? meta.pricedCount : 0,
      covered: !!covered
    };
    window.dispatchEvent(new CustomEvent('homeheat:zip-searched', { detail: detail }));
  }

  // Render results
  function renderResults(zip, suppliers, unpricedSuppliers = [], availData = null) {
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

    // v1.1 Features
    priceMovement.style.display = 'none'; // Reset before showing
    showPriceMovement(zip, lowestPrice);
    updateSchemaMarkup(zip, suppliers);

    // Initialize price alert form
    if (typeof window.initPriceAlertForm === 'function') {
      window.initPriceAlertForm('#price-alert-container', {
        zip: zip,
        lowestPrice: lowestPrice,
        defaultThreshold: Math.max(lowestPrice - 0.15, 1.50)
      });
    }

    // Initialize Get Quotes form using pre-fetched availability data (parallel with supplier search)
    if (typeof window.initGetQuotesForm === 'function' && availData && availData.available) {
      var cards = document.querySelectorAll('#supplier-cards > .supplier-card');
      var container = document.getElementById('get-quotes-container');
      if (cards.length >= 3 && container) {
        cards[2].after(container);
      }
      window.initGetQuotesForm('#get-quotes-container', {
        zip: zip,
        supplierCount: availData.supplier_count,
        mode: availData.mode || 'routed',
        fallback_phones: availData.fallback_phones || null
      });
    }

    // Show PWA install banner after user has seen value (Android only)
    if (typeof window.showPwaInstallBanner === 'function') {
      setTimeout(() => window.showPwaInstallBanner(), 1500);
    }

    // V2.12.0: Check for kerosene suppliers and show cross-sell banner
    checkKeroseneCrossSell(zip);
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

    // V2.12.0: Check for kerosene suppliers
    checkKeroseneCrossSell(zip);
  }

  // V2.12.0: Check if kerosene suppliers exist for this ZIP and show cross-sell banner
  function checkKeroseneCrossSell(zip) {
    // Remove any existing banner
    var existing = document.getElementById('kerosene-cross-sell');
    if (existing) existing.remove();

    fetch(API_BASE + API_ENDPOINT + '?zip=' + zip + '&fuel=kerosene')
      .then(function(resp) { return resp.ok ? resp.json() : null; })
      .then(function(data) {
        if (!data || !data.data) return;
        var keroSuppliers = data.data.filter(function(s) {
          return s.currentPrice && s.currentPrice.pricePerGallon;
        });
        if (keroSuppliers.length === 0) return;

        var banner = document.createElement('div');
        banner.id = 'kerosene-cross-sell';
        banner.className = 'kerosene-cross-sell';
        banner.innerHTML =
          '<h4>K-1 Kerosene Also Available</h4>' +
          '<p>' + keroSuppliers.length + ' supplier' + (keroSuppliers.length > 1 ? 's' : '') +
          ' deliver K-1 kerosene to ' + zip + '</p>' +
          '<a href="/prices/kerosene/?zip=' + zip + '" class="kerosene-cross-sell-link">See Kerosene Prices &rarr;</a>';

        var cards = document.getElementById('supplier-cards');
        if (cards) cards.appendChild(banner);
      })
      .catch(function() { /* silent — kerosene check is non-critical */ });
  }

  // V3.0.0: Generate supplier initials for avatar
  function getInitials(name) {
    if (!name) return '?';
    // Split on whitespace, take first letter of first two meaningful words
    var words = name.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    // Use first letter of each of the first two words
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }

  // V3.0.0: Deterministic color index from supplier name (0-9)
  function getAvatarColor(name) {
    if (!name) return 0;
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 10;
  }

  // V3.0.0: Build avatar HTML
  function buildAvatar(name) {
    return '<div class="supplier-avatar" data-color="' + getAvatarColor(name) + '">' + escapeHtml(getInitials(name)) + '</div>';
  }

  // V3.0.0: Build service badges HTML (graceful degradation — only shown when data exists)
  function buildBadges(supplier) {
    var badges = [];

    // Fuel types
    if (supplier.fuelTypes && supplier.fuelTypes.length > 0) {
      var fuelLabels = { oil: 'Heating Oil', kerosene: 'Kerosene', diesel: 'Diesel', propane: 'Propane' };
      supplier.fuelTypes.forEach(function(ft) {
        if (fuelLabels[ft] && ft !== 'oil') { // Skip "Heating Oil" — it's assumed
          badges.push(fuelLabels[ft]);
        }
      });
    }

    // Payment methods
    if (supplier.paymentMethods && supplier.paymentMethods.length > 0) {
      var hasCreditCard = supplier.paymentMethods.indexOf('credit_card') !== -1;
      if (hasCreditCard) badges.push('Credit Cards');
    }

    // Min gallons shown in price block (single source of truth), not duplicated here

    // Senior discount
    if (supplier.seniorDiscount === 'yes') {
      badges.push('Senior Discount');
    }

    if (badges.length === 0) return '';
    return '<div class="supplier-badges">' +
      badges.map(function(b) { return '<span class="supplier-badge">' + escapeHtml(b) + '</span>'; }).join('') +
      '</div>';
  }

  // V3.0.0: Freshness indicator with color-coded dot
  function buildFreshness(scrapedAt) {
    if (!scrapedAt) {
      return '<div class="price-freshness"><span class="freshness-dot stale"></span> Update time unknown</div>';
    }

    var date = new Date(scrapedAt);
    if (isNaN(date.getTime())) {
      return '<div class="price-freshness"><span class="freshness-dot stale"></span> Update time unknown</div>';
    }

    var now = new Date();
    var diff = now - date;
    if (diff < 0) {
      return '<div class="price-freshness"><span class="freshness-dot stale"></span> Update time unknown</div>';
    }
    var hours = Math.floor(diff / (1000 * 60 * 60));
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));

    var dotClass, text;
    if (hours < 24) {
      dotClass = 'fresh';
      text = hours < 1 ? 'Updated now' : hours + 'h ago';
    } else if (days <= 3) {
      dotClass = 'recent';
      text = days === 1 ? 'Yesterday' : days + 'd ago';
    } else {
      dotClass = 'stale';
      text = days < 7 ? days + 'd ago' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return '<div class="price-freshness"><span class="freshness-dot ' + dotClass + '"></span> ' + escapeHtml(text) + '</div>';
  }

  // V3.0.0: Verified badge HTML
  function buildVerifiedBadge(supplier) {
    if (!supplier.claimedAt) return '';
    return '<span class="verified-badge"><svg viewBox="0 0 16 16"><path d="M6.5 12.5l-4-4 1.5-1.5 2.5 2.5 5.5-5.5 1.5 1.5z"/></svg>Verified</span>';
  }

  // Create supplier card HTML
  function createSupplierCard(supplier) {
    var price = supplier.currentPrice;
    // Defensive: if price data is missing/malformed, fall back to unpriced card
    var ppg = price ? Number(price.pricePerGallon) : NaN;
    if (!price || !Number.isFinite(ppg) || ppg <= 0) {
      return createUnpricedSupplierCard(supplier);
    }

    var phone = supplier.phone || '';
    var phoneDigits = phone.replace(/\D/g, '');
    var canCall = phoneDigits.length >= 10;
    var hasValidWebsite = supplier.website && /^https?:\/\//i.test(supplier.website);
    var safeSlug = supplier.slug ? encodeURIComponent(supplier.slug) : '';

    // Estimate: use minGallons if higher than 150, single source of truth
    var estimateGal = 150;
    var minGal = Math.floor(Number(supplier.minimumGallons || price.minGallons || 0) || 0);
    if (minGal > estimateGal) estimateGal = minGal;
    var estimateTotal = Math.round(ppg * estimateGal);

    return '<div class="supplier-card">' +
      buildAvatar(supplier.name) +
      '<div class="supplier-info">' +
        '<div class="supplier-name-row">' +
          '<div class="supplier-name">' +
            (safeSlug ? '<a href="/supplier/' + safeSlug + '" class="supplier-profile-link">' + escapeHtml(supplier.name) + '</a>' : escapeHtml(supplier.name)) +
          '</div>' +
          buildVerifiedBadge(supplier) +
        '</div>' +
        '<div class="supplier-location">' + escapeHtml(supplier.city || '') + ', ' + escapeHtml(supplier.state || '') + '</div>' +
        buildBadges(supplier) +
        '<div class="supplier-actions">' +
          (canCall ? '<a href="tel:' + phoneDigits + '" class="supplier-phone" data-track-supplier-id="' + supplier.id + '" data-track-supplier-name="' + escapeHtml(supplier.name) + '" data-track-action="call">Call ' + escapeHtml(phone) + '</a>' : '') +
          (hasValidWebsite ? '<a href="' + escapeHtml(supplier.website) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" class="supplier-website-btn" data-track-supplier-id="' + supplier.id + '" data-track-supplier-name="' + escapeHtml(supplier.name) + '" data-track-action="website">Visit Website</a>' : '') +
        '</div>' +
      '</div>' +
      '<div class="supplier-price">' +
        '<div class="price-amount">$' + ppg.toFixed(2) + '</div>' +
        '<div class="price-unit">per gallon</div>' +
        '<div class="price-estimate">~$' + estimateTotal + ' for ' + estimateGal + ' gal</div>' +
        (minGal ? '<div class="price-min">' + minGal + '+ gal min</div>' : '') +
        buildFreshness(price.scrapedAt) +
      '</div>' +
    '</div>';
  }

  // Create unpriced supplier card HTML (call for price)
  function createUnpricedSupplierCard(supplier) {
    var phone = supplier.phone || '';
    var phoneDigits = phone.replace(/\D/g, '');
    var canCall = phoneDigits.length >= 10;
    var hasValidWebsite = supplier.website && /^https?:\/\//i.test(supplier.website);
    var safeSlug = supplier.slug ? encodeURIComponent(supplier.slug) : '';

    return '<div class="supplier-card supplier-card-unpriced">' +
      buildAvatar(supplier.name) +
      '<div class="supplier-info">' +
        '<div class="supplier-name-row">' +
          '<div class="supplier-name">' +
            (safeSlug ? '<a href="/supplier/' + safeSlug + '" class="supplier-profile-link">' + escapeHtml(supplier.name) + '</a>' : escapeHtml(supplier.name)) +
          '</div>' +
          buildVerifiedBadge(supplier) +
        '</div>' +
        '<div class="supplier-location">' + escapeHtml(supplier.city || '') + ', ' + escapeHtml(supplier.state || '') + '</div>' +
        buildBadges(supplier) +
        '<div class="supplier-actions">' +
          (canCall ? '<a href="tel:' + phoneDigits + '" class="supplier-phone" data-track-supplier-id="' + supplier.id + '" data-track-supplier-name="' + escapeHtml(supplier.name) + '" data-track-action="call">Call ' + escapeHtml(phone) + '</a>' : '') +
          (hasValidWebsite ? '<a href="' + escapeHtml(supplier.website) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" class="supplier-website-btn" data-track-supplier-id="' + supplier.id + '" data-track-supplier-name="' + escapeHtml(supplier.name) + '" data-track-action="website">Visit Website</a>' : '') +
        '</div>' +
      '</div>' +
      '<div class="supplier-price supplier-price-unpriced">' +
        '<div class="price-unavailable">No online price</div>' +
      '</div>' +
    '</div>';
  }

  // V3.0.0: formatCardFreshness replaced by buildFreshness() with color-coded dot

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
        // Hide leaderboard and lowest-price card when showing ZIP-specific results
        if (defaultLeaderboard) {
          defaultLeaderboard.style.opacity = '0';
          setTimeout(() => { defaultLeaderboard.style.display = 'none'; }, 300);
        }
        if (lowestPriceCard) lowestPriceCard.style.display = 'none';
        break;
      case 'empty':
        emptyState.style.display = 'block';
        appCta.style.display = 'block';
        if (defaultLeaderboard) {
          defaultLeaderboard.style.opacity = '0';
          setTimeout(() => { defaultLeaderboard.style.display = 'none'; }, 300);
        }
        if (lowestPriceCard) lowestPriceCard.style.display = 'none';
        break;
      case 'error':
        errorState.style.display = 'block';
        if (defaultLeaderboard) {
          defaultLeaderboard.style.opacity = '0';
          setTimeout(() => { defaultLeaderboard.style.display = 'none'; }, 300);
        }
        if (lowestPriceCard) lowestPriceCard.style.display = 'none';
        break;
    }
  }

  // ZIP prefix → 2-letter state abbreviation (lowercase, for matching leaderboard data)
  var ZIP_PREFIX_TO_STATE = {
    '01':'ma','02':'ma','03':'nh','04':'me','05':'vt','06':'ct',
    '07':'nj','08':'nj','10':'ny','11':'ny','12':'ny','13':'ny',
    '14':'ny','15':'pa','16':'pa','17':'pa','18':'pa','19':'pa',
    '20':'dc','21':'md','22':'va','23':'va','24':'wv','25':'wv',
    '26':'wv','27':'nc','28':'nc','29':'sc','30':'ga','31':'ga',
    '32':'fl','33':'fl','34':'fl','35':'al','36':'al','37':'tn',
    '38':'tn','39':'ms','40':'ky','41':'ky','42':'ky','43':'oh',
    '44':'oh','45':'oh','46':'in','47':'in','48':'mi','49':'mi',
    '50':'ia','51':'ia','52':'ia','53':'wi','54':'wi','55':'mn',
    '56':'mt','57':'sd','58':'nd','59':'mt','60':'il','61':'il',
    '62':'il','63':'mo','64':'mo','65':'mo','66':'ks','67':'ks',
    '68':'ne','69':'ne','70':'la','71':'la','72':'ar','73':'ok',
    '74':'ok','75':'tx','76':'tx','77':'tx','78':'tx','79':'tx',
    '80':'co','81':'co','82':'wy','83':'id','84':'ut','85':'az',
    '86':'az','87':'nm','88':'nm','89':'nv','90':'ca','91':'ca',
    '92':'ca','93':'ca','94':'ca','95':'ca','96':'hi','97':'or',
    '98':'wa','99':'ak'
  };

  function getStateFromZipPrefix(zip) {
    if (!zip || zip.length < 2) return null;
    // Handle RI (028, 029) and DE (197, 198, 199) 3-digit prefixes
    var p3 = zip.substring(0, 3);
    if (p3 === '028' || p3 === '029') return 'ri';
    if (p3 === '197' || p3 === '198' || p3 === '199') return 'de';
    return ZIP_PREFIX_TO_STATE[zip.substring(0, 2)] || null;
  }

  // Show empty state with coverage request form
  function showEmpty(zip) {
    document.getElementById('empty-zip').textContent = zip;

    // State average context from cached leaderboard
    var stateAvgEl = document.getElementById('empty-state-avg');
    if (leaderboardData && leaderboardData.stateAverages) {
      var stateCode = getStateFromZipPrefix(zip);
      if (stateCode) {
        var stateData = leaderboardData.stateAverages.find(function(s) { return s.state === stateCode; });
        if (stateData) {
          document.getElementById('empty-state-name').textContent = stateData.stateName;
          document.getElementById('empty-avg-price').textContent = '$' + stateData.avgPrice.toFixed(2);
          document.getElementById('empty-supplier-count').textContent = stateData.supplierCount;
          stateAvgEl.style.display = 'block';
        } else {
          stateAvgEl.style.display = 'none';
        }
      } else {
        stateAvgEl.style.display = 'none';
      }
    } else {
      if (stateAvgEl) stateAvgEl.style.display = 'none';
    }

    // Pre-fill ZIP in coverage form
    var coverageZipInput = document.getElementById('coverage-zip');
    if (coverageZipInput) coverageZipInput.value = zip;

    // Check localStorage for existing signup
    var formInner = document.getElementById('coverage-request-form-inner');
    var alreadyDiv = document.getElementById('coverage-request-already');
    var successDiv = document.getElementById('coverage-request-success');
    try {
      var existing = localStorage.getItem('homeheat_coverage_' + zip);
      if (existing && alreadyDiv && formInner) {
        document.getElementById('coverage-already-zip').textContent = zip;
        alreadyDiv.style.display = 'block';
        formInner.style.display = 'none';
        successDiv.style.display = 'none';
      } else {
        if (alreadyDiv) alreadyDiv.style.display = 'none';
        if (formInner) formInner.style.display = 'block';
        if (successDiv) successDiv.style.display = 'none';
      }
    } catch (e) {
      // localStorage unavailable — show form
    }

    showNearbyZips(zip);
    showState('empty');
    logAnalytics('coverage_empty_shown', { zip: zip });
  }

  // Coverage request "Update preferences" link — reveal form
  (function() {
    var updateLink = document.getElementById('coverage-update-link');
    if (updateLink) {
      updateLink.addEventListener('click', function(e) {
        e.preventDefault();
        var alreadyDiv = document.getElementById('coverage-request-already');
        var formInner = document.getElementById('coverage-request-form-inner');
        if (alreadyDiv) alreadyDiv.style.display = 'none';
        if (formInner) formInner.style.display = 'block';
      });
    }
  })();

  // Coverage request form submission
  (function() {
    var form = document.getElementById('coverage-request-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var emailInput = document.getElementById('coverage-email');
      var zipInput2 = document.getElementById('coverage-zip');
      var submitBtn = document.getElementById('coverage-submit-btn');
      var errorEl = document.getElementById('coverage-request-error');
      var honeypot = form.querySelector('[name="website_url"]');

      var email = (emailInput.value || '').trim();
      var zip2 = (zipInput2.value || '').trim();

      // Client-side honeypot check
      if (honeypot && honeypot.value) return;

      // Basic client-side validation
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }
      if (!zip2 || !/^\d{5}$/.test(zip2)) {
        errorEl.textContent = 'Please enter a valid 5-digit ZIP code.';
        errorEl.style.display = 'block';
        return;
      }

      // Gather fuel types. Note: the kerosene/propane checkboxes are siblings
      // of the <form>, not children — `form.querySelector` would return null.
      // Look them up at document scope (the names are unique on the page).
      var fuelTypes = ['heating_oil'];
      var keroseneBox = document.querySelector('input[name="fuel_kerosene"]');
      if (keroseneBox && keroseneBox.checked) {
        fuelTypes.push('kerosene');
      }
      var propaneBox = document.querySelector('input[name="fuel_propane"]');
      if (propaneBox && propaneBox.checked) {
        fuelTypes.push('propane');
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      errorEl.style.display = 'none';

      fetch(API_BASE + '/api/coverage-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          zip_code: zip2,
          fuel_types: fuelTypes,
          source_page: window.location.pathname
        })
      })
      .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
      .then(function(result) {
        if (result.ok && result.data.success) {
          // Save to localStorage
          try { localStorage.setItem('homeheat_coverage_' + zip2, Date.now().toString()); } catch (e) {}

          // Show success state
          var formInner = document.getElementById('coverage-request-form-inner');
          var successDiv = document.getElementById('coverage-request-success');
          var alreadyDiv = document.getElementById('coverage-request-already');
          if (formInner) formInner.style.display = 'none';
          if (alreadyDiv) alreadyDiv.style.display = 'none';

          var location = result.data.city && result.data.state
            ? result.data.city + ', ' + result.data.state.toUpperCase()
            : zip2;
          document.getElementById('coverage-success-location').textContent = location;

          // Build conditional success links
          var linksHtml = '';
          if (leaderboardData && leaderboardData.stateAverages) {
            var stateCode = getStateFromZipPrefix(zip2);
            if (stateCode) {
              var stateData = leaderboardData.stateAverages.find(function(s) { return s.state === stateCode; });
              if (stateData) {
                linksHtml += '<a href="/prices/' + stateCode + '/">View ' + escapeHtml(stateData.stateName) + ' heating oil prices</a>';
              }
            }
          }
          linksHtml += '<a href="/prices">View all prices</a>';
          document.getElementById('coverage-success-links').innerHTML = linksHtml;

          if (successDiv) successDiv.style.display = 'block';
          logAnalytics('coverage_request', { zip: zip2, fuels: fuelTypes.join(',') });
        } else {
          errorEl.textContent = result.data.error || 'Something went wrong — please try again.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Notify Me';
        }
      })
      .catch(function() {
        errorEl.textContent = 'Something went wrong — please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Notify Me';
      });
    });
  })();

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
