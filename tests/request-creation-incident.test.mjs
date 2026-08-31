import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public and Admin request creation share normalized participant persistence", async () => {
  const [edge, admin] = await Promise.all([
    read("supabase/functions/public-request-submit/index.ts"),
    read("assets/js/admin-v3.js"),
  ]);
  assert.match(edge, /normalizedIntakeParticipants\(input\.participants, requestId\)/);
  assert.doesNotMatch(edge, /\.\.\.allowed\(person,/);
  assert.match(admin, /admin_request:true/);
  assert.match(admin, /functions\.invoke\("public-request-submit"/);
});

test("failed intake rollback removes only customers created for the failed request", async () => {
  const sql = await read(
    "supabase/migrations/20260831144051_repair_failed_intake_customer_rollback.sql",
  );
  assert.match(sql, /v_customer_link_type in \('new_customer', 'ambiguous_review'\)/);
  assert.match(sql, /not exists \([\s\S]*service_requests where customer_id = v_request\.customer_id/);
  assert.match(sql, /created_at >= v_request\.created_at - interval '1 minute'/);
  assert.match(sql, /'customer_deleted', v_customer_delete_count = 1/);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]*to service_role/);
});

test("reserved invalid-domain certification identities suppress all email delivery", async () => {
  const source = await read("supabase/functions/send-request-email/index.ts");
  assert.match(source, /isReservedSyntheticRecipient\(customer\.email\)/);
  assert.match(source, /suppression_reason: "reserved_synthetic_recipient"/);
  assert.match(source, /admin_alert_sent: false/);
});

test("customer-safe response remains generic while logs identify the failed persistence stage", async () => {
  const edge = await read("supabase/functions/public-request-submit/index.ts");
  assert.match(edge, /failureStage = "participant_persistence"/);
  assert.match(edge, /stage: failureStage/);
  assert.match(edge, /We could not submit your request\. Please try again or contact Aligned Print & Scan\./);
  assert.doesNotMatch(edge, /admin_detail:[\s\S]{0,120}stage/);
});

test("public submission remains double-click guarded and restores failure state", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /setSubmitState\(true, "Securely submitting your request…"\)/);
  assert.match(script, /btn\.disabled = isSubmitting/);
  assert.match(script, /btn\.textContent = isSubmitting \? "Submitting…" : "Submit Request"/);
  assert.match(script, /setSubmitState\(false, "We could not submit your request/);
});
