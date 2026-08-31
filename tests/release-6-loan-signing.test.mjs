import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Release 6 migration creates canonical assignment and immutable pricing tables", async () => {
  const sql = await read("supabase/migrations/20260819171136_release_6_loan_signing_core.sql");
  assert.match(sql, /create table public\.loan_signing_assignments/);
  assert.match(sql, /service_request_id uuid not null unique references public\.service_requests/);
  assert.match(sql, /create table public\.loan_signing_pricing_snapshots/);
  assert.match(sql, /pricing_status='accepted'/);
  assert.match(sql, /grant select,insert,update,delete .* to service_role/);
});

test("Release 6 preserves distinct property, signing, and return concepts", async () => {
  const sql = await read("supabase/migrations/20260819171136_release_6_loan_signing_core.sql");
  for (const field of ["property_address_line1", "signing_address_line1", "return_method", "prepaid_label_provided"]) {
    assert.match(sql, new RegExp(field));
  }
});

test("Release 6 supports the eight core signing types and three methods", async () => {
  const sql = await read("supabase/migrations/20260819171136_release_6_loan_signing_core.sql");
  for (const type of ["buyer_purchase", "seller", "refinance", "heloc", "loan_modification", "reverse_mortgage", "commercial", "other_custom"]) assert.match(sql, new RegExp(type));
  for (const method of ["in_person_mobile", "ron", "either_tbd"]) assert.match(sql, new RegExp(method));
});

test("public intake submits structured loan signing data and signer rows", async () => {
  const [page, script, edge] = await Promise.all([
    read("pricing.html"), read("assets/js/script.js"), read("supabase/functions/public-request-submit/index.ts"),
  ]);
  assert.match(page, /data-service="loan_signing"/);
  assert.match(page, /loanSigningSignerFields/);
  assert.match(script, /lsaSignerFirstName/);
  assert.match(script, /property_address_line1/);
  assert.match(edge, /table: "loan_signing_assignments"/);
  assert.match(edge, /lsa_signing_package_source/);
});

test("standard pricing is centralized and marks custom packages for review", async () => {
  const pricing = await read("assets/js/pricing-config.js");
  for (const amount of [125, 150, 175]) assert.match(pricing, new RegExp(`: ${amount}`));
  assert.match(pricing, /commercial: null/);
  assert.match(pricing, /other_custom: null/);
  assert.match(pricing, /standardAssumption/);
  assert.match(pricing, /policyVersion/);
});

test("business intake enforces eligibility, role, credit hold, and organization linkage", async () => {
  const edge = await read("supabase/functions/business-portal/index.ts");
  assert.match(edge, /requireCapability\(membership, "create_request"\)/);
  assert.match(edge, /service_\$\{service\}_enabled/);
  assert.match(edge, /organization\.credit_hold === true/);
  assert.match(edge, /organization_id: organizationId/);
  assert.match(edge, /Each signer requires a legal name and individual email/);
});

test("admin exposes a dedicated Loan Signings module and New Order service", async () => {
  const [html, admin] = await Promise.all([read("admin-dashboard.html"), read("assets/js/admin-v3.js")]);
  assert.match(html, /data-admin-view="loan-signings"/);
  assert.match(admin, /function renderLoanSignings/);
  assert.match(admin, /value="loan_signing"/);
  assert.match(admin, /data-service-fields="loan_signing"/);
});

test("Release 6 completion placeholder is replaced by the Release 7 requirements engine", async () => {
  const gate = await read("supabase/functions/_shared/completion-gate.mjs");
  assert.match(gate, /loanSigningCompletion/);
  assert.doesNotMatch(gate, /LOAN_SIGNING_RELEASE_7_REQUIREMENTS_PENDING/);
});

test("public page gives scope and advice disclaimers without deep fulfillment promises", async () => {
  const page = await read("loan-signing.html");
  assert.match(page, /not legal or financial advice/i);
  assert.match(page, /Remote Online Notarization/);
  assert.match(page, /pricing\.html\?service=loan_signing#request/);
  assert.doesNotMatch(page, /guaranteed funding/i);
});
