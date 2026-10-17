import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=stripTypeScriptTypes(read('supabase/functions/admin-service-adjustment/index.ts').replace(/^import .*;\n/gm,''),{mode:'transform'});
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('paid neighborhood conversion through actual Edge handler and SQL supports immutable, atomic paid conversion',{skip:!process.env.APS_PGLITE_MODULE},async t=>{
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
  if(url.endsWith('/rpc/aps_convert_neighborhood_paid_service')){
   assert.equal(init.headers.Authorization,'Bearer fixture-admin');
   const b=JSON.parse(init.body);
   try {return respond((await db.query('select aps_convert_neighborhood_paid_service($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',[b.p_request,b.p_target,b.p_total,JSON.stringify(b.p_details),b.p_reason,b.p_preview,b.p_revision,b.p_expected_quote,b.p_financial_version,b.p_operation])).rows[0].result);}catch(e){return respond({message:e.message},400);}
  }
  throw Error('Unexpected outbound operation: '+url);
 }});vm.runInContext(source,context);
 const invoke=(command,total,token=true,extra={})=>handler(new Request('https://aps-fixture.invalid/adjust',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer fixture-admin'}:{})},body:JSON.stringify({command,request_id:request,new_service_type:'ron',new_service_total:total,number_of_signers:1,number_of_notarizations:1,reason:'Synthetic paid conversion verification',revision:0,...extra})}));
 for(const paid of [100,40])for(const total of [140,100,60,20])await t.test(`paid=${paid}, proposed=${total}: preview, commit, retry retain all records`,async()=>{
  await db.exec('BEGIN');
  try {
   await db.query(`insert into service_requests(id,service_type,status,paid_amount,quote_amount,fulfillment_state,stripe_payment_intent_id,stripe_checkout_session_id) values($1,'mobile','under_review',$2,100,'not_started','pi_test_original','cs_test_original')`,[request,paid]);
   await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Synthetic address')`,[request]);
   const invoice=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due,stripe_payment_intent_id) values($1,$2,100,$3,$4,'pi_test_original') returning id`,[request,paid===100?'paid':'partially_paid',paid,100-paid])).rows[0];
   await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test,stripe_payment_intent_id) values($1,$2,$3,true,'pi_test_original')`,[request,invoice.id,paid]);
   const before=await snapshot();calls=[];
   const previewResponse=await invoke('preview_service_conversion',total);assert.equal(previewResponse.status,200);
   const preview=await previewResponse.json();assert.deepEqual(await snapshot(),before);
   assert.equal(preview.additional_amount_due,Math.max(0,total-100));
   assert.equal(preview.credit_or_refund_due,Math.max(0,100-total));
   const extra={revision:preview.revision,expected_quote:preview.expected_quote,financial_version:preview.financial_version,operation_id:crypto.randomUUID()};
   if(total<100){
     assert.equal(preview.requires_financial_review,true);
     await db.exec('SAVEPOINT attempt');const response=await invoke('convert_service',total,true,extra);assert.equal(response.status,400);assert.match((await response.json()).error,/financial review/);await db.exec('ROLLBACK TO SAVEPOINT attempt');assert.deepEqual(await snapshot(),before);
   }else{
     const response=await invoke('convert_service',total,true,extra);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
     const after=await snapshot();
     for(const name of ['request_payments','refunds'])assert.deepEqual(after[name],before[name]);
     assert.deepEqual(after.invoices.find(x=>x.id===invoice.id),before.invoices[0]);
     assert.equal(after.invoices.length,total>100?2:1);
     assert.equal(Number(after.service_requests[0].balance_due),total-paid);
     assert.equal(after.service_requests[0].stripe_payment_intent_id,'pi_test_original');
     if(paid===100&&total===100){
       await db.exec('SAVEPOINT issuance');
       await assert.rejects(db.query(`update quotes set state='approved' where id=$1`,[result.quote_id]),/must issue/);await db.exec('ROLLBACK TO SAVEPOINT issuance');
       await db.query(`insert into invoice_items(service_request_id,item_type,description,quantity,unit_price,line_total) values($1,'service','Reviewed destination',1,100,100)`,[request]);
       await db.query(`update quotes set state='sent' where id=$1`,[result.quote_id]);
       assert.equal((await db.query('select issued_item_snapshot from neighborhood_conversion_operations where id=$1',[extra.operation_id])).rows[0].issued_item_snapshot.length,1);
       await db.exec('SAVEPOINT changed_item');await assert.rejects(db.query(`update invoice_items set description='Changed after issuance' where service_request_id=$1 and invoice_id is null`,[request]),/items are immutable/);await db.exec('ROLLBACK TO SAVEPOINT changed_item');
       await db.query(`update quotes set state='approved' where id=$1`,[result.quote_id]);
       // Retry remains harmless even after later quote approval.
       const approved=await snapshot();const retry=await invoke('convert_service',total,true,extra);assert.equal(retry.status,200);assert.deepEqual(await snapshot(),approved);
     }else{
     const retry=await invoke('convert_service',total,true,extra);assert.equal(retry.status,200);assert.equal((await retry.json()).duplicate,true);assert.deepEqual(await snapshot(),after);
     }
   }
   assert.equal(calls.some(c=>/stripe.com|resend.com|create-additional-invoice/.test(c.url)),false);
  } finally {await db.exec('ROLLBACK');}
 });
 for(const paid of [100,40])await t.test(`paid=${paid}: separately completed refund permits reduced conversion`,async()=>{
  await db.exec('BEGIN');try{
   await db.query(`insert into service_requests(id,service_type,status,paid_amount,quote_amount,fulfillment_state) values($1,'mobile','under_review',$2,100,'not_started')`,[request,paid]);
   await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Synthetic address')`,[request]);
   const invoice=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due) values($1,'issued',100,$2,$3) returning id`,[request,paid,100-paid])).rows[0];
   const payment=(await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test) values($1,$2,$3,true) returning id`,[request,invoice.id,paid])).rows[0];
   // Simulated completion of an independently approved refund; no provider call.
   await db.query(`insert into refunds(service_request_id,invoice_id,payment_id,amount,status,reason) values($1,$2,$3,20,'succeeded','Fixture approved refund')`,[request,invoice.id,payment.id]);
   const before=await snapshot();const preview=await (await invoke('preview_service_conversion',80)).json();
   assert.equal(preview.requires_financial_review,false);assert.equal(preview.financials.net_retained,paid-20);
   const result=await invoke('convert_service',80,true,{financial_version:preview.financial_version,operation_id:crypto.randomUUID()});assert.equal(result.status,200,JSON.stringify(await result.json()));
   const after=await snapshot();for(const name of ['invoices','request_payments','refunds'])assert.deepEqual(after[name],before[name]);
   assert.equal(Number(after.service_requests[0].balance_due),100-paid);
  }finally{await db.exec('ROLLBACK')}
 });
 await t.test('stale financial preview, pending refund and late failure preserve complete state',async()=>{
  await db.exec('BEGIN');try{
   await db.query(`insert into service_requests(id,service_type,status,paid_amount,quote_amount,fulfillment_state) values($1,'mobile','under_review',100,100,'not_started')`,[request]);
   const quote=(await db.query(`insert into quotes(service_request_id,state,amount,version) values($1,'approved',100,1) returning id`,[request])).rows[0];
   await db.query(`update service_requests set current_quote_id=$2 where id=$1`,[request,quote.id]);
   const invoice=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due,source_quote_id) values($1,'paid',100,100,0,$2) returning id`,[request,quote.id])).rows[0];
   const payment=(await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test) values($1,$2,100,true) returning id`,[request,invoice.id])).rows[0];
   await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Synthetic address')`,[request]);
   let preview=await (await invoke('preview_service_conversion',140)).json();
   let extra={expected_quote:quote.id,financial_version:preview.financial_version,operation_id:crypto.randomUUID()};
   await db.query(`insert into refunds(service_request_id,invoice_id,payment_id,amount,status) values($1,$2,$3,10,'pending')`,[request,invoice.id,payment.id]);
   await db.exec('SAVEPOINT attempt');let res=await invoke('convert_service',140,true,extra);assert.equal(res.status,400);assert.match((await res.json()).error,/pending or invalid refunds/);await db.exec('ROLLBACK TO SAVEPOINT attempt');
   await db.exec("update refunds set status='failed'");
   await db.exec('SAVEPOINT attempt');res=await invoke('convert_service',140,true,extra);assert.equal(res.status,400);assert.match((await res.json()).error,/preview changed/);await db.exec('ROLLBACK TO SAVEPOINT attempt');
   preview=await (await invoke('preview_service_conversion',140)).json();extra.financial_version=preview.financial_version;
   await db.exec(`create function reject_paid_conversion() returns trigger language plpgsql as $$begin if new.event_type='service_changed' then raise exception 'Injected final failure';end if;return new;end$$;create trigger fail_paid_conversion before insert on request_timeline_events for each row execute function reject_paid_conversion();`);
   const before=await snapshot();await db.exec('SAVEPOINT attempt');res=await invoke('convert_service',140,true,extra);assert.equal(res.status,400);assert.match((await res.json()).error,/Injected final failure/);await db.exec('ROLLBACK TO SAVEPOINT attempt');assert.deepEqual(await snapshot(),before);
   assert.equal((await db.query('select count(*) from neighborhood_conversion_operations')).rows[0].count,0);
   await db.exec('drop trigger fail_paid_conversion on request_timeline_events');
   res=await invoke('convert_service',140,true,extra);assert.equal(res.status,200,JSON.stringify(await res.json()));
   assert.deepEqual((await db.query('select * from quotes where id=$1',[quote.id])).rows[0],before.quotes[0]);
   await db.exec('SAVEPOINT attempt');res=await invoke('convert_service',150,true,extra);assert.equal(res.status,400);assert.match((await res.json()).error,/different operation/);await db.exec('ROLLBACK TO SAVEPOINT attempt');
  }finally{await db.exec('ROLLBACK')}
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
