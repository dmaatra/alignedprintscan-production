import { normalizeProofFailure, ProofError } from "./errors.ts";
import { proofLogger } from "./logger.ts";
import { mapProofTransactionStatus } from "./status-map.ts";
import {
  type AcceptedWebhook,
  PROOF_WEBHOOK_EVENTS,
  type WebhookEventRecord,
  type WebhookTransaction,
} from "./webhook-types.ts";

export interface WebhookRepository {
  accept(
    event: AcceptedWebhook,
  ): Promise<{ row: WebhookEventRecord; duplicate: boolean }>;
  transaction(providerId: string): Promise<WebhookTransaction | null>;
  updateEvent(id: string, patch: Record<string, unknown>): Promise<void>;
  updateTransaction(id: string, patch: Record<string, unknown>): Promise<void>;
  markDocument(
    integrationId: string,
    documentId: string | null,
    processed: boolean,
  ): Promise<void>;
  recordTimeline?(
    transaction: WebhookTransaction,
    event: AcceptedWebhook,
  ): Promise<void>;
}

const precedence: Record<string, number> = {
  started: 10,
  recalled: 25,
  expired: 50,
  deleted: 50,
  failed: 60,
  completed_with_rejections: 70,
  completed: 80,
  released: 90,
};

export class ProofWebhookLifecycle {
  constructor(
    private readonly repository: WebhookRepository,
    private readonly maxAttempts = 5,
  ) {}

  async accept(
    raw: Record<string, unknown>,
    fingerprint: string,
    environment: "production" | "fairfax",
  ) {
    const event = parseWebhook(raw, fingerprint, environment);
    const accepted = await this.repository.accept(event);
    if (
      accepted.duplicate &&
      ["processed", "manual_review", "dead_letter"].includes(
        accepted.row.processing_status,
      )
    ) return { accepted: true, duplicate: true };
    try {
      await this.process(accepted.row);
    } catch (error) {
      await this.fail(accepted.row, normalizeProofFailure(error));
      throw error;
    }
    return { accepted: true, duplicate: accepted.duplicate };
  }

  async process(row: WebhookEventRecord) {
    if (
      !PROOF_WEBHOOK_EVENTS.includes(
        row.eventName as typeof PROOF_WEBHOOK_EVENTS[number],
      )
    ) {
      await this.repository.updateEvent(row.id, {
        processing_status: "manual_review",
        manual_review_reason: "Unsupported documented event mapping.",
      });
      return;
    }
    if (!row.transactionId) {
      return await this.manual(
        row,
        "Webhook transaction correlation is missing.",
      );
    }
    const transaction = await this.repository.transaction(row.transactionId);
    if (!transaction) {
      return await this.manual(
        row,
        "Webhook transaction is not correlated to APS.",
      );
    }
    const occurred = new Date(row.occurredAt).getTime();
    const previous = transaction.last_webhook_occurred_at
      ? new Date(transaction.last_webhook_occurred_at).getTime()
      : 0;
    const state = eventState(row.eventName);
    const stale = occurred < previous;
    const regression = state !== null && (precedence[state] ?? 0) <
        (precedence[transaction.proof_status ?? ""] ?? 0);
    const stickyReview = Boolean(transaction.webhook_manual_review_reason);
    const patch: Record<string, unknown> = {
      last_webhook_event: row.eventName,
      last_synced_at: new Date().toISOString(),
    };
    if (state && !stale && !regression) {
      patch.proof_status = state;
      patch.aps_status = mapProofTransactionStatus(state);
      patch.last_webhook_occurred_at = row.occurredAt;
    }
    if (
      ["transaction.held_for_review", "transaction.signer.high_risk_detected"]
        .includes(row.eventName)
    ) {
      patch.webhook_manual_review_reason =
        "Proof reported a manual-review condition.";
      patch.aps_status = "requires_attention";
    } else if (stickyReview) {
      patch.webhook_manual_review_reason =
        transaction.webhook_manual_review_reason;
    }
    if (row.eventName === "transaction.completed") {
      patch.completed_at = row.occurredAt;
    }
    if (row.eventName === "transaction.released") {
      Object.assign(patch, {
        completed_assets_available: true,
        audit_trail_available: true,
        released_at: row.occurredAt,
      });
    }
    if (row.eventName === "transaction.meeting.created") {
      Object.assign(patch, {
        meeting_state: "created",
        meeting_id: row.meetingId,
      });
    }
    if (row.eventName === "transaction.meeting.video.processed") {
      Object.assign(patch, {
        recording_metadata_available: true,
        recording_content_blocked: true,
        meeting_id: row.meetingId,
      });
    }
    if (
      row.eventName === "transaction.document.upload" ||
      row.eventName === "transaction.document.processed"
    ) {
      await this.repository.markDocument(
        transaction.id,
        row.documentId,
        row.eventName.endsWith("processed"),
      );
    }
    if (stale || regression) {
      patch.webhook_manual_review_reason =
        "Out-of-order Proof event requires safe refresh.";
      patch.webhook_refresh_required = true;
    }
    await this.repository.updateTransaction(transaction.id, patch);
    await this.repository.recordTimeline?.(transaction, row);
    await this.repository.updateEvent(row.id, {
      proof_transaction_record_id: transaction.id,
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    });
    proofLogger.idempotency({
      operation: "proof_webhook",
      event_name: row.eventName,
      event_id_suffix: row.eventId?.slice(-8),
      fingerprint_prefix: row.fingerprint.slice(0, 12),
      processing_state: "processed",
    });
  }

