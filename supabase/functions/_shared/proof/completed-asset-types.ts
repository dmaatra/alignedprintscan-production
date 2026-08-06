export type CompletedAssetCommand =
  | "list_completed_assets"
  | "retrieve_completed_document"
  | "retrieve_audit_trail"
  | "refresh_completed_asset_state"
  | "mark_asset_manual_review";
export interface CompletedAssetInput {
  command: CompletedAssetCommand;
  integrationId?: string;
  assetId?: string;
  sourceAssetId?: string;
  reason?: string;
}
export interface CompletedAssetRecord {
  id: string;
  proof_transaction_record_id: string;
  proof_transaction_id: string;
  proof_asset_id: string | null;
  source_asset_id: string | null;
  asset_type: "completed_document" | "audit_trail";
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  availability_state: string;
  retrieval_state: string;
  retrieval_attempt_count: number;
  retrieved_at: string | null;
  retrieval_manual_review_reason: string | null;
}
export function completedProjection(row: CompletedAssetRecord) {
  return {
    assetId: row.id,
    integrationId: row.proof_transaction_record_id,
    sourceAssetId: row.source_asset_id,
    assetType: row.asset_type,
    fileName: row.file_name,
    availabilityState: row.availability_state,
    retrievalState: row.retrieval_state,
    byteSize: row.byte_size,
    checksum: row.sha256,
    stored: Boolean(row.storage_path),
    retrievedAt: row.retrieved_at,
    requiresManualReview: row.retrieval_state === "manual_review",
  };
}
