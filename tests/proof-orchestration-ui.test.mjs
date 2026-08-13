import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin RON control panel reuses guarded server-side Proof commands", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /proof-admin-transaction/);
  assert.match(admin, /proof-admin-document/);
  assert.match(admin, /Create Proof Draft/);
  assert.match(admin, /Map Approved Signers/);
  assert.match(admin, /Select APS Documents/);
  assert.match(admin, /Sync Proof Status/);
  assert.match(admin, /Activate Prepared Transaction/);
  assert.match(admin, /confirm\("Activate this prepared Proof transaction/);
  assert.match(admin, /selectedRequest\.service_type === "ron"/);
});

test("approved APS request participants are the sole signer mapping source", async () => {
  const types = await read("supabase/functions/_shared/proof/activation-types.ts");
  const repo = await read("supabase/functions/_shared/proof/activation-repository.ts");
  assert.match(types, /approvedSignerInputs/);
  assert.match(types, /participant_type === "signer"/);
  assert.match(repo, /request_participants\?select=/);
  assert.match(repo, /participants\.length === ron\[0\]\.number_of_signers/);
  assert.match(repo, /participants\.every/);
  assert.match(repo, /participant\.identity_name_confirmed === true/);
});

test("Proof witness requirement is passed only as an explicit selected document flag", async () => {
  const lifecycle = await read("supabase/functions/_shared/proof/document-lifecycle.ts");
  const service = await read("supabase/functions/_shared/proof/service.ts");
  assert.match(lifecycle, /witnessRequired: Boolean\(input\.witnessRequired\)/);
  assert.match(lifecycle, /witness_required: flags\.witnessRequired/);
  assert.match(service, /form\.set\("witness_required", String\(input\.witnessRequired\)\)/);
});

test("customer RON projection excludes provider IDs and all access-link values", async () => {
  const status = await read("supabase/functions/get-request-status/index.ts");
  assert.match(status, /ron_session: ronSession/);
  assert.match(status, /email=eq\.\$\{\s*encodeURIComponent\(customer\?\.email/);
  assert.doesNotMatch(status, /transaction_access_link/);
  assert.doesNotMatch(status, /proof_transaction_id.*ronSession/);
});

test("customer portal shows authoritative session states without a dead join control", async () => {
  const portal = await read("assets/js/script.js");
  assert.match(portal, /Payment Required/);
  assert.match(portal, /Appointment Confirmation Pending/);
  assert.match(portal, /Preparing Your Session/);
  assert.match(portal, /Secure Session Invitation Sent/);
  assert.match(portal, /Session Completed/);
  assert.match(portal, /link && session\?\.state === "ready"/);
});

test("completed Proof assets stage into the existing private APS review and release path", async () => {
  const repo = await read("supabase/functions/_shared/proof/completed-asset-repository.ts");
  const lifecycle = await read("supabase/functions/_shared/proof/completed-asset-lifecycle.ts");
  assert.match(lifecycle, /stage_completed_asset/);
  assert.match(repo, /document_classification: asset\.asset_type === "completed_document"\s*\? "completed_notarized_document"/);
  assert.match(repo, /customer_visible: false/);
  assert.match(repo, /eligible_for_delivery: false/);
  assert.match(repo, /review_state: "pending"/);
});

test("RON customer documents remain filtered by the existing release boundary", async () => {
  const status = await read("supabase/functions/get-request-status/index.ts");
  const portal = await read("assets/js/script.js");
  assert.match(status, /file\.customer_visible === true &&\s*file\.eligible_for_delivery === true/);
  assert.match(portal, /Completed Notarized Documents/);
  assert.match(portal, /completed_notarized_document/);
});

test("Proof credentials remain server-side and migration grants no browser access", async () => {
  const admin = await read("assets/js/admin.js");
  const portal = await read("assets/js/script.js");
  const migration = await read("supabase/migrations/20260813092744_proof_business_orchestration_ui.sql");
  assert.doesNotMatch(admin, /PROOF_API_KEY|PROOF_WEBHOOK_SECRET/);
  assert.doesNotMatch(portal, /PROOF_API_KEY|PROOF_WEBHOOK_SECRET/);
  assert.doesNotMatch(migration, /grant .*authenticated|grant .*anon/i);
});
