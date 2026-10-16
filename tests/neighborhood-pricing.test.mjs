import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { evaluateCompletion } from '../supabase/functions/_shared/completion-gate.mjs';
const read = path => fs.readFileSync(new URL('../'+path, import.meta.url),'utf8');
const context = vm.createContext({window:{}});
for (const name of ['pricing-config','estimate-components','neighborhood-pricing']) vm.runInContext(read(`assets/js/${name}.js`),context);
const {ALIGNED_PRICING:pricing,APSEstimateComponents:estimates,APSNeighborhoodPricing:program} = context.window;
for (const [service,input,expected] of [
 ['print',{print:{pages:2},fulfillment:'courier'},4],
 ['print',{scanPages:2,fulfillment:'mobile-service'},4],
 ['print',{print:{pages:2},scanPages:2,fulfillment:'mobile-service'},4],
 ['mobile',{},25],['mobile',{print:{enabled:true,pages:2}},25],
 ['mobile',{scanPages:2},25],['mobile',{print:{enabled:true,pages:2},scanPages:2},25],
]) test(`one-trip pricing ${service} ${JSON.stringify(input)}`,()=>{
 const snapshot=program.apply(estimates.build(service,input,pricing),'CAMDEN_PARK');
 const travel=snapshot.components.filter(line=>['mobile:base','print:courier','print:mobile_service','promotion:CAMDEN_PARK'].includes(line.key));
 assert.equal(travel.reduce((sum,line)=>sum+line.line_amount,0),expected);
 assert.equal(snapshot.components.filter(line=>line.key==='promotion:CAMDEN_PARK').length,1);
 assert.equal(program.apply(snapshot,'CAMDEN_PARK').total,snapshot.total);
});
test('RON and witness rates unchanged',()=>{
 const standard=estimates.build('ron',{providedWitnessCount:2},pricing);
 assert.equal(standard.components.find(line=>line.key==='ron:witness').unit_amount,25);
 assert.equal(program.apply(standard,'CAMDEN_PARK').total,standard.total);
 const mobile=program.apply(estimates.build('mobile',{providedWitnessCount:2},pricing),'CAMDEN_PARK');
 assert.equal(mobile.components.find(line=>line.key==='mobile:witness').unit_amount,50);
 assert.equal(mobile.components.find(line=>line.key.startsWith('notarial_act')).unit_amount,10);
});
test('neighborhood reuses exact standard wizard markup',()=>{
 const section=html=>html.slice(html.indexOf('<section class="section" id="request">'),html.indexOf('</form>')+7);
 assert.equal(section(read('neighborhood.html')),section(read('pricing.html')));
});
const source=read('supabase/functions/public-request-submit/index.ts').replace(/^import .*;\n/gm,'');
const server=vm.createContext({Deno:{env:{get:()=>''},serve:()=>{}},Response,console});
vm.runInContext(stripTypeScriptTypes(source,{mode:'transform'}),server);
const valid=(pages=0,scans=3)=>({customer:{first_name:'Test',last_name:'Customer',email:'test@example.invalid'},request:{service_type:'print',preferred_date:'2026-12-01',preferred_time_window:'Morning',estimated_total:3,estimate_components:{snapshot_version:'aps-estimate-components-v1',service:'print',components:[{key:'print:scan',label:'Scan to PDF',quantity:3,unit_amount:1,line_amount:3,billable:true}],total:3}},service_detail:{black_white_pages:pages,color_pages:0,scan_pages:scans,delivery_address:'123 Test Lane, Waxahachie, 75165'},files:[]});
function validate(body){server.body=body;return vm.runInContext('validate(body)',server)}
test('scan-only accepts physical originals without upload or false exception',()=>{
 const result=validate(valid());assert.equal(result.request.document_state,'physical_originals_expected');assert.equal(result.request.document_upload_exception_reason,null);
});
test('printing and combined requests retain source-file requirements',()=>{
 assert.throws(()=>validate(valid(3,0)),/Upload at least/);assert.throws(()=>validate(valid(3,3)),/Upload at least/);
});
test('scan-only rejects missing address, schedule, zero and invalid counts',()=>{
 for(const key of ['preferred_date','preferred_time_window']){const b=valid();delete b.request[key];assert.throws(()=>validate(b),/schedule/);}
 const b=valid();delete b.service_detail.delivery_address;assert.throws(()=>validate(b),/service address/);
 for(const scans of [0,-1,1.5,'bad'])assert.throws(()=>validate(valid(0,scans)),/page count/);
});
test('scan completion still requires actual scanning and released digital output',()=>{
 const b={request:{service_type:'print',document_state:'physical_originals_expected'},detail:{scan_pages:3},facts:{},invoices:[],files:[]};
 assert.equal(evaluateCompletion(b).allowed,false);
 assert.equal(evaluateCompletion({...b,facts:{scan_completed:true}}).allowed,false);
 assert.equal(evaluateCompletion({...b,facts:{scan_completed:true},files:[{customer_visible:true,eligible_for_delivery:true,document_classification:'customer_deliverable',review_state:'approved',uploaded_by:'admin'}]}).allowed,true);
});
