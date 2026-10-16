// Synthetic local browser audit; external network is blocked. Requires the existing static server on 127.0.0.1:8028.
const fs=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=require(process.env.APS_PLAYWRIGHT_MODULE || 'playwright');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{
 const {PGlite}=await import(process.env.APS_PGLITE_MODULE || '@electric-sql/pglite');const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;create function public.is_admin() returns boolean language sql as $$select true$$;`);
 await db.exec(fs.readFileSync(root+'/tests/fixtures/neighborhood-schema.sql','utf8'));
 for(const f of ['20261016032854_neighborhood_pricing_program.sql','20261016045905_neighborhood_review_hardening.sql'])await db.exec(fs.readFileSync(root+'/supabase/migrations/'+f,'utf8'));
 await db.exec(`create table request_status_updates(id uuid default gen_random_uuid(),service_request_id uuid,status text,message text,sent_email boolean,sent_sms boolean,created_at timestamptz default now());`);
 const ids=['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'];
 for(const [i,id] of ids.entries()){
 const mobile=i===0;const components=[{key:mobile?'mobile:base':'print:mobile_service',label:mobile?'Mobile Notary Appointment Base':'Mobile Document Service Base',quantity:1,unit_amount:mobile?50:20,line_amount:mobile?50:20,billable:true},{key:mobile?'notarial_act:jurat':'print:scan',label:mobile?'Jurat':'Scan to PDF',quantity:1,unit_amount:mobile?10:3,line_amount:mobile?10:3,billable:true},{key:'promotion:CAMDEN_PARK',label:'Camden Park Promotional Adjustment',quantity:1,unit_amount:mobile?-25:-16,line_amount:mobile?-25:-16,billable:true}];
 await db.query(`insert into service_requests(id,service_type,status,workflow_status,created_at,preferred_date,preferred_time_window,estimated_total,estimate_components,paid_amount,payment_status,document_state,participant_state,fulfillment_state,acquisition_landing_page,acquisition_utm_source,acquisition_utm_medium,acquisition_utm_campaign) values($1,$2,'under_review','under_review',now(),'2026-12-01','09:00', $3,$4,0,'unpaid','received','submitted','not_started','/neighborhood','yard_sign','offline','neighborhood_services')`,[id,mobile?'mobile':'print',mobile?35:7,JSON.stringify({snapshot_version:'aps-estimate-components-v1',service:mobile?'mobile':'print',total:mobile?35:7,components})]);
 if(mobile)await db.query(`insert into mobile_notary_requests(service_request_id,street_address,city,state,zip,number_of_signers,number_of_notarizations) values($1,'123 Test Lane','Waxahachie','TX','75165',1,1)`,[id]);
 else await db.query(`insert into print_scan_requests(service_request_id,fulfillment_type,delivery_address,scan_pages) values($1,'mobile-service','123 Test Lane, Waxahachie, TX 75165',3)`,[id]);
 await db.query(`insert into request_promotion_applications(service_request_id,promotion_code,submitted_service_address) values($1,'CAMDEN_PARK','123 Test Lane, Waxahachie, TX 75165')`,[id]);
 }
 const tables=new Set((await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r=>r.tablename));const calls=[],missing=new Set();
 const customer={id:'55555555-5555-4555-8555-555555555555',first_name:'APS',last_name:'Synthetic',email:'aps-audit@example.invalid',phone:'4695550100'};
 async function dispatch(spec){calls.push(spec);try{
 if(spec.kind==='rpc'){
  if(spec.name==='aps_review_pricing_program'){const a=spec.args;const r=await db.query('select aps_review_pricing_program($1,$2,$3,$4,$5) as result',[a.p_request,a.p_status,a.p_reason,a.p_revision,a.p_travel_calculation]);return {data:r.rows[0].result,error:null};}
  if(spec.name==='aps_resolve_pricing_adjustment'){const a=spec.args;const r=await db.query('select aps_resolve_pricing_adjustment($1,$2,$3) as result',[a.p_request,a.p_revision,a.p_reason]);return {data:r.rows[0].result,error:null};}
  return {data:spec.name.includes('count')?0:[],error:null};
 }
 if(spec.kind==='function'){
  const a=spec.args.body||{};
  if(spec.name==='admin-business-foundation')return {data:{ok:true},error:null};
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
 else if(spec.operation==='insert'){let all=[];for(const value of Array.isArray(spec.value)?spec.value:[spec.value]){const keys=Object.keys(value);const r=await db.query(`insert into "${spec.table}" (${keys.map(k=>'"'+k+'"').join(',')}) values (${keys.map((k,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(value));all.push(...r.rows)}result={rows:all};}
 else result=await db.query(`select * from "${spec.table}"${where}`,params);
 let data=result.rows;
 if(spec.table==='service_requests')for(const r of data){r.customers=customer;r.request_promotion_applications=(await db.query('select * from request_promotion_applications where service_request_id=$1',[r.id])).rows;r.request_participants=[];for(const name of ['mobile_notary_requests','print_scan_requests'])r[name]=(await db.query(`select * from ${name} where service_request_id=$1`,[r.id])).rows;}
 data=JSON.parse(JSON.stringify(data),(k,v)=>['preferred_date','appointment_date'].includes(k)&&typeof v==='string'?v.slice(0,10):v);return {data:spec.single?data[0]||null:data,count:data.length,error:null};
 }catch(e){return {data:null,error:{message:e.message}};}}
 const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
 await page.exposeFunction('apsAuditDispatch',dispatch);
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='localhost'||u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'window.supabase=window.__apsMockSupabase;'});return route.abort();});
 await page.addInitScript(()=>{
 const session={user:{id:'11111111-1111-4111-8111-111111111111',email:'aps-admin@example.invalid'},access_token:'synthetic-only'};
 const query=table=>{const spec={kind:'table',table,filters:[]};const q={then(resolve,reject){return window.apsAuditDispatch(spec).then(resolve,reject)}};for(const method of ['select','order','limit','range','not','in','or','gte','lte','contains'])q[method]=()=>q;for(const method of ['eq','neq','is'])q[method]=(key,v)=>{spec.filters.push([method,key,v]);return q};for(const method of ['single','maybeSingle'])q[method]=()=>{spec.single=true;return q};for(const method of ['insert','update','delete','upsert'])q[method]=value=>{spec.operation=method;spec.value=value;return q};return q};
 const channel={on(){return this},subscribe(fn){fn?.('SUBSCRIBED');return this},unsubscribe(){}};
 window.__apsMockSupabase={createClient:()=>({from:query,auth:{getSession:async()=>({data:{session:window.__auditAnonymous?null:session}}),getUser:async()=>({data:{user:session.user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},rpc:(name,args)=>window.apsAuditDispatch({kind:'rpc',name,args}),functions:{invoke:(name,args)=>window.apsAuditDispatch({kind:'function',name,args})},channel:()=>channel,removeChannel(){},realtime:{setAuth:async()=>{}},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:null}})})}})};
 });
 await page.goto('http://127.0.0.1:8028/admin-dashboard.html');await page.waitForTimeout(1000);console.log('BOOT',await page.locator('#adminLiveStatus').innerText(),errors);await page.locator('[data-id="'+ids[0]+'"]').first().waitFor({timeout:15000});console.log('ADMIN_LOADED');
 await page.locator('[data-id="'+ids[0]+'"]').first().click();await page.locator('#pricingProgramReason').waitFor();
 await page.locator('#pricingProgramReason').fill('Synthetic address reviewed');await page.locator('#reviewPricingProgram').click();await page.waitForFunction(()=>document.querySelector('#requestDetail')?.innerText.includes('Applied pricing: CAMDEN_PARK'));
 assert.equal((await db.query('select approved_travel_amount from request_promotion_applications where service_request_id=$1',[ids[0]])).rows[0].approved_travel_amount,'25');console.log('ADMIN_APPROVAL_MOBILE_PASS');
 await page.locator('[data-workspace-tab="quote"]').click();await page.locator('#saveInvoiceBtn').click();await page.waitForTimeout(400);assert.equal((await db.query('select amount from quotes where service_request_id=$1',[ids[0]])).rows[0].amount,'35');console.log('ADMIN_QUOTE_SAVE_PASS');
 await page.locator('[data-workspace-tab="fulfillment"]').click();await page.locator('#appointmentDate').fill('2026-12-02');await page.locator('#appointmentTime').fill('10:00');await page.locator('#saveAppointmentBtn').click();await page.waitForTimeout(500);console.log('APPOINTMENT_WRITES',calls.filter(c=>c.operation==='update'&&c.value?.appointment_date));assert.equal(new Date((await db.query('select appointment_date from service_requests where id=$1',[ids[0]])).rows[0].appointment_date).toISOString().slice(0,10),'2026-12-02');console.log('ADMIN_APPOINTMENT_PASS');
 await page.locator('[data-workspace-tab="overview"]').click();
 await page.locator('#pricingProgramDecision').selectOption('denied');await page.locator('#pricingProgramReason').fill('Synthetic outside boundary');await page.locator('#reviewPricingProgram').click();assert.match(await page.locator('#pricingProgramResult').innerText(),/Calculate standard mileage/);console.log('ADMIN_DENIAL_REQUIRES_MILEAGE_PASS');
 await page.locator('[data-workspace-tab="fulfillment"]').click();await page.locator('.mobile-travel-manual summary').click();await page.locator('#manualTravelMiles').fill('18');await page.locator('#manualTravelFee').fill('10');await page.locator('#manualTravelNote').fill('Synthetic manual mileage review');await page.locator('#applyManualMobileTravel').click();await page.locator('.mobile-travel-results').waitFor();await page.locator('[data-workspace-tab="overview"]').click();
 await page.locator('#reviewPricingProgram').click();await page.waitForFunction(()=>document.querySelector('#requestDetail')?.innerText.includes('Applied pricing: STANDARD'));
 assert.equal((await db.query('select quote_amount from service_requests where id=$1',[ids[0]])).rows[0].quote_amount,'70');assert.equal((await db.query('select count(*) from request_pricing_reviews where service_request_id=$1',[ids[0]])).rows[0].count,2);console.log('ADMIN_DENIAL_STANDARD_MILEAGE_HISTORY_PASS');
 await page.locator('[data-id="'+ids[1]+'"]').first().click();await page.locator('#pricingProgramReason').fill('Synthetic document address reviewed');await page.locator('#reviewPricingProgram').click();await page.waitForFunction(()=>document.querySelector('#requestDetail')?.innerText.includes('Applied pricing: CAMDEN_PARK'));
 assert.equal((await db.query('select approved_travel_amount from request_promotion_applications where service_request_id=$1',[ids[1]])).rows[0].approved_travel_amount,'4');console.log('ADMIN_APPROVAL_DOCUMENT_PASS');
 for(const id of ids)assert.equal((await db.query('select acquisition_utm_campaign from service_requests where id=$1',[id])).rows[0].acquisition_utm_campaign,'neighborhood_services');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});for(const tab of ['overview','customer','documents','quote','payments','messages','fulfillment','timeline']){await page.locator('[data-workspace-tab="'+tab+'"]').click();await page.waitForTimeout(80);assert.equal(await page.locator('[data-workspace-tab="'+tab+'"]').getAttribute('aria-selected'),'true');}await page.locator('[data-workspace-tab="overview"]').click();await page.screenshot({path:'/private/tmp/aps-admin-audit-'+width+'.png',fullPage:true});console.log('ADMIN_TABS',width,'overflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));}
 console.log('JS_ERRORS',errors);console.log('UNMODELED_READ_TABLES',[...missing]);fs.writeFileSync('/private/tmp/aps-admin-audit-results.json',JSON.stringify({errors,calls,missing:[...missing]},null,2));assert.deepEqual(errors,[]);await browser.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
