import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/client-quote-action/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{mode:'transform'});
function fixture(failAt) {
 const request={id:'request',quote_amount:35,initial_payment_amount:35,estimated_total:35,current_quote_id:'quote',status:'quote_ready'};
 const invoices=[],items=[{line_total:60,invoice_id:null},{line_total:-25,invoice_id:null}],calls=[];
 let fail=true;
 const context=vm.createContext({Deno:{env:{get:()=>''},serve(){}},Response,console,fetch:async(url,opts={})=>{
  const path=new URL(url).pathname.split('/').at(-1),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;calls.push({path,method,body});
  if(method==='PATCH'&&path===failAt&&fail){fail=false;return new Response(JSON.stringify({message:'Injected finalization failure'}),{status:500});}
  let result;
  if(path==='service_requests'){if(body)Object.assign(request,body);result=[request];}
  else if(path==='request_promotion_applications')result=[{eligibility_status:'approved',financial_adjustment_required:false}];
  else if(path==='quotes')result=[{id:'quote',state:'approved'}];
  else if(path==='invoices'){if(method==='POST')invoices.push({...body,id:'invoice'});else if(body)Object.assign(invoices[0],body);result=invoices;}
  else if(path==='invoice_items'){if(body)items.forEach(item=>{if(item.invoice_id===null)Object.assign(item,body)});result=items;}
  else throw Error('Unexpected external operation: '+url);
  return new Response(JSON.stringify(result));
 }});
 return {request,invoices,items,calls,approve:()=>vm.runInContext("materializeInitialInvoice('request','quote')",context),init:()=>vm.runInContext(source,context)};
}
for(const failure of ['invoice_items','service_requests'])test('quote approval reports '+failure+' failure and retry repairs without duplicate invoice',async()=>{
 const f=fixture(failure);f.init();await assert.rejects(f.approve(),/Injected finalization failure/);
 await f.approve();assert.equal(f.invoices.length,1);assert.equal(f.items.every(x=>x.invoice_id==='invoice'),true);assert.equal(f.request.status,'awaiting_payment');assert.equal(f.invoices[0].amount_due,35);
});
test('repeated approval preserves partial payment and later request status',async()=>{
 const f=fixture();f.init();await f.approve();Object.assign(f.invoices[0],{amount_paid:10,paid_amount:10,balance_due:25,payment_status:'partially_paid'});f.request.status='scheduled';const before=JSON.stringify(f.invoices);await f.approve();assert.equal(JSON.stringify(f.invoices),before);assert.equal(f.request.status,'scheduled');
});
