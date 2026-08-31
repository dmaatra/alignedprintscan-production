import type { ApsProofStatus } from "./status-map.ts";

export type ProofEnvironment = "production" | "fairfax";
export type ProofWorkflowCategory = "aps_originated" | "proof_odn";
export type ProofCreationState =
  | "claimed"
  | "request_dispatched"
  | "created"
  | "rejected"
  | "failed"
  | "ambiguous"
  | "manual_review"
  | "cancelled"
  | "deleted";

export type ProofTransactionCommand =
  | "organization_check"
  | "create_draft"
  | "retrieve"
  | "refresh"
  | "delete_draft"
  | "cancel_local"
  | "mark_manual_review";

export interface ProofTransactionRecord {
  id: string;
  service_request_id: string;
  proof_transaction_id: string | null;
  idempotency_key: string;
  workflow_category: ProofWorkflowCategory;
  environment: ProofEnvironment;
  external_id: string;
  creation_state: ProofCreationState;
  proof_status: string | null;
  provider_detailed_status: string | null;
  aps_status: ApsProofStatus;
  is_active: boolean;
  creation_attempt_count: number;
  claim_acquired_at: string;
  request_dispatched_at: string | null;
  ambiguous_at: string | null;
  provider_created_at: string | null;
  provider_updated_at: string | null;
  pending_primary_signer_access_link?: string | null;
  pending_primary_signer_email?: string | null;
  last_synced_at: string | null;
  deleted_at: string | null;
  cancelled_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  manual_review_reason: string | null;
  last_command: ProofTransactionCommand | null;
  last_command_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestProofReadiness {
  id: string;
  service_type: string;
}

export interface ProofTransactionProjection {
  integrationId: string;
  serviceRequestId: string;
  environment: ProofEnvironment;
  workflowCategory: ProofWorkflowCategory;
  externalId: string;
  creationState: ProofCreationState;
  apsStatus: ApsProofStatus;
  providerStatus: string | null;
  providerDetailedStatus: string | null;
  providerTransactionId: string | null;
  isActive: boolean;
  attemptCount: number;
  lastSyncedAt: string | null;
  requiresManualReview: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  cancelledAt: string | null;
}

export function projectProofTransaction(
  record: ProofTransactionRecord,
): ProofTransactionProjection {
  return {
    integrationId: record.id,
    serviceRequestId: record.service_request_id,
    environment: record.environment,
    workflowCategory: record.workflow_category,
    externalId: record.external_id,
    creationState: record.creation_state,
    apsStatus: record.aps_status,
    providerStatus: record.proof_status,
    providerDetailedStatus: record.provider_detailed_status,
    providerTransactionId: record.proof_transaction_id,
    isActive: record.is_active,
    attemptCount: record.creation_attempt_count,
    lastSyncedAt: record.last_synced_at,
    requiresManualReview: record.creation_state === "ambiguous" ||
      record.creation_state === "manual_review",
    errorCode: record.last_error_code,
    errorMessage: record.last_error_message,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    deletedAt: record.deleted_at,
    cancelledAt: record.cancelled_at,
  };
}
