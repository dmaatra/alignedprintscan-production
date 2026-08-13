import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCompletion } from "../supabase/functions/_shared/completion-gate.mjs";

const paid = [{ status: "paid", amount_due: 50, amount_paid: 50, balance_due: 0 }];
const released = [{ is_active: true, customer_visible: true, eligible_for_delivery: true, document_classification: "customer_deliverable" }];
const base = (overrides = {}) => ({ request: { service_type: "ron", document_state: "approved", participant_state: "approved" }, invoices: paid, reviewItems: [], files: [], facts: { components: ["ron"], ron_session_completed: true, external_platform_delivery: true }, detail: {}, ...overrides });
const codes = (result) => result.blockers.map((item) => item.code);

test("RON requires completed session and cleared reviews", () => {
  assert.ok(codes(evaluateCompletion(base({ facts: { components: ["ron"], external_platform_delivery: true } }))).includes("RON_SESSION"));
  assert.ok(codes(evaluateCompletion(base({ reviewItems: [{ state: "open", target_tab: "documents" }] }))).includes("OPEN_REVIEW_ITEMS"));
  assert.equal(evaluateCompletion(base()).allowed, true);
});

test("RON requires a known delivery path but only requires a file when APS owes it", () => {
  assert.ok(codes(evaluateCompletion(base({ facts: { components: ["ron"], ron_session_completed: true } }))).includes("RON_DELIVERY_PATH"));
  assert.ok(codes(evaluateCompletion(base({ facts: { components: ["ron"], ron_session_completed: true, aps_deliverable_required: true } }))).includes("CUSTOMER_DELIVERABLE"));
  assert.equal(evaluateCompletion(base({ files: released, facts: { components: ["ron"], ron_session_completed: true, aps_deliverable_required: true } })).allowed, true);
});

test("physical-only Mobile can complete while Mobile plus Scan requires release", () => {
  const mobile = base({ request: { service_type: "mobile", document_state: "approved", participant_state: "approved" }, facts: { components: ["mobile"], mobile_service_completed: true, physical_only: true } });
  assert.equal(evaluateCompletion(mobile).allowed, true);
  const hybrid = { ...mobile, facts: { ...mobile.facts, components: ["mobile", "scan"], scan_completed: true } };
  assert.ok(codes(evaluateCompletion(hybrid)).includes("SCAN_DELIVERABLE"));
  assert.equal(evaluateCompletion({ ...hybrid, files: released }).allowed, true);
});

test("Print pickup is physical, digital delivery is conditional, and Scan always requires release", () => {
  const print = base({ request: { service_type: "print", document_state: "approved", participant_state: "approved" }, detail: { fulfillment_type: "pickup", black_white_pages: 2 }, facts: { components: ["print_copy"], production_completed: true, pickup_completed: true, physical_only: true } });
  assert.equal(evaluateCompletion(print).allowed, true);
  assert.ok(codes(evaluateCompletion({ ...print, facts: { ...print.facts, aps_deliverable_required: true, physical_only: false } })).includes("CUSTOMER_DELIVERABLE"));
  const scan = { ...print, detail: { scan_pages: 2 }, facts: { components: ["scan"], scan_completed: true } };
  assert.ok(codes(evaluateCompletion(scan)).includes("SCAN_DELIVERABLE"));
});

test("Courier requires pickup, delivery, and proof only when configured", () => {
  const courier = base({ request: { service_type: "print", document_state: "approved", participant_state: "approved" }, facts: { components: ["courier"], pickup_required: true, pickup_completed: false, delivery_completed: false, physical_only: true } });
  assert.deepEqual(codes(evaluateCompletion(courier)).filter((code) => code.startsWith("COURIER")), ["COURIER_PICKUP", "COURIER_DELIVERY"]);
  assert.equal(evaluateCompletion({ ...courier, facts: { ...courier.facts, pickup_completed: true, delivery_completed: true } }).allowed, true);
  assert.ok(codes(evaluateCompletion({ ...courier, facts: { ...courier.facts, pickup_completed: true, delivery_completed: true, proof_of_delivery_required: true } })).includes("PROOF_OF_DELIVERY"));
});

test("zero balance alone is insufficient and every hybrid component is enforced", () => {
  const result = evaluateCompletion(base({ request: { service_type: "mobile", document_state: "approved", participant_state: "approved" }, facts: { components: ["mobile", "scan"] } }));
  assert.ok(codes(result).includes("MOBILE_SERVICE"));
  assert.ok(codes(result).includes("SCAN"));
  assert.ok(codes(result).includes("SCAN_DELIVERABLE"));
});

test("stored intake detail cannot be masked by omitting a hybrid component", () => {
  const result = evaluateCompletion(base({ request: { service_type: "mobile", document_state: "approved", participant_state: "approved" }, detail: { scan_to_pdf_needed: true }, facts: { components: ["mobile"], mobile_service_completed: true, physical_only: true } }));
  assert.ok(result.components.includes("scan"));
  assert.ok(codes(result).includes("SCAN_DELIVERABLE"));
});

test("primary or supplemental outstanding balance blocks normal completion", () => {
  const result = evaluateCompletion(base({ invoices: [...paid, { status: "final_balance_due", amount_due: 59, amount_paid: 0 }] }));
  assert.ok(codes(result).includes("OUTSTANDING_BALANCE"));
  assert.equal(result.outstanding_balance, 59);
});

test("legacy missing fields never crash or silently auto-complete", () => {
  const result = evaluateCompletion({ request: { service_type: "print" }, invoices: [], reviewItems: [], files: [], facts: {}, detail: {} });
  assert.equal(result.allowed, false);
  assert.ok(codes(result).includes("SERVICE_COMPONENTS_UNKNOWN"));
});
