import { serviceRows } from "../_shared/release2-auth.ts";
const secret=Deno.env.get("RESEND_WEBHOOK_SECRET")||"",apiKey=Deno.env.get("RESEND_API_KEY")||"";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const b64=(value:string)=>{const normalized=value.replace(/^v1,/,'').replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')),c=>c.charCodeAt(0));};
async function verify(raw:string,req:Request){
  const id=req.headers.get("svix-id")||"",timestamp=req.headers.get("svix-timestamp")||"",signatures=(req.headers.get("svix-signature")||"").match(/v1,[^ ,]+/g)||[];
  if(!secret||!id||!timestamp||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  const key=b64(secret.replace(/^whsec_/,'')),cryptoKey=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["verify"]),payload=new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
  for(const signature of signatures){try{if(await crypto.subtle.verify("HMAC",cryptoKey,b64(signature),payload))return true;}catch{}}
  return false;
}
Deno.serve(async req=>{
  if(req.method!=="POST")return json({ok:false},405);
  const raw=await req.text();if(!await verify(raw,req))return json({ok:false,error:"Invalid webhook signature."},401);
  try{
    const event=JSON.parse(raw);if(event.type!=="email.received")return json({ok:true,ignored:true});
    const eventId=req.headers.get("svix-id")||"",to=Array.isArray(event.data?.to)?event.data.to:[],match=to.map((v:unknown)=>String(v)).join(" ").match(/reply\+([a-f0-9]{64})@/i);
    if(!match)return json({ok:true,ignored:true});
    const tokenHash=await hash(match[1]),routes=await serviceRows(`message_reply_routes?select=conversation_id&token_hash=eq.${tokenHash}&limit=1`);
    if(!routes[0])return json({ok:true,ignored:true});
    const conversations=await serviceRows(`message_conversations?select=*&id=eq.${routes[0].conversation_id}&status=eq.open&limit=1`),conversation=conversations[0];
    if(!conversation)return json({ok:true,ignored:true});
    const duplicate=await serviceRows(`messages?select=id&provider_event_id=eq.${encodeURIComponent(eventId)}&limit=1`);if(duplicate.length)return json({ok:true,duplicate:true});
    const received=await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`,{headers:{Authorization:`Bearer ${apiKey}`}}),content=await received.json();if(!received.ok)throw new Error("Inbound content retrieval failed.");
    const now=new Date().toISOString(),sender=String(event.data.from||"").slice(0,500),renderedText=String(content.text||"").slice(0,50000),renderedHtml=String(content.html||"").slice(0,100000);
    await serviceRows("messages",{method:"POST",body:JSON.stringify({service_request_id:conversation.service_request_id,conversation_id:conversation.id,direction:"inbound",visibility:"customer",sender,recipient:to.join(", "),subject:String(event.data.subject||conversation.subject).slice(0,300),rendered_html:renderedHtml||null,rendered_text:renderedText||null,delivery_state:"received",provider_event_id:eventId,provider_email_id:event.data.email_id,provider_message_identifier:event.data.message_id,received_at:now,source_type:"inbound_reply",source_event:"email.received",metadata:{attachments:Array.isArray(event.data.attachments)?event.data.attachments.map((a:any)=>({filename:a.filename,content_type:a.content_type})):[]}})});
    await serviceRows(`message_conversations?id=eq.${conversation.id}`,{method:"PATCH",body:JSON.stringify({unread_count:Number(conversation.unread_count||0)+1,last_message_at:now,updated_at:now})});
    return json({ok:true});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},400);}
});
