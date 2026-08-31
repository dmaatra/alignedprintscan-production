import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public intake uses one server-authorized submission boundary", async () => {
  const script = await read("assets/js/script.js");
  const edge = await read("supabase/functions/public-request-submit/index.ts");
  const config = await read("supabase/config.toml");
  assert.match(
    script,
    /wizard\.addEventListener\("submit", submitPublicRequestSecurely\)/,
  );
  assert.match(script, /functions\.invoke\("public-request-submit"/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /aps_create_request_with_customer/);
  assert.match(
    config,
    /\[functions\.public-request-submit\][\s\S]*verify_jwt = false/,
  );
});

test("intake accepts documents xor a valid upload exception and rolls back failed requests", async () => {
  const edge = await read("supabase/functions/public-request-submit/index.ts");
  const rollback = await read(
    "supabase/migrations/20260831132500_atomic_failed_intake_rollback.sql",
  );
  assert.match(edge, /!files\.length && !exceptionReason/);
  assert.match(edge, /files\.length && exceptionReason/);
  assert.match(edge, /MAX_FILES = 12/);
  assert.match(edge, /signers\.length > 10/);
  assert.match(edge, /removeStored\(storedPaths\)/);
  assert.match(edge, /rpc\/aps_rollback_failed_intake/);
  assert.match(edge, /rollbackError/);
  assert.doesNotMatch(edge, /service_requests\?id=eq\.\$\{encodeURIComponent\(requestId\)\}[\s\S]{0,80}method: "DELETE"/);
  assert.match(rollback, /created_at < now\(\) - interval '30 minutes'/);
  assert.match(rollback, /business_financial_events/);
  assert.match(rollback, /proof_transactions/);
  assert.match(rollback, /request_completion_facts/);
  assert.match(rollback, /delete from public\.customer_link_audits/);
  assert.match(rollback, /delete from public\.service_requests/);
  assert.match(rollback, /grant execute[\s\S]*to service_role/);
});

test("selected files accumulate and can be removed independently", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /selectedRequestFiles = new Map/);
  assert.match(script, /data-remove-selected-file/);
  assert.match(script, /data-add-selected-file/);
  assert.match(script, /filesForInput\(inputName\)/);
  assert.match(
    script,
    /documentUploadException" && el\.checked && hasSelectedRequestFiles\(\)/,
  );
  assert.match(script, /Your selected document is still attached/);
});

test("print intake clears notary-only native signer requirements", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /signerHost\.dataset\.service !== activeService/);
  assert.match(
    script,
    /const signerRequired = \["ron", "mobile"\]\.includes\(activeService\)/,
  );
  assert.match(script, /signerHost\.dataset\.service = activeService/);
});

test("public intake native validation includes only active wizard controls", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /function controlIsActive\(control\)/);
  assert.match(script, /node\.getAttribute\?\.\("aria-hidden"\) === "true"/);
  assert.match(script, /node\.style\?\.display === "none"/);
  assert.match(script, /node\.classList\?\.contains\("wizard-step"\)/);
  assert.match(
    script,
    /control\.dataset\.activeRequired = String\(control\.required\)/,
  );
  assert.match(
    script,
    /control\.required =[\s\S]*active && control\.dataset\.activeRequired === "true"/,
  );
  assert.match(
    script,
    /control\.disabled =[\s\S]*!active \|\| control\.dataset\.activeDisabled === "true"/,
  );
  assert.match(
    script,
    /renderWitnessIdentityFields\(\);\s*syncActiveValidationControls\(\);/,
  );
  assert.match(
    script,
    /qs\("#nextStep"\)\.style\.display[\s\S]*syncActiveValidationControls\(\);/,
  );
});

test("dynamic signer witness and file controls remain wired after rerendering", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /wizard\.addEventListener\("input", \(event\) =>/);
  assert.match(script, /wizard\.addEventListener\("change", \(event\) =>/);
  assert.match(
    script,
    /if \(el\.type === "file"\) accumulateRequestFiles\(el\)/,
  );
  assert.match(
    script,
    /documentUploadException" && el\.checked && hasSelectedRequestFiles\(\)/,
  );
});

