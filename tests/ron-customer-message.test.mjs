import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCompletion } from "../supabase/functions/_shared/completion-gate.mjs";

test("normal send-message validates before sending and attaches only the selected released Proof return", async () => {
  const originalFetch = globalThis.fetch, originalDeno = globalThis.Deno;
  let handler, providerCalls = 0, insertedMessages = 0, statusUpdates = 0;
  let openReview = true;
  const requestId = "aca9ee54-fb45-4042-8cf4-4b3a6d906d22";
  const returned = { id: "ef51366f-17dc-44ed-af91-e914217b32a6", file_name: "completed.pdf", file_path: "returned.pdf", uploaded_by: "proof", document_classification: "completed_notarized_document", review_state: "approved", is_active: true, customer_visible: true, eligible_for_delivery: true };
  const files = [returned, { ...returned, id: "manual", uploaded_by: "admin", review_state: "pending", customer_visible: false, eligible_for_delivery: false }, { ...returned, id: "audit", document_classification: "internal_document", customer_visible: false, eligible_for_delivery: false }];
  const request = { id: requestId, service_type: "ron", customer_id: "customer", document_state: "approved", participant_state: "approved", status: "appointment_confirmed" };
  const json = (value,status=200) => new Response(JSON.stringify(value),{status});
  globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", RESEND_API_KEY: "fixture" })[name] || "" }, serve: callback => { handler=callback; } };
  globalThis.fetch = async (url,init={}) => {
    const path = String(url);
    if(path.endsWith("/auth/v1/user")) return json({id:"admin"});
    if(path.endsWith("/rpc/is_admin")) return json(true);
    if(path.includes("/functions/v1/update-request-status")) {
      const body=JSON.parse(init.body);
      const validation=evaluateCompletion({request,files,invoices:[],reviewItems:openReview?[{state:"open",blocker_key:"pdf_page_count_changed_after_quote"}]:[],facts:{components:["ron"],ron_session_completed:true,aps_deliverable_required:true}});
      if(body.validate_only) return json({ok:true,validation});
      assert.equal(validation.allowed,true);
      statusUpdates++;
      return json({ok:true,status:"completed"});
    }
    if(path.includes("/storage/v1/object/service-request-files/")) {
      assert.ok(path.endsWith("returned.pdf"));
      return new Response(new Uint8Array([37,80,68,70]));
    }
    if(path === "https://api.resend.com/emails") {
      providerCalls++;
      const email=JSON.parse(init.body);
      assert.equal(email.attachments.length,1);
      assert.equal(email.attachments[0].filename,"completed.pdf");
      return json({id:"provider-message"});
    }
    const table=path.split("/rest/v1/")[1]?.split("?")[0];
    if(init.method) {
      if(table === "messages" && init.method === "POST") { insertedMessages++; return json([{id:"message"}]); }
      return json([]);
    }
    if(table === "service_requests") return json([request]);
    if(table === "message_templates") return json([{id:"template",template_key:"document_delivery",active:true,required_attachment_type:"deliverable",subject_template:"Completed document",html_template:"<p>Your document is ready.</p>",text_template:"Your document is ready."}]);
    if(table === "customers") return json([{first_name:"Fixture",email:"fixture@example.invalid"}]);
    if(table === "request_files") return json(files);
    if(["quotes","invoices","invoice_items","request_payments"].includes(table)) return json([]);
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  try {
    await import("../supabase/functions/send-message/index.ts?ron-incident-test");
    const invoke = auth => handler(new Request("https://fixture.invalid/functions/v1/send-message", {method:"POST",headers:{"Content-Type":"application/json",...(auth ? {Authorization:"Bearer fixture"}: {})},body:JSON.stringify({request_id:requestId,template_id:"00000000-0000-0000-0000-000000000001",status:"completed",request_file_ids:[returned.id]})}));
    const unauthorized=await invoke(false);
    assert.equal(unauthorized.status,400);
    assert.equal(providerCalls,0);
    const blocked=await invoke(true);
    const failure=await blocked.json();
    assert.equal(blocked.status,400);
    assert.equal(failure.message_sent,false);
    assert.match(failure.error,/1 required review item/);
    assert.equal(insertedMessages,0);
    assert.equal(providerCalls,0);
    assert.equal(statusUpdates,0);
    openReview=false;
    const sent=await invoke(true);
    assert.equal(sent.status,200);
    assert.equal((await sent.json()).ok,true);
    assert.equal(providerCalls,1);
    assert.equal(insertedMessages,1);
    assert.equal(statusUpdates,1);
  } finally { globalThis.fetch=originalFetch;globalThis.Deno=originalDeno; }
});
