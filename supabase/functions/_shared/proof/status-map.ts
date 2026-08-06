export type ApsProofStatus =
  | "not_started"
  | "preparing"
  | "ready"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed"
  | "requires_attention";

const transactionStatuses: Readonly<Record<string, ApsProofStatus>> = Object
  .freeze({
    created: "preparing",
    started: "preparing",
    draft: "preparing",
    ready: "ready",
    active: "in_progress",
    in_progress: "in_progress",
    completed: "completed",
    released: "completed",
    complete: "completed",
    completed_with_rejections: "requires_attention",
    complete_with_rejections: "requires_attention",
    sent: "in_progress",
    received: "in_progress",
    sent_to_signer: "in_progress",
    viewed: "in_progress",
    meeting_in_progress: "in_progress",
    attempted: "requires_attention",
    partially_complete: "in_progress",
    esign_complete: "in_progress",
    wet_sign_complete: "in_progress",
    awaiting_payment: "requires_attention",
    recalled: "preparing",
    deleted: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",
    failed: "failed",
    expired: "requires_attention",
  });

export function mapProofTransactionStatus(
  rawStatus: string | null | undefined,
): ApsProofStatus {
  if (!rawStatus) return "not_started";
  return transactionStatuses[rawStatus.trim().toLowerCase()] ??
    "requires_attention";
}

export function customerSafeProofStatus(status: ApsProofStatus): string {
  return ({
    not_started: "Not started",
    preparing: "Preparing your online notarization",
    ready: "Ready for your online notarization",
    in_progress: "Online notarization in progress",
    completed: "Online notarization completed",
    cancelled: "Online notarization cancelled",
    failed: "We need to review your online notarization",
    requires_attention: "We need to review your online notarization",
  } as const)[status];
}
