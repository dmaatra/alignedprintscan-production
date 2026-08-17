import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deliverCustomerCommunication } from "../supabase/functions/_shared/communication-history.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function historyHarness({ existing = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method || "GET",
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (url.includes("request_timeline_events?")) return response([]);
    if (url.endsWith("/request_timeline_events")) {
      return response([{ id: "timeline-1" }], 201);
    }
    if (url.includes("/messages?select=*&idempotency_key")) {
      return response(existing ? [existing] : []);
    }
    if (url.endsWith("/messages") && init.method === "POST") {
      return response([{ id: "message-1", delivery_state: "sending" }], 201);
    }
    if (url.includes("/messages?id=eq.")) {
      const id = url.split("/messages?id=eq.")[1];
      return response([{ id, delivery_state: init.body ? JSON.parse(init.body).delivery_state : "sending" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { calls, fetchImpl };
}

const options = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-key",
  requestId: "request-a",
  templateId: "template-a",
  templateKey: "request_received",
  recipient: "jordan@example.com",
  subject: "Request received: APS-A",
  renderedHtml: "<html>APS-A</html>",
  renderedText: "APS-A",
  sourceType: "automatic",
  sourceEvent: "request_created",
  idempotencyKey: "request:request-a:received",
};

test("successful automatic delivery stores rendered evidence, provider ID, and one timeline event", async () => {
  const harness = historyHarness();
  const result = await deliverCustomerCommunication({
    ...options,
    fetchImpl: harness.fetchImpl,
  }, async () => ({ id: "provider-1" }));
  assert.equal(result.duplicate, false);
  const insert = harness.calls.find((call) =>
    call.url.endsWith("/messages") && call.method === "POST"
  );
  assert.equal(insert.body.source_type, "automatic");
  assert.equal(insert.body.rendered_html, "<html>APS-A</html>");
  const update = harness.calls.find((call) =>
    call.url.includes("messages?id=eq.message-1")
  );
  assert.equal(update.body.delivery_state, "sent");
  assert.equal(update.body.provider_message_id, "provider-1");
  assert.equal(
    harness.calls.filter((call) => call.url.endsWith("request_timeline_events"))
      .length,
    1,
  );
});

test("failed automatic delivery remains durable and records a safe failure timeline event", async () => {
  const harness = historyHarness();
  await assert.rejects(() =>
    deliverCustomerCommunication(
      { ...options, fetchImpl: harness.fetchImpl },
      async () => {
        throw new Error("provider rejected bearer secret-token");
      },
    )
  );
  const update = harness.calls.find((call) =>
    call.url.includes("messages?id=eq.message-1")
  );
  assert.equal(update.body.delivery_state, "failed");
  assert.match(update.body.error_message, /\[redacted\]/);
  assert.doesNotMatch(update.body.error_message, /secret-token/);
  assert.equal(
    harness.calls.filter((call) => call.url.endsWith("request_timeline_events"))
      .length,
    1,
  );
});

test("idempotent retry reuses history and never calls the provider again", async () => {
  const existing = {
    id: "message-existing",
    delivery_state: "sent",
    provider_message_id: "provider-existing",
  };
  const harness = historyHarness({ existing });
  let sends = 0;
  const result = await deliverCustomerCommunication({
    ...options,
    fetchImpl: harness.fetchImpl,
  }, async () => {
    sends += 1;
    return { id: "should-not-send" };
  });
  assert.equal(result.duplicate, true);
  assert.equal(sends, 0);
  assert.equal(
    harness.calls.filter((call) =>
      call.url.endsWith("/messages") && call.method === "POST"
    ).length,
    0,
  );
});

test("failed idempotent delivery is retried in place and becomes sent", async () => {
  const existing = { id: "message-failed", delivery_state: "failed", error_message: "temporary" };
  const harness = historyHarness({ existing });
  let sends = 0;
  const result = await deliverCustomerCommunication({ ...options, fetchImpl: harness.fetchImpl }, async () => {
    sends += 1;
    return { id: "provider-retry" };
  });
  assert.equal(result.duplicate, false);
  assert.equal(sends, 1);
  const retry = harness.calls.find(call => call.url.includes("messages?id=eq.message-failed") && call.body?.delivery_state === "sending");
  assert.ok(retry);
  assert.equal(harness.calls.filter(call => call.url.endsWith("/messages") && call.method === "POST").length, 0);
});

test("idempotent insert conflict re-reads history and never duplicates delivery", async () => {
  const existing = {
    id: "message-existing",
    delivery_state: "sent",
    provider_message_id: "provider-existing",
  };
  let lookups = 0;
  let sends = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url.includes("/messages?select=*&idempotency_key")) {
      lookups += 1;
      return response(lookups === 1 ? [] : [existing]);
    }
    if (url.endsWith("/messages") && init.method === "POST") {
      return response({ message: "duplicate key" }, 409);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const result = await deliverCustomerCommunication(
    { ...options, fetchImpl },
    async () => {
      sends += 1;
      return { id: "should-not-send" };
    },
  );
  assert.equal(result.duplicate, true);
  assert.equal(sends, 0);
  assert.equal(lookups, 2);
});

test("request acknowledgment preserves customer success independently of admin alert", async () => {
  const source = await read("supabase/functions/send-request-email/index.ts");
  const customerAt = source.indexOf("deliverCustomerCommunication");
  const adminAt = source.indexOf("try { adminSend = await sendEmail");
  assert.ok(customerAt > 0 && adminAt > customerAt);
  assert.match(source, /admin_alert_sent: !adminAlertError/);
  assert.match(
    source,
    /Customer acknowledgment sent; administrator alert failed/,
  );
});

test("workflow, payment, invoice, action, and admin paths use unified history", async () => {
  const paths = [
    "supabase/functions/send-order-email/index.ts",
    "supabase/functions/send-request-email/index.ts",
    "supabase/functions/customer-request-action/index.ts",
    "supabase/functions/admin-resolve-customer-action/index.ts",
  ];
  for (const path of paths) {
    assert.match(await read(path), /deliverCustomerCommunication/);
  }
  assert.match(
    await read("supabase/functions/stripe-webhook/index.ts"),
    /stripe:\$\{session\.id\}:payment_confirmation/,
  );
  assert.match(
    await read("supabase/functions/create-additional-invoice/index.ts"),
    /invoice:\$\{invoice\.id\}:final_balance_due/,
  );
  assert.match(
    await read("supabase/functions/send-message/index.ts"),
    /source_type: "admin"/,
  );
});

test("portal response continues to exclude internal message metadata and unreleased files", async () => {
  const source = await read("supabase/functions/get-request-status/index.ts");
  assert.match(source, /file\.customer_visible === true/);
  assert.match(source, /file\.eligible_for_delivery === true/);
  const responseBlock = source.slice(
    source.indexOf("return json({\n      ok: true"),
  );
  assert.doesNotMatch(
    responseBlock,
    /provider_message_id|error_message|source_type|idempotency_key/,
  );
});

test("all fifteen synthetic previews use the canonical shell and request-scoped CTA", async () => {
  const generator = await read("scripts/generate-email-previews.mjs");
  assert.match(generator, /renderCustomerEmailShell/);
  assert.match(generator, /customerPortalUrl/);
  assert.match(generator, /const specs = \[/);
  const keys = [...generator.matchAll(/^\s*\["([a-z_]+)"/gm)].map((match) =>
    match[1]
  );
  assert.equal(keys.length, 15);
  assert.equal(new Set(keys).size, 15);
});

test("requested, appointment, payment, and completion dates remain distinct in previews", async () => {
  const generator = await read("scripts/generate-email-previews.mjs");
  for (
    const field of [
      "requestedDate",
      "appointmentDate",
      "paymentDate",
      "completionDate",
    ]
  ) assert.match(generator, new RegExp(field));
  assert.match(generator, /Remaining Balance/);
  assert.doesNotMatch(generator, /paid in full/i);
});

test("completion messaging uses the effective transition date before status persistence", async () => {
  const admin = await read("assets/js/admin.js");
  const sender = await read("supabase/functions/send-message/index.ts");
  assert.match(
    admin,
    /status === "completed" && !selectedRequest\?\.completed_at/,
  );
  assert.match(
    admin,
    /completionDate = customerPreviewDate\(new Date\(\)\.toISOString\(\), "Completion pending"\)/,
  );
  assert.match(
    sender,
    /effectiveCompletionAt = targetStatus === "completed" &&\s*!serviceRequest\.completed_at/,
  );
  assert.match(
    sender,
    /completion_date: customerDate\(effectiveCompletionAt\)/,
  );
  assert.ok(
    sender.indexOf("const effectiveCompletionAt") <
      sender.indexOf('await fetch("https://api.resend.com/emails"'),
  );
  assert.ok(
    sender.indexOf('await fetch("https://api.resend.com/emails"') <
      sender.lastIndexOf(
        'status: "completed",\n              send_message: false',
      ),
  );
});

test("appointment messages persist canonical appointment readiness state", async () => {
  const sender = await read("supabase/functions/send-message/index.ts");
  assert.match(sender, /targetStatus === "appointment_confirmed"/);
  assert.match(
    sender,
    /statusUpdate\.appointment_confirmed_at = new Date\(\)\.toISOString\(\)/,
  );
  assert.match(sender, /statusUpdate\.appointment_state = "scheduled"/);
  assert.match(sender, /targetStatus === "appointment_needs_rescheduling"/);
  assert.match(
    sender,
    /statusUpdate\.appointment_state = "rescheduling_requested"/,
  );
});
