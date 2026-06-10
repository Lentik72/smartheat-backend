// src/services/IndexNowService.test.js
// Plain-Node assertion style (see migrations-list.test.js). Exits 0 on
// success, 1 on any failure. DB/network-free (stubbed sequelize + injected fetch).
const assert = require('assert');
const path = require('path');
const os = require('os');
const fsReal = require('fs');
const {
  normalizePageContent, hashContent, parseSitemapUrls, urlPathToFilePath,
  hashSitemapPages, diffPages, loadStoredHashes, saveHashes, pruneHashes,
  submitToIndexNow, runIndexNowSubmission, INDEXNOW_ENDPOINT,
} = require('./IndexNowService');

let passed = 0, failed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + label); }
  catch (e) { failed++; console.error('  ✗ ' + label + ' — ' + e.message); }
}

(async function main() {
  console.log('\n=== normalize / hash ===');

  await check('date-only differences collapse to same hash', () => {
    const a = '<script>{"dateModified":"2026-06-10","priceValidUntil":"2026-06-17"}</script><p>$4.799</p><link href="s.css?v=abc123">';
    const b = '<script>{"dateModified":"2026-06-11","priceValidUntil":"2026-06-18"}</script><p>$4.799</p><link href="s.css?v=def456">';
    assert.strictEqual(hashContent(normalizePageContent(a)), hashContent(normalizePageContent(b)));
  });

  await check('a price change produces a different hash', () => {
    const c = '<p>$4.799</p>';
    const d = '<p>$4.699</p>';
    assert.notStrictEqual(hashContent(normalizePageContent(c)), hashContent(normalizePageContent(d)));
  });

  await check('relative "Nh ago" / "Nd ago" freshness is stripped (drifts nightly)', () => {
    const a = '<td class="supplier-freshness"><span class="freshness-dot fresh"></span> 5h ago</td><p>$4.50</p>';
    const b = '<td class="supplier-freshness"><span class="freshness-dot fresh"></span> 14h ago</td><p>$4.50</p>';
    assert.strictEqual(hashContent(normalizePageContent(a)), hashContent(normalizePageContent(b)));
    const c = '<span>3d ago</span><p>$4.50</p>';
    const d = '<span>6d ago</span><p>$4.50</p>';
    assert.strictEqual(hashContent(normalizePageContent(c)), hashContent(normalizePageContent(d)));
  });

  await check('word-form freshness (Now / today / Yesterday / just now / Updated now) collapses', () => {
    const variants = [
      '<span>Now</span><p>$4.50</p>',
      '<span>Updated now</span><p>$4.50</p>',
      '<span>just now</span><p>$4.50</p>',
      '<span>today</span><p>$4.50</p>',
      '<span>Yesterday</span><p>$4.50</p>',
      '<span>5h ago</span><p>$4.50</p>',
    ];
    const hashes = variants.map(v => hashContent(normalizePageContent(v)));
    assert.ok(hashes.every(h => h === hashes[0]), 'all freshness variants hash equal');
  });

  await check('human "Mon DD, YYYY" dates are stripped', () => {
    const a = 'Last scrape Jun 10, 2026 <p>$4.50</p>';
    const b = 'Last scrape Jun 11, 2026 <p>$4.50</p>';
    assert.strictEqual(hashContent(normalizePageContent(a)), hashContent(normalizePageContent(b)));
  });

  console.log('\n=== sitemap parse / path mapping ===');

  await check('parseSitemapUrls strips BASE_URL and maps root to "/"', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.gethomeheat.com/</loc></url>
      <url><loc>https://www.gethomeheat.com/prices/ak/</loc></url>
      <url><loc>https://www.gethomeheat.com/supplier/abc-oil</loc></url>
    </urlset>`;
    assert.deepStrictEqual(parseSitemapUrls(xml), ['/', '/prices/ak/', '/supplier/abc-oil']);
  });

  await check('urlPathToFilePath reverses generate-sitemap fileToUrl', () => {
    const wd = '/srv/website';
    assert.strictEqual(urlPathToFilePath('/', wd), path.join(wd, 'index.html'));
    assert.strictEqual(urlPathToFilePath('/prices/ak/', wd), path.join(wd, 'prices/ak/index.html'));
    assert.strictEqual(urlPathToFilePath('/supplier/abc-oil', wd), path.join(wd, 'supplier/abc-oil.html'));
  });

  console.log('\n=== hashSitemapPages / diffPages ===');

  await check('hashSitemapPages reads via injected reader and reports missing', () => {
    const fakeFiles = {
      '/srv/website/index.html': '<p>$4.50</p>',
      '/srv/website/prices/ak/index.html': '<p>$4.99</p>',
    };
    const reader = (fp) => {
      if (fakeFiles[fp] == null) { const e = new Error('ENOENT'); throw e; }
      return fakeFiles[fp];
    };
    const { current, missing } = hashSitemapPages(['/', '/prices/ak/', '/gone'], '/srv/website', reader);
    assert.strictEqual(current.size, 2);
    assert.deepStrictEqual(missing, ['/gone']);
  });

  await check('diffPages: new + changed submitted, gone pruned (not submitted), unchanged skipped', () => {
    const current = new Map([['/a', 'h1'], ['/b', 'h2new'], ['/c', 'h3']]);
    const stored  = new Map([['/a', 'h1'], ['/b', 'h2old'], ['/d', 'h4']]);
    const { toSubmit, toPrune } = diffPages(current, stored);
    assert.deepStrictEqual(toSubmit.sort(), ['/b', '/c']);
    assert.deepStrictEqual(toPrune, ['/d']);
  });

  console.log('\n=== DB layer (stubbed sequelize) ===');

  await check('loadStoredHashes returns a Map of url -> content_hash', async () => {
    const stub = { query: async () => [[{ url: '/a', content_hash: 'h1' }, { url: '/b', content_hash: 'h2' }], {}] };
    const m = await loadStoredHashes(stub);
    assert.strictEqual(m.get('/a'), 'h1');
    assert.strictEqual(m.get('/b'), 'h2');
  });

  await check('saveHashes upserts with bound params', async () => {
    const calls = [];
    const stub = { query: async (sql, opts) => { calls.push({ sql, bind: opts && opts.bind }); return [[], {}]; } };
    await saveHashes(stub, new Map([['/a', 'h1'], ['/b', 'h2']]));
    assert.strictEqual(calls.length, 1);
    assert.ok(/INSERT INTO indexnow_page_hashes/.test(calls[0].sql));
    assert.ok(/ON CONFLICT \(url\) DO UPDATE/.test(calls[0].sql));
    assert.deepStrictEqual(calls[0].bind, ['/a', 'h1', '/b', 'h2']);
  });

  await check('pruneHashes deletes by url array, no-ops on empty', async () => {
    const calls = [];
    const stub = { query: async (sql, opts) => { calls.push({ sql, bind: opts && opts.bind }); return [[], {}]; } };
    await pruneHashes(stub, []);
    assert.strictEqual(calls.length, 0);
    await pruneHashes(stub, ['/d', '/e']);
    assert.strictEqual(calls.length, 1);
    assert.ok(/DELETE FROM indexnow_page_hashes WHERE url = ANY/.test(calls[0].sql));
    assert.deepStrictEqual(calls[0].bind, [['/d', '/e']]);
  });

  console.log('\n=== submitToIndexNow (fake fetch) ===');

  await check('POSTs absolute URLs with host/key/keyLocation and reports submittedUrls', async () => {
    const seen = [];
    const fakeFetch = async (url, opts) => { seen.push({ url, opts }); return { ok: true, status: 200 }; };
    const r = await submitToIndexNow(['/x', '/prices/ak/'], { key: 'abc123', fetchImpl: fakeFetch, logger: { error() {} } });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].url, INDEXNOW_ENDPOINT);
    const body = JSON.parse(seen[0].opts.body);
    assert.strictEqual(body.host, 'www.gethomeheat.com');
    assert.strictEqual(body.key, 'abc123');
    assert.strictEqual(body.keyLocation, 'https://www.gethomeheat.com/abc123.txt');
    assert.deepStrictEqual(body.urlList, ['https://www.gethomeheat.com/x', 'https://www.gethomeheat.com/prices/ak/']);
    assert.strictEqual(r.submitted, 2);
    assert.deepStrictEqual(r.submittedUrls, ['/x', '/prices/ak/']);
    assert.strictEqual(r.failed, 0);
  });

  await check('a non-OK response counts as failed, not submitted (so it retries next run)', async () => {
    const fakeFetch = async () => ({ ok: false, status: 403 });
    const r = await submitToIndexNow(['/x'], { key: 'k', fetchImpl: fakeFetch, logger: { error() {} } });
    assert.strictEqual(r.submitted, 0);
    assert.deepStrictEqual(r.submittedUrls, []);
    assert.strictEqual(r.failed, 1);
  });

  console.log('\n=== runIndexNowSubmission (temp fixture) ===');

  await check('bootstrap run submits every indexable URL and persists hashes', async () => {
    const dir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
    fsReal.writeFileSync(path.join(dir, 'sitemap.xml'),
      `<urlset><url><loc>https://www.gethomeheat.com/</loc></url>` +
      `<url><loc>https://www.gethomeheat.com/prices/ak/</loc></url></urlset>`);
    fsReal.writeFileSync(path.join(dir, 'index.html'), '<p>$4.50 — 2026-06-10</p>');
    fsReal.mkdirSync(path.join(dir, 'prices', 'ak'), { recursive: true });
    fsReal.writeFileSync(path.join(dir, 'prices', 'ak', 'index.html'), '<p>$4.99</p>');

    const sql = [];
    const stubSequelize = {
      query: async (q, opts) => {
        sql.push(q);
        if (/^SELECT/.test(q)) return [[], {}];
        return [[], {}];
      },
    };
    const posted = [];
    const fakeFetch = async (url, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };

    process.env.INDEXNOW_KEY = 'testkey';
    delete process.env.INDEXNOW_DRY_RUN;
    const r = await runIndexNowSubmission({ sequelize: stubSequelize, logger: { info() {}, error() {}, warn() {} }, websiteDir: dir, fetchImpl: fakeFetch });

    assert.strictEqual(r.indexable, 2);
    assert.strictEqual(r.submitted, 2);
    assert.strictEqual(posted.length, 1);
    assert.deepStrictEqual(posted[0].urlList.sort(), ['https://www.gethomeheat.com/', 'https://www.gethomeheat.com/prices/ak/']);
    assert.ok(sql.some(q => /INSERT INTO indexnow_page_hashes/.test(q)), 'persisted hashes');
  });

  await check('missing INDEXNOW_KEY => skip, no fetch', async () => {
    const dir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
    fsReal.writeFileSync(path.join(dir, 'sitemap.xml'), `<urlset></urlset>`);
    let fetched = false;
    const fakeFetch = async () => { fetched = true; return { ok: true, status: 200 }; };
    delete process.env.INDEXNOW_KEY;
    const r = await runIndexNowSubmission({ sequelize: { query: async () => [[], {}] }, logger: { info() {}, error() {}, warn() {} }, websiteDir: dir, fetchImpl: fakeFetch });
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(fetched, false);
  });

  await check('dry-run submits nothing and persists nothing', async () => {
    const dir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
    fsReal.writeFileSync(path.join(dir, 'sitemap.xml'),
      `<urlset><url><loc>https://www.gethomeheat.com/</loc></url></urlset>`);
    fsReal.writeFileSync(path.join(dir, 'index.html'), '<p>$1</p>');
    const sql = [];
    const stub = { query: async (q) => { sql.push(q); return [[], {}]; } };
    let fetched = false;
    const fakeFetch = async () => { fetched = true; return { ok: true, status: 200 }; };
    process.env.INDEXNOW_KEY = 'k';
    process.env.INDEXNOW_DRY_RUN = 'true';
    const r = await runIndexNowSubmission({ sequelize: stub, logger: { info() {}, error() {}, warn() {} }, websiteDir: dir, fetchImpl: fakeFetch });
    delete process.env.INDEXNOW_DRY_RUN;
    assert.strictEqual(r.dryRun, true);
    assert.strictEqual(fetched, false);
    assert.ok(!sql.some(q => /INSERT INTO|DELETE FROM/.test(q)), 'no writes in dry-run');
  });

  await check('a failed submission throws (surfaces in ops email) and persists nothing', async () => {
    const dir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
    fsReal.writeFileSync(path.join(dir, 'sitemap.xml'),
      `<urlset><url><loc>https://www.gethomeheat.com/</loc></url></urlset>`);
    fsReal.writeFileSync(path.join(dir, 'index.html'), '<p>$1</p>');
    const sql = [];
    const stub = { query: async (q) => { sql.push(q); return [[], {}]; } };
    const fakeFetch = async () => ({ ok: false, status: 403 });
    process.env.INDEXNOW_KEY = 'k';
    delete process.env.INDEXNOW_DRY_RUN;
    let threw = false;
    try {
      await runIndexNowSubmission({ sequelize: stub, logger: { info() {}, error() {}, warn() {} }, websiteDir: dir, fetchImpl: fakeFetch });
    } catch (e) {
      threw = true;
      assert.ok(/submissions failed/.test(e.message));
    }
    assert.strictEqual(threw, true, 'must throw on submission failure');
    assert.ok(!sql.some(q => /INSERT INTO/.test(q)), 'no hash persisted for a failed submission');
  });

  await check('a missing sitemap.xml throws (surfaces in ops email), persists nothing', async () => {
    const dir = fsReal.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
    const sql = [];
    const stub = { query: async (q) => { sql.push(q); return [[], {}]; } };
    let fetched = false;
    const fakeFetch = async () => { fetched = true; return { ok: true, status: 200 }; };
    process.env.INDEXNOW_KEY = 'k';
    delete process.env.INDEXNOW_DRY_RUN;
    let threw = false;
    try {
      await runIndexNowSubmission({ sequelize: stub, logger: { info() {}, error() {}, warn() {} }, websiteDir: dir, fetchImpl: fakeFetch });
    } catch (e) {
      threw = true;
      assert.ok(/cannot read sitemap\.xml/.test(e.message));
    }
    assert.strictEqual(threw, true, 'must throw when sitemap.xml is missing');
    assert.strictEqual(fetched, false);
    assert.ok(!sql.some(q => /INSERT INTO/.test(q)), 'no writes when sitemap missing');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
