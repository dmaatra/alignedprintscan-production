import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Payment Received opens the manual recorder while other statuses remain message-driven", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /btn\.dataset\.status === "payment_received"[\s\S]*openManualPaymentDialog\("initial"\)/);
  assert.match(admin, /btn\.dataset\.status === "final_payment_received"[\s\S]*openManualPaymentDialog\("final"\)/);
  assert.match(admin, /recordPrimaryPaymentBtn/);
  assert.match(admin, /recordSupplementalPaymentBtn/);
});

test("manual payment modal targets one existing invoice and enforces its balance", async () => {
  const admin = await read("assets/js/admin.js");
  const modal = admin.slice(admin.indexOf("async function openManualPaymentDialog"), admin.indexOf("async function requireAdminSession"));
  assert.match(modal, /invoice_id: target\.id/);
  assert.match(modal, /max="\$\{outstanding\.toFixed\(2\)\}"/);
  assert.match(modal, /Amount cannot exceed the outstanding balance/);
  assert.doesNotMatch(modal, /createAdditionalInvoice|createMissingInitialInvoice/);
  assert.match(modal, /Payment already recorded/);
  assert.match(modal, /method\.toLowerCase\(\) === "test"/);
  assert.match(modal, /cancel-manual-payment/);
  assert.match(modal, /dialog\.close\("cancel"\)/);
  assert.match(modal, /dialog-close" type="button"/);
});

test("manual payment fallback cannot duplicate a paid primary invoice", async () => {
  const source = await read("supabase/functions/record-admin-payment/index.ts");
  assert.match(source, /Payment recording never creates an invoice/);
  assert.doesNotMatch(source, /createMissingInitialInvoice|Initial invoice materialized/);
  assert.match(source, /requestedAmount > invoiceBalance/);
  assert.match(source, /external_reference: body\.reference/);
});

test("manual payment attempts carry a unique external reference for retry deduplication", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /paymentAttemptReference = `manual:/);
  assert.match(admin, /crypto\.randomUUID\(\)/);
  assert.match(admin, /reference: reference \|\| paymentAttemptReference/);
});

test("Stripe webhook verifies signatures and deduplicates sessions", async () => {
  const source = await read("supabase/functions/stripe-webhook/index.ts");
  assert.match(source, /STRIPE_WEBHOOK_SECRET/);
  assert.match(source, /verifyStripeSignature/);
  assert.match(source, /external_reference=eq/);
  assert.match(source, /duplicate: true/);
  assert.match(source, /const newPaid = currentPaid \+ amount/);
  assert.match(source, /paidInFull \? invoiceStatus : "partially_paid"/);
  assert.match(source, /paymentResponse\.status === 409/);
});

test("admin service-role mutations require administrator authorization", async () => {
  const config = await read("supabase/config.toml");
  const status = await read("supabase/functions/update-request-status/index.ts");
  const supplemental = await read("supabase/functions/create-additional-invoice/index.ts");
  const invoiceEmail = await read("supabase/functions/send-invoice-email/index.ts");
  assert.match(config, /\[functions\.update-request-status\][\s\S]*?verify_jwt = true/);
  assert.match(config, /\[functions\.create-additional-invoice\][\s\S]*?verify_jwt = true/);
  assert.match(config, /\[functions\.send-invoice-email\][\s\S]*?verify_jwt = true/);
  for (const source of [status, supplemental, invoiceEmail]) {
    assert.match(source, /requireAdmin/);
    assert.match(source, /rpc\/is_admin/);
  }
});

test("quote approval is stale-safe and preserves partial payments", async () => {
  const source = await read("supabase/functions/client-quote-action/index.ts");
  const portal = await read("assets/js/script.js");
  assert.match(source, /This quote is no longer current/);
  assert.match(source, /hasRecordedPayment/);
  assert.match(source, /alreadyApproved/);
  assert.match(source, /insertResponse\.status === 409/);
  assert.match(portal, /quote_id: quoteId/);
});

test("quote save is financially side-effect free", async () => {
  const admin = await read("assets/js/admin.js");
  const saveQuote = admin.slice(admin.indexOf("async function saveInvoice"), admin.indexOf("async function sendInvoiceEmail"));
  assert.doesNotMatch(saveQuote, /\.from\("invoices"\)/);
  assert.doesNotMatch(saveQuote, /send-order-email/);
  assert.match(saveQuote, /Quote saved by admin\. No customer email sent/);
});

test("intake captures service-aware signer and upload exception data", async () => {
  const html = await read("pricing.html");
  const script = await read("assets/js/script.js");
  assert.match(html, /signerFields/);
  assert.match(html, /documentUploadExceptionReason/);
  assert.match(html, /mobileFiles/);
  assert.match(script, /activeService === "ron" \? " \*"/);
  assert.match(script, /request_notarial_acts/);
  assert.match(script, /witness_source: "aps"/);
});

test("workspace and global navigation follow the locked boundary", async () => {
  const html = await read("admin-dashboard.html");
  for (const tab of ["overview", "customer", "documents", "quote", "payments", "messages", "fulfillment", "timeline"]) {
    assert.match(html, new RegExp(`data-workspace-tab="${tab}"`));
  }
  assert.doesNotMatch(html, /data-admin-view="documents"/);
  assert.match(html, /data-admin-view="review"/);
  assert.match(html, /data-admin-view="messages"/);
});

test("migration adds durable financial uniqueness and protected communications", async () => {
  const sql = await read("supabase/migrations/20260813020000_aps_workflow_refactor.sql");
  assert.match(sql, /invoices_one_primary_per_source_quote/);
  assert.match(sql, /request_payments_external_reference_unique/);
  assert.match(sql, /message_templates/);
  assert.match(sql, /'aps_admin_only_'\|\|t/);
  assert.match(sql, /invalidate_changed_document_review/);
  assert.match(sql, /drop policy if exists "public read invoices"/);
  assert.match(sql, /drop policy if exists "Allow public reads from service request files"/);
});

test("status-message workflow sends before changing status", async () => {
  const source = await read("supabase/functions/update-request-status/index.ts");
  const sendAt = source.indexOf("const emailResponse = await fetch");
  const updateAt = source.indexOf("const updateResponse = await supabaseFetch");
  assert.ok(sendAt > 0 && updateAt > sendAt);
  assert.match(source, /status was not changed/);
  assert.match(source, /status_changed_without_message/);
});

test("status-without-message control uses the canonical transition and cannot fabricate payments", async () => {
  const admin = await read("assets/js/admin.js");
  const handler = admin.slice(admin.indexOf('$$\(".status-actions button[data-status]"'), admin.indexOf('$("#messageTemplateSelect"'));
  assert.match(handler, /payment_received.*openManualPaymentDialog\("initial"\)/s);
  assert.match(handler, /final_payment_received.*openManualPaymentDialog\("final"\)/s);
  assert.match(handler, /updateStatusWithoutSending.*updateRequestStatus\(btn\.dataset\.status\)/s);
  assert.ok(handler.indexOf('openManualPaymentDialog("final")') < handler.indexOf("updateStatusWithoutSending"));
  const transition = admin.slice(admin.indexOf("async function updateRequestStatus"), admin.indexOf("function populateInvoicePresetSelect"));
  assert.match(transition, /const sendMessage = !\$\("#updateStatusWithoutSending"\)\?\.checked/);
  assert.ok(transition.indexOf("const sendMessage") < transition.indexOf("await saveAppointmentDetails"));
  assert.match(transition, /send_message: sendMessage/);
});

test("customer portal prioritizes one action-required card", async () => {
  const html = await read("success.html");
  const script = await read("assets/js/script.js");
  assert.match(html, />View My Request</);
  assert.match(script, /Action Required/);
  assert.match(script, /Review & Approve Quote/);
  assert.match(script, /Payment required/);
  assert.match(script, /Document needed/);
});

test("completed portal treats only APS-released documents as a customer deliverable action", async () => {
  const script = await read("assets/js/script.js");
  assert.match(script, /const apsDocuments = documents\.filter/);
  assert.match(script, /customerPrimaryAction\(\{ request, invoices, documents: apsDocuments, messages, hasQuote, sessionId \}\)/);
  assert.doesNotMatch(script, /customerPrimaryAction\(\{ request, invoices, documents, messages, hasQuote, sessionId \}\)/);
});

test("message composer uses centralized templates and status-after-send", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /Message Composer/);
  assert.match(admin, /messageTemplateSelect/);
  assert.match(admin, /sendAndUpdateStatusBtn/);
  assert.match(admin, /functions\.invoke\("send-message"/);
  assert.match(admin, /message-file-attachment/);
});

test("Communication Log merges canonical messages with non-duplicated legacy communication rows", async () => {
  const admin = await read("assets/js/admin.js");
  const start = admin.indexOf("function mergeCommunicationRecords");
  const end = admin.indexOf("\n\nasync function getPatch32Records", start);
  const context = {};
  vm.runInNewContext(`${admin.slice(start, end)}; this.mergeCommunicationRecords = mergeCommunicationRecords;`, context);
  const rows = context.mergeCommunicationRecords(
    [{ id: "message-1", subject: "Payment received", delivery_state: "sent", sent_at: "2026-08-14T07:42:25Z" }],
    [
      { id: "legacy-duplicate", subject: "Duplicate bridge", delivery_status: "sent", created_at: "2026-08-14T07:42:26Z", metadata: { unified_message_id: "message-1" } },
      { id: "legacy-only", subject: "Quote approved", delivery_status: "sent", created_at: "2026-08-14T06:53:15Z" },
    ],
  );
  assert.deepEqual(Array.from(rows, (row) => row.subject), ["Payment received", "Quote approved"]);
  assert.equal(rows[0].delivery_status, "sent");
  assert.match(admin, /adminClient\.from\("messages"\)/);
  assert.match(admin, /adminClient\.from\("request_communications"\)/);
});

test("message delivery validates attachments and releases status only after send", async () => {
  const source = await read("supabase/functions/send-message/index.ts");
  const sendAt = source.indexOf('fetch("https://api.resend.com/emails"');
  const statusAt = source.indexOf('rest(`service_requests?id=eq.${requestId}`');
  assert.ok(sendAt > 0 && statusAt > sendAt);
  assert.match(source, /requires at least one released customer deliverable/);
  assert.match(source, /Only intentionally released customer deliverables/);
  assert.match(source, /validate_only: true/);
  assert.match(source, /Completion requirements are not satisfied/);
  assert.match(source, /providerAttachments/);
  assert.match(source, /providerAccepted/);
  assert.match(source, /Message was sent, but the status update failed/);
  assert.match(source, /message_sent: providerAccepted/);
});

test("admin upload never releases a document implicitly", async () => {
  const admin = await read("assets/js/admin.js");
  const upload = admin.slice(admin.indexOf("async function uploadAdminDocuments"), admin.indexOf("async function selectRequest"));
  assert.match(upload, /customer_visible: false/);
  assert.match(upload, /eligible_for_delivery: false/);
  assert.doesNotMatch(upload, /const customerVisible/);
});

test("customer portal exposes all six deep-linkable sections", async () => {
  const script = await read("assets/js/script.js");
  for (const tab of ["overview", "documents", "quote-payment", "fulfillment", "messages", "activity"]) {
    assert.match(script, new RegExp(`data-portal-panel=\\"${tab}\\"`));
  }
  assert.match(script, /params\.get\("tab"\)/);
  assert.match(script, /customer_documents/);
  assert.match(script, /customer_activity/);
});

test("public status reader excludes unreleased and internal documents", async () => {
  const source = await read("supabase/functions/get-request-status/index.ts");
  assert.match(source, /file\.customer_visible === true/);
  assert.match(source, /file\.eligible_for_delivery === true/);
  assert.match(source, /file\.document_classification !== "internal_document"/);
  assert.match(source, /delivery_state=eq\.sent/);
  const response = source.slice(source.indexOf("return json({\n      ok: true"));
  assert.doesNotMatch(response, /\n\s*files,/);
  assert.doesNotMatch(response, /\n\s*timeline_events:/);
  assert.doesNotMatch(response, /\n\s*communications,/);
  assert.match(response, /visibility === "customer"/);
  assert.match(source, /const publicRequest = pick/);
  assert.match(source, /const publicInvoices = invoices\.map/);
  assert.match(source, /const publicServiceDetail = serviceDetail\s*\? pick/);
  assert.doesNotMatch(response, /service_detail: serviceDetail/);
});

test("supplemental invoices preserve earlier balances and support invoice three plus", async () => {
  const source = await read("supabase/functions/create-additional-invoice/index.ts");
  const checkout = await read("supabase/functions/create-embedded-checkout/index.ts");
  assert.match(source, /requestBalance = activeInvoices\.reduce/);
  assert.match(source, /paidAmount <= 0/);
  assert.match(source, /invoice_type/);
  assert.match(checkout, /supplemental/);
  assert.match(checkout, /-0\*\[2-9\]/);
});

test("intake confirmation reads the centralized branded template", async () => {
  const source = await read("supabase/functions/send-request-email/index.ts");
  assert.match(source, /message_templates\?select=\*&template_key=eq\.request_received/);
  assert.match(source, /templateId: template\.id/);
});

test("completion exceptions are admin-only, reasoned, and separately audited", async () => {
  const source = await read("supabase/functions/update-request-status/index.ts");
  const migration = await read("supabase/migrations/20260813030000_service_aware_completion_gate.sql");
  assert.match(source, /const admin = await requireAdmin/);
  assert.match(source, /Complete with Exception requires an explanation/);
  assert.match(source, /order_completed_with_exception/);
  assert.match(source, /Order Completed with Exception/);
  assert.match(source, /overridden_blockers/);
  assert.match(migration, /request_completion_exceptions/);
  assert.match(migration, /created_by uuid not null/);
  assert.match(migration, /aps_admin_completion_exceptions/);
});

test("completion UI shows blocker targets and requires an intentional exception", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /Authoritative Fulfillment Facts/);
  assert.match(admin, /Completion is blocked/);
  assert.match(admin, /completion-blocker-link/);
  assert.match(admin, /Complete with Exception/);
  assert.match(admin, /complete_with_exception: true/);
});

test("customer completion copy is service-specific and hides gate internals", async () => {
  const portal = await read("assets/js/script.js");
  assert.match(portal, /Your Notarization Is Complete/);
  assert.match(portal, /Your Completed Scans Are Ready/);
  assert.match(portal, /Your Document Order Is Complete/);
  assert.match(portal, /printing, scanning, and courier delivery are complete/);
  assert.match(portal, /Your Delivery Is Complete/);
  const copy = portal.slice(portal.indexOf("function customerCompletionCopy"), portal.indexOf("function invoiceTotal"));
  assert.doesNotMatch(copy, /completion RPC|service-aware gate|override reason|unresolved review item/i);
});

test("customer portal initializes a completed existing request", async () => {
  const portal = await read("assets/js/script.js");
  const start = portal.indexOf("function customerPrimaryAction");
  const end = portal.indexOf("\n}\ninitSuccessPage();", start) + 2;
  assert.ok(start >= 0 && end > start, "initSuccessPage source is available");

  const successBox = { innerHTML: "" };
  const request = {
    id: "existing-request-id",
    status: "completed",
    service_type: "ron",
  };
  const serviceDetail = { ron_session_completed: true };
  const context = {
    URLSearchParams,
    encodeURIComponent,
    window: { location: { search: "?request_id=existing-request-id&tab=overview" } },
    location: { search: "?request_id=existing-request-id&tab=overview", reload() {} },
    localStorage: { getItem() { return null; } },
    history: { replaceState() {} },
    qs(selector) {
      if (selector === "#successDetails") return successBox;
      if (["#successEyebrow", "#successHeadline", "#successLead"].includes(selector)) return { textContent: "" };
      return null;
    },
    qsa() { return []; },
    async getPublicStatus() {
      return {
        request,
        service_detail: serviceDetail,
        reference_number: "APS-EXISTING",
        items: [],
        invoices: [],
        additional_invoice_items: [],
        customer_actions: [],
        customer_documents: [],
        messages: [],
        customer_activity: [],
      };
    },
    renderSuccessFallback() { throw new Error("existing request should not use fallback"); },
    refFromPublicId() { return "APS-EXISTING"; },
    customerCompletionCopy(_request, detail) {
      assert.equal(detail, serviceDetail);
      return { eyebrow: "Complete", headline: "Your Notarization Is Complete", title: "Notarization Complete", body: "Complete" };
    },
    statusCopy() { throw new Error("completed request should use completion copy"); },
    serviceLabel() { return "Remote Online Notary"; },
    formatDateValue() { return "Pending"; },
    formatTimeWindow() { return "Pending"; },
    money(value) { return `$${Number(value).toFixed(2)}`; },
    escapePublic(value) { return String(value ?? ""); },
    statusTimeline() { return ""; },
    customerCard() { return ""; },
    printControls() { return ""; },
    customerActionPanel() { return ""; },
    invoiceList() { return ""; },
    paymentSchedulePanel() { return ""; },
    receiptPanel() { return ""; },
    appointmentDetailsPanel() { return ""; },
    ronNextStepPanel() { return ""; },
    bindCustomerActionControls() {},
    findInitialInvoice() { return null; },
    startEmbeddedPayment() {},
    startStatusPolling() {},
    initReveals() {},
  };
  context.window.window = context.window;
  vm.runInNewContext(`${portal.slice(start, end)}\nglobalThis.runInitSuccessPage = initSuccessPage;`, context);

  await context.runInitSuccessPage();

  assert.match(successBox.innerHTML, /Notarization Complete/);
  assert.match(successBox.innerHTML, /data-portal-panel="documents"/);
});
