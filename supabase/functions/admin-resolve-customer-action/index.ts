/** Resolve a pending customer cancellation/reschedule request. */
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Aligned Print & Scan <notifications@alignedprintscan.com>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";
function json(body: unknown, status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
async function db(path:string,init:RequestInit={}){return fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}})}
async function rows(r:Response){if(!r.ok)throw new Error(await r.text());return r.json()}
function ref(id:string){return `APS-${id.slice(0,8).toUpperCase()}`}
async function send(to:string,subject:string,html:string){if(!RESEND_API_KEY||!to)return {id:null,skipped:true};const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:FROM_EMAIL,to:[to],subject,html})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.message||"Email failed");return d}
Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});try{
  const b=await req.json().catch(()=>({})); const actionId=String(b.action_id||"").trim(); const decision=String(b.decision||"").toLowerCase(); const message=String(b.admin_message||"").trim(); const refund=Math.max(0,Number(b.approved_refund_amount||0));
  if(!actionId||!["approved","denied"].includes(decision))throw new Error("Action ID and a valid decision are required.");
  const actionRows=await rows(await db(`customer_action_requests?select=*&id=eq.${actionId}&limit=1`)); const action=actionRows?.[0]; if(!action)return json({ok:false,error:"Action request not found."},404);
  const requestRows=await rows(await db(`service_requests?select=id,status,appointment_date,appointment_time,customers(email,first_name,last_name)&id=eq.${action.service_request_id}&limit=1`)); const request=requestRows?.[0]; const customer=Array.isArray(request?.customers)?request.customers[0]:request?.customers;
  await db(`customer_action_requests?id=eq.${actionId}`,{method:"PATCH",body:JSON.stringify({status:decision,admin_message:message||null,approved_refund_amount:refund,resolved_at:new Date().toISOString()})});
  const requestPatch:any={customer_action_status:`${action.action_type}_${decision}`};
  if(decision==="approved"&&action.action_type==="cancel") requestPatch.status="cancelled",requestPatch.workflow_status="cancelled";
  if(decision==="approved"&&action.action_type==="reschedule"&&action.proposed_appointment_at){const d=new Date(action.proposed_appointment_at);requestPatch.appointment_date=d.toISOString().slice(0,10);requestPatch.appointment_time=d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/Chicago"});}
  await db(`service_requests?id=eq.${action.service_request_id}`,{method:"PATCH",body:JSON.stringify(requestPatch)});
  if(refund>0) await db("refund_reviews",{method:"POST",body:JSON.stringify({service_request_id:action.service_request_id,customer_action_request_id:actionId,status:"approved",requested_amount:refund,approved_amount:refund,reason:message||"Approved customer action refund."})});
  const title=`${action.action_type==="cancel"?"Cancellation":"Reschedule"} ${decision}`;
  await db("request_timeline_events",{method:"POST",body:JSON.stringify({service_request_id:action.service_request_id,event_type:`${action.action_type}_${decision}`,title,detail:message||null,actor_type:"admin",metadata:{customer_action_request_id:actionId,approved_refund_amount:refund}})});
  const reference=ref(action.service_request_id); const subject=`${title}: ${reference}`; const statusUrl=`${SITE_URL}/success.html?request_id=${action.service_request_id}&ref=${reference}`;
  const html=`<h1>${title}</h1><p>Hello ${customer?.first_name||"there"},</p><p>Your ${action.action_type} request for <strong>${reference}</strong> was ${decision}.</p>${message?`<p><strong>Message:</strong> ${message}</p>`:""}${refund>0?`<p><strong>Approved refund:</strong> $${refund.toFixed(2)}</p><p>This records the approved amount for processing; your payment provider may require additional processing time.</p>`:""}<p><a href="${statusUrl}">View request status</a></p>`;
  const mail=await send(customer?.email||action.customer_email,subject,html).catch(()=>({id:null,failed:true}));
  await db("request_communications",{method:"POST",body:JSON.stringify({service_request_id:action.service_request_id,direction:"outbound",channel:"email",subject,message:`Customer action ${decision}.`,delivery_status:mail.failed?"failed":(mail.skipped?"skipped":"sent"),provider_message_id:mail.id||null})});
  return json({ok:true,status:decision,approved_refund_amount:refund});
}catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e)},400)}})
