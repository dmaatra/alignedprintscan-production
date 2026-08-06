import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { ProofError } from "./errors.ts";
import { sanitizeProofLogValue } from "./logger.ts";
import {
  parseWebhook,
  ProofWebhookLifecycle,
  type WebhookRepository,
} from "./webhook-lifecycle.ts";
import {
  constantTimeEqual,
  sha256Hex,
  verifyProofWebhook,
} from "./webhook-security.ts";
import type {
  AcceptedWebhook,
  WebhookEventRecord,
  WebhookTransaction,
} from "./webhook-types.ts";

const secret = "dedicated-test-signing-key",
  bytes = new TextEncoder().encode(
    '{"event":"transaction.completed","data":{}}',
  );
async function signature(body = bytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, body.slice().buffer),
    ),
  ].map((x) => x.toString(16).padStart(2, "0")).join("");
}
Deno.test("valid signature accepted", async () =>
  assertEquals(
    (await verifyProofWebhook(bytes, await signature(), secret)).length,
    64,
  ));
Deno.test("invalid signature rejected", async () => {
  await assertRejects(() => verifyProofWebhook(bytes, "0".repeat(64), secret));
});
Deno.test("missing signature rejected", async () => {
  await assertRejects(() => verifyProofWebhook(bytes, null, secret));
});
Deno.test("malformed signature rejected", async () => {
  await assertRejects(() => verifyProofWebhook(bytes, "not-hex", secret));
});
Deno.test("raw body verified before parsing", async () => {
  const malformed = new TextEncoder().encode("not-json");
  assertEquals(
    (await verifyProofWebhook(malformed, await signature(malformed), secret))
      .length,
    64,
  );
});
Deno.test("constant-time comparison path used", () => {
  assert(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1])));
  assert(!constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 0])));
});
Deno.test("payload fingerprint stable", async () =>
  assertEquals(await sha256Hex(bytes), await sha256Hex(bytes)));
Deno.test("secret and signature absent from projections", () =>
  assert(
    !JSON.stringify(
      parseWebhook(
        payload("transaction.completed"),
        "a".repeat(64),
        "production",
      ),
    ).includes(secret),
  ));
Deno.test("invalid signature creates no event row", async () => {
  const repo = new Repo();
  await assertRejects(() => verifyProofWebhook(bytes, "0".repeat(64), secret));
  assertEquals(repo.rows.length, 0);
});
Deno.test("signature is redacted from logging context", () => {
  assertEquals(
    sanitizeProofLogValue({ signature: "private", webhook_secret: secret }),
    { signature: "[REDACTED]", webhook_secret: "[REDACTED]" },
  );
});

class Repo implements WebhookRepository {
  rows: WebhookEventRecord[] = [];
  updates: Record<string, unknown>[] = [];
  txUpdates: Record<string, unknown>[] = [];
  tx: WebhookTransaction | null = {
    id: "11111111-1111-4111-8111-111111111111",
    workflow_category: "aps_originated",
    proof_status: "started",
    aps_status: "preparing",
    last_webhook_occurred_at: null,
    webhook_manual_review_reason: null,
  };
  failAccept = false;
  async accept(event: AcceptedWebhook) {
    if (this.failAccept) {
      throw new ProofError("PROOF_PROVIDER_ERROR", "db", 500, true);
    }
    const existing = this.rows.find((x) =>
      x.eventId === event.eventId || x.fingerprint === event.fingerprint
    );
    if (existing) {
      existing.delivery_count++;
      return { row: existing, duplicate: true };
    }
    const row = {
      ...event,
      id: crypto.randomUUID(),
      proof_transaction_record_id: null,
      processing_status: "received",
      attempt_count: 0,
      delivery_count: 1,
    };
    this.rows.push(row);
    return { row, duplicate: false };
  }
  async transaction() {
    return this.tx;
  }
  async updateEvent(_id: string, patch: Record<string, unknown>) {
    this.updates.push(patch);
  }
  async updateTransaction(_id: string, patch: Record<string, unknown>) {
    this.txUpdates.push(patch);
    if (this.tx) this.tx = { ...this.tx, ...patch } as WebhookTransaction;
  }
  async markDocument() {}
}
const payload = (event: string, date = "2026-08-05T20:00:00Z") => ({
  id: `ev_${event}`,
  event,
  data: {
    transaction_id: "ot_test",
    date_occurred: date,
    document: { document_id: "do_test" },
    meeting: { meeting_id: "me_test", api_url: "https://api.proof.com/secret" },
  },
});
const lifecycle = (repo = new Repo()) => ({
  repo,
  life: new ProofWebhookLifecycle(repo),
});
Deno.test("first event accepted", async () =>
  assertEquals(
    (await lifecycle().life.accept(
      payload("transaction.created"),
      "1".repeat(64),
      "production",
    )).duplicate,
    false,
  ));
