export const PROOF_WEBHOOK_EVENTS = [
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
] as const;

export interface AcceptedWebhook {
  eventId: string | null;
  subscriptionId: string | null;
  eventName: string;
  transactionId: string | null;
  occurredAt: string;
  fingerprint: string;
  environment: "production" | "fairfax";
  meetingId: string | null;
  documentId: string | null;
}
export interface WebhookEventRecord extends AcceptedWebhook {
  id: string;
  proof_transaction_record_id: string | null;
  processing_status: string;
  attempt_count: number;
  delivery_count: number;
}
export interface WebhookTransaction {
  id: string;
  service_request_id?: string;
  workflow_category: "aps_originated" | "proof_odn";
  proof_status: string | null;
  aps_status: string;
  last_webhook_occurred_at: string | null;
  webhook_manual_review_reason: string | null;
}
