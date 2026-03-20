#!/usr/bin/env node
/**
 * Droplet Health Check — Canary diagnostic tool
 *
 * POSTs to 3-4 known Droplet suppliers, reports success/failure/price.
 * Run before each batch rollout and as a manual troubleshooting tool.
 *
 * Usage:
 *   node scripts/droplet-health.js
 */

const CANARY_SUPPLIERS = [
  { name: 'G&G Oil (CT)', url: 'https://ggoilct.com/get-price/', zip: '06489', wcp_id: '2' },
  { name: 'Reis Fuel (NJ)', url: 'https://reisfuel.com/get-price/', zip: '07828', wcp_id: '2' },
  { name: 'FJB Oil (CT)', url: 'https://fjboil.com/get-price/', zip: '06716', wcp_id: '2' },
  { name: 'Barrco Fuel (NY)', url: 'https://orders.dropletfuel.com/barrcofuel/check-price/', zip: '10501', wcp_id: '2' },
];

// Chrome version from date — stays fresh without manual updates
const _chromeBase = 132;
const _chromeBaseDate = new Date('2025-01-14');
const _currentChrome = _chromeBase + Math.floor((Date.now() - _chromeBaseDate.getTime()) / (35 * 24 * 60 * 60 * 1000));
const BROWSER_UA_POOL = [
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_currentChrome}.0.0.0 Safari/537.36`,
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_currentChrome - 1}.0.0.0 Safari/537.36`,
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${_currentChrome - 2}.0.0.0 Safari/537.36`,
];

const PRICE_REGEX = /tier_price_option"[^>]*data-gal="[0-9]+"[^>]*>([0-9]+\.[0-9]{2,3})/;
const FALLBACK_REGEX = /\$\s*([0-9]+\.[0-9]{2,3})/;

async function checkSupplier(supplier) {
  const ua = BROWSER_UA_POOL[Math.floor(Math.random() * BROWSER_UA_POOL.length)];
  const formParams = new URLSearchParams({ wcp_id: supplier.wcp_id, zip_code: supplier.zip });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(supplier.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml',
      },
      body: formParams.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return { name: supplier.name, status: 'FAIL', detail: `HTTP ${resp.status}` };
    }

    const html = await resp.text();

    // Check for blocks
    if (/captcha|blocked|rate.limit/i.test(html)) {
      return { name: supplier.name, status: 'BLOCKED', detail: 'Block text detected in response' };
    }

    // Try primary regex (150-gal tier)
    let match = PRICE_REGEX.exec(html);
    if (match) {
      return { name: supplier.name, status: 'OK', price: `$${match[1]}`, tier: '150gal' };
    }

    // Fallback: generic dollar amount
    match = FALLBACK_REGEX.exec(html);
    if (match) {
      return { name: supplier.name, status: 'OK', price: `$${match[1]}`, tier: 'generic' };
    }

    return { name: supplier.name, status: 'FAIL', detail: 'No price found in response' };
  } catch (err) {
    clearTimeout(timeout);
    const detail = err.name === 'AbortError' ? 'Timeout (10s)' : err.message;
    return { name: supplier.name, status: 'FAIL', detail };
  }
}

async function main() {
  console.log('Droplet Health Check');
  console.log('─'.repeat(60));

  const results = [];
  for (const supplier of CANARY_SUPPLIERS) {
    // Sequential to avoid hammering the same server
    const result = await checkSupplier(supplier);
    results.push(result);

    const icon = result.status === 'OK' ? '✅' :
                 result.status === 'BLOCKED' ? '🚫' : '❌';
    const detail = result.price
      ? `${result.price} (${result.tier})`
      : result.detail;
    console.log(`  ${icon} ${result.name.padEnd(25)} ${detail}`);

    // 2-second delay between requests
    if (CANARY_SUPPLIERS.indexOf(supplier) < CANARY_SUPPLIERS.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('─'.repeat(60));
  const ok = results.filter(r => r.status === 'OK').length;
  const total = results.length;
  console.log(`  ${ok}/${total} healthy`);

  if (ok < total) {
    console.log('\n  ⚠️  Some suppliers failed. Check before enabling batch.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
