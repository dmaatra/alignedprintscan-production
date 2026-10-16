import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { validateRefund } from '../supabase/functions/_shared/service-adjustment.mjs';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/admin-service-adjustment/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{mode:'transform'});
function harness(status=200,payload={id:'re_fixture',status:'succeeded'}) {
 const calls=[];
 const context=vm.createContext({Deno:{env:{get:name=>name==='STRIPE_SECRET_KEY'?'sk_test_fixture_never_sent':''},serve(){}},Response,URLSearchParams,fetch:async(url,init)=>{
  assert.equal(url,'https://api.stripe.com/v1/refunds');calls.push({url,...init});
  return new Response(JSON.stringify(payload),{status});
 }});vm.runInContext(source,context);
 return {calls,refund:()=>vm.runInContext("stripeRefund('pi_test_original',12.34,'fixture-stable-key','Synthetic reduction')",context)};
}
test('Stripe refund adapter preserves original intent, cents and retry key (simulated transport)',async()=>{
 const f=harness();await f.refund();await f.refund();assert.equal(f.calls.length,2);
 for(const call of f.calls){assert.equal(call.headers['Idempotency-Key'],'fixture-stable-key');assert.equal(call.headers.Authorization,'Bearer sk_test_fixture_never_sent');assert.equal(call.body.get('payment_intent'),'pi_test_original');assert.equal(call.body.get('amount'),'1234');}
});
test('Stripe pending result is not reported as succeeded (simulated transport)',async()=>{
 const f=harness(200,{id:'re_fixture',status:'pending'});assert.equal((await f.refund()).status,'pending');
});
test('Stripe rejection and unsupported state propagate rather than fabricate success',async()=>{
 await assert.rejects(harness(402,{error:{message:'Synthetic provider rejection'}}).refund(),/Synthetic provider rejection/);
 await assert.rejects(harness(200,{status:'failed'}).refund(),/refund state failed/);
});
test('refund exposure validation covers previously refunded and partially paid amounts',()=>{
 const payment={id:'payment',amount:40};const refunds=[{payment_id:'payment',amount:10,status:'succeeded'}];
 assert.deepEqual(validateRefund({payment,refunds,amount:30,method:'stripe'}),{requested:30,remaining:30});
 assert.throws(()=>validateRefund({payment,refunds,amount:30.01,method:'stripe'}),/exceeds/);
});

test('nonfinite refund inputs and corrupted financial totals fail before a provider call',()=>{
 for(const amount of [NaN,Infinity,-Infinity,'invalid'])assert.throws(()=>validateRefund({payment:{id:'payment',amount:40},amount,method:'stripe'}),/finite|positive/);
 assert.throws(()=>validateRefund({payment:{id:'payment',amount:NaN},amount:10,method:'stripe'}),/finite/);
 assert.throws(()=>validateRefund({payment:{id:'payment',amount:40},refunds:[{payment_id:'payment',amount:'invalid',status:'succeeded'}],amount:10,method:'stripe'}),/finite/);
});
