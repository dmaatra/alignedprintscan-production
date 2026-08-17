import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("supplemental invoice reports notification outcome without rolling back financial success",async()=>{
  const [source,admin]=await Promise.all([read("supabase/functions/create-additional-invoice/index.ts"),read("assets/js/admin.js")]);
  assert.match(source,/async function notifyFinalInvoice/);
  assert.match(source,/retryable: true/);
  assert.match(source,/invoice:\$\{invoice\.id\}:final_balance_due/);
  assert.ok(source.lastIndexOf("notifyFinalInvoice(requestId, invoice, note)")>source.indexOf('await logTimeline'));
  assert.match(source,/notification_only/);
  assert.match(source,/Only an unpaid active supplemental or final invoice notification can be retried/);
  assert.match(admin,/paymentInvoiceBalance\(invoice\) > 0\.009/);
  assert.match(admin,/Retry Invoice Notification/);
  assert.match(admin,/notification_only: true/);
  assert.match(admin,/The invoice remains unchanged/);
});

test("participant editing is server-authorized, audited, readiness-aware, and terminal-locked",async()=>{
  const [config,edge,admin]=await Promise.all([read("supabase/config.toml"),read("supabase/functions/admin-update-participant/index.ts"),read("assets/js/admin.js")]);
  assert.match(config,/\[functions\.admin-update-participant\][\s\S]*verify_jwt = true/);
  assert.match(edge,/rpc\/is_admin/);
  assert.match(edge,/participant_updated/);
  assert.match(edge,/participant_information_incomplete/);
  assert.match(edge,/terminal\.has/);
  assert.match(edge,/resolved_at/);
  assert.match(admin,/Edit Participant/);
  assert.match(admin,/functions\.invoke\("admin-update-participant"/);
});

test("additional participant review never infers a signer and Add Participant updates the canonical roster",async()=>{
  const [edge,admin,migration]=await Promise.all([read("supabase/functions/admin-update-participant/index.ts"),read("assets/js/admin.js"),read("supabase/migrations/20260817034552_additional_participant_information_workflow.sql")]);
  assert.match(admin,/Add Participant/);
  assert.match(admin,/Flag Additional Participant Review/);
  assert.match(admin,/Do not infer a signer from document text/);
  assert.match(edge,/command==="flag_additional_review"/);
  assert.match(edge,/automatic_inference:false/);
  assert.match(edge,/legal_conclusion:false/);
  assert.match(edge,/command==="add"/);
  assert.match(edge,/number_of_signers:signerCount/);
  assert.match(edge,/participant_added/);
  assert.match(edge,/original_submission_preserved:true/);
  assert.match(migration,/Additional Participant Information Needed/);
  assert.match(migration,/APS is not determining who is legally required to sign/);
});

test("participant information template is centralized, manual, neutral, and status-free",async()=>{
  const sql=await read("supabase/migrations/20260817033729_participant_edit_and_information_template.sql");
  assert.match(sql,/participant_information_needed/);
  assert.match(sql,/Do not send identity documents or sensitive identity-verification information by email/);
  assert.match(sql,/associated_status=null/);
  assert.match(sql,/active=true/);
});

test("Admin New Order captures canonical Mobile participants, acts, address, documents, and provenance",async()=>{
  const [admin,intake]=await Promise.all([read("assets/js/admin-v3.js"),read("supabase/functions/public-request-submit/index.ts")]);
  for(const token of ["adminMobileSignerFields","mobile_signer_first_","mobile_signer_middle_","mobile_signer_last_","mobile_act_type_","mobile_witness_name_","mobile_print_addon","mobile_scan_addon","document_upload_exception_reason"])assert.match(admin,new RegExp(token));
  assert.match(admin,/participants=Array\.from\(\{length:signerCount\}/);
  assert.match(admin,/notarialActs=Array\.from\(\{length:actCount\}/);
  assert.match(admin,/appointment_location:service==="mobile"\?mobileAddress/);
  assert.match(admin,/reviewItem\("Signers", signerReview\)/);
  assert.match(admin,/reviewItem\("Requested acts", actReview\)/);
  assert.match(admin,/print_add_on:wizardChecked\(form,"mobile_print_addon"\)/);
  assert.match(intake,/service === "ron" \|\| service === "mobile"/);
  assert.match(intake,/adminRequest[\s\S]*\? "supporting_document"[\s\S]*: "customer_document"/);
});

test("Print & Scan remains free of notarial participant requirements",async()=>{
  const [admin,intake]=await Promise.all([read("assets/js/admin-v3.js"),read("supabase/functions/public-request-submit/index.ts")]);
  assert.match(admin,/participant_state:service==="print"\?"not_applicable"/);
  assert.match(intake,/if \(service === "ron" \|\| service === "mobile"\)/);
});

test("Admin New Order disables every inactive service control after dynamic fields render",async()=>{
  const admin=await read("assets/js/admin-v3.js");
  assert.match(admin,/setWizardRonStructuredFields\(form\);\s*setWizardMobileAddonFields\(form\);\s*setWizardService\(form\);/);
  assert.match(admin,/form\.addEventListener\("input", \(\) => \{ setWizardRonStructuredFields\(form\); setWizardMobileAddonFields\(form\); setWizardService\(form\);/);
  assert.match(admin,/form\.addEventListener\("change",[\s\S]*setWizardRonStructuredFields\(form\); setWizardMobileAddonFields\(form\); setWizardService\(form\);/);
  assert.match(admin,/control\.disabled = !active/);
});
