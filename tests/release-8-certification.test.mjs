import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Release 8 certification migration adds retry safety, acknowledgements, and governed projections",async()=>{
  const sql=await read("supabase/migrations/20260820062251_release_8_loan_signing_exception_certification.sql");
  for(const token of ["idempotency_key","terms_policy_version","terms_acknowledged_at","exception_attention_state","authorized_refund_due","final_service_value","resolution_state","loan_signing_resolution_id","approve_lsa_financials"])assert.match(sql,new RegExp(token));
  assert.match(sql,/loan_signing_open_exception_kind_unique/);
  assert.match(sql,/refund_reviews_loan_signing_resolution_unique/);
});

test("all eighteen maintained Loan Signing message families are specified or safely mapped",async()=>{
  const source=await read("supabase/functions/_shared/template-preview.mjs");
  const lsaKeys=["lsa_request_received","lsa_information_needed","lsa_assignment_confirmed","lsa_signer_confirmation","lsa_package_documents_needed","lsa_replacement_package_received","lsa_signing_not_completed","lsa_signing_follow_up","lsa_additional_appointment_needed","lsa_cancellation_requested","lsa_cancellation_under_review","lsa_cancellation_resolution","lsa_additional_charge_review","lsa_additional_charge_issued","lsa_scanback_return_follow_up","lsa_completed"];
  for(const key of lsaKeys)assert.match(source,new RegExp(`${key}:\\{category:\"Loan Signing\"`));
  for(const mapped of ["appointment_confirmed","refund_processed"])assert.match(source,new RegExp(`${mapped}:\\{category:`));
  assert.equal(lsaKeys.length+2,18);
});

test("portal cancellation and terms acknowledgement are tenant-scoped and capability-gated",async()=>{
  const portal=await read("supabase/functions/business-portal/index.ts"),ui=await read("assets/js/business-auth.js");
  assert.match(portal,/request_lsa_cancellation/);assert.match(portal,/requireCapability\(membership, "mutate_request"\)/);assert.match(portal,/terms_acknowledged/);assert.match(portal,/terms_policy_version/);assert.match(portal,/organization_id/);
  assert.match(ui,/Cancellation Requested/);assert.match(ui,/lsa_terms_acknowledged/);assert.match(ui,/capabilities\.mutate_request/);
  assert.doesNotMatch(ui,/policy_snapshot|decision_reason|suggested_amount/);
});

test("reference catalog contains at least fifteen LSA scripts and nine quick-reference cards",async()=>{
  const {OPERATOR_REFERENCE_SCRIPTS}=await import("../assets/js/operator-reference-catalog.mjs");
  const lsa=OPERATOR_REFERENCE_SCRIPTS.filter(item=>item.key.startsWith("lsa-"));
  const cards=lsa.filter(item=>item.key.startsWith("lsa-card-"));
  assert.ok(lsa.length>=24);assert.equal(cards.length,9);
  for(const item of lsa){assert.ok(item.stop.trim());assert.ok(item.next.trim());}
});

test("exception closeout blocks unresolved finance and requires communication confirmation",async()=>{
  const admin=await read("supabase/functions/admin-loan-signing-fulfillment/index.ts");
  assert.match(admin,/command===\"close_exception\"/);assert.match(admin,/lsa_refund_due,lsa_additional_amount_due/);assert.match(admin,/communication_complete!==true/);assert.match(admin,/communication_state:\"sent\"/);assert.match(admin,/lsa_exception_closed/);
  assert.match(admin,/create-additional-invoice/);assert.match(admin,/refund_reviews/);assert.match(admin,/issue_refunds/);
});

test("public terms preserve exact wait boundaries and non-advice safeguards",async()=>{
  const terms=await read("terms.html"),service=await read("loan-signing.html");
  assert.match(terms,/first 30 minutes/);assert.match(terms,/started 30-minute increment/);assert.match(terms,/delay caused by APS/i);assert.match(terms,/legal, lending, title, escrow, or financial advice/i);
  assert.match(service,/reviewed under the applicable assignment terms/);assert.match(service,/terms\.html#loan-signing-assignments/);
});
