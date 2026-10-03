import test from 'node:test';
import assert from 'node:assert/strict';
test('manual completion still blocks open reviews and records normal completion without email or exception',async()=>{
 const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
 let handler,open=true,updates=0,audits=0,mail=0;
 const id='10000000-0000-4000-8000-000000000001';
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
 globalThis.Deno={env:{get:n=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'})[n]||''},serve:h=>{handler=h;}};
 globalThis.fetch=async(url,init={})=>{
  const path=String(url);
  if(path.endsWith('/auth/v1/user')) return json({id:'admin'});
  if(path.endsWith('/rpc/is_admin')) return json(true);
  if(path.includes('/functions/')){mail++;throw new Error('No email may be sent.');}
  const table=path.split('/rest/v1/')[1]?.split('?')[0];
  if(init.method==='PATCH'&&table==='service_requests') {const patch=JSON.parse(init.body);assert.equal(patch.status,'completed');assert.equal(patch.completion_path,'normal');assert.equal(patch.completion_exception_id,null);updates++;return json([]);}
  if(init.method==='POST'&&table==='request_timeline_events'){const event=JSON.parse(init.body);assert.equal(event.metadata.message_sent,false);assert.equal(event.metadata.completion_path,'normal');audits++;return json([]);}
  if(init.method==='POST'&&table==='request_status_updates') return json([]);
  if(table==='service_requests') return json([{id,service_type:'ron',status:'appointment_confirmed',document_state:'approved',participant_state:'approved'}]);
  if(table==='review_queue_items') return json(open?[{state:'open',blocker_key:'pricing_review'}]:[]);
  if(table==='request_files') return json([{uploaded_by:'proof',document_classification:'completed_notarized_document',review_state:'approved',is_active:true,customer_visible:true,eligible_for_delivery:true}]);
  if(table==='request_completion_facts') return json([{components:['ron'],ron_session_completed:true,aps_deliverable_required:true}]);
  if(['invoices','request_participants','ron_requests','proof_transactions'].includes(table))return json([]);
  throw new Error(`Unexpected fixture call ${table}`);
 };
 try{
  await import('../supabase/functions/update-request-status/index.ts');
  const call=()=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({request_id:id,status:'completed',send_message:false})}));
  assert.equal((await call()).status,409);assert.equal(updates,0);
  open=false;const response=await call();const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.ok,true);assert.equal(updates,1);assert.equal(audits,1);assert.equal(mail,0);
 }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
});
