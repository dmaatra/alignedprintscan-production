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
    draft: "preparing",
    ready: "ready",
    active: "in_progress",
    in_progress: "in_progress",
    completed: "completed",
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