  async fail(row: WebhookEventRecord, error: ProofError) {
    const attempts = row.attempt_count + 1;
    const dead = attempts >= this.maxAttempts;
    await this.repository.updateEvent(row.id, {
      attempt_count: attempts,
      processing_status: dead ? "dead_letter" : "retryable_failed",
      next_retry_at: dead
        ? null
        : new Date(Date.now() + 60_000 * attempts).toISOString(),
      dead_lettered_at: dead ? new Date().toISOString() : null,
      manual_review_reason: dead
        ? "Webhook processing retry limit reached."
        : null,
      last_error_code: error.code,
      last_error_message: error.message,
    });
  }
  private async manual(row: WebhookEventRecord, reason: string) {
    await this.repository.updateEvent(row.id, {
      processing_status: "manual_review",
      manual_review_reason: reason,
    });
  }
}

export function parseWebhook(
  raw: Record<string, unknown>,
  fingerprint: string,
  environment: "production" | "fairfax",
): AcceptedWebhook {
  const data = object(raw.data);
  const eventName = text(raw.event);
  const occurredAt = timestamp(data.date_occurred ?? raw.date_occurred);
  if (!eventName || !occurredAt) {
    throw new ProofError(
      "PROOF_MALFORMED_RESPONSE",
      "Proof webhook payload is malformed.",
      400,
    );
  }
  const meeting = object(data.meeting);
  const document = object(data.document);
  return {
    eventId: text(raw.id ?? raw.event_id),
    subscriptionId: text(raw.webhook_id ?? raw.subscription_id),
    eventName,
    transactionId: text(data.transaction_id),
    occurredAt,
    fingerprint,
    environment,
    meetingId: text(meeting.meeting_id),
    documentId: text(document.document_id),
  };
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : null;
}
function timestamp(value: unknown): string | null {
  const v = text(value);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function eventState(event: string): string | null {
  return ({
    "transaction.created": "started",
    "transaction.deleted": "deleted",
    "transaction.expired": "expired",
    "transaction.recalled": "recalled",
    "transaction.completed": "completed",
    "transaction.released": "released",
    "transaction.completed_with_rejections": "completed_with_rejections",
    "transaction.declined": "failed",
  } as Record<string, string>)[event] ?? null;
}