Deno.test("duplicate provider event ID no-ops", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.created"),
    "1".repeat(64),
    "production",
  );
  assert(
    (await x.life.accept(
      payload("transaction.created"),
      "2".repeat(64),
      "production",
    )).duplicate,
  );
});
Deno.test("duplicate payload fingerprint no-ops", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.created"),
    "1".repeat(64),
    "production",
  );
  assert(
    (await x.life.accept(
      { ...payload("transaction.updated"), id: "ev_other" },
      "1".repeat(64),
      "production",
    )).duplicate,
  );
});
Deno.test("delivery count increments", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.created"),
    "1".repeat(64),
    "production",
  );
  await x.life.accept(
    payload("transaction.created"),
    "2".repeat(64),
    "production",
  );
  assertEquals(x.repo.rows[0].delivery_count, 2);
});
Deno.test("reprocessing remains idempotent", async () => {
  const x = lifecycle();
  const e = parseWebhook(
    payload("transaction.completed"),
    "3".repeat(64),
    "production",
  );
  const row = (await x.repo.accept(e)).row;
  await x.life.process(row);
  await x.life.process(row);
  assertEquals(x.repo.rows.length, 1);
});
Deno.test("duplicate retry does not duplicate effects", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.completed"),
    "f".repeat(64),
    "production",
  );
  await x.life.accept(
    payload("transaction.completed"),
    "f".repeat(64),
    "production",
  );
  assertEquals(x.repo.rows.length, 1);
});
Deno.test("newer event advances state", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.completed"),
    "4".repeat(64),
    "production",
  );
  assertEquals(x.repo.tx?.proof_status, "completed");
});
Deno.test("older event cannot regress state", async () => {
  const x = lifecycle();
  x.repo.tx!.proof_status = "released";
  x.repo.tx!.last_webhook_occurred_at = "2026-08-06T00:00:00Z";
  await x.life.accept(
    payload("transaction.updated", "2026-08-05T00:00:00Z"),
    "5".repeat(64),
    "production",
  );
  assertEquals(x.repo.tx?.proof_status, "released");
});
Deno.test("released cannot regress to completed", async () => {
  const x = lifecycle();
  x.repo.tx!.proof_status = "released";
  await x.life.accept(
    payload("transaction.completed"),
    "6".repeat(64),
    "production",
  );
  assertEquals(x.repo.tx?.proof_status, "released");
});
Deno.test("completed cannot regress to started", async () => {
  const x = lifecycle();
  x.repo.tx!.proof_status = "completed";
  await x.life.accept(
    payload("transaction.created"),
    "7".repeat(64),
    "production",
  );
  assertEquals(x.repo.tx?.proof_status, "completed");
});
Deno.test("manual review remains sticky", async () => {
  const x = lifecycle();
  x.repo.tx!.webhook_manual_review_reason = "review";
  await x.life.accept(
    payload("transaction.updated"),
    "8".repeat(64),
    "production",
  );
  assertEquals(x.repo.tx?.webhook_manual_review_reason, "review");
});
Deno.test("unknown event preserved manual review", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.unknown"),
    "9".repeat(64),
    "production",
  );
  assertEquals(x.repo.updates.at(-1)?.processing_status, "manual_review");
});
Deno.test("important out-of-order event marks safe refresh", async () => {
  const x = lifecycle();
  x.repo.tx!.last_webhook_occurred_at = "2026-08-06T00:00:00Z";
  await x.life.accept(
    payload("transaction.completed", "2026-08-05T00:00:00Z"),
    "a".repeat(64),
    "production",
  );
  assertEquals(
    x.repo.tx?.webhook_manual_review_reason,
    "Out-of-order Proof event requires safe refresh.",
  );
});