test("customer documents preserve provenance and secure request-scoped access", async () => {
  const intake = await read(
    "supabase/functions/public-request-submit/index.ts",
  );
  const upload = await read(
    "supabase/functions/customer-upload-document/index.ts",
  );
  const status = await read("supabase/functions/get-request-status/index.ts");
  for (const source of [intake, upload]) {
    assert.match(
      source,
      source === intake
        ? /document_classification:[\s\S]*adminRequest[\s\S]*\? "supporting_document"[\s\S]*: "customer_document"/
        : /document_classification: "customer_document"/,
    );
    assert.match(
      source,
      source === intake
        ? /customer_visible: !adminRequest/
        : /customer_visible: true/,
    );
    assert.match(source, /eligible_for_delivery: false/);
  }
  assert.match(status, /const ownUpload/);
  assert.match(status, /storage\/v1\/object\/sign\/service-request-files/);
  assert.match(status, /document_classification !== "internal_document"/);
});

test("admin storage remains RLS protected and release is server validated", async () => {
  const sql = await read(
    "supabase/migrations/20260814043639_intake_document_workflow_recovery.sql",
  );
  const admin = await read("assets/js/admin.js");
  assert.match(sql, /aps_admin_request_files/);
  assert.match(
    sql,
    /bucket_id = 'service-request-files' and \(select public\.is_admin\(\)\)/,
  );
  assert.match(sql, /admin_set_document_release/);
  assert.match(sql, /Internal and audit documents cannot be released/);
  assert.match(admin, /rpc\("admin_set_document_release"/);
  assert.match(admin, /Customer already has access/);
});

test("document release correction preserves guards without a nonexistent timestamp", async () => {
  const sql = await read(
    "supabase/migrations/20260814082621_fix_document_release_missing_updated_at.sql",
  );
  assert.match(sql, /auth\.uid\(\) is null or not public\.is_admin\(\)/);
  assert.match(sql, /Document not found for this request/);
  assert.match(sql, /Internal and audit documents cannot be released/);
  assert.match(
    sql,
    /Approve the completed notarized document in APS review before releasing it/,
  );
  assert.match(sql, /customer_visible = p_release/);
  assert.match(sql, /eligible_for_delivery = p_release/);
  assert.match(sql, /insert into public\.request_timeline_events/);
  assert.match(
    sql,
    /revoke all on function public\.admin_set_document_release/,
  );
  assert.doesNotMatch(sql, /updated_at\s*=/);
});

test("admin RON intake persists structured signers witnesses and acts", async () => {
  const admin = await read("assets/js/admin-v3.js");
  const intake = await read(
    "supabase/functions/public-request-submit/index.ts",
  );
  assert.match(admin, /ron_signer_count[^\n]*max="10"/);
  assert.match(admin, /ron_signer_first_/);
  assert.match(admin, /ron_signer_middle_/);
  assert.match(admin, /ron_signer_last_/);
  assert.match(admin, /ron_witness_name_/);
  assert.match(admin, /participant_type:"witness"/);
  assert.match(intake, /request_notarial_acts/);
  assert.match(admin, /functions\.invoke\("public-request-submit"/);
  assert.match(admin, /admin_request:true/);
  assert.doesNotMatch(admin, /from\("ron_requests"\)\.insert/);
  assert.match(intake, /if \(adminRequest\) await requireProofAdmin\(req\)/);
  assert.match(
    intake,
    /requestPayload\.request_source = adminRequest \? "admin" : "website"/,
  );
  assert.match(
    intake,
    /if \(adminRequest\)[\s\S]*service_requests\?id=eq\.[\s\S]*request_source: "admin"/,
  );
  assert.match(intake, /uploaded_by: adminRequest \? "admin" : "customer"/);
  assert.match(
    intake,
    /document_classification:[\s\S]*adminRequest[\s\S]*\? "supporting_document"[\s\S]*: "customer_document"/,
  );
});

test("Proof draft blockers are actionable and completed legacy sessions do not lead on stale fields", async () => {
  const detail = await read("assets/js/admin.js");
  assert.match(
    detail,
    /Add and approve at least one signer with an individual email address/,
  );
  assert.match(detail, /proofOpenCustomer/);
  const { buildRonSessionRows } = await import(
    "../assets/js/ron-session-state.mjs"
  );
  const request = {
    id: "legacy",
    service_type: "ron",
    workflow_status: "completed",
    payment_state: "unpaid",
    document_state: "pending",
    customers: {},
    ron_requests: [{ number_of_signers: 1 }],
  };
  const row = buildRonSessionRows({
    requests: [request],
    invoices: [],
    participants: [],
    transactions: [],
    assets: [],
    files: [],
  })[0];
  assert.equal(row.attention, false);
  assert.equal(row.sessionStatus.key, "completed");
});
