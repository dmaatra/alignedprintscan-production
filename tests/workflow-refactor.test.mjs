import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("status selection does not record or create payment", async () => {
  const admin = await read("assets/js/admin.js");
  const statusFunction = admin.slice(admin.indexOf("async function updateRequestStatus"), admin.indexOf("async function saveInvoice"));
  assert.doesNotMatch(statusFunction, /recordAdminPayment\(/);
  assert.match(admin, /recordPrimaryPaymentBtn/);
  assert.match(admin, /recordSupplementalPaymentBtn/);
});

test("manual payment fallback cannot duplicate a paid primary invoice", async () => {
  const source = await read("supabase/functions/record-admin-payment/index.ts");
  assert.match(source, /The primary invoice is already paid/);
  assert.match(source, /existingPrimary/);
});

test("Stripe webhook verifies signatures and deduplicates sessions", async () => {
  const source = await read("supabase/functions/stripe-webhook/index.ts");
  assert.match(source, /STRIPE_WEBHOOK_SECRET/);
  assert.match(source, /verifyStripeSignature/);
  assert.match(source, /external_reference=eq/);
  assert.match(source, /duplicate: true/);
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

test("customer portal prioritizes one action-required card", async () => {
  const html = await read("success.html");
  const script = await read("assets/js/script.js");
  assert.match(html, />View My Request</);
  assert.match(script, /Action Required/);
  assert.match(script, /Review &amp; Approve Quote/);
  assert.match(script, /Payment required/);
  assert.match(script, /Document needed/);
});

test("message composer uses centralized templates and status-after-send", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /Message Composer/);
  assert.match(admin, /messageTemplateSelect/);
  assert.match(admin, /sendAndUpdateStatusBtn/);
  assert.match(admin, /functions\.invoke\("send-message"/);
  assert.match(admin, /message-file-attachment/);
});

test("message delivery validates attachments and releases status only after send", async () => {
  const source = await read("supabase/functions/send-message/index.ts");
  const sendAt = source.indexOf('fetch("https://api.resend.com/emails"');
  const statusAt = source.indexOf('rest(`service_requests?id=eq.${requestId}`');
  assert.ok(sendAt > 0 && statusAt > sendAt);
  assert.match(source, /requires at least one released customer deliverable/);
  assert.match(source, /Only intentionally released customer deliverables/);
  assert.match(source, /Completion is blocked by an outstanding balance/);
  assert.match(source, /providerAttachments/);
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
});

test("intake confirmation reads the centralized branded template", async () => {
  const source = await read("supabase/functions/send-request-email/index.ts");
  assert.match(source, /message_templates\?select=\*&template_key=eq\.request_received/);
  assert.match(source, /template_id: template\.id/);
});
