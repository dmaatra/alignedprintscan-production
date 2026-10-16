import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=stripTypeScriptTypes(read('supabase/functions/admin-service-adjustment/index.ts').replace(/^import .*;\n/gm,''),{mode:'transform'});
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('paid neighborhood conversion through actual Edge handler and SQL remains blocked without financial mutation',{skip:!process.env.APS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(process.env.APS_PGLITE_MODULE),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;create function is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;set test.admin='true';`);
 await db.exec(read('tests/fixtures/neighborhood-schema.sql'));
 await db.exec(`create table ron_requests(id uuid primary key default gen_random_uuid(),service_request_id uuid,number_of_signers integer,number_of_notarizations integer,witness_review_required boolean,witness_count text);create table proof_transactions(id uuid primary key default gen_random_uuid(),service_request_id uuid,aps_status text);`);
 for(const file of fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(x=>/^20261016.*neighborhood.*sql$/.test(x)).sort())await db.exec(read('supabase/migrations/'+file));
 const request='22222222-2222-4222-8222-222222222222';
 const tables=['service_requests','quotes','invoices','invoice_items','request_payments','refunds','request_promotion_applications','request_pricing_reviews','request_service_conversions','request_timeline_events','mobile_notary_requests','ron_requests','review_queue_items'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await db.query(`select * from ${name} order by id`)).rows])));
 let handler,authorized=true,calls=[];
 const context=vm.createContext({Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://aps-fixture.invalid':'synthetic'},serve:fn=>handler=fn},Request,Response,URLSearchParams,crypto,console,fetch:async(url,init={})=>{
  calls.push({url,method:init.method||'GET'});
  if(url.endsWith('/auth/v1/user'))return respond({id:'11111111-1111-4111-8111-111111111111'});
  if(url.endsWith('/rpc/is_admin'))return respond(authorized);
  if(url.includes('/request_promotion_applications?'))return respond([{id:'promotion-fixture'}]);
  if(url.endsWith('/rpc/aps_convert_neighborhood_service')){
   assert.equal(init.headers.Authorization,'Bearer fixture-admin');
   const b=JSON.parse(init.body);
   try {return respond((await db.query('select aps_convert_neighborhood_service($1,$2,$3,$4,$5,$6,$7,$8) as result',[b.p_request,b.p_target,b.p_total,JSON.stringify(b.p_details),b.p_reason,b.p_preview,b.p_revision,b.p_expected_quote])).rows[0].result);}catch(e){return respond({message:e.message},400);}
  }
  throw Error('Unexpected outbound operation: '+url);
 }});vm.runInContext(source,context);
 const invoke=(command,total,token=true)=>handler(new Request('https://aps-fixture.invalid/adjust',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer fixture-admin'}:{})},body:JSON.stringify({command,request_id:request,new_service_type:'ron',new_service_total:total,number_of_signers:1,number_of_notarizations:1,reason:'Synthetic paid conversion verification',revision:0})}));
 for(const paid of [100,40])for(const total of [140,100,60,20])await t.test(`paid=${paid}, proposed=${total}: preview, commit, retry retain all records`,async()=>{
  await db.exec('BEGIN');
  try {
   await db.query(`insert into service_requests(id,service_type,status,paid_amount,quote_amount,fulfillment_state,stripe_payment_intent_id,stripe_checkout_session_id) values($1,'mobile','under_review',$2,100,'not_started','pi_test_original','cs_test_original')`,[request,paid]);
   await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Synthetic address')`,[request]);
   const invoice=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due,stripe_payment_intent_id) values($1,$2,100,$3,$4,'pi_test_original') returning id`,[request,paid===100?'paid':'partially_paid',paid,100-paid])).rows[0];
   await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test,stripe_payment_intent_id) values($1,$2,$3,true,'pi_test_original')`,[request,invoice.id,paid]);
   const before=await snapshot();calls=[];
   // Savepoints recover the fixture transaction after the intentionally rejected RPC.
   for(const command of ['preview_service_conversion','convert_service','convert_service']){
    await db.exec('SAVEPOINT attempt');const response=await invoke(command,total);assert.equal(response.status,400);assert.match((await response.json()).error,/financial history/);await db.exec('ROLLBACK TO SAVEPOINT attempt');
    assert.deepEqual(await snapshot(),before);
   }
   assert.equal(calls.some(c=>/stripe.com|resend.com|create-additional-invoice/.test(c.url)),false);
  } finally {await db.exec('ROLLBACK');}
 });
 for(const paid of [35,10])await t.test(`paid=${paid}: pricing-program increase reconciles with a separate invoice`,async()=>{
  await db.exec('BEGIN');
  try {
   await db.query(`insert into service_requests(id,service_type,status,paid_amount,quote_amount,fulfillment_state) values($1,'mobile','under_review',$2,35,'not_started')`,[request,paid]);
   await db.query(`insert into mobile_notary_requests(service_request_id,street_address,city,state,zip) values($1,'Synthetic address','Waxahachie','TX','75165')`,[request]);
   await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address,eligibility_status,applied_pricing_program,approved_travel_amount,standard_travel_amount,promotional_adjustment) values($1,'CAMDEN_PARK','Synthetic address','approved','CAMDEN_PARK',25,50,25)`,[request]);
   const invoice=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due,stripe_payment_intent_id) values($1,$2,35,$3,$4,'pi_test_original') returning *`,[request,paid===35?'paid':'partially_paid',paid,35-paid])).rows[0];
   const payment=(await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test,stripe_payment_intent_id) values($1,$2,$3,true,'pi_test_original') returning *`,[request,invoice.id,paid])).rows[0];
   const travel=(await db.query(`insert into mobile_travel_calculations(service_request_id,suggested_fee) values($1,10) returning id`,[request])).rows[0];
   await db.query(`select aps_review_pricing_program($1,'denied','Synthetic standard review',0,$2)`,[request,travel.id]);
   await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due) values($1,'issued',35,0,35)`,[request]);
   const result=(await db.query(`select aps_resolve_pricing_adjustment($1,1,'Synthetic separate invoice reconciliation') result`,[request])).rows[0].result;
   assert.equal(result.net_charges,70);
   assert.deepEqual((await db.query('select * from invoices where id=$1',[invoice.id])).rows[0],invoice);
   assert.deepEqual((await db.query('select * from request_payments where id=$1',[payment.id])).rows[0],payment);
   const balance=(await db.query('select sum(balance_due) balance from invoices where service_request_id=$1',[request])).rows[0].balance;
   assert.equal(Number(balance),70-paid);
  }finally{await db.exec('ROLLBACK');}
 });
 await t.test('authorization rejects before RPC or financial reads',async()=>{
  calls=[];assert.equal((await invoke('convert_service',140,false)).status,400);assert.equal(calls.length,0);
  authorized=false;calls=[];assert.equal((await invoke('convert_service',140)).status,400);assert.equal(calls.length,2);authorized=true;
 });
 await db.close();
});
