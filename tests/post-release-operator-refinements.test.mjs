import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {SYNTHETIC_TEMPLATE_CONTEXT,TEMPLATE_SPECIFICATIONS,renderFullTemplateEmail,renderTemplateValues} from "../supabase/functions/_shared/template-preview.mjs";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("structured signer intake preserves optional middle name and requires first/last",async()=>{
  const [publicUi,adminUi,submit]=await Promise.all([read("assets/js/script.js"),read("assets/js/admin-v3.js"),read("supabase/functions/public-request-submit/index.ts")]);
  for(const source of [publicUi,adminUi,submit]){assert.match(source,/first_name/);assert.match(source,/middle_name/);assert.match(source,/last_name/);}
  assert.match(submit,/first name and last name/i);
  assert.match(adminUi,/Signer information incomplete/);assert.match(adminUi,/first name/);assert.match(adminUi,/last name/);
  assert.match(adminUi,/\["ron","mobile"\]/);assert.match(adminUi,/terminal/);
});

test("operator presentation humanizes address, witness, and scan fields",async()=>{
  const admin=await read("assets/js/admin.js");
  assert.match(admin,/Completed-document scan back/);assert.match(admin,/Document scanning \/ PDF conversion/);
  assert.match(admin,/witness_provider/);assert.match(admin,/value = "N\/A"/);assert.match(admin,/assembledMobileAddress/);assert.match(admin,/multiline-value/);
});

test("new maintained templates render and preserve the conversion wording",()=>{
  for(const key of ["document_needed_for_quote","document_received_under_review","service_changed_appointment_conversion"]){
    const spec=TEMPLATE_SPECIFICATIONS[key];assert.ok(spec,key);assert.ok(spec.fields.length>=4);
    const rendered=renderFullTemplateEmail({template:{template_key:key,name:key,subject_template:"Update {{request_reference}}",html_template:key==="service_changed_appointment_conversion"?"<p>{{previous_service_name}} to {{service_name}}. {{message_body}}</p>":"<p>Document update.</p>"}});
    assert.match(rendered.html,/APS-DEMO1234/);
  }
  assert.equal(renderTemplateValues("{{previous_service_name}} → {{service_name}}",SYNTHETIC_TEMPLATE_CONTEXT),"Remote Online Notary → Mobile Notary");
});

test("customer upload persists inbound communication with attachment associations",async()=>{
  const upload=await read("supabase/functions/customer-upload-document/index.ts"),admin=await read("assets/js/admin.js");
  assert.match(upload,/source_event:\s*"customer_document_upload"/);assert.match(upload,/message_attachments/);assert.match(upload,/attachment_names/);
  assert.match(admin,/Inbound · Customer/);assert.match(admin,/attachment_names/);
});

test("customer activity includes appointment and conversion while hiding internal document enums",async()=>{
  const [status,portal]=await Promise.all([read("supabase/functions/get-request-status/index.ts"),read("assets/js/script.js")]);
  assert.match(status,/appointment_confirmed/);assert.match(status,/service_changed/);assert.match(status,/Your .* appointment has been confirmed/);
  assert.doesNotMatch(portal,/customer_deliverable[^\n]{0,100}(textContent|innerHTML)/);assert.match(portal,/Document from Aligned Print &amp; Scan/);
});

test("payment message binds the triggering payment and current cumulative totals",async()=>{
  const send=await read("supabase/functions/send-message/index.ts");
  assert.match(send,/request_payments/);assert.match(send,/const payment =/);assert.match(send,/payment\?\.invoice_id/);assert.match(send,/paymentAmount/);assert.match(send,/paidAmount/);assert.match(send,/balanceDue/);
});

test("admin document removal is audit-safe and conversion preserves the same request",async()=>{
  const handler=await read("supabase/functions/admin-service-adjustment/index.ts");
  assert.match(handler,/remove_admin_document/);assert.match(handler,/Customer-uploaded source documents cannot be removed/);assert.match(handler,/Proof Completed Documents cannot be removed/);assert.match(handler,/Withdraw Release/);assert.match(handler,/admin_document_removed/);
  assert.match(handler,/preview_service_conversion/);assert.match(handler,/convert_service/);assert.match(handler,/same_request:true/);assert.match(handler,/proof_history_preserved/);assert.match(handler,/create-additional-invoice/);assert.match(handler,/request_service_conversions/);assert.doesNotMatch(handler,/delete.*(invoice|payment|request_files)/i);
});

test("conversion migration is backward-compatible and admin-authorized",async()=>{
  const migration=await read("supabase/migrations/20260816225345_post_release_operator_refinements.sql");
  assert.match(migration,/add column if not exists first_name/);assert.match(migration,/enable row level security/);assert.match(migration,/public\.is_admin\(\)/);assert.match(migration,/previous_appointment jsonb/);assert.match(migration,/proof_transaction_preserved/);
  for(const key of ["document_needed_for_quote","document_received_under_review","service_changed_appointment_conversion"])assert.match(migration,new RegExp(key));
});
