import type { ProofEnvironment } from "./transaction-types.ts";

export const APS_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PROOF_DOCUMENT_MAX_BYTES = 30 * 1024 * 1024;
export const PROOF_REQUIREMENTS = [
  "notarization",
  "esign",
  "identity_confirmation",
  "readonly",
  "non_essential",
] as const;

export type ProofDocumentRequirement = typeof PROOF_REQUIREMENTS[number];
export type ProofDocumentCommand =
  | "list_eligible_source_documents"
  | "prepare_upload"
  | "upload_source_document"
  | "refresh_document"
  | "refresh_all_documents"
  | "mark_document_manual_review";
export type ProofDocumentUploadState =
  | "prepared"
  | "claimed"
  | "uploading"
  | "uploaded"
  | "rejected"
  | "failed"
  | "ambiguous"
  | "processing"
  | "processed"
  | "processing_failed"
  | "manual_review";

export interface ProofDocumentFlags {
  requirement: ProofDocumentRequirement;
  notarizationRequired: boolean;
  esignRequired: boolean;
  identityConfirmationRequired: boolean;
  witnessRequired: boolean;
  signingRequiresMeeting: boolean;
  customerCanAnnotate: boolean;
  bundlePosition: number | null;
}

export interface RequestFileRecord {
  id: string;
  service_request_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  document_category: string | null;
  is_active: boolean | null;
}

export interface ProofDocumentAssetRecord {
  id: string;
  proof_transaction_record_id: string;
  source_request_file_id: string;
  proof_transaction_id: string;
  proof_asset_id: string | null;
  tracking_id: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  upload_state: ProofDocumentUploadState;
  dispatch_state: string;
  processing_state: string;
  dispatch_attempt_count: number;
  requirement: ProofDocumentRequirement;
  notarization_required: boolean;
  esign_required: boolean;
  identity_confirmation_required: boolean;
  witness_required: boolean;
  signing_requires_meeting: boolean;
  customer_can_annotate: boolean;
  bundle_position: number | null;
  retry_eligible: boolean;
  manual_review_reason: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  uploaded_at: string | null;
  processed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProofDocumentProjection {
  assetId: string;
  integrationId: string;
  requestFileId: string;
  fileName: string;
  byteSize: number;
  checksum: string;
  trackingId: string;
  requirement: ProofDocumentRequirement;
  flags: Omit<ProofDocumentFlags, "requirement">;
  uploadState: ProofDocumentUploadState;
  processingState: string;
  providerDocumentId: string | null;
  retryEligible: boolean;
  requiresManualReview: boolean;
  warning: string | null;
  uploadedAt: string | null;
  processedAt: string | null;
  lastSyncedAt: string | null;
}

export interface DocumentCommandInput {
  command: ProofDocumentCommand;
  serviceRequestId?: string;
  integrationId?: string;
  requestFileId?: string;
  assetId?: string;
  environment?: ProofEnvironment;
  flags?: Partial<ProofDocumentFlags>;
  reason?: string;
  retryConfirmedRejection?: boolean;
}

export function projectProofDocument(
  row: ProofDocumentAssetRecord,
): ProofDocumentProjection {
  return {
    assetId: row.id,
    integrationId: row.proof_transaction_record_id,
    requestFileId: row.source_request_file_id,
    fileName: row.file_name,
    byteSize: row.byte_size,
    checksum: row.sha256,
    trackingId: row.tracking_id,
    requirement: row.requirement,
    flags: {
      notarizationRequired: row.notarization_required,
      esignRequired: row.esign_required,
      identityConfirmationRequired: row.identity_confirmation_required,
      witnessRequired: row.witness_required,
      signingRequiresMeeting: row.signing_requires_meeting,
      customerCanAnnotate: row.customer_can_annotate,
      bundlePosition: row.bundle_position,
    },
    uploadState: row.upload_state,
    processingState: row.processing_state,
    providerDocumentId: row.proof_asset_id,
    retryEligible: row.retry_eligible,
    requiresManualReview: ["ambiguous", "manual_review", "processing_failed"]
      .includes(row.upload_state),
    warning: row.manual_review_reason ?? row.last_error_message,
    uploadedAt: row.uploaded_at,
    processedAt: row.processed_at,
    lastSyncedAt: row.last_synced_at,
  };
}
