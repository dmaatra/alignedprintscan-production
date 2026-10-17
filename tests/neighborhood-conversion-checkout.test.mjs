import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/create-embedded-checkout/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{mode:'transform'});
for (const [secret, publishable, allowed, expected] of [
 ['sk_test_fixture','pk_test_fixture',true,true],
 ['sk_live_fixture','pk_live_fixture',true,false],
 ['sk_test_fixture','pk_test_fixture',false,undefined],
]) test(`checkout preflight requires scoped access and reports key isolation without provider calls (${secret}, ${allowed})`,async()=>{
 let handler;let providerCalls=0;
 vm.runInNewContext(source,{Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://fixture.invalid':k==='STRIPE_SECRET_KEY'?secret:k==='STRIPE_PUBLISHABLE_KEY'?publishable:'synthetic'},serve:f=>handler=f},Response,console,authorizePortal:async()=>allowed,fetch:async()=>{providerCalls++;throw Error('Unexpected provider call')}});
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({request_id:'request',access_token:'fixture',preflight_only:true})}));
 const data=await response.json();assert.equal(response.status,allowed?200:403);assert.equal(data.test_mode_ready,expected);assert.equal(providerCalls,0);
});
for(const state of ['draft','sent',null])test(`checkout refuses neighborhood quote ${state} before provider access`,async()=>{
 let handler;const calls=[];
 vm.runInNewContext(source,{Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://fixture.invalid':'synthetic'},serve:f=>handler=f},Response,console,authorizePortal:async()=>true,fetch:async(url)=>{
 calls.push(url);if(url.includes('/service_requests?'))return Response.json([{id:'request',current_quote_id:'quote',customers:{email:'fixture@example.invalid'}}]);
 if(url.includes('/request_promotion_applications?'))return Response.json([{eligibility_status:'denied',financial_adjustment_required:false}]);
 if(url.includes('/quotes?'))return Response.json(state?[{state}]:[]);
 throw Error('Unexpected outbound request');
 }});
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({request_id:'request',invoice_id:'existing-invoice'})}));assert.equal(response.status,400);assert.match((await response.json()).error,/Approve the current service quote/);assert.equal(calls.some(x=>x.includes('stripe.com')||x.includes('/invoices?')),false);
});
