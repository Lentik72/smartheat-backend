/**
 * Unit tests for the shared requireAdmin middleware.
 * Plain-Node assertion style (see multi-branch-config.test.js). Exits 0 on
 * success, throws (exit 1) on any failure. No DB / network / deps required —
 * the middleware reads process.env at call time, so we mutate it per case.
 */
const assert = require('assert');
const requireAdmin = require('./requireAdmin');

const ORIG = {
  admin: process.env.ADMIN_REVIEW_TOKEN,
  dash: process.env.DASHBOARD_PASSWORD,
};

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

// Returns { nexted, res } after running the middleware.
function run(req) {
  let nexted = false;
  const res = mockRes();
  requireAdmin(req, res, () => { nexted = true; });
  return { nexted, res };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

try {
  // --- ADMIN_REVIEW_TOKEN configured (DASHBOARD_PASSWORD off) ---
  process.env.ADMIN_REVIEW_TOKEN = 'secret-token';
  delete process.env.DASHBOARD_PASSWORD;

  check('valid token via X-Admin-Token header -> next()', () => {
    const { nexted, res } = run({ headers: { 'x-admin-token': 'secret-token' }, query: {} });
    assert.strictEqual(nexted, true);
    assert.strictEqual(res.statusCode, null);
  });

  check('valid token via Authorization: Bearer -> next()', () => {
    const { nexted } = run({ headers: { authorization: 'Bearer secret-token' }, query: {} });
    assert.strictEqual(nexted, true);
  });

  check('valid token via ?token query -> next()', () => {
    const { nexted } = run({ headers: {}, query: { token: 'secret-token' } });
    assert.strictEqual(nexted, true);
  });

  check('wrong token -> 401, no next()', () => {
    const { nexted, res } = run({ headers: { 'x-admin-token': 'nope' }, query: {} });
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.statusCode, 401);
  });

  check('missing token -> 401, no next()', () => {
    const { nexted, res } = run({ headers: {}, query: {} });
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.statusCode, 401);
  });

  check('retired public default token is rejected -> 401', () => {
    const { nexted, res } = run({ headers: { 'x-admin-token': 'smartheat-price-review-2024' }, query: {} });
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.statusCode, 401);
  });

  // --- DASHBOARD_PASSWORD also accepted ---
  process.env.ADMIN_REVIEW_TOKEN = 'secret-token';
  process.env.DASHBOARD_PASSWORD = 'dash-pass';

  check('valid DASHBOARD_PASSWORD -> next()', () => {
    const { nexted } = run({ headers: { 'x-admin-token': 'dash-pass' }, query: {} });
    assert.strictEqual(nexted, true);
  });

  // --- Fail-closed when nothing configured ---
  delete process.env.ADMIN_REVIEW_TOKEN;
  delete process.env.DASHBOARD_PASSWORD;

  check('fail-closed: neither env set -> 503 even with a token', () => {
    const { nexted, res } = run({ headers: { 'x-admin-token': 'anything' }, query: {} });
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.statusCode, 503);
  });

  console.log(`\n${passed} assertions passed`);
} finally {
  if (ORIG.admin === undefined) delete process.env.ADMIN_REVIEW_TOKEN;
  else process.env.ADMIN_REVIEW_TOKEN = ORIG.admin;
  if (ORIG.dash === undefined) delete process.env.DASHBOARD_PASSWORD;
  else process.env.DASHBOARD_PASSWORD = ORIG.dash;
}
