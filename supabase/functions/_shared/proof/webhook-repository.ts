import { ProofError } from "./errors.ts";
import type { WebhookRepository } from "./webhook-lifecycle.ts";
import type {
  AcceptedWebhook,
  WebhookEventRecord,
  WebhookTransaction,
} from "./webhook-types.ts";

export class SupabaseWebhookRepository implements WebhookRepository {
  private readonly url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  private readonly key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ??
    "";
  constructor() {
    if (!this.url || !this.key) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "Proof webhook persistence is unavailable.",
        503,
      );
    }
  }

  async accept(event: AcceptedWebhook) {
    const response = await this.request(
      "proof_webhook_events?on_conflict=environment,payload_fingerprint",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({
          proof_event_id: event.eventId,
          subscription_id: event.subscriptionId,
          environment: event.environment,
          event_type: event.eventName,
          proof_transaction_id: event.transactionId,
          occurred_at: event.occurredAt,
          payload_fingerprint: event.fingerprint,
          signature_verified: true,
          processing_status: "received",
          payload: null,
          sanitized_metadata: {
            meeting_id: event.meetingId,
            document_id: event.documentId,
          },
        }),
      },
    );
    const inserted = await this.read<Record<string, unknown>>(response);
    if (inserted[0]) {
      return { row: normalize(inserted[0], event), duplicate: false };
    }
    const existing = (await this.rows<Record<string, unknown>>(
      `proof_webhook_events?select=*&environment=eq.${event.environment}&payload_fingerprint=eq.${event.fingerprint}&limit=1`,
    ))[0];
    if (!existing) throw persist();
    const deliveries = Number(existing.delivery_count ?? 1) + 1;
    await this.updateEvent(String(existing.id), {
      delivery_count: deliveries,
      updated_at: new Date().toISOString(),
    });
    return {
      row: normalize({ ...existing, delivery_count: deliveries }, event),
      duplicate: true,
    };
  }
  async transaction(providerId: string) {
    return (await this.rows<WebhookTransaction>(
      `proof_transactions?select=*&proof_transaction_id=eq.${
        encodeURIComponent(providerId)
      }&limit=1`,
    ))[0] ?? null;
  }
  async updateEvent(id: string, patch: Record<string, unknown>) {
    await this.patch(
      `proof_webhook_events?id=eq.${encodeURIComponent(id)}`,
      patch,
    );
  }
  async updateTransaction(id: string, patch: Record<string, unknown>) {
    await this.patch(
      `proof_transactions?id=eq.${encodeURIComponent(id)}`,
      patch,
    );
  }
  async markDocument(
    integrationId: string,
    documentId: string | null,
    processed: boolean,
  ) {
    if (!documentId) return;
    await this.patch(
      `proof_transaction_assets?proof_transaction_record_id=eq.${
        encodeURIComponent(integrationId)
      }&proof_asset_id=eq.${
        encodeURIComponent(documentId)
      }&asset_type=eq.source_document`,
      {
        processing_state: processed ? "complete" : "processing",
        upload_state: processed ? "processed" : "processing",
        last_synced_at: new Date().toISOString(),
      },
    );
  }
  async recordTimeline(
    transaction: WebhookTransaction,
    event: AcceptedWebhook,
  ) {
    if (!transaction.service_request_id) return;
    const existing = await this.rows<{ id: string }>(
      `request_timeline_events?select=id&service_request_id=eq.${transaction.service_request_id}&metadata-%3E%3Eproof_fingerprint=eq.${event.fingerprint}&limit=1`,
    );
    if (existing[0]) return;
    const labels: Record<string, [string, string]> = {
      "transaction.document.processed": [
        "proof_document_processed",
        "Secure-session document processed",
      ],
      "transaction.meeting.created": [
        "proof_session_available",
        "Secure notary session became available",
      ],
      "transaction.completed": [
        "proof_transaction_completed",
        "Secure notarization completed",
      ],
      "transaction.completed_with_rejections": [
        "proof_transaction_rejected_documents",
        "Secure notarization completed with rejected documents",
      ],
      "transaction.released": [
        "proof_documents_available",
        "Completed notarized documents available for retrieval",
      ],
      "transaction.expired": [
        "proof_transaction_expired",
        "Secure notarization transaction expired",
      ],
    };
    const label = labels[event.eventName];
    if (!label) return;
    const response = await this.request("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: transaction.service_request_id,
        event_type: label[0],
        title: label[1],
        detail: "Proof lifecycle state synchronized to APS.",
        actor_type: "system",
        visibility: "internal",
        metadata: {
          proof_fingerprint: event.fingerprint,
          proof_event: event.eventName,
        },
      }),
    });
    if (!response.ok && response.status !== 409) throw persist();
  }
  private async patch(path: string, body: Record<string, unknown>) {
    const response = await this.request(path, {
      method: "PATCH",
      body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) throw persist();
  }
  private request(path: string, init: RequestInit = {}) {
    return fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }
  private async rows<T>(path: string) {
    return this.read<T>(await this.request(path));
  }
  private async read<T>(response: Response): Promise<T[]> {
    if (!response.ok) throw persist();
    return await response.json() as T[];
  }
}
function normalize(
  row: Record<string, unknown>,
  event: AcceptedWebhook,
): WebhookEventRecord {
  return {
    ...event,
    id: String(row.id),
    proof_transaction_record_id: row.proof_transaction_record_id as
      | string
      | null,
    processing_status: String(row.processing_status),
    attempt_count: Number(row.attempt_count),
    delivery_count: Number(row.delivery_count),
  };
}
function persist() {
  return new ProofError(
    "PROOF_PROVIDER_ERROR",
    "APS could not durably accept the Proof event.",
    500,
    true,
  );
}
