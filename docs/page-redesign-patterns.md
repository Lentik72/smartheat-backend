# Page Redesign Patterns

Reusable patterns extracted from the County Page v2 redesign (heatingoil-3ixk, shipped 2026-04-26). Apply these when planning the next page redesign (state pages, supplier pages, ZIP pages, fuel-hub pages, dashboard).

Spec + plan for the original work: `HeatingOil/docs/superpowers/{specs,plans}/2026-04-24-county-page-evolve-redesign.md`.

---

## When to use this playbook

- You're redesigning a generated page (one served from `website/` by the Express static layer).
- The redesign changes the visible layout, not just copy or styling tweaks.
- The page has SEO weight — Google indexes it, users land on it from search.
- You want to ship without freezing the existing page during development.

If the change is a one-line copy edit or a CSS color tweak, skip this and just edit in place.

---

## Pattern 1 — Parallel-URL rollout

Avoid feature flags and avoid in-place rewrites. Emit the new layout to a parallel URL tree (`/prices/county/v2/...`) while v1 keeps serving the canonical URL. Cutover is a single commit that swaps the default and deletes the v2 tree.

**Why:**
- v1 stays live for organic traffic during development.
- You smoketest the new layout at real production URLs (with real DB data, real CDN, real cron).
- Rollback is `git revert HEAD` — no data state to undo.
- No feature-flag infrastructure to build.

**Implementation shape:**
```js
// Generator accepts a layout flag, defaults to whatever is canonical TODAY.
const cliLayout = layoutArg ? layoutArg.split('=')[1] : 'v2'; // post-cutover

// Pre-cutover, v2 emits to a parallel tree:
const COUNTY_DIR = layout === 'v2'
  ? path.join(outputDir, FUEL.dirPrefix, 'v2')
  : path.join(outputDir, FUEL.dirPrefix);

// v2 pages get a noindex meta during the parallel period:
${isV2 ? `<meta name="robots" content="noindex,nofollow">` : ''}

// canonical/og:url include /v2 during parallel period, drop at cutover:
<link rel="canonical" href=".../prices/county${isV2 ? '/v2' : ''}/...">
```

**Cron wiring during parallel period** — server.js runs both passes:
```js
await cronMonitor.run('county-elite-pages', () => generateCountyElitePages({ ... }));
await cronMonitor.run('county-elite-pages-v2', () => generateCountyElitePages({ ..., layout: 'v2' }));
```

**Cutover commit:**
1. Flip default `layout` to `'v2'`.
2. Drop the `/v2/` subdir routing — both layouts emit at canonical path.
3. Drop the noindex meta.
4. Drop `/v2/` from `canonical` and `og:url`.
5. Drop the v2-specific cron + startup passes.
6. Delete `website/<page-tree>/v2/` directory.
7. (Follow-up commit, optional): delete v1 markup branch entirely.

**Don't:** build a feature-flag table, an A/B routing layer, or a percentage rollout. We're a one-person op; one commit is the rollout.

---

## Pattern 2 — Tokens file separate from page CSS

`website/css/tokens-r2.css` holds CSS custom properties only — colors, spacing, type scale, named radii/shadows. Page-specific CSS imports it.

**Why:**
- Tokens are reusable across pages and across iOS (the iOS app reads the same color names).
- Page CSS files stay focused on layout; design tokens stay focused on system.
- Token edits cascade to every page without touching layout files.

**Pattern:**
```html
<link rel="stylesheet" href="../../style.min.css?v={hash}">          <!-- site-wide base -->
<link rel="stylesheet" href="../../css/tokens-r2.css?v={hash}">     <!-- design tokens -->
<link rel="stylesheet" href="../county-elite.css?v={hash}">          <!-- shared content sections -->
<link rel="stylesheet" href="../county-elite-v2.css?v={hash}">       <!-- this page's hero/list overrides -->
```

Order matters: tokens before page CSS, base CSS before overrides.

**Don't** redefine `--success-green` in three places. Define it in tokens-r2.css; reference it everywhere.

---

## Pattern 3 — CSS source-of-truth at a tracked location

`website/prices/` is gitignored (generated output). For new CSS files like `county-elite-v2.css`, put the **source** at `scripts/lib/<file>.css` (tracked) and have the generator copy it to the output dir on each run.

**Why:**
- The output dir is gitignored, so `git add website/prices/...` won't work.
- The generator needs the file to exist at the linked URL after every fresh deploy.
- Putting the source in `scripts/lib/` makes the file part of the deploy artifact and visible in PR diffs.

**Generator pattern:**
```js
const v2CssSrc = path.join(__dirname, 'lib', 'county-elite-v2.css');
const v2CssContent = fsSync.readFileSync(v2CssSrc, 'utf-8');
const v2Hash = crypto.createHash('md5').update(v2CssContent).digest('hex').slice(0, 8);

// Write BEFORE HTML so CDN doesn't cache stale CSS under new hash:
await fs.writeFile(path.join(outputDir, 'county-elite-v2.css'), v2CssContent);
```

Hash bumps automatically when you edit the source file.

