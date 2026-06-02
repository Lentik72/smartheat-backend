// src/routes/price-review.test.js
// Fix C: manual heating_oil submit clears oil scrape-backoff (recordSuccess →
// UPDATE scrape_status='active'); kerosene-only submit does NOT. No DB — fake
// sequelize captures issued SQL.
// Run: node src/routes/price-review.test.js

const route = require('./price-review');
let passed = 0, failed = 0;
function pass(l){ passed++; console.log(`  ✓ ${l}`); }
function fail(l,d){ failed++; console.error(`  ✗ ${l} — ${d}`); }
function assertTrue(c,l,d){ c?pass(l):fail(l,d||'expected true'); }

function makeReq(fuel){
  const calls = [];
  const fakeSeq = { calls, query(sql,opts){ calls.push({sql,opts});
    if(/SELECT name, website FROM suppliers/i.test(sql)) return Promise.resolve([[{name:'Test Co',website:'https://t.co'}]]);
    return Promise.resolve([[],0]); } };
  const req = { authType:'master', body:{prices:[{supplierId:'sup-1',price:3.49,fuelType:fuel}]},
    app:{locals:{sequelize:fakeSeq, logger:{info(){},warn(){},error(){}}}} };
  let payload=null; const res={status(){return this;}, json(p){payload=p;return this;}};
  return { req, res, calls, getPayload:()=>payload };
}
function ranRecordSuccess(calls){ return calls.some(c =>
  /UPDATE suppliers SET/i.test(c.sql) && /scrape_status\s*=\s*'active'/.test(c.sql) &&
  Array.isArray(c.opts&&c.opts.bind) && c.opts.bind.includes('sup-1')); }

(async () => {
  console.log('\n=== oil submit clears backoff ===');
  { const {req,res,calls,getPayload}=makeReq('heating_oil'); await route.submitPrices(req,res);
    assertTrue(ranRecordSuccess(calls),'oil submit calls recordSuccess(scrape_status=active)');
    assertTrue(getPayload()&&getPayload().submitted===1,'oil submit reports 1 success',JSON.stringify(getPayload())); }
  console.log('\n=== kerosene-only submit does NOT clear oil backoff ===');
  { const {req,res,calls,getPayload}=makeReq('kerosene'); await route.submitPrices(req,res);
    assertTrue(!ranRecordSuccess(calls),'kerosene submit does NOT call recordSuccess');
    assertTrue(getPayload()&&getPayload().submitted===1,'kerosene submit still reports 1 success',JSON.stringify(getPayload())); }
  console.log(`\n${failed===0?'✅':'❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed===0?0:1);
})();
