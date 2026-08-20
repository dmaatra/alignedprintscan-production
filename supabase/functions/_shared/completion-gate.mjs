const done = new Set(["completed", "complete", "fulfilled", "released", "delivered"]);
const blocked = new Set(["pending", "blocked", "review_required", "re_review_required", "needs_review"]);
const truthy = (value) => value === true || done.has(String(value || "").toLowerCase());

function componentSet(input) {
  const explicit = Array.isArray(input.facts?.components) ? input.facts.components.filter(Boolean) : [];
  const components = new Set(explicit.map((value) => String(value).toLowerCase()));
  const type = String(input.request?.service_type || "").toLowerCase();
  if (type === "ron") components.add("ron");
  if (type === "mobile") components.add("mobile");
  if (type === "print") {
    const detail = input.detail || {};
    if (Number(detail.black_white_pages || 0) + Number(detail.color_pages || 0) > 0) components.add("print_copy");
    if (Number(detail.scan_pages || 0) > 0) components.add("scan");
    if (String(detail.fulfillment_type || "").toLowerCase() === "courier") components.add("courier");
  }
  if (type === "mobile" && input.detail?.scan_to_pdf_needed) components.add("scan");
  if (type === "loan_signing") components.add("loan_signing");
  return components;
}

export function evaluateCompletion(input) {
  const blockers = [];
  const add = (code, message, target_tab) => {
    if (!blockers.some((item) => item.code === code)) blockers.push({ code, message, target_tab });
  };
  const invoices = Array.isArray(input.invoices) ? input.invoices : [];
  const outstanding = invoices.reduce((sum, invoice) => {
    if (["void", "cancelled"].includes(String(invoice.status || "").toLowerCase())) return sum;
    const due = Number(invoice.amount_due || 0);
    const paid = Number(invoice.amount_paid || invoice.paid_amount || 0);
    return sum + Math.max(0, Number(invoice.balance_due ?? (due - paid)));
  }, 0);
  const prepaidOutstanding = invoices.reduce((sum, invoice) => {
    if (["void", "cancelled"].includes(String(invoice.status || "").toLowerCase())) return sum;
    const term = String(invoice.payment_terms || "prepaid").toLowerCase();
    if (term !== "prepaid") return sum;
    const due = Number(invoice.amount_due || 0), paid = Number(invoice.amount_paid || invoice.paid_amount || 0);
    return sum + Math.max(0, Number(invoice.balance_due ?? (due - paid)));
  }, 0);
  if (prepaidOutstanding > 0.009) add("OUTSTANDING_BALANCE", `Outstanding prepaid balance: $${prepaidOutstanding.toFixed(2)}`, "payments");
  const openReviews = (input.reviewItems || []).filter((item) => String(item.state || "open") === "open");
  if (openReviews.length) add("OPEN_REVIEW_ITEMS", `${openReviews.length} required review item(s) remain unresolved`, openReviews[0]?.target_tab || "overview");
  if (blocked.has(String(input.request?.document_state || "").toLowerCase())) add("DOCUMENT_REVIEW", "Document review or re-review is not complete", "documents");
  if (blocked.has(String(input.request?.participant_state || "").toLowerCase())) add("PARTICIPANT_REVIEW", "Participant or witness preparation is not complete", "customer");
  const facts = input.facts || {};
  const components = componentSet(input);
  if (!components.size) add("SERVICE_COMPONENTS_UNKNOWN", "Confirm the purchased service components", "fulfillment");
  const released = (input.files || []).some((file) => file.is_active !== false && file.customer_visible === true && file.eligible_for_delivery === true && file.document_classification !== "internal_document");
  const deliveryPathKnown = facts.aps_deliverable_required === true || facts.external_platform_delivery === true || facts.physical_only === true || facts.customer_declined_optional_deliverable === true;
  if (components.has("ron")) {
    const proofComplete = ["completed", "released"].includes(String(input.proofTransaction?.proof_status || "").toLowerCase());
    if (!truthy(facts.ron_session_completed) && !proofComplete) add("RON_SESSION", "RON session not completed", "fulfillment");
    if (!deliveryPathKnown) add("RON_DELIVERY_PATH", "Confirm how final RON documents are delivered", "documents");
  }
  if (components.has("mobile") && !truthy(facts.mobile_service_completed)) add("MOBILE_SERVICE", "Mobile appointment/service not completed", "fulfillment");
  if (components.has("print_copy")) {
    if (!truthy(facts.production_completed)) add("PRODUCTION", "Print/Copy production not completed", "fulfillment");
    const method = String(input.detail?.fulfillment_type || "").toLowerCase();
    if (["pickup", "customer-pickup"].includes(method) && !truthy(facts.pickup_completed)) add("PICKUP", "Customer pickup/handoff not confirmed", "fulfillment");
    if (["courier", "delivery", "mobile-service", "mobile-notary"].includes(method) && !truthy(facts.delivery_completed)) add("DELIVERY", "Delivery/handoff not confirmed", "fulfillment");
  }
  if (components.has("scan")) {
    if (!truthy(facts.scan_completed)) add("SCAN", "Scanning not completed", "fulfillment");
    if (!released) add("SCAN_DELIVERABLE", "Customer scan deliverable not released", "documents");
  }
  if (components.has("courier")) {
    if (facts.pickup_required !== false && !truthy(facts.pickup_completed)) add("COURIER_PICKUP", "Courier pickup not confirmed", "fulfillment");
    if (!truthy(facts.delivery_completed)) add("COURIER_DELIVERY", "Courier delivery/handoff not confirmed", "fulfillment");
    if (facts.proof_of_delivery_required === true && !truthy(facts.proof_of_delivery_present)) add("PROOF_OF_DELIVERY", "Required proof of delivery is missing", "documents");
  }
  if (components.has("loan_signing")) {
    const lsa = loanSigningCompletion({
      assignment: input.detail || {},
      requirements: input.loanSigningRequirements || [],
      packages: input.loanSigningPackages || [],
      stipulations: input.loanSigningStipulations || [],
      scanbacks: input.loanSigningScanbacks || [],
      returns: input.loanSigningReturns || [],
      payment_terms: input.detail?.payment_terms || "prepaid",
      prepaid_balance: prepaidOutstanding,
    });
    lsa.blockers.forEach((item) => add(item.code, item.message, "fulfillment"));
  }
  if (facts.aps_deliverable_required === true && !released) add("CUSTOMER_DELIVERABLE", "Required customer deliverable not released", "documents");
  return { allowed: blockers.length === 0, blockers, outstanding_balance: outstanding, components: [...components] };
}
import { loanSigningCompletion } from "./loan-signing-fulfillment.mjs";
