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

console.log('\n=== cross-fuel identity guard (heatingoil-u2gr) ===');
// A secondary-fuel price IDENTICAL to the primary heating-oil price is almost always a
// mislabeled capture (e.g. dolanoilservice propane regex grabbed the $4.899 oil price).
// Per-fuel range gates can't catch it (the value is in-range), so reject on value-identity.
{ const r=evaluatePriceSanity({newPrice:4.899, primaryPrice:4.899});
  ok(!r.ok, 'secondary price == primary oil price → rejected');
  ok(/cross.?fuel/i.test(r.rejection.reason), 'cross-fuel rejection reason wording');
  eq(r.rejection.primaryPrice, 4.899, 'cross-fuel rejection carries primaryPrice');
  ok(r.rejection.previousPrice===undefined && r.rejection.marketMedian===undefined, 'cross-fuel rejection has NO drop/median fields'); }
ok(evaluatePriceSanity({newPrice:5.399, primaryPrice:4.499}).ok, 'distinct secondary vs oil → ok');
ok(evaluatePriceSanity({newPrice:4.899, primaryPrice:null}).ok, 'no primaryPrice (primary fuel itself) → not cross-fuel checked');
ok(evaluatePriceSanity({newPrice:4.899}).ok, 'absent primaryPrice → ok (back-compat, primary-fuel call)');
ok(evaluatePriceSanity({newPrice:4.909, primaryPrice:4.899}).ok, 'one-cent difference → not identity → ok');
ok(!evaluatePriceSanity({newPrice:4.899, primaryPrice:4.89900}).ok, 'float-equal within epsilon → rejected');
{ const r=evaluatePriceSanity({newPrice:4.20, primaryPrice:4.20, prevPrice:6.30, stateMedian:4.40, state:'PA'});
  ok(!r.ok && r.rejection.primaryPrice===4.20, 'cross-fuel takes precedence over drop/median when secondary==oil'); }

