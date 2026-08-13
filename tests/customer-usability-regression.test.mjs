import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APS_BRAND,
  customerPortalUrl,
  recipientGreeting,
  renderCustomerEmailShell,
} from "../supabase/functions/_shared/customer-email.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical customer email shell keeps brand, support, and request content isolated", () => {
  const first = renderCustomerEmailShell({ title: "Quote ready", body: "APS-FIRST-ONLY", preheader: "First" });
  const second = renderCustomerEmailShell({ title: "Payment received", body: "APS-SECOND-ONLY", preheader: "Second" });
  for (const html of [first, second]) {
    assert.match(html, /Aligned Print & Scan/);
    assert.match(html, /Aligned Print & Scan LLC/);
    assert.match(html, /hello@alignedprintscan\.com/);
    assert.match(html, /Customer Support/);
  }
  assert.match(first, /APS-FIRST-ONLY/);
  assert.doesNotMatch(first, /APS-SECOND-ONLY/);
  assert.match(second, /APS-SECOND-ONLY/);
  assert.doesNotMatch(second, /APS-FIRST-ONLY/);
  assert.equal(APS_BRAND.companyName, "Aligned Print & Scan");
});

test("customer greetings fail closed to a neutral salutation", () => {
  assert.equal(recipientGreeting({}), "Hello,");
  assert.equal(recipientGreeting({ first_name: "  Maya " }), "Hello Maya,");
  assert.equal(recipientGreeting({ display_name: "Jordan Lee" }), "Hello Jordan,");
});

test("customer email actions use request-scoped portal deep links", () => {
  const first = customerPortalUrl("https://alignedprintscan.com/", "request-one", "documents");
  const second = customerPortalUrl("https://alignedprintscan.com", "request-two", "quote-payment");
  assert.equal(first, "https://alignedprintscan.com/success.html?request_id=request-one&tab=documents");
  assert.equal(second, "https://alignedprintscan.com/success.html?request_id=request-two&tab=quote-payment");
  assert.doesNotMatch(first, /request-two/);
});

test("all direct customer notification paths use the canonical shell", async () => {
  const paths = [
    "supabase/functions/send-request-email/index.ts",
    "supabase/functions/send-order-email/index.ts",
    "supabase/functions/send-message/index.ts",
    "supabase/functions/customer-request-action/index.ts",
    "supabase/functions/admin-resolve-customer-action/index.ts",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /_shared\/(customer-email|template-preview)\.mjs/);
    assert.match(source, /renderCustomerEmailShell|renderFullTemplateEmail/);
  }
});

test("the centralized customer template inventory remains complete", async () => {
  const migration = await read("supabase/migrations/20260813020000_aps_workflow_refactor.sql");
  const expected = [
    "request_received", "quote_ready", "awaiting_payment_reminder", "payment_received",
    "appointment_confirmed", "appointment_reminder", "appointment_rescheduled", "ron_session_ready",
    "mobile_appointment_confirmation", "completed_scan_delivery", "document_delivery", "final_invoice",
    "order_completed", "cancellation", "general_customer_message",
  ];
  for (const key of expected) assert.match(migration, new RegExp(`\\('${key}'`));
  assert.equal(expected.length, 15);
});

test("portal computes exactly one primary action from explicit customer-visible state", async () => {
  const source = await read("assets/js/script.js");
  const action = source.slice(source.indexOf("function customerPrimaryAction"), source.indexOf("async function initSuccessPage"));
  assert.match(action, /quote.*Review & Approve Quote/s);
  assert.match(action, /balanceDue > 0.*Make Payment/s);
  assert.match(action, /document_state === "customer_action_required"/);
  assert.doesNotMatch(action, /under_review[^\n]*!fileCount|!fileCount[^\n]*under_review/);
  assert.match(source, /data-portal-action=/);
  assert.match(source, /activatePortalTab/);
  assert.match(source, /portal-summary-grid/);
});

test("admin global search returns typed authorized request, customer, and invoice results", async () => {
  const [html, admin, enhancements] = await Promise.all([
    read("admin-dashboard.html"),
    read("assets/js/admin.js"),
    read("assets/js/admin-v3.js"),
  ]);
  assert.match(html, /id="globalAdminSearchResults"/);
  for (const field of ["data-reference", "data-customer-name", "data-customer-email", "data-customer-phone", "data-invoice-numbers"]) {
    assert.match(admin, new RegExp(field));
  }
  for (const type of ["Request", "Customer", "Invoice"]) assert.match(enhancements, new RegExp(`type: "${type}"`));
  assert.match(enhancements, /normalizedSearch/);
  assert.match(enhancements, /activateTab\(result\.dataset\.searchTab/);
});
