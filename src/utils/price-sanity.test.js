// src/utils/price-sanity.test.js
// Pure price-sanity check. Drop precedence over median (mirrors scrape-prices.js).
// Percent fields are whole numbers (33 not 0.33) to match the email's .toFixed(0).
// Run: node src/utils/price-sanity.test.js
const { evaluatePriceSanity, MAX_PRICE_DROP, MAX_BELOW_MEDIAN } = require('./price-sanity');
let passed=0, failed=0;
const pass=l=>{passed++;console.log(`  ✓ ${l}`);};
const fail=(l,d)=>{failed++;console.error(`  ✗ ${l} — ${d}`);};
const eq=(a,b,l)=>JSON.stringify(a)===JSON.stringify(b)?pass(l):fail(l,`got ${JSON.stringify(a)}`);
const ok=(c,l)=>c?pass(l):fail(l,'expected true');

console.log('\n=== evaluatePriceSanity ===');
eq(evaluatePriceSanity({newPrice:4.20, prevPrice:4.50, stateMedian:4.40, state:'CT'}), {ok:true}, 'small drop within band → ok');
eq(evaluatePriceSanity({newPrice:4.20, prevPrice:null, stateMedian:null}), {ok:true}, 'no prev, no median → ok (first price)');
eq(evaluatePriceSanity({newPrice:4.20, prevPrice:4.20, stateMedian:4.20, state:'CT'}), {ok:true}, 'flat → ok');
ok(evaluatePriceSanity({newPrice:3.00, prevPrice:4.00}).ok, 'exactly 25% drop → ok (strict >)');
{ const r=evaluatePriceSanity({newPrice:4.20, prevPrice:6.30, stateMedian:4.40, state:'PA'});
  ok(!r.ok, 'big drop → rejected');
  eq(r.rejection.previousPrice, 6.30, 'drop rejection has previousPrice');
  ok(Math.round(r.rejection.dropPercent)===33, 'drop rejection dropPercent≈33');
  ok(r.rejection.marketMedian===undefined, 'drop rejection has NO marketMedian');
  ok(/drop exceeds 25% threshold/.test(r.rejection.reason), 'drop reason wording'); }
{ const r=evaluatePriceSanity({newPrice:3.00, prevPrice:3.10, stateMedian:4.50, state:'NY'});
  ok(!r.ok, 'far below median → rejected');
  eq(r.rejection.marketMedian, 4.50, 'median rejection has marketMedian');
  eq(r.rejection.state, 'NY', 'median rejection has state');
  ok(Math.round(r.rejection.belowMedianPercent)===33, 'belowMedianPercent≈33');
  ok(r.rejection.previousPrice===undefined, 'median rejection has NO previousPrice');
  ok(/below NY median exceeds 25% threshold/.test(r.rejection.reason), 'median reason wording'); }
{ const r=evaluatePriceSanity({newPrice:4.20, prevPrice:6.30, stateMedian:10.0, state:'PA'});
  ok(r.rejection.previousPrice!==undefined, 'when both fail, drop takes precedence'); }
ok(MAX_PRICE_DROP===0.25 && MAX_BELOW_MEDIAN===0.25, 'thresholds exported = 0.25');

console.log(`\n${failed===0?'✅':'❌'} ${passed} passed, ${failed} failed`);
process.exit(failed===0?0:1);