**Tokens file** lives at `website/css/tokens-r2.css` (NOT gitignored — `website/css/` isn't excluded). Generator reads it for hashing too:
```js
const tokensHash = md5(fs.readFileSync('website/css/tokens-r2.css'));
```

---

## Pattern 4 — Renderer module per major section

Hero + supplier list got their own module: `scripts/lib/render-county-v2.js`. Generator calls it; module owns the markup.

**Why:**
- Generator is already 1500+ lines. Adding another 400 lines of v2 hero would make it unreadable.
- The module is testable in isolation (`scripts/lib/render-county-v2.test.js`, bare-node assert, no jest).
- XSS concerns localized — every dynamic value goes through `escapeHtml` from the shared utility.

**Module shape:**
```js
const { escapeHtml } = require('../../src/utils/html');

function renderHeroAnswer({ countyName, stats, allPricedSuppliers, cheapestSupplier, ... }) {
  // Compute all derived values once
  // Build conditional sub-pieces (graceful degradation when data is missing)
  // Return template string
}

function renderSupplierList({ suppliers, cheapestId, visibleCount }) { ... }

module.exports = { renderHeroAnswer, renderSupplierList, cheapestTiebreak, ... };
```

**Test pattern (no framework):**
```js
const assert = require('assert');
const { renderHeroAnswer, cheapestTiebreak } = require('./render-county-v2');

(() => {
  const html = renderHeroAnswer({ ... });
  assert.ok(html.includes('Cheapest in Westchester'));
  assert.ok(!html.includes('<script>alert'), 'XSS escaped');
})();

console.log('render-county-v2 tests passed');
```

Run: `node scripts/lib/<module>.test.js`. Add to CI later if we add CI.

---

## Pattern 5 — Deterministic tiebreak (single comparator)

When multiple data points share an extreme value (cheapest price, highest count, most-recent timestamp), pick ONE winner deterministically.

**Anti-pattern (broken):**
```js
const sorted = items.filter(...).sort(byTime).sort(byHash);  // multi-pass
```
JS `Array.sort` is stable but collapses equal-comparator returns to input order. Multi-pass means the second sort can't break ties from the first.

**Correct (single comparator):**
```js
function cheapestTiebreak(suppliers) {
  const priced = suppliers.filter(s => s.hasPrice && Number.isFinite(Number(s.price)));
  const minPrice = priced.reduce((m, s) => Math.min(m, Number(s.price)), Infinity);
  const tied = priced.filter(s => Number(s.price) === minPrice);
  tied.sort((a, b) => {
    const ta = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
    const tb = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
    return (tb - ta) || hashId(a.id).localeCompare(hashId(b.id));
  });
  return tied[0];
}
```

**Disclose ties** when the hero/card promotes ONE winner from a tied set:
```html
<p class="supplier-line">Supreme Oil · White Plains</p>
<p class="hero-tied-count">+3 more suppliers tied at this price</p>
```
Only show when `tiedCount > 1`. The disclosure lives next to the claim, not buried in the list.

---

## Pattern 6 — Graceful degradation, never broken templates

Every dynamic block conditionally renders. If the data is missing, omit the block entirely — never substitute a fallback string into a templated sentence.

**Anti-pattern:**
```js
// Renders "Current $4.55 is in the this week of the last 6 weeks" when band is null
<p>Current ${low} is in the <strong>${band || 'this week'}</strong> of the last 6 weeks.</p>
```

**Correct:**
```js
const percentileBand = historicalPercentileBand(minPrice, history);  // returns null if history < 7 obs
const percentileHTML = (percentileBand && minPrice != null)
  ? `<p>Current $${minPrice.toFixed(2)} is in the <strong>${escapeHtml(percentileBand)}</strong> of the last 6 weeks.</p>`
  : '';
```

**Common cases to guard:**
- `savings === 0` → omit the savings line, don't render `~$0`.
- `tiedCount === 1` → omit the tied-count disclosure entirely.
- `phone === null` → omit the Call CTA, don't render a disabled-Call placeholder.
- `history.length < 7` → omit the percentile/historical block.
- `min === max` (single supplier or all-clustered county) → omit the savings chip.

**Rule:** if the renderer can produce visible-but-broken copy, the input data needs guarding before the template string.

---

## Pattern 7 — Mobile-first breakpoints

The county v2 uses three breakpoints, mobile-first:

| Breakpoint | What changes |
|---|---|
| Default (320px+) | Single column, stacked card, savings chip below price |
| `min-width: 360px` | Savings chip beside price, supplier-row Call shows phone digits |
| `min-width: 768px` | Breadcrumb visible (hidden under 768px to save first-viewport space) |
| `min-width: 1024px` | Sticky hero bar disabled (desktop has the hero in viewport on scroll), two-column hero |

**Common mobile fixes:**
- `flex` containers need `min-width: 0` on the flex-grow child to prevent siblings from being clipped at narrow widths.
- `flex-shrink: 0` on small fixed-width elements (icons, submit buttons) so they don't get squeezed.
- Keep `min-height: var(--tap-min)` (44px) on every interactive element.

---

## Pattern 8 — Sticky bar that coexists with site nav

The site nav is `position: sticky; top: 0; z-index: 100`. A page-specific sticky bar (e.g., hero answer bar) needs to either:
- Sit BELOW the nav (`top: 70px; z-index: 90`) — both visible during scroll, nav stays accessible.
- Sit ABOVE the nav (`top: 0; z-index: 110`) — bar covers nav while visible.

We picked option 1 for county v2 — preserves nav, no menu/logo loss during scroll.

**IntersectionObserver pattern:**
```js
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
```

**Don't** use `scroll` event listeners — IntersectionObserver is cheaper and battery-friendlier. Always check `'IntersectionObserver' in window` before instantiating.

**Avoid** bottom-fixed sticky bars on pages that also show the iOS `.floating-app-wrapper` — they collide.

---

## Pattern 9 — Honesty rules ("describe, don't prescribe")

When showing observed data:
- **OK:** "Prices range $0.80/gal across 14 suppliers." "Updated 2 hours ago." "Westchester median is $0.12 above the NY state median."
- **OK:** "Save ~$X on a typical delivery" or "▼ $X vs high" — both honest framings of observed spread.
- **Not OK:** "Prices are rising — order now." "Best time to buy." "Save up to $X." "$X saved with HomeHeat."
- **Not OK:** Predictive claims. We see retail, not wholesale; we can't predict.

**Savings framing rule (revised 2026-04-25):** both `(max - min) × 150` and `(median - min) × 150` are honest. Pick to match design context. Never overstate by promising the user will save the full spread.

**Tied-count disclosure** (Pattern 5) is part of this — naming one supplier when several tie is honest only if you also disclose the tie count.

Spec section 7 of the county v2 spec carries the full rule with an anti-slippery-slope clause: interpretation (percentile, tercile, range) is categorically different from prediction (forecast, recommendation). Adding more interpretation never crosses into prediction.

---

## What this redesign explicitly didn't ship

These were tried during option-A implementation, then dropped on visual review:
- `.hero-pain-anchor` — pushed the answer card down on mobile, redundant with range bar + delivery-math.
- `.price-bands` (Good/Average/Overpaying tercile chips) — added ~50px card height, info inferable from range bar.
- `.historical-percentile` — backward-looking sentence, marginal value.
- `.data-trust-inline` — provenance line, low ROI on screen real-estate.

The `historicalPercentileBand` helper + tercile-math constants stay in the renderer for reuse. The markup doesn't ship.

**Lesson for next redesign:** prototype faithful is often the right call. Adding "informational density" beyond what the design shows usually adds chrome more than value. Ship lean first; add density later only if traffic data shows users want it.

---

## Cutover checklist

When moving a parallel-URL rollout to canonical:

- [ ] Generator default flips to new layout
- [ ] Subdir routing (`/v2/`) removed — both layouts emit at canonical path
- [ ] `noindex` meta dropped
- [ ] `canonical` and `og:url` no longer include `/v2`
- [ ] Asset paths recalculated for new depth (e.g., `../` prefix removed)
- [ ] Cron + startup passes for the v2-specific generator removed (default IS v2 now)
- [ ] Old subdir tree deleted from disk
- [ ] Tests still green
- [ ] Local regen produces canonical URLs that serve new markup
- [ ] Old `/v2/` URLs return 404 (parallel tree gone)
- [ ] Push, then `npm run verify-deploy`

Old layout's markup branch can be removed in a follow-up commit once you're confident — 24-48 hours of organic traffic on the new canonical URL is usually enough.

---

## Reuse map for the next redesign

When you redesign the **state landing pages** (`/prices/{state}`):
- Use Pattern 1 (parallel URL `/prices/{state}/v2`)
- Keep tokens-r2.css; add `state-elite-v2.css` next to it
- Build `render-state-v2.js` module the same way
- Apply Pattern 7 mobile breakpoints (probably same 360/768/1024)
- The "tied lowest county" disclosure (Pattern 5) might apply if the page promotes a single county

When you redesign **supplier pages** (`/supplier/{slug}`):
- Pattern 1 still applies (parallel URL `/supplier/v2/{slug}`)
- Tokens reused; new `supplier-elite-v2.css`
- Pattern 6 graceful-degradation matters more — supplier data is sparser
- The "Call" CTA pattern (Call {SupplierName}) is directly transferable
- Sticky bar (Pattern 8) less useful since supplier pages are shorter

When you redesign the **dashboard** (iOS):
- CSS patterns don't transfer (SwiftUI), but tokens-r2 color names are designed to be portable — same `--success-green` value used in the iOS Color extension
- Honesty rules (Pattern 9) absolutely transfer — describe, don't prescribe
- Tiebreak (Pattern 5) transfers conceptually if any view promotes a single best metric

---

## Out of scope for this doc

- Database schema patterns → see `docs/price-pipeline.md`
- Supplier model and lifecycle → see `docs/supplier-lifecycle.md`
- Generator architecture → see `docs/website-generation.md`
- Deploy + rollback → see `docs/deployment.md`

This doc only covers the patterns that emerged from the v2 redesign and would be useful to reuse when redesigning a different page.
