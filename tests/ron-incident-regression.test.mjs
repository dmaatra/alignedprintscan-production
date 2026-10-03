import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateCompletion } from "../supabase/functions/_shared/completion-gate.mjs";

const { derive } = createRequire(import.meta.url)("../assets/js/proof-return-state.js");
const proof = patch => ({ uploaded_by: "proof", document_classification: "completed_notarized_document", is_active: true, review_state: "pending", ...patch });
const input = files => ({ request: { service_type: "ron", document_state: "approved", participant_state: "approved" }, files, facts: { components: ["ron"], ron_session_completed: true, aps_deliverable_required: true }, reviewItems: [], invoices: [] });

test("legitimate pending Proof review blocks even when another artifact is released", () => {
  const result = evaluateCompletion(input([proof({}), proof({ review_state: "approved", customer_visible: true, eligible_for_delivery: true })]));
  assert.equal(result.allowed, false);
  assert.ok(result.blockers.some(b => b.code === "PROOF_DOCUMENT_REVIEW"));
});
test("reviewed released Proof artifact completes alongside hidden manual copy and audit trail", () => {
  const files = [proof({ review_state: "approved", customer_visible: true, eligible_for_delivery: true }), proof({ uploaded_by: "admin", customer_visible: false }), proof({ document_classification: "internal_document", customer_visible: false })];
  assert.equal(evaluateCompletion(input(files)).allowed, true);
  assert.equal(derive({ transaction: { proof_status: "completed" }, files }).key, "released");
});
test("manual uploads cannot masquerade as retrieved Proof documents", () => {
  for (const uploaded_by of ["admin", "customer"]) {
    const state = derive({ transaction: { proof_status: "completed" }, files: [proof({ uploaded_by, review_state: "approved" })] });
    assert.equal(state.key, "completed_waiting");
  }
});
test("inactive Proof copies and internal audit documents create no pending Proof obligation", () => {
  const result = evaluateCompletion({ ...input([proof({ is_active: false }), proof({ document_classification: "internal_document" })]), facts: { components: ["ron"], ron_session_completed: true, external_platform_delivery: true } });
  assert.equal(result.allowed, true);
});
test("the actual pricing-review blocker remains fail-closed until explicitly resolved", () => {
  const result = evaluateCompletion({ ...input([proof({ review_state: "approved", customer_visible: true, eligible_for_delivery: true })]), reviewItems: [{ blocker_key: "pdf_page_count_changed_after_quote", state: "open", target_tab: "quote" }] });
  assert.equal(result.allowed, false);
  assert.equal(result.blockers[0].code, "OPEN_REVIEW_ITEMS");
});
test("dashboard enrichment filters Loan Signing requests before invoking fulfillment", async () => {
  const source = await readFile(new URL("../assets/js/admin.js", import.meta.url), "utf8");
  assert.match(source, /const loanSigningRequests = requests.filter\(\s*\(request\) => request.service_type === "loan_signing"/);
  const load = source.slice(source.indexOf("async function loadRequests()"));
  assert.match(load, /loanSigningRequests.map\(async \(request\)[\s\S]*?command: "snapshot", request_id: request.id/);
  assert.doesNotMatch(evaluateCompletion(input([])).blockers.map(b => b.code).join(","), /LOAN|LSA/);
});
