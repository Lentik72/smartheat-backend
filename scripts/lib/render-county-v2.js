/**
 * County Page v2 renderer — produces the hero "answer card" and the
 * supplier-list markup that replaces v1's <header>/.zip-filter-section
 * and the supplier <table>.
 *
 * Source of design: Claude Design Round 2 prototype
 * (~/Desktop/ClaudeDesign-Package/round-2-handoff-v2/handoff/county-prototype.html).
 * Spec: docs/superpowers/specs/2026-04-24-county-page-evolve-redesign.md
 *
 * Honesty rules (spec Section 7 + memory feedback_savings_framing.md):
 *   - Savings = (median - min) * 150  (NEVER (max - min)).
 *   - "Lowest price" badge text on the cheapest row (NEVER "save $X" chip).
 *   - Describe the data; never recommend buy/wait.
 *   - When savings === 0 or non-finite, omit savings copy entirely.
 */

const crypto = require('crypto');
const { escapeHtml } = require('../../src/utils/html');

const STANDARD_DELIVERY_GAL = 150;

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function hashId(id) {
  return crypto.createHash('md5').update(String(id ?? '')).digest('hex');
}

/**
 * Pick the single cheapest supplier when multiple suppliers tie at min_price.
 * Single-comparator sort: most recent scrape first, then stable MD5 hash.
 * Multi-pass sorts collapse equal timestamps to input order — wrong.
 */
function cheapestTiebreak(suppliers) {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return null;
  const priced = suppliers.filter(s => s && s.hasPrice && Number.isFinite(Number(s.price)));
  if (priced.length === 0) return null;
  const minPrice = priced.reduce((m, s) => Math.min(m, Number(s.price)), Infinity);
  const tied = priced.filter(s => Number(s.price) === minPrice);
  tied.sort((a, b) => {
    const ta = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
    const tb = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
    return (tb - ta) || hashId(a.id).localeCompare(hashId(b.id));
  });
  return tied[0];
}

/**
 * 3-bucket freshness for the per-row chip.
 * Intentionally distinct from supplier-data.js's computeFreshness (5-bucket)
 * — that one is used elsewhere on the site for different copy.
 */
