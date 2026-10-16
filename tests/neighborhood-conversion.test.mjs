import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const modulePath=process.env.APS_PGLITE_MODULE;
test('atomic neighborhood conversion preserves history and fails safely',{skip:!modulePath},async t=>{
 const {PGlite}=await import(modulePath),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;create function is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;set test.admin='true';`);
 await db.exec(read('tests/fixtures/neighborhood-schema.sql'));
 await db.exec(`create table ron_requests(id uuid primary key default gen_random_uuid(),service_request_id uuid,number_of_signers integer,number_of_notarizations integer,witness_review_required boolean,witness_count text);create table proof_transactions(id uuid primary key default gen_random_uuid(),service_request_id uuid,aps_status text);`);
 for(const file of ['20261016032854_neighborhood_pricing_program.sql','20261016045905_neighborhood_review_hardening.sql','20261016092536_neighborhood_atomic_conversion.sql','20261016101212_neighborhood_financial_history_integrity.sql','20261016124235_neighborhood_reconciliation_retry_safety.sql'])await db.exec(read('supabase/migrations/'+file));
 const id='22222222-2222-4222-8222-222222222222';
 const estimate={components:[{key:'mobile:base',label:'Mobile Notary Appointment Base',quantity:1,unit_amount:50,line_amount:50},{key:'notarial_act:jurat',label:'Jurat',quantity:1,unit_amount:10,line_amount:10},{key:'promotion:CAMDEN_PARK',label:'Camden Park Promotional Adjustment',quantity:1,unit_amount:-25,line_amount:-25}],total:35};
 await db.query(`insert into service_requests(id,service_type,status,estimated_total,estimate_components,paid_amount,acquisition_utm_campaign,fulfillment_state) values($1,'mobile','under_review',35,$2,0,'neighborhood_services','not_started')`,[id,JSON.stringify(estimate)]);
 await db.query(`insert into mobile_notary_requests(service_request_id,street_address,city,state,zip,number_of_signers,number_of_notarizations,witness_count,print_add_on) values($1,'Original Address','Waxahachie','TX','75165',2,1,'1',true)`,[id]);
 await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','Original Address, Waxahachie, TX 75165')`,[id]);
 await db.query(`select aps_review_pricing_program($1,'approved','Original address reviewed',0)`,[id]);
 const details={number_of_signers:2,number_of_notarizations:1,street_address:'New Test Address',city:'Waxahachie',state:'TX',zip:'75165'};
 const call=async(target='ron',preview=true,revision=null,quote=null,total=35)=> (await db.query(`select aps_convert_neighborhood_service($1,$2,$3,$4,'Customer requested destination service',$5,$6,$7) result`,[id,target,total,JSON.stringify(details),preview,revision,quote])).rows[0].result;
 const tables=['service_requests','mobile_notary_requests','ron_requests','request_promotion_applications','quotes','invoice_items','request_service_conversions','request_pricing_reviews','review_queue_items','request_timeline_events','invoices','request_payments','refunds','proof_transactions'];
 const snapshot=async()=>{const out={};for(const name of tables)out[name]=(await db.query(`select * from ${name} order by id`)).rows;return out;};
 await t.test('unauthorized and anonymous callers rejected',async()=>{await db.exec("set test.admin='false'");await assert.rejects(call(),/Administrator/);await db.exec("set test.admin='true';set role anon");await assert.rejects(call(),/permission denied/);await db.exec('reset role;set role service_role');await assert.rejects(call(),/permission denied/);await db.exec('reset role');});
 await t.test('preview is read only',async()=>{const before=await snapshot();const p=await call();assert.equal(p.requires_quote_review,true);assert.equal(p.additional_amount_due,0);assert.deepEqual(await snapshot(),before);});
 await t.test('any financial history blocks before writes',async()=>{await db.query(`insert into request_payments(service_request_id,amount) values($1,5)`,[id]);const before=await snapshot();await assert.rejects(call(),/financial history/);assert.deepEqual(await snapshot(),before);await db.exec('delete from request_payments');});
 await t.test('legacy checkout reference blocks conversion',async()=>{await db.query(`update service_requests set stripe_checkout_session_id='synthetic-checkout' where id=$1`,[id]);await assert.rejects(call(),/financial history/);await db.query(`update service_requests set stripe_checkout_session_id=null where id=$1`,[id]);});
 await t.test('active provider transaction blocks; cancelled history remains',async()=>{await db.query(`insert into proof_transactions(service_request_id,aps_status) values($1,'in_progress')`,[id]);await assert.rejects(call(),/Proof transaction/);await db.exec("update proof_transactions set aps_status='cancelled'");assert.equal((await call()).proof_history_preserved,true);});
 await t.test('late database failure rolls every earlier mutation back',async()=>{
  await db.exec(`create function reject_conversion_timeline() returns trigger language plpgsql as $$begin if new.event_type='service_changed' then raise exception 'Injected final write failure';end if;return new;end$$;create trigger fail_conversion before insert on request_timeline_events for each row execute function reject_conversion_timeline();`);
  const p=await call(),before=await snapshot();await assert.rejects(call('ron',false,p.revision,p.expected_quote),/Injected final write failure/);assert.deepEqual(await snapshot(),before);await db.exec('drop trigger fail_conversion on request_timeline_events');
 });
 let first;
 await t.test('Mobile to RON atomically creates draft and retains original data',async()=>{
  const p=await call();first=p;const result=await call('ron',false,p.revision,p.expected_quote);assert.ok(result.conversion_id);
  const r=(await db.query('select * from service_requests')).rows[0];assert.equal(r.service_type,'ron');assert.deepEqual(r.estimate_components,estimate);assert.equal(r.acquisition_utm_campaign,'neighborhood_services');assert.equal(r.status,'under_review');
  const a=(await db.query('select * from request_promotion_applications')).rows[0];assert.equal(a.applied_pricing_program,'STANDARD');assert.equal(a.submitted_service_address,'Original Address, Waxahachie, TX 75165');
  assert.equal((await db.query('select count(*) from invoices')).rows[0].count,0);assert.equal((await db.query('select count(*) from proof_transactions')).rows[0].count,1);
  const m=(await db.query('select * from mobile_notary_requests')).rows[0];assert.equal(m.witness_count,'1');assert.equal(m.print_add_on,true);
 });
 await t.test('stale reverse conversion rejected without writes',async()=>{const before=await snapshot();await assert.rejects(call('mobile',false,first.revision,first.expected_quote,60),/preview changed/);assert.deepEqual(await snapshot(),before);});
 await t.test('RON to Mobile returns to pending review and applies discount only after approval',async()=>{
  const p=await call('mobile',true,null,null,60);await call('mobile',false,p.revision,p.expected_quote,60);
  const a=(await db.query('select * from request_promotion_applications')).rows[0];assert.equal(a.eligibility_status,'pending_review');assert.equal(a.promotional_adjustment,'0');
  await assert.rejects(db.query(`update service_requests set status='quote_ready' where id=$1`,[id]),/Complete neighborhood/);
  await db.query(`select aps_review_pricing_program($1,'approved','New destination manually verified',$2)`,[id,a.revision]);
  assert.equal((await db.query('select quote_amount from service_requests')).rows[0].quote_amount,'35');
  const histories=(await db.query(`select previous_application from request_pricing_reviews where previous_application ? 'conversion_previous_mobile'`)).rows;assert.equal(histories.length,2);assert.equal(histories[1].previous_application.conversion_previous_mobile[0].street_address,'Original Address');
 });
 await db.close();
});
