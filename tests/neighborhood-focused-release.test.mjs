import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('focused release enforces deferred paths in database without blocking ordinary finance',{skip:!process.env.APS_PGLITE_MODULE},async t=>{
 const {PGlite}=await import(process.env.APS_PGLITE_MODULE),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;create function is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;set test.admin='true';`);
 await db.exec(read('tests/fixtures/neighborhood-schema.sql'));
 await db.exec(`create table ron_requests(id uuid primary key default gen_random_uuid(),service_request_id uuid,number_of_signers integer,number_of_notarizations integer,witness_review_required boolean,witness_count text);create table proof_transactions(id uuid primary key default gen_random_uuid(),service_request_id uuid,aps_status text);`);
 for(const f of fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(x=>/^20261016.*neighborhood.*sql$/.test(x)).sort())await db.exec(read('supabase/migrations/'+f));
 await db.exec(read('supabase/migrations/20261016170000_focused_release_restrictions.sql'));
 const id='22222222-2222-4222-8222-222222222222';
 const snapshot=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(r) from service_requests r) requests,(select jsonb_agg(i) from invoices i) invoices,(select jsonb_agg(p) from request_payments p) payments,(select jsonb_agg(a) from request_promotion_applications a) applications`)).rows);
 for(const mode of ['paid','partial','issued','checkout'])await t.test(mode+' blocks RPC, direct changes and retries atomically',async()=>{
  await db.exec('begin');
  await db.query(`insert into service_requests(id,service_type,status,paid_amount,fulfillment_state) values($1,'mobile','under_review',0,'not_started')`,[id]);
  await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Synthetic address')`,[id]);
  if(mode==='issued')await db.query(`insert into quotes(service_request_id,state,amount) values($1,'draft',35)`,[id]);
  // Seed issued history with only preexisting quote guard disabled, then restore it.
  if(mode==='issued')await db.exec(`alter table quotes disable trigger guard_neighborhood_quote;update quotes set state='sent';alter table quotes enable trigger guard_neighborhood_quote;`);
  if(mode==='checkout')await db.query(`update service_requests set stripe_checkout_session_id='cs_test_original' where id=$1`,[id]);
  if(['paid','partial'].includes(mode))await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due,stripe_payment_intent_id) values($1,$2,100,$3,$4,'pi_test_original')`,[id,mode==='paid'?'paid':'partially_paid',mode==='paid'?100:40,mode==='paid'?0:60]);
  const before=await snapshot();
  for(const sql of [
   `select aps_convert_neighborhood_paid_service('${id}','ron',35,'{}','Test release restriction',true)`,
   `select aps_convert_neighborhood_paid_service('${id}','ron',35,'{}','Test release restriction',false)`,
   `select aps_resolve_pricing_adjustment('${id}',0,'Test release restriction')`,
   `update service_requests set service_type='ron' where id='${id}'`,
   `update request_promotion_applications set eligibility_status='approved' where service_request_id='${id}'`,
   `update request_promotion_applications set approved_travel_amount=1 where service_request_id='${id}'`
  ])for(let retry=0;retry<2;retry++){
   await db.exec('savepoint attempt');await assert.rejects(db.exec(sql),/deferred/);await db.exec('rollback to attempt');assert.equal(await snapshot(),before);
  }
  await db.exec('rollback');
 });
 await t.test('pre-issue review, ordinary payment updates and standard service changes remain available',async()=>{
  await db.query(`insert into service_requests(id,service_type,status,paid_amount) values($1,'mobile','under_review',0)`,[id]);
  await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Synthetic address')`,[id]);
  await db.query(`update request_promotion_applications set eligibility_status='approved' where service_request_id=$1`,[id]);
  const invoice=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,balance_due) values($1,'unpaid',100,0,100) returning id`,[id])).rows[0].id;
  await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test) values($1,$2,40,true)`,[id,invoice]);
  await db.query(`update invoices set amount_paid=40,balance_due=60,status='partially_paid' where id=$1`,[invoice]);
  await db.query(`update service_requests set paid_amount=40,payment_status='partially_paid' where id=$1`,[id]);
  await db.exec(`insert into service_requests(id,service_type,paid_amount) values('33333333-3333-4333-8333-333333333333','mobile',100);update service_requests set service_type='ron' where id='33333333-3333-4333-8333-333333333333';`);
 });
 await t.test('issued quote lock survives expiry and blocks replacement issuance',async()=>{
  const other='44444444-4444-4444-8444-444444444444';
  await db.query(`insert into service_requests(id,service_type,status) values($1,'ron','under_review')`,[other]);
  await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address,eligibility_status,applied_pricing_program) values($1,'CAMDEN_PARK','Synthetic address','denied','STANDARD')`,[other]);
  const q=(await db.query(`insert into quotes(service_request_id,state,amount) values($1,'sent',35) returning id`,[other])).rows[0].id;
  await db.query(`update quotes set state='approved' where id=$1`,[q]);
  await db.query(`update quotes set state='expired' where id=$1`,[q]);
  await assert.rejects(db.query(`insert into quotes(service_request_id,state,amount) values($1,'sent',40)`,[other]),/deferred/);
  await assert.rejects(db.query(`update request_promotion_applications set revision=revision+1 where service_request_id=$1`,[other]),/deferred/);
 });
 await t.test('authorization and private implementation are closed',async()=>{
  await db.exec("set test.admin='false'");await assert.rejects(db.query(`select aps_convert_neighborhood_paid_service($1,'ron',35,'{}','test auth')`,[id]),/Administrator/);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query(`select has_schema_privilege($1,'aps_deferred','USAGE') allowed`,[role])).rows[0].allowed,false);
  assert.equal((await db.query(`select has_function_privilege('anon','public.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid)','EXECUTE') allowed`)).rows[0].allowed,false);
 });
 await db.close();
});