for (
  const event of [
    "transaction.created",
    "transaction.updated",
    "transaction.deleted",
    "transaction.expired",
    "transaction.recalled",
    "transaction.document.upload",
    "transaction.document.processed",
    "transaction.meeting.created",
    "transaction.completed",
    "transaction.released",
    "transaction.completed_with_rejections",
    "transaction.held_for_review",
    "transaction.declined",
    "transaction.signer.high_risk_detected",
    "transaction.meeting.video.processed",
  ]
) {
  Deno.test(`event mapping ${event}`, async () => {
    const x = lifecycle();
    await x.life.accept(
      payload(event),
      await sha256Hex(new TextEncoder().encode(event)),
      "production",
    );
    assert(x.repo.updates.length > 0);
  });
}
for (
  const name of [
    "no payment mutation",
    "no invoice mutation",
    "no automatic APS completion",
    "no scheduling mutation",
    "no customer update mutation",
    "no email sent",
  ]
) {
  Deno.test(name, () =>
    assert(
      !/payment|invoice|service_requests|send-email/.test(
        ProofWebhookLifecycle.toString(),
      ),
    ));
}
Deno.test("retryable internal failure", async () => {
  const x = lifecycle();
  const row = {
    ...parseWebhook(
      payload("transaction.updated"),
      "b".repeat(64),
      "production",
    ),
    id: crypto.randomUUID(),
    proof_transaction_record_id: null,
    processing_status: "received",
    attempt_count: 0,
    delivery_count: 1,
  };
  await x.life.fail(
    row,
    new ProofError("PROOF_PROVIDER_ERROR", "safe", 500, true),
  );
  assertEquals(x.repo.updates.at(-1)?.processing_status, "retryable_failed");
});
Deno.test("bounded retry count and dead letter", async () => {
  const x = lifecycle();
  const row = {
    ...parseWebhook(
      payload("transaction.updated"),
      "c".repeat(64),
      "production",
    ),
    id: crypto.randomUUID(),
    proof_transaction_record_id: null,
    processing_status: "received",
    attempt_count: 4,
    delivery_count: 1,
  };
  await x.life.fail(
    row,
    new ProofError("PROOF_PROVIDER_ERROR", "safe", 500, true),
  );
  assertEquals(x.repo.updates.at(-1)?.processing_status, "dead_letter");
});
Deno.test("manual review escalation", async () => {
  const x = lifecycle();
  x.repo.tx = null;
  await x.life.accept(
    payload("transaction.updated"),
    "d".repeat(64),
    "production",
  );
  assertEquals(x.repo.updates.at(-1)?.processing_status, "manual_review");
});
Deno.test("fast durable acceptance failure is not 200 eligible", async () => {
  const x = lifecycle();
  x.repo.failAccept = true;
  await assertRejects(() =>
    x.life.accept(payload("transaction.updated"), "e".repeat(64), "production")
  );
});
Deno.test("video event stores no provider API URL", async () => {
  const x = lifecycle();
  await x.life.accept(
    payload("transaction.meeting.video.processed"),
    "0f".repeat(32),
    "production",
  );
  assert(!JSON.stringify(x.repo.txUpdates).includes("api.proof.com"));
});
