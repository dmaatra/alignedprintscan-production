import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public intake uses one server-authorized submission boundary", async () => {
  const script = await read("assets/js/script.js");
  const edge = await read("supabase/functions/public-request-submit/index.ts");
  const config = await read("supabase/config.toml");
  assert.match(script, /wizard\.addEventListener\("submit", submitPublicRequestSecurely\)/);
  assert.match(script, /functions\.invoke\("public-request-submit"/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /aps_create_request_with_customer/);
  assert.match(config, /\[functions\.public-request-submit\][\s\S]*verify_jwt = false/);
});

test("intake accepts documents xor a valid upload exception and rolls back failed requests", async () => {
  const edge = await read("supabase/functions/public-request-submit/index.ts");
  assert.match(edge, /!files\.length && !exceptionReason/);
  assert.match(edge, /files\.length && exceptionReason/);
  assert.match(edge, /MAX_FILES = 12/);
  assert.match(edge, /signers\.length > 10/);
  assert.match(edge, /removeStored\(storedPaths\)/);
  assert.match(edge, /service_requests\?id=eq/);
});

test("selected files accumulate and can be removed independently", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /selectedRequestFiles = new Map/);
  assert.match(script, /data-remove-selected-file/);
  assert.match(script, /data-add-selected-file/);
  assert.match(script, /filesForInput\(inputName\)/);
  assert.match(script, /documentUploadException" && el\.checked\) clearSelectedRequestFiles/);
});

test("print intake clears notary-only native signer requirements", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /signerHost\.dataset\.service !== activeService/);
  assert.match(script, /const signerRequired = \["ron", "mobile"\]\.includes\(activeService\)/);
  assert.match(script, /signerHost\.dataset\.service = activeService/);
});

test("customer documents preserve provenance and secure request-scoped access", async () => {
  const intake = await read("supabase/functions/public-request-submit/index.ts");
  const upload = await read("supabase/functions/customer-upload-document/index.ts");
  const status = await read("supabase/functions/get-request-status/index.ts");
  for (const source of [intake, upload]) {
    assert.match(source, /document_classification: "customer_document"/);
    assert.match(source, /customer_visible: true/);
    assert.match(source, /eligible_for_delivery: false/);
  }
  assert.match(status, /const ownUpload/);
  assert.match(status, /storage\/v1\/object\/sign\/service-request-files/);
  assert.match(status, /document_classification !== "internal_document"/);
});

test("admin storage remains RLS protected and release is server validated", async () => {
  const sql = await read("supabase/migrations/20260814043639_intake_document_workflow_recovery.sql");
  const admin = await read("assets/js/admin.js");
  assert.match(sql, /aps_admin_request_files/);
  assert.match(sql, /bucket_id = 'service-request-files' and \(select public\.is_admin\(\)\)/);
  assert.match(sql, /admin_set_document_release/);
  assert.match(sql, /Internal and audit documents cannot be released/);
  assert.match(admin, /rpc\("admin_set_document_release"/);
  assert.match(admin, /Customer already has access/);
});

test("document release correction preserves guards without a nonexistent timestamp", async () => {
  const sql = await read("supabase/migrations/20260814082621_fix_document_release_missing_updated_at.sql");
  assert.match(sql, /auth\.uid\(\) is null or not public\.is_admin\(\)/);
  assert.match(sql, /Document not found for this request/);
  assert.match(sql, /Internal and audit documents cannot be released/);
  assert.match(sql, /Approve the completed notarized document in APS review before releasing it/);
  assert.match(sql, /customer_visible = p_release/);
  assert.match(sql, /eligible_for_delivery = p_release/);
  assert.match(sql, /insert into public\.request_timeline_events/);
  assert.match(sql, /revoke all on function public\.admin_set_document_release/);
  assert.doesNotMatch(sql, /updated_at\s*=/);
});

test("admin RON intake persists structured signers witnesses and acts", async () => {
  const admin = await read("assets/js/admin-v3.js");
  assert.match(admin, /ron_signer_count[^\n]*max="10"/);
  assert.match(admin, /ron_signer_name_/);
  assert.match(admin, /ron_witness_name_/);
  assert.match(admin, /participant_type:"witness"/);
  assert.match(admin, /request_notarial_acts/);
});

test("Proof draft blockers are actionable and completed legacy sessions do not lead on stale fields", async () => {
  const detail = await read("assets/js/admin.js");
  assert.match(detail, /Add and approve at least one signer with an individual email address/);
  assert.match(detail, /proofOpenCustomer/);
  const { buildRonSessionRows } = await import("../assets/js/ron-session-state.mjs");
  const request = { id:"legacy", service_type:"ron", workflow_status:"completed", payment_state:"unpaid", document_state:"pending", customers:{}, ron_requests:[{number_of_signers:1}] };
  const row = buildRonSessionRows({ requests:[request], invoices:[], participants:[], transactions:[], assets:[], files:[] })[0];
  assert.equal(row.attention, false);
  assert.equal(row.sessionStatus.key, "completed");
});