console.log('\n=== DB helpers (fake sequelize) ===');
const { getAllStateMedians, getStateMedian, recordPriceRejection, checkAndRecordPrice, getRecentRejections } = require('./price-sanity');
function fakeSeq(rowsForSelect) {
  const calls=[];
  return { calls, query(sql,opts){ calls.push({sql,opts});
    if (/PERCENTILE_CONT/.test(sql)) return Promise.resolve([rowsForSelect||[]]);
    if (/SELECT price_per_gallon FROM supplier_prices/.test(sql)) return Promise.resolve([rowsForSelect||[]]);
    return Promise.resolve([[],0]); } };
}
(async()=>{
  { const seq=fakeSeq([{state:'CT',median_price:'4.40'},{state:'PA',median_price:'4.10'}]);
    const m=await getAllStateMedians(seq);
    ok(m.CT===4.40 && m.PA===4.10, 'getAllStateMedians parses rows → number map');
    ok(/PERCENTILE_CONT/.test(seq.calls[0].sql) && /heating_oil/.test(seq.calls[0].sql), 'uses oil median SQL'); }
  { const seq=fakeSeq([{median_price:'4.55'}]);
    ok((await getStateMedian(seq,'CT'))===4.55, 'getStateMedian returns number');
    ok(seq.calls[0].opts.bind[0]==='CT', 'getStateMedian binds state'); }
  { const seq=fakeSeq([]); ok((await getStateMedian(seq,'WY'))===null, 'getStateMedian null when <5 suppliers');
    ok((await getStateMedian(seq,null))===null, 'getStateMedian null for null state'); }
  { const seq=fakeSeq();
    await recordPriceRejection(seq,{supplierId:'s1',supplierName:'X',fuelType:'heating_oil',newPrice:4.2,
      rejection:{reason:'r',dropPercent:33,previousPrice:6.3},source:'scheduler'});
    const c=seq.calls.find(c=>/INSERT INTO price_rejections/.test(c.sql));
    ok(c, 'recordPriceRejection inserts'); ok(c.opts.bind.includes('scheduler'),'binds source');
    ok(c.opts.bind.includes(6.3) && c.opts.bind.includes(33), 'binds previousPrice + dropPercent');
    ok(c.opts.bind.includes(null), 'null for market_median on a drop rejection'); }
  { const seq={query(){return Promise.reject(new Error('boom'));}};
    await recordPriceRejection(seq,{supplierId:'s1',supplierName:'X',fuelType:'heating_oil',newPrice:4.2,rejection:{reason:'r'},source:'batch'});
    pass('recordPriceRejection swallows DB errors'); }
  { const seq=fakeSeq();
    const v=await checkAndRecordPrice(seq,{supplierId:'s1',supplierName:'X',fuelType:'heating_oil',newPrice:4.2,prevPrice:6.3,stateMedian:null,state:'PA',source:'scheduler'});
    ok(!v.ok, 'checkAndRecordPrice returns reject verdict');
    ok(seq.calls.some(c=>/INSERT INTO price_rejections/.test(c.sql)), 'reject path records rejection'); }
  { const seq=fakeSeq();
    const v=await checkAndRecordPrice(seq,{supplierId:'s1',supplierName:'X',fuelType:'heating_oil',newPrice:4.2,prevPrice:4.3,stateMedian:4.4,state:'PA',source:'scheduler'});
    ok(v.ok, 'checkAndRecordPrice ok verdict');
    ok(!seq.calls.some(c=>/INSERT INTO price_rejections/.test(c.sql)), 'ok path records nothing'); }
  { process.env.DISABLE_PRICE_SANITY='true';
    const seq=fakeSeq();
    const v=await checkAndRecordPrice(seq,{supplierId:'s1',supplierName:'X',fuelType:'heating_oil',newPrice:1.0,prevPrice:6.3,stateMedian:6.0,state:'PA',source:'scheduler'});
    ok(v.ok, 'kill switch → ok even for an anomalous price');
    ok(seq.calls.length===0, 'kill switch → no DB writes');
    delete process.env.DISABLE_PRICE_SANITY; }
  { const seq=fakeSeq();
    const v=await checkAndRecordPrice(seq,{supplierId:'s1',supplierName:'Dolan',fuelType:'propane',newPrice:4.899,primaryPrice:4.899,source:'scheduler'});
    ok(!v.ok, 'checkAndRecordPrice rejects a secondary price identical to primary oil');
    const c=seq.calls.find(c=>/INSERT INTO price_rejections/.test(c.sql));
    ok(c, 'cross-fuel rejection is recorded to price_rejections');
    ok(c && c.opts.bind.some(b=>/cross.?fuel/i.test(String(b))), 'recorded reason is cross-fuel'); }
  { process.env.DISABLE_PRICE_SANITY='true';
    const seq=fakeSeq();
    const v=await checkAndRecordPrice(seq,{supplierId:'s1',supplierName:'Dolan',fuelType:'propane',newPrice:4.899,primaryPrice:4.899,source:'scheduler'});
    ok(v.ok, 'kill switch bypasses the cross-fuel guard too');
    ok(seq.calls.length===0, 'kill switch → no writes for cross-fuel collision');
    delete process.env.DISABLE_PRICE_SANITY; }
  { const seq={query(){return Promise.reject(new Error('db down'));}};
    ok((await getStateMedian(seq,'CT'))===null, 'getStateMedian returns null on DB error'); }
  { const calls=[]; const seq={calls,query(sql,opts){calls.push({sql,opts});
      return Promise.resolve([[{supplierName:'X',newPrice:4.2,marketMedian:null,reason:'r'}]]);}};
    const rows=await getRecentRejections(seq);
    ok(Array.isArray(rows) && rows.length===1, 'getRecentRejections returns rows');
    const sql=calls[0].sql;
    ok(/DISTINCT ON \(supplier_id, fuel_type\)/.test(sql), 'dedups per supplier+fuel');
    ok(/INTERVAL '24 hours'/.test(sql) && /::float/.test(sql) && /LIMIT 50/.test(sql), '24h window + ::float casts + cap'); }
  console.log(`\n${failed===0?'✅':'❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed===0?0:1);
})();
