// Synthetic local browser audit; external network is blocked. Requires the existing static server on 127.0.0.1:8028.
const fs=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=require(process.env.APS_PLAYWRIGHT_MODULE || 'playwright');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{
 const {PGlite}=await import(process.env.APS_PGLITE_MODULE || '@electric-sql/pglite');const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;create function public.is_admin() returns boolean language sql as $$select true$$;`);
 await db.exec(fs.readFileSync(root+'/tests/fixtures/neighborhood-schema.sql','utf8'));
 for(const f of ['20261016032854_neighborhood_pricing_program.sql','20261016045905_neighborhood_review_hardening.sql','20261016092536_neighborhood_atomic_conversion.sql','20261016101212_neighborhood_financial_history_integrity.sql','20261016124235_neighborhood_reconciliation_retry_safety.sql','20261016152822_neighborhood_paid_conversion.sql'])await db.exec(fs.readFileSync(root+'/supabase/migrations/'+f,'utf8'));
 await db.exec(`create table ron_requests(id uuid primary key default gen_random_uuid(),service_request_id uuid,number_of_signers integer,number_of_notarizations integer,witness_review_required boolean);create table proof_transactions(id uuid primary key default gen_random_uuid(),service_request_id uuid,aps_status text);`);
 await db.exec(`create table request_status_updates(id uuid default gen_random_uuid(),service_request_id uuid,status text,message text,sent_email boolean,sent_sms boolean,created_at timestamptz default now());`);
 await db.exec(fs.readFileSync(root+'/supabase/migrations/20260813030000_service_aware_completion_gate.sql','utf8'));
 await db.exec(`create table request_files(id uuid primary key default gen_random_uuid(),service_request_id uuid,file_name text,file_path text,file_type text,is_active boolean default true,customer_visible boolean,eligible_for_delivery boolean,document_classification text,uploaded_by text,review_state text,created_at timestamptz default now());`);
 let statusHandler;
 const ids=['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'];
 for(const [i,id] of ids.entries()){
 const mobile=i===0;const components=[{key:mobile?'mobile:base':'print:mobile_service',label:mobile?'Mobile Notary Appointment Base':'Mobile Document Service Base',quantity:1,unit_amount:mobile?50:20,line_amount:mobile?50:20,billable:true},{key:mobile?'notarial_act:jurat':'print:scan',label:mobile?'Jurat':'Scan to PDF',quantity:1,unit_amount:mobile?10:3,line_amount:mobile?10:3,billable:true},{key:'promotion:CAMDEN_PARK',label:'Camden Park Promotional Adjustment',quantity:1,unit_amount:mobile?-25:-16,line_amount:mobile?-25:-16,billable:true}];
 await db.query(`insert into service_requests(id,service_type,status,workflow_status,created_at,preferred_date,preferred_time_window,estimated_total,estimate_components,paid_amount,payment_status,document_state,participant_state,fulfillment_state,acquisition_landing_page,acquisition_utm_source,acquisition_utm_medium,acquisition_utm_campaign) values($1,$2,'under_review','under_review',now(),'2026-12-01','09:00', $3,$4,0,'unpaid','received','submitted','not_started','/neighborhood','yard_sign','offline','neighborhood_services')`,[id,mobile?'mobile':'print',mobile?35:7,JSON.stringify({snapshot_version:'aps-estimate-components-v1',service:mobile?'mobile':'print',total:mobile?35:7,components})]);
 if(mobile)await db.query(`insert into mobile_notary_requests(service_request_id,street_address,city,state,zip,number_of_signers,number_of_notarizations) values($1,'123 Test Lane','Waxahachie','TX','75165',1,1)`,[id]);
 else await db.query(`insert into print_scan_requests(service_request_id,fulfillment_type,delivery_address,scan_pages) values($1,'mobile-service','123 Test Lane, Waxahachie, TX 75165',3)`,[id]);
 await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','123 Test Lane, Waxahachie, TX 75165')`,[id]);
 }
 const tables=new Set((await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r=>r.tablename));const calls=[],missing=new Set();let denyAccess=false;
 const customer={id:'55555555-5555-4555-8555-555555555555',first_name:'APS',last_name:'Synthetic',email:'aps-audit@example.invalid',phone:'4695550100'};
 async function dispatch(spec){calls.push(spec);try{
 if(spec.kind==='rpc'){
  if(spec.name==='aps_review_pricing_program'){const a=spec.args;const r=await db.query('select aps_review_pricing_program($1,$2,$3,$4,$5) as result',[a.p_request,a.p_status,a.p_reason,a.p_revision,a.p_travel_calculation]);return {data:r.rows[0].result,error:null};}
  if(spec.name==='aps_resolve_pricing_adjustment'){const a=spec.args;const r=await db.query('select aps_resolve_pricing_adjustment($1,$2,$3) as result',[a.p_request,a.p_revision,a.p_reason]);return {data:r.rows[0].result,error:null};}
  return {data:spec.name.includes('count')?0:[],error:null};
 }
 if(spec.kind==='function'){
  const a=spec.args.body||{};
  if(spec.name==='update-request-status'){const response=await statusHandler(new Request('https://fixture.invalid/status',{method:'POST',headers:{Authorization:'Bearer synthetic-only','Content-Type':'application/json'},body:JSON.stringify(a)}));const data=await response.json();return {data,error:response.ok?null:{message:data.error||'Completion blocked'}};}
  if(spec.name==='admin-business-foundation')return denyAccess?{data:null,error:{message:'Synthetic staff access denied'}}:{data:{ok:true},error:null};
  if(spec.name==='admin-service-adjustment'){if(a.command==='preview_service_conversion')await new Promise(resolve=>setTimeout(resolve,200));const result=await db.query('select aps_convert_neighborhood_paid_service($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[a.request_id,a.new_service_type,a.new_service_total,JSON.stringify(a),a.reason,a.command==='preview_service_conversion',a.revision??null,a.expected_quote??null,a.financial_version??null,a.operation_id??null]);return {data:result.rows[0].result,error:null};}
  if(spec.name==='admin-route-distance'){
   if(a.command==='record_manual'){const calculation=(await db.query(`insert into mobile_travel_calculations(service_request_id,suggested_fee,applied_fee,round_trip_miles,operator_note,pricing_tier_label) values($1,$2,$2,$3,$4,'Synthetic reviewed mileage') returning *`,[a.request_id,a.actual_fee,a.round_trip_miles,a.operator_note])).rows[0];return {data:{ok:true,calculation},error:null};}

   const detail=(await db.query('select * from mobile_notary_requests where service_request_id=$1',[a.request_id])).rows[0]||{};
   return {data:{ok:true,detail,origins:[],calculations:[],configured:false},error:null};
  }
  return {data:{ok:false,error:'External/provider operation intentionally disabled in synthetic audit'},error:{message:'External/provider operation intentionally disabled in synthetic audit'}};
 }
 if(!tables.has(spec.table)){missing.add(spec.table);return {data:spec.single?null:[],count:0,error:null};}
 let params=[];const filters=(spec.filters||[]).map(([method,key,value])=>{assert.match(key,/^[a-z_]+$/);if(method==='is')return `"${key}" is ${value===null?'null':value?'true':'false'}`;params.push(value);return `"${key}" ${method==='neq'?'<>':'='} $${params.length}`});const where=filters.length?' where '+filters.join(' and '):'';let result;
 if(spec.operation==='update'){const base=params.length;const columns=Object.keys(spec.value);params.push(...Object.values(spec.value));result=await db.query(`update "${spec.table}" set ${columns.map((k,i)=>`"${k}"=$${base+i+1}`).join(',')}${where} returning *`,params);}
 else if(spec.operation==='delete')result=await db.query(`delete from "${spec.table}"${where} returning *`,params);
 else if(spec.operation==='upsert'){const keys=Object.keys(spec.value);result=await db.query(`insert into "${spec.table}" (${keys.map(k=>'"'+k+'"').join(',')}) values (${keys.map((k,i)=>'$'+(i+1)).join(',')}) on conflict(service_request_id) do update set ${keys.filter(k=>k!=='service_request_id').map(k=>'"'+k+'"=excluded."'+k+'"').join(',')} returning *`,Object.values(spec.value));}
 else if(spec.operation==='insert'){let all=[];for(const value of Array.isArray(spec.value)?spec.value:[spec.value]){const keys=Object.keys(value);const r=await db.query(`insert into "${spec.table}" (${keys.map(k=>'"'+k+'"').join(',')}) values (${keys.map((k,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(value));all.push(...r.rows)}result={rows:all};}
 else result=await db.query(`select * from "${spec.table}"${where}`,params);
 let data=result.rows;
 if(spec.table==='service_requests')for(const r of data){r.customers=customer;r.request_promotion_applications=(await db.query('select * from request_promotion_applications where service_request_id=$1',[r.id])).rows;r.request_participants=[];for(const name of ['mobile_notary_requests','print_scan_requests','ron_requests'])r[name]=(await db.query(`select * from ${name} where service_request_id=$1`,[r.id])).rows;}
 data=JSON.parse(JSON.stringify(data),(k,v)=>['preferred_date','appointment_date'].includes(k)&&typeof v==='string'?v.slice(0,10):v);return {data:spec.single?data[0]||null:data,count:data.length,error:null};
 }catch(e){return {data:null,error:{message:e.message}};}}
 const completionVm=require('node:vm'),{stripTypeScriptTypes:stripCompletion}=require('node:module');
 const {evaluateCompletion}=await import(root+'/supabase/functions/_shared/completion-gate.mjs');
 const statusContext=completionVm.createContext({Deno:{env:{get:()=>''},serve:fn=>statusHandler=fn},Request,Response,console,evaluateCompletion,fetch:async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111'}));
  if(url.endsWith('/rpc/is_admin'))return new Response('true');
  assert.ok(url.includes('/rest/v1/'),'Provider calls forbidden in completion fixture');
  const u=new URL(url),filters=[];for(const [key,value]of u.searchParams){if(['select','order','limit'].includes(key))continue;const dot=value.indexOf('.'),op=value.slice(0,dot),raw=value.slice(dot+1);filters.push([op,key,raw==='true'?true:raw==='false'?false:raw]);}
  const result=await dispatch({kind:'table',table:u.pathname.split('/').at(-1),filters,operation:options.method==='PATCH'?'update':options.method==='POST'?'insert':undefined,value:options.body?JSON.parse(options.body):undefined});return new Response(JSON.stringify(result.error||result.data),{status:result.error?400:200});
 }});
 completionVm.runInContext(stripCompletion(fs.readFileSync(root+'/supabase/functions/update-request-status/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'transform'}),statusContext);
 const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
 await page.exposeFunction('apsAuditDispatch',dispatch);
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='localhost'||u.hostname==='127.0.0.1'){if(u.pathname==='/admin-login.html')return route.fulfill({contentType:'text/html',body:'<h1>APS synthetic sign-in destination</h1>'});return route.continue();}if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'window.supabase=window.__apsMockSupabase;'});return route.abort();});
 await page.addInitScript(()=>{
 const session={user:{id:'11111111-1111-4111-8111-111111111111',email:'aps-admin@example.invalid'},access_token:'synthetic-only'};
 const query=table=>{const spec={kind:'table',table,filters:[]};const q={then(resolve,reject){return window.apsAuditDispatch(spec).then(resolve,reject)}};for(const method of ['select','order','limit','range','not','in','or','gte','lte','contains'])q[method]=()=>q;for(const method of ['eq','neq','is'])q[method]=(key,v)=>{spec.filters.push([method,key,v]);return q};for(const method of ['single','maybeSingle'])q[method]=()=>{spec.single=true;return q};for(const method of ['insert','update','delete','upsert'])q[method]=value=>{spec.operation=method;spec.value=value;return q};return q};
 const channel={on(){return this},subscribe(fn){fn?.('SUBSCRIBED');return this},unsubscribe(){}};
 window.__apsMockSupabase={createClient:()=>({from:query,auth:{getSession:async()=>({data:{session:window.__auditAnonymous?null:session}}),getUser:async()=>({data:{user:session.user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},rpc:(name,args)=>window.apsAuditDispatch({kind:'rpc',name,args}),functions:{invoke:(name,args)=>window.apsAuditDispatch({kind:'function',name,args})},channel:()=>channel,removeChannel(){},realtime:{setAuth:async()=>{}},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:null}})})}})};
 });
 const acceptanceDir=process.env.APS_ACCEPTANCE_DIR;
 async function captureStage(name){if(!acceptanceDir)return;fs.mkdirSync(acceptanceDir,{recursive:true});const old=page.viewportSize();for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:acceptanceDir+'/'+name+'-'+(width===1440?'desktop':'mobile')+'.png',fullPage:true});const result=page.locator('.service-adjustment-dialog .workflow-result');if(await result.isVisible()){await result.scrollIntoViewIfNeeded();await page.screenshot({path:acceptanceDir+'/'+name+'-controls-'+(width===1440?'desktop':'mobile')+'.png',fullPage:true});await page.locator('.service-adjustment-dialog h2').scrollIntoViewIfNeeded();}}await page.setViewportSize(old||{width:1440,height:1000});}
 await page.goto('http://127.0.0.1:8028/admin-dashboard.html');await page.waitForTimeout(1000);console.log('BOOT',await page.locator('#adminLiveStatus').innerText(),errors);await page.locator('[data-id="'+ids[0]+'"]').first().waitFor({timeout:15000});console.log('ADMIN_LOADED');
 await page.locator('[data-id="'+ids[0]+'"]').first().click();await page.locator('#pricingProgramReason').waitFor();await captureStage('admin-01-pending');const acceptanceHtml=acceptanceDir?await page.content():null;if(acceptanceHtml)fs.writeFileSync(acceptanceDir+'/operations-preview.html',acceptanceHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<head>','<head><base href="http://127.0.0.1:8032/">'));
 await page.locator('#pricingProgramReason').fill('Synthetic address reviewed');await page.locator('#reviewPricingProgram').click();await page.waitForFunction(()=>document.querySelector('#requestDetail')?.innerText.includes('Applied pricing: CAMDEN_PARK'));
 assert.equal((await db.query('select approved_travel_amount from request_promotion_applications where service_request_id=$1',[ids[0]])).rows[0].approved_travel_amount,'25');console.log('ADMIN_APPROVAL_MOBILE_PASS');await captureStage('admin-02-approved');
 await page.locator('[data-workspace-tab="quote"]').click();await page.locator('#saveInvoiceBtn').click();await page.waitForTimeout(400);assert.equal((await db.query('select amount from quotes where service_request_id=$1',[ids[0]])).rows[0].amount,'35');console.log('ADMIN_QUOTE_SAVE_PASS');await captureStage('admin-03-quote');
 await page.locator('[data-workspace-tab="fulfillment"]').click();await page.locator('#appointmentDate').fill('2026-12-02');await page.locator('#appointmentTime').fill('10:00');await page.locator('#saveAppointmentBtn').click();await page.waitForTimeout(500);console.log('APPOINTMENT_WRITES',calls.filter(c=>c.operation==='update'&&c.value?.appointment_date));assert.equal(new Date((await db.query('select appointment_date from service_requests where id=$1',[ids[0]])).rows[0].appointment_date).toISOString().slice(0,10),'2026-12-02');console.log('ADMIN_APPOINTMENT_PASS');await captureStage('admin-04-appointment');
 await page.locator('[data-workspace-tab="overview"]').click();
 await page.locator('#pricingProgramDecision').selectOption('denied');await page.locator('#pricingProgramReason').fill('Synthetic outside boundary');await page.locator('#reviewPricingProgram').click();assert.match(await page.locator('#pricingProgramResult').innerText(),/Calculate standard mileage/);console.log('ADMIN_DENIAL_REQUIRES_MILEAGE_PASS');
 await page.locator('[data-workspace-tab="fulfillment"]').click();await page.locator('.mobile-travel-manual summary').click();await page.locator('#manualTravelMiles').fill('18');await page.locator('#manualTravelFee').fill('10');await page.locator('#manualTravelNote').fill('Synthetic manual mileage review');await page.locator('#applyManualMobileTravel').click();await page.locator('.mobile-travel-results').waitFor();await page.locator('[data-workspace-tab="overview"]').click();
 await page.locator('#reviewPricingProgram').click();await page.waitForFunction(()=>document.querySelector('#requestDetail')?.innerText.includes('Applied pricing: STANDARD'));
 assert.equal((await db.query('select quote_amount from service_requests where id=$1',[ids[0]])).rows[0].quote_amount,'70');assert.equal((await db.query('select count(*) from request_pricing_reviews where service_request_id=$1',[ids[0]])).rows[0].count,2);console.log('ADMIN_DENIAL_STANDARD_MILEAGE_HISTORY_PASS');await captureStage('admin-05-standard-pricing');
 await page.locator('[data-id="'+ids[1]+'"]').first().click();await page.locator('#pricingProgramReason').fill('Synthetic document address reviewed');await page.locator('#reviewPricingProgram').click();await page.waitForFunction(()=>document.querySelector('#requestDetail')?.innerText.includes('Applied pricing: CAMDEN_PARK'));
 assert.equal((await db.query('select approved_travel_amount from request_promotion_applications where service_request_id=$1',[ids[1]])).rows[0].approved_travel_amount,'4');console.log('ADMIN_APPROVAL_DOCUMENT_PASS');await captureStage('admin-06-document-approved');
 // Exercise the real conversion dialog and the atomic RPC against fixture data.
 await page.locator('[data-id="'+ids[0]+'"]').first().click();await page.locator('[data-workspace-tab="customer"]').click();await page.locator('#convertServiceBtn').click();
 let dialog=page.locator('.service-adjustment-dialog');await dialog.locator('[name="total"]').fill('35');await dialog.locator('[name="reason"]').fill('Synthetic destination conversion');await dialog.locator('.preview-conversion').click();await dialog.locator('[name="total"]').fill('36');await page.waitForTimeout(400);assert.equal(await dialog.locator('.confirm-conversion').isDisabled(),true);await dialog.locator('[name="total"]').fill('35');await dialog.locator('.preview-conversion').click();await page.waitForFunction(()=>!document.querySelector('.confirm-conversion')?.disabled);
 await dialog.locator('[name="total"]').fill('36');assert.equal(await dialog.locator('.confirm-conversion').isDisabled(),true);await dialog.locator('[name="total"]').fill('35');await dialog.locator('.preview-conversion').click();await page.waitForFunction(()=>!document.querySelector('.confirm-conversion')?.disabled);await dialog.locator('.confirm-conversion').click();await page.locator('.service-adjustment-dialog').waitFor({state:'detached'});
 assert.equal((await db.query('select service_type from service_requests where id=$1',[ids[0]])).rows[0].service_type,'ron');console.log('ADMIN_MOBILE_TO_RON_CONVERSION_PASS');await page.setViewportSize({width:390,height:1000});
 await page.locator('[data-workspace-tab="customer"]').click();await page.locator('#convertServiceBtn').click();dialog=page.locator('.service-adjustment-dialog');
 for(const [name,value] of Object.entries({total:'60',street:'456 Synthetic Lane',city:'Waxahachie',state:'TX',zip:'75165',reason:'Synthetic return to Mobile'}))await dialog.locator('[name="'+name+'"]').fill(value);
 await dialog.locator('.preview-conversion').click();await page.waitForFunction(()=>!document.querySelector('.confirm-conversion')?.disabled);await dialog.locator('.confirm-conversion').click();await page.locator('.service-adjustment-dialog').waitFor({state:'detached'});
 assert.equal((await db.query('select eligibility_status from request_promotion_applications where service_request_id=$1',[ids[0]])).rows[0].eligibility_status,'pending_review');console.log('ADMIN_RON_TO_MOBILE_PENDING_REVIEW_PASS');await page.locator('[data-workspace-tab="overview"]').click();assert.match(await page.locator('#requestDetail').innerText(),/Current service address to review:.*456 Synthetic Lane/s);await page.screenshot({path:'/private/tmp/aps-admin-converted-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-id="'+ids[1]+'"]').first().click();
 // Execute the actual quote-approval helper against the same synthetic database.
 const vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
 const invoiceContext=vm.createContext({Deno:{env:{get:()=>''},serve(){}},Response,console,fetch:async(url,options={})=>{
  const u=new URL(url);assert.equal(u.pathname.startsWith('/rest/v1/'),true,'Only synthetic REST is allowed');
  const filters=[];for(const [key,value] of u.searchParams){if(['select','order','limit'].includes(key))continue;const dot=value.indexOf('.'),op=value.slice(0,dot),raw=value.slice(dot+1);assert.ok(['eq','is'].includes(op));filters.push([op,key,raw==='null'?null:raw]);}
  const method=options.method||'GET';const result=await dispatch({kind:'table',table:u.pathname.split('/').at(-1),filters,operation:method==='PATCH'?'update':method==='POST'?'insert':undefined,value:options.body?JSON.parse(options.body):undefined});
  return new Response(JSON.stringify(result.error||result.data),{status:result.error?400:200});
 }});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync(root+'/supabase/functions/client-quote-action/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'transform'}),invoiceContext);
 const quote=(await db.query('select current_quote_id from service_requests where id=$1',[ids[1]])).rows[0].current_quote_id;
 invoiceContext.requestId=ids[1];invoiceContext.quoteId=quote;
 const invoice=await vm.runInContext('materializeInitialInvoice(requestId,quoteId)',invoiceContext);
 assert.equal(Number(invoice.amount_due),7);assert.equal((await db.query('select count(*) from invoice_items where invoice_id=$1',[invoice.id])).rows[0].count,3);
 assert.equal((await db.query('select status from service_requests where id=$1',[ids[1]])).rows[0].status,'awaiting_payment');
 await vm.runInContext('materializeInitialInvoice(requestId,quoteId)',invoiceContext);assert.equal((await db.query('select count(*) from invoices')).rows[0].count,1);
 console.log('QUOTE_APPROVAL_INVOICE_ITEMIZATION_RETRY_PASS');await captureStage('admin-07-invoice');
 for(const [paid,balance,status] of [[2,5,'partially_paid'],[7,0,'paid']]){
  await db.query('update invoices set amount_paid=$1,paid_amount=$1,balance_due=$2,status=$3,payment_status=$3 where id=$4',[paid,balance,status,invoice.id]);
  const before=(await db.query('select * from invoices where id=$1',[invoice.id])).rows;
  await vm.runInContext('materializeInitialInvoice(requestId,quoteId)',invoiceContext);
  assert.deepEqual((await db.query('select * from invoices where id=$1',[invoice.id])).rows,before);
  await page.reload();await page.locator('[data-id="'+ids[1]+'"]').first().click();await page.locator('[data-workspace-tab="payments"]').click();
  assert.match(await page.locator('#requestDetail').innerText(),/INV-44444444-01/);console.log('ADMIN_INVOICE_PAYMENT_VIEW_PASS',status);await captureStage('admin-08-'+status);
 }
 // The completion button calls the actual Edge handler and completion gate.
 await page.locator('[data-workspace-tab="messages"]').click();await page.locator('#updateStatusWithoutSending').check();await page.locator('[data-status="completed"]').click();await page.waitForTimeout(250);
 assert.notEqual((await db.query('select status from service_requests where id=$1',[ids[1]])).rows[0].status,'completed');
 await page.locator('[data-workspace-tab="fulfillment"]').click();await captureStage('admin-09-completion-blocked');
 // Released scan metadata represents a simulated document provider result.
 await db.query(`insert into request_files(service_request_id,file_name,file_path,file_type,customer_visible,eligible_for_delivery,document_classification,uploaded_by,review_state) values($1,'synthetic-scan.pdf','synthetic/scan.pdf','application/pdf',true,true,'scan_output','admin','approved')`,[ids[1]]);
 await page.locator('.completion-fact[data-key="scan_completed"]').check();await page.locator('#completionDocumentState').selectOption('approved');await page.locator('#completionParticipantState').selectOption('not_applicable');await page.locator('#completionDeliveryPath').selectOption('aps');await page.locator('#saveCompletionFactsBtn').click();await page.waitForFunction(()=>document.querySelector('#completionGateResult')?.textContent.includes('Fulfillment facts saved'));
 await captureStage('admin-10-fulfillment-ready');await page.locator('[data-workspace-tab="messages"]').click();await page.locator('#updateStatusWithoutSending').check();await page.locator('[data-status="completed"]').click();await page.waitForTimeout(600);
 assert.equal((await db.query('select status from service_requests where id=$1',[ids[1]])).rows[0].status,'completed');assert.equal((await db.query("select count(*) from request_timeline_events where service_request_id=$1 and event_type='order_completed'",[ids[1]])).rows[0].count,1);
 await page.locator('[data-workspace-tab="overview"]').click();await captureStage('admin-11-completed');console.log('ADMIN_COMPLETION_ACTUAL_HANDLER_PASS');
 for(const id of ids)assert.equal((await db.query('select acquisition_utm_campaign from service_requests where id=$1',[id])).rows[0].acquisition_utm_campaign,'neighborhood_services');
 for(const width of [1440,1034,390]){await page.setViewportSize({width,height:1000});const title=await page.locator(".admin-v3-workspace-title-row h2").boundingBox();assert.ok(title.width>=Math.min(200,width-80) && title.height<150,"Request heading remains readable at "+width);for(const tab of ['overview','customer','documents','quote','payments','messages','fulfillment','timeline']){await page.locator('[data-workspace-tab="'+tab+'"]').click();await page.waitForTimeout(80);assert.equal(await page.locator('[data-workspace-tab="'+tab+'"]').getAttribute('aria-selected'),'true');}await page.locator('[data-workspace-tab="overview"]').click();await page.locator('.admin-v3-workspace').evaluate(el=>el.scrollTop=300);const header=await page.locator('.admin-v3-workspace-header').boundingBox(),tabs=await page.locator('#workspaceTabs').boundingBox();assert.ok(tabs.y>=header.y+header.height-1,'Sticky tabs remain below header at '+width);await page.locator('[data-workspace-tab="quote"]').click();assert.equal(await page.locator('[data-workspace-tab="quote"]').getAttribute('aria-selected'),'true');await page.screenshot({path:'/private/tmp/aps-admin-audit-'+width+'.png',fullPage:true});console.log('ADMIN_TABS',width,'overflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));}
 await page.setViewportSize({width:1440,height:1000});
 for(const view of ['calendar','review','invoices','payments']){
  await page.locator('a[data-admin-view="'+view+'"]').click();
  await page.waitForFunction(()=>{const el=document.querySelector('#adminModuleContent');return el&&el.innerText.trim()&&!el.innerText.includes('Loading…')});
  assert.equal(await page.locator('#adminModuleView').isVisible(),true);
  if(view==='invoices'){const text=await page.locator('#adminModuleContent').innerText();assert.match(text,/APS-44444444/);assert.match(text,/ISSUED INVOICES\s+\$7.00/);assert.match(text,/OUTSTANDING RECEIVABLE\s+\$0.00/);}
  console.log('ADMIN_GLOBAL_MODULE_PASS',view);
 }
 // Paid conversion through the actual dialog and new atomic RPC. Payments are
 // synthetic ledger fixtures; no Stripe/Resend request is permitted.
 await db.query(`update service_requests set paid_amount=20,fulfillment_state='not_started' where id=$1`,[ids[0]]);
 const paidOriginal=(await db.query(`insert into invoices(service_request_id,status,amount_due,amount_paid,paid_amount,balance_due,stripe_payment_intent_id) values($1,'partially_paid',60,20,20,40,'pi_fixture_original') returning *`,[ids[0]])).rows[0];
 await db.query(`insert into request_payments(service_request_id,invoice_id,amount,is_test,stripe_payment_intent_id) values($1,$2,20,true,'pi_fixture_original')`,[ids[0],paidOriginal.id]);
 await page.goto('http://127.0.0.1:8028/admin-dashboard.html');await page.locator('[data-id="'+ids[0]+'"]').first().click();await page.locator('[data-workspace-tab="customer"]').click();await page.locator('#convertServiceBtn').click();dialog=page.locator('.service-adjustment-dialog');
 await dialog.locator('[name="total"]').fill('40');await dialog.locator('[name="reason"]').fill('Synthetic paid conversion');await dialog.locator('.preview-conversion').click();await page.waitForTimeout(500);assert.equal(await dialog.locator('.confirm-conversion').isDisabled(),true);assert.match(await dialog.innerText(),/separately approved/);await captureStage('admin-12-paid-reduction-review');
 await dialog.locator('[name="total"]').fill('80');await dialog.locator('.preview-conversion').click();await page.waitForFunction(()=>!document.querySelector('.confirm-conversion')?.disabled);assert.match(await dialog.innerText(),/separate invoice/);await captureStage('admin-13-paid-increase-preview');await dialog.locator('.confirm-conversion').click();await dialog.waitFor({state:'detached'});
 assert.deepEqual((await db.query('select * from invoices where id=$1',[paidOriginal.id])).rows[0],paidOriginal);
 const converted=(await db.query('select * from service_requests where id=$1',[ids[0]])).rows[0];assert.equal(converted.service_type,'ron');assert.equal(Number(converted.balance_due),60);
 assert.equal((await db.query(`select count(*) from review_queue_items where service_request_id=$1 and blocker_key='conversion_customer_notification' and state='open'`,[ids[0]])).rows[0].count,1);
 await page.locator('[data-workspace-tab="payments"]').click();await captureStage('admin-14-paid-conversion');console.log('ADMIN_PAID_CONVERSION_HISTORY_BALANCE_NOTIFICATION_PASS');
 // Administrator reviews a complete revised itemization before customer approval.
 await db.query('delete from invoice_items where service_request_id=$1 and invoice_id is null',[ids[0]]);
 await db.query(`insert into invoice_items(service_request_id,item_type,description,quantity,unit_price,line_total) values($1,'service','Reviewed RON destination services',1,80,80)`,[ids[0]]);
 await db.query(`update quotes set state='sent' where id=$1`,[converted.current_quote_id]);
 invoiceContext.requestId=ids[0];invoiceContext.quoteId=converted.current_quote_id;
 const conversionInvoiceBefore=(await db.query('select * from invoices where service_request_id=$1 order by id',[ids[0]])).rows;
 const approvedConversion=await vm.runInContext('materializeInitialInvoice(requestId,quoteId)',invoiceContext);assert.equal(approvedConversion.conversion_reused,true);assert.equal(approvedConversion.request_balance_due,60);
 await vm.runInContext('materializeInitialInvoice(requestId,quoteId)',invoiceContext);assert.deepEqual((await db.query('select * from invoices where service_request_id=$1 order by id',[ids[0]])).rows,conversionInvoiceBefore);console.log('PAID_CONVERSION_APPROVAL_NO_DUPLICATE_CHARGE_PASS');

 denyAccess=true;const beforeDenied=calls.length;await page.goto('http://127.0.0.1:8028/admin-dashboard.html');await page.waitForURL('**/admin-login.html');
 assert.equal(calls.slice(beforeDenied).filter(c=>['insert','update','delete','upsert'].includes(c.operation)).length,0);console.log('ADMIN_STAFF_DENIED_REDIRECT_PASS');
 await page.addInitScript(()=>{window.__auditAnonymous=true;});await page.goto('http://127.0.0.1:8028/admin-dashboard.html');await page.waitForURL('**/admin-login.html');console.log('ADMIN_ANONYMOUS_REDIRECT_PASS');
 console.log('JS_ERRORS',errors);console.log('UNMODELED_READ_TABLES',[...missing]);fs.writeFileSync('/private/tmp/aps-admin-audit-results.json',JSON.stringify({errors,calls,missing:[...missing]},null,2));assert.deepEqual(errors,[]);await browser.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