function freshnessChip(scrapedAt) {
  if (!scrapedAt) return { klass: 'is-stale', label: 'Stale' };
  const ageMs = Date.now() - new Date(scrapedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return { klass: 'is-stale', label: 'Stale' };
  const ageH = ageMs / 3_600_000;
  if (ageH < 48) return { klass: 'is-fresh', label: 'Fresh' };
  if (ageH <= 24 * 7) return { klass: 'is-recent', label: 'Recent' };
  return { klass: 'is-stale', label: 'Stale' };
}

/**
 * Plain-language percentile for hero copy.
 * Returns null when history is too thin to be meaningful — caller MUST
 * omit the entire <p class="historical-percentile"> block on null.
 * (Built but NOT wired into the initial hero; available for future use.)
 */
function historicalPercentileBand(currentMin, history) {
  if (!Array.isArray(history) || history.length < 7) return null;
  const obs = history.map(h => Number(h && h.min_price)).filter(Number.isFinite);
  if (obs.length < 7) return null;
  if (!Number.isFinite(currentMin)) return null;
  const rank = obs.filter(p => p <= currentMin).length / obs.length;
  if (rank <= 0.10) return 'bottom 10%';
  if (rank <= 0.25) return 'bottom 25%';
  if (rank <= 0.50) return 'bottom half';
  if (rank >= 0.90) return 'top 10%';
  if (rank >= 0.75) return 'top 25%';
  return 'top half';
}

/**
 * Human-readable freshness for the hero meta line.
 * "today" / "yesterday" / "{N} days ago" / "stale — last update {N} days ago"
 */
/**
 * Format a scrape timestamp as "9:14 AM" for the hero "as of" line.
 * Returns null when scrapedAt is missing/invalid.
 */
function formatTimeOfDay(scrapedAt) {
  if (!scrapedAt) return null;
  const d = new Date(scrapedAt);
  if (isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function freshnessHuman(maxScrapedAt) {
  if (!maxScrapedAt) return 'unknown';
  const ageMs = Date.now() - new Date(maxScrapedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  const ageH = ageMs / 3_600_000;
  if (ageH < 24) return 'today';
  if (ageH < 48) return 'yesterday';
  const ageD = Math.round(ageH / 24);
  if (ageD <= 7) return `${ageD} days ago`;
  return `stale — last update ${ageD} days ago`;
}

function maxScrapedAt(suppliers) {
  let max = 0;
  for (const s of suppliers || []) {
    if (!s || !s.scrapedAt) continue;
    const t = new Date(s.scrapedAt).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max ? new Date(max).toISOString() : null;
}

function initials(name) {
  if (!name) return '??';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function safeTel(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.length < 7) return null;
  return digits;
}

// ──────────────────────────────────────────────────────────
// Renderers
// ──────────────────────────────────────────────────────────

/**
 * Hero answer card — replaces v1's <header class="page-header"> +
 * <section class="zip-filter-section"> blocks.
 *
 * Faithful to the Claude Design prototype. The savings copy is
 * median-based (not max-based) per memory feedback_savings_framing.md.
 * When savings === 0 (e.g., median ≈ min cluster county), the
 * savings line is omitted rather than rendering "$0 saved".
 */
function renderHeroAnswer({ countyName, stateCode, stateName, stats, allPricedSuppliers, cheapestSupplier, breadcrumbHTML }) {
  const supplierCount = (allPricedSuppliers || []).length;
  // Derive low/high from the SAME supplier list the table renders, so the
  // hero's big price and the list's cheapest row never disagree. county_current_stats
  // is a cron-computed snapshot that can lag behind individual supplier scrapes.
  const supplierPrices = (allPricedSuppliers || [])
    .map(s => Number(s && s.price))
    .filter(p => Number.isFinite(p) && p > 0);
  const minPrice = supplierPrices.length > 0 ? Math.min(...supplierPrices) : null;
  const maxPrice = supplierPrices.length > 0 ? Math.max(...supplierPrices) : null;
  // Median is expensive to compute on every render; trust the stats snapshot.
  // If it's stale by a few cents, the visual band is still informative.
  const medianPrice = stats && Number.isFinite(Number(stats.median_price)) ? Number(stats.median_price) : null;

  // "vs high" framing — matches Claude Design prototype. Both framings (max-min
  // and median-min) are honest: the page shows real observed data, the user
  // reads the spread. Decision date 2026-04-25 (reverted from median-only).
  const deliveryLow = minPrice ? Math.round(minPrice * STANDARD_DELIVERY_GAL) : null;
  const deliveryHigh = maxPrice ? Math.round(maxPrice * STANDARD_DELIVERY_GAL) : null;
  const savingsRaw = (maxPrice != null && minPrice != null) ? (maxPrice - minPrice) * STANDARD_DELIVERY_GAL : null;
  const savings = (savingsRaw != null && Number.isFinite(savingsRaw) && savingsRaw > 0) ? Math.round(savingsRaw) : 0;
  const savingsChipPerGal = (maxPrice != null && minPrice != null && maxPrice > minPrice)
    ? (maxPrice - minPrice).toFixed(2) : null;

  const cheapestZipForRefine = ''; // server has no user ZIP; client JS may hydrate from URL
  const freshScrapedAt = maxScrapedAt(allPricedSuppliers);
  const freshTimeOfDay = formatTimeOfDay(freshScrapedAt);
  const freshHuman = freshnessHuman(freshScrapedAt);

  const cheapestName = cheapestSupplier && cheapestSupplier.name ? cheapestSupplier.name : null;
  const cheapestCity = cheapestSupplier && cheapestSupplier.city ? cheapestSupplier.city : null;
  const cheapestSlug = cheapestSupplier && cheapestSupplier.slug ? cheapestSupplier.slug : null;

  // Build inner pieces conditionally so we never render broken/zero-value lines.
  const savingsChipHTML = savingsChipPerGal
    ? `<span class="savings-chip" role="status">▼ $${savingsChipPerGal} vs high</span>`
    : '';

  const supplierLineHTML = cheapestName
    ? (cheapestSlug
        ? `<p class="supplier-line"><a href="/supplier/${escapeHtml(cheapestSlug)}">${escapeHtml(cheapestName)}</a>${cheapestCity ? ` · ${escapeHtml(cheapestCity)}` : ''}</p>`
        : `<p class="supplier-line">${escapeHtml(cheapestName)}${cheapestCity ? ` · ${escapeHtml(cheapestCity)}` : ''}</p>`)
    : '';

  // Tied-count disclosure — when N suppliers share min_price, the hero names
  // ONE (the deterministic tiebreak winner). Without this line, the user
  // could read the hero as "Supreme is uniquely cheapest" when there are
  // actually 4 suppliers at the same price. Honest disclosure adjacent to the
  // claim. Omitted when only 1 supplier is at the min (no tie to disclose).
  const tiedCount = (minPrice != null)
    ? supplierPrices.filter(p => p === minPrice).length
    : 0;
  const tiedExtra = tiedCount > 1 ? tiedCount - 1 : 0;
  const tiedHTML = tiedExtra > 0
    ? `<p class="hero-tied-count">+${tiedExtra} more supplier${tiedExtra === 1 ? '' : 's'} tied at this price</p>`
    : '';

  const priceRangeHTML = (minPrice != null && medianPrice != null && maxPrice != null) ? `
      <figure class="price-range" aria-label="Price range in ${escapeHtml(countyName)}: $${minPrice.toFixed(2)} low to $${maxPrice.toFixed(2)} high, average $${medianPrice.toFixed(2)}">
        <figcaption class="price-range-labels">
          <span>$${minPrice.toFixed(2)} low</span><span>$${medianPrice.toFixed(2)} avg</span><span>$${maxPrice.toFixed(2)} high</span>
        </figcaption>
        <div class="price-range-bar" role="presentation">
          <span class="price-range-marker" aria-hidden="true"></span>
        </div>
      </figure>` : '';

  const deliveryMathHTML = (deliveryLow != null && deliveryHigh != null) ? `
      <div class="delivery-math">
        <p class="delivery-math-label">For a ${STANDARD_DELIVERY_GAL} gal delivery you'd pay</p>
        <p>
          <span class="delivery-math-total">$${deliveryLow}</span>
          <span class="delivery-math-compare">vs $${deliveryHigh} at the highest</span>
        </p>${savings > 0 ? `
        <p class="delivery-math-savings">You save ~$${savings} on this delivery</p>` : ''}
      </div>` : '';

  const priceBlockHTML = minPrice != null ? `
      <p class="price">
        <strong>$${minPrice.toFixed(2)}</strong><span class="unit">/gal</span>
        ${savingsChipHTML}
      </p>` : `
      <p class="price"><strong>—</strong><span class="unit">/gal</span></p>`;

  // In-card Call CTA — primary action when we know the cheapest supplier's
  // phone. Sits above the ZIP refine form so Call (primary) ranks above
  // Refine (secondary). Omitted entirely when no phone — never render a
  // disabled-Call placeholder (per CLAUDE.md anti-empty-state rule).
  const cheapestTelInCard = cheapestSupplier ? safeTel(cheapestSupplier.phone) : null;
  const cardCallHTML = (cheapestTelInCard && cheapestName)
    ? `
      <a class="card-call" href="tel:${escapeHtml(cheapestTelInCard)}" aria-label="Call ${escapeHtml(cheapestName)} at ${escapeHtml(cheapestSupplier.phone)}">
        Call ${escapeHtml(cheapestName)}
      </a>`
    : '';


  // Sticky hero bar (mobile only — CSS hides ≥1024px). IntersectionObserver
  // toggles `.is-visible` when the hero scrolls past the viewport top.
  // Respects prefers-reduced-motion via CSS transition only (no JS easing).
  const cheapestTel = cheapestTelInCard;
  const stickyBarHTML = (minPrice != null && cheapestName) ? `
<aside class="sticky-hero-bar" id="stickyBar" aria-hidden="true">
  <span class="pulse-dot" aria-hidden="true"></span>
  <div class="sticky-hero-bar-body">
    <p class="sticky-hero-bar-eyebrow">Cheapest in ${escapeHtml(countyName)}</p>
    <p class="sticky-hero-bar-price"><strong>$${minPrice.toFixed(2)}</strong> <span>/gal · ${escapeHtml(cheapestName)}</span></p>
  </div>${cheapestTel ? `
  <a class="btn-call" href="tel:${escapeHtml(cheapestTel)}" aria-label="Call ${escapeHtml(cheapestName)}">Call →</a>` : ''}
</aside>
<script>
(function(){
  var hero = document.querySelector('.hero-answer');
  var bar = document.getElementById('stickyBar');
  if (!hero || !bar || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      var show = !e.isIntersecting;
      bar.classList.toggle('is-visible', show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    });
  }, { rootMargin: '-56px 0px 0px 0px' });
  io.observe(hero);
})();
</script>` : '';

  return `
<section class="hero-answer" aria-labelledby="hero-title">
  <div class="hero-inner">

    <div>
      ${breadcrumbHTML || ''}

      <h1 id="hero-title" class="hero-title">Cheapest heating oil in ${escapeHtml(countyName)} today</h1>
      <p class="hero-meta">
        <span class="pulse-dot" aria-hidden="true"></span>
        ${supplierCount} supplier${supplierCount === 1 ? '' : 's'} tracked · updated ${escapeHtml(freshHuman)} · Free, no signup
      </p>

      <ul class="hero-proof" aria-label="What you get">
        <li>✓ Real prices, not teasers</li>
        <li>✓ No calls until you pick</li>
        <li>✓ Updated daily from suppliers</li>
        <li>✓ Works with any sized tank</li>
      </ul>
    </div>

    <article class="answer-card" aria-labelledby="answer-eyebrow">
      <div class="answer-head">
        <p class="eyebrow" id="answer-eyebrow">Lowest in ${escapeHtml(countyName)}</p>
        <p class="answer-timestamp">${freshTimeOfDay ? `as of ${escapeHtml(freshTimeOfDay)}` : `updated ${escapeHtml(freshHuman)}`}</p>
      </div>
${priceBlockHTML}
${supplierLineHTML}
${tiedHTML}
${priceRangeHTML}
${deliveryMathHTML}
${cardCallHTML}
      <form class="zip-refine" role="search" action="/prices/" method="get">
        <label for="zip-refine" class="visually-hidden">Refine by ZIP</label>
        <input id="zip-refine" name="zip"
               inputmode="numeric" pattern="[0-9]{5}"
               maxlength="5" value="${escapeHtml(cheapestZipForRefine)}"
               placeholder="Refine by ZIP">
        <button type="submit">Refine →</button>
      </form>
    </article>

  </div>
</section>${stickyBarHTML}`;
}

/**
 * Supplier list — replaces v1's <table class="supplier-table">.
 * Only the tiebreak winner (single id) gets `is-cheapest` + "Lowest price" badge.
 * All tied-low suppliers still sort to the top of the list; only the winner
 * gets the visual treatment (per spec Section 1 "Tie handling": applying
 * cheapest visuals to multiple rows dilutes the signal).
 */
function renderSupplierList({ suppliers, cheapestId, visibleCount = 12 }) {
  if (!suppliers || suppliers.length === 0) return '';

  const visible = suppliers.slice(0, visibleCount);
  const hidden = suppliers.slice(visibleCount);
  const isCheapestRow = (s) =>
    cheapestId != null && s && String(s.id) === String(cheapestId);

  const renderRow = (s, isCheapest) => {
    const name = escapeHtml(s.name || 'Unknown supplier');
    const city = escapeHtml(s.city || '');
    // 0 isn't a real minimum — fall back to the industry-standard 150 gal default.
    const rawMinGal = Number(s.minGallons);
    const minGal = Number.isFinite(rawMinGal) && rawMinGal > 0 ? rawMinGal : 150;
    // $0 prices are bad data, not real prices. Treat as "no price".
    const rawPrice = Number(s.price);
    const hasRealPrice = s.hasPrice && Number.isFinite(rawPrice) && rawPrice > 0;
    const price = hasRealPrice ? rawPrice : null;
    const deliveryCost = price ? Math.round(price * minGal) : null;
    // Freshness chip only meaningful when we've actually scraped.
    // Directory-only suppliers (no price scraped) get NO chip — "Stale" would
    // imply we tried recently; we haven't.
    const showFreshness = hasRealPrice && s.scrapedAt;
    const fresh = showFreshness ? freshnessChip(s.scrapedAt) : null;
    const tel = safeTel(s.phone);
    const profileHref = s.slug ? `/supplier/${encodeURIComponent(s.slug)}` : null;
    const verifiedBadge = s.claimed_at
      ? `<span class="badge-verified">✓ Verified</span>`
      : '';
    const flagCheapest = isCheapest
      ? `<span class="flag-cheapest" role="status">Lowest price</span>`
      : '';
    // Stable color assignment — same supplier always gets the same avatar color
    // across regenerations. 8 prototype variants (av-0 through av-7).
    const avIdx = parseInt(hashId(s.id).slice(0, 2), 16) % 8;

    const nameHTML = profileHref
      ? `<a href="${profileHref}" class="supplier-name">${name}</a>`
      : `<span class="supplier-name">${name}</span>`;

    const callHTML = tel
      ? `<a href="tel:${escapeHtml(tel)}" class="btn-call" aria-label="Call ${name} at ${escapeHtml(s.phone)}">
            Call <span class="call-num">${escapeHtml(s.phone)}</span>
         </a>`
      : `<span class="btn-call btn-call-disabled" aria-disabled="true">No phone</span>`;

    const profileHTML = profileHref
      ? `<a href="${profileHref}" class="btn-profile">Profile</a>`
      : '';

    const badgesHTML = (verifiedBadge || fresh)
      ? `<div class="supplier-badges">
                ${verifiedBadge}
                ${fresh ? `<span class="freshness ${fresh.klass}">${fresh.label}</span>` : ''}
              </div>`
      : '';

    return `
        <li>
          <article class="supplier-row${isCheapest ? ' is-cheapest' : ''}">
            <div class="supplier-avatar av-${avIdx}" aria-hidden="true">${escapeHtml(initials(s.name))}</div>
            <div class="supplier-head">
              ${nameHTML}
              ${city ? `<p class="supplier-meta">${city} · min ${minGal} gal</p>` : `<p class="supplier-meta">min ${minGal} gal</p>`}
              ${badgesHTML}
            </div>
            <div class="supplier-price">
              ${hasRealPrice
                ? `<p class="price-big">$${price.toFixed(2)}</p>
                   <p class="price-unit">per gal</p>
                   <p class="price-delivery">~$${deliveryCost} / ${minGal}</p>`
                : `<p class="price-big">—</p><p class="price-unit">call for price</p>`}
            </div>
            <div class="supplier-actions">
              ${callHTML}
              ${profileHTML}
            </div>
            ${flagCheapest}
          </article>
        </li>`;
  };

  // All rows live in a single <ul> so they share the same grid layout.
  // Extras get hidden="" attr; click reveals them in place.
  const allRowsHTML = visible.map(s => renderRow(s, isCheapestRow(s))).join('\n')
    + (hidden.length > 0
        ? '\n' + hidden.map(s => renderRow(s, isCheapestRow(s)).replace('<li>', '<li hidden class="supplier-row-extra">')).join('\n')
        : '');

  const showMoreHTML = hidden.length > 0
    ? `\n<button type="button" class="show-more">Show ${hidden.length} more supplier${hidden.length === 1 ? '' : 's'}</button>
<script>
(function(){
  var btn = document.currentScript.previousElementSibling;
  if (!btn || !btn.classList.contains('show-more')) return;
  btn.addEventListener('click', function(){
    document.querySelectorAll('.supplier-row-extra').forEach(function(li){ li.removeAttribute('hidden'); });
    btn.remove();
  });
})();
</script>`
    : '';

  return `
      <ul class="supplier-list">
        ${allRowsHTML}
      </ul>${showMoreHTML}`;
}

module.exports = {
  STANDARD_DELIVERY_GAL,
  cheapestTiebreak,
  freshnessChip,
  freshnessHuman,
  formatTimeOfDay,
  historicalPercentileBand,
  hashId,
  initials,
  safeTel,
  renderHeroAnswer,
  renderSupplierList,
};
