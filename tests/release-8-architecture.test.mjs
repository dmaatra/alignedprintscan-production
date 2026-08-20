import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Release 8 stores policy, exceptions, visits, charges, and decisions behind service-role RLS", async () => {
  const sql = await read("supabase/migrations/20260820044712_release_8_loan_signing_policies_exceptions.sql");
  for (const table of ["loan_signing_policy_versions","loan_signing_organization_terms","loan_signing_exceptions","loan_signing_visits","loan_signing_additional_charges","loan_signing_financial_resolutions"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all[\s\S]*from public,anon,authenticated/);
  assert.match(sql, /automatic_financial_action"\s*:\s*false/);
  assert.match(sql, /before_preparation_percent"\s*:\s*0/);
  assert.match(sql, /after_preparation_before_travel_percent"\s*:\s*50/);
  assert.match(sql, /after_travel_or_arrival_percent"\s*:\s*100/);
});

test("admin and portal workflows separate exception facts, financial authorization, and communication", async () => {
  const [admin, portal, ui] = await Promise.all([
    read("supabase/functions/admin-loan-signing-fulfillment/index.ts"),
    read("supabase/functions/business-portal/index.ts"),
    read("assets/js/admin.js"),
  ]);
  assert.match(admin, /save_exception/); assert.match(admin, /resolve_financial/); assert.match(admin, /save_charge/); assert.match(admin, /save_visit/); assert.match(admin, /close_exception/);
  assert.match(admin, /organization_contract/); assert.match(admin, /assignment_specific_agreement/); assert.match(admin, /manual_authorized_exception/);
  assert.doesNotMatch(admin, /from\("invoices"\)|from\("refunds"\)|send-message/);
  assert.match(portal, /request_lsa_cancellation/); assert.match(portal, /customer_safe_status/); assert.match(portal, /customer_safe_explanation/);
  assert.match(ui, /Exception &amp; Financial Review/); assert.match(ui, /Complete Communication &amp; Close/); assert.match(admin, /no financial action was automatic/);
});

test("Release 8 adds Loan Signing terms, templates, search, scripts, and checklist references", async () => {
  const [terms, service, templates, catalog, admin] = await Promise.all([
    read("terms.html"), read("loan-signing.html"), read("supabase/functions/_shared/template-preview.mjs"),
    read("assets/js/operator-reference-catalog.mjs"), read("assets/js/admin-v3.js"),
  ]);
  assert.match(terms, /id="loan-signing-assignments"/); assert.match(terms, /first 30 minutes/); assert.match(terms, /\$25/);
  assert.match(service, /terms\.html#loan-signing-assignments/);
  for (const key of ["lsa_request_received","lsa_information_needed","lsa_assignment_confirmed","lsa_signer_confirmation","lsa_cancellation_under_review","lsa_signing_not_completed","lsa_additional_appointment_needed","lsa_exception_resolved"]) assert.match(templates, new RegExp(key));
  for (const key of ["lsa-cancellation-review","lsa-no-sign","lsa-resign","lsa-wait-review","lsa-exception-checklist"]) assert.match(catalog, new RegExp(key));
  assert.match(admin, /templateSearch/); assert.match(admin, /templateCategory/); assert.match(admin, /templateService/);
});
