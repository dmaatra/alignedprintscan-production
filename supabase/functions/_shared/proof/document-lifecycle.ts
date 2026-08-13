import { normalizeProofFailure, ProofError } from "./errors.ts";
import { proofLogger } from "./logger.ts";
import type {
  ProofProviderDocument,
  ProofProviderTransaction,
} from "./service.ts";
import type { ProofDocumentRepository } from "./document-repository.ts";
import {
  APS_DOCUMENT_MAX_BYTES,
  type DocumentCommandInput,
  projectProofDocument,
  PROOF_DOCUMENT_MAX_BYTES,
  PROOF_REQUIREMENTS,
  type ProofDocumentAssetRecord,
  type ProofDocumentCommand,
  type ProofDocumentFlags,
  type ProofDocumentProjection,
  type RequestFileRecord,
} from "./document-types.ts";
import type { ProofTransactionRecord } from "./transaction-types.ts";

const BUCKET = "service-request-files";

export interface ProofDocumentService {
  getTransaction(id: string): Promise<ProofProviderTransaction>;
  addDocument(input: {
    transactionId: string;
    filename: string;
    bytes: Uint8Array;
    trackingId: string;
    requirement: ProofDocumentFlags["requirement"];
    notarizationRequired: boolean;
    esignRequired: boolean;
    identityConfirmationRequired: boolean;
    witnessRequired: boolean;
    signingRequiresMeeting: boolean;
    customerCanAnnotate: boolean;
    bundlePosition: number | null;
  }): Promise<ProofProviderDocument>;
  getTransactionDocumentMetadata(id: string): Promise<ProofProviderDocument[]>;
}

export type DocumentCommandResult =
  | {
    kind: "eligible_documents";
    documents: Array<
      {
        requestFileId: string;
        fileName: string;
        byteSize: number | null;
        eligible: boolean;
        reason: string | null;
      }
    >;
  }
  | { kind: "document"; document: ProofDocumentProjection; duplicate?: boolean }
  | { kind: "documents"; documents: ProofDocumentProjection[] };

export class ProofDocumentLifecycle {
  constructor(
    private readonly repository: ProofDocumentRepository,
    private readonly service: ProofDocumentService,
    private readonly environment: "production" | "fairfax",
  ) {}

  async execute(
    input: DocumentCommandInput,
    adminUserId: string,
  ): Promise<DocumentCommandResult> {
    switch (input.command) {
      case "list_eligible_source_documents":
        return await this.listEligible(input);
      case "prepare_upload":
        return await this.prepare(input, adminUserId);
      case "upload_source_document":
        return await this.upload(input, adminUserId);
      case "refresh_document":
        return await this.refreshOne(input, adminUserId);
      case "refresh_all_documents":
        return await this.refreshAll(input, adminUserId);
      case "mark_document_manual_review":
        return await this.markManualReview(input, adminUserId);
      default:
        throw readiness("A supported Proof document command is required.");
    }
  }

  private async listEligible(
    input: DocumentCommandInput,
  ): Promise<DocumentCommandResult> {
    const integration = await this.integration(input.integrationId);
    this.assertIntegration(integration, input.serviceRequestId);
    await this.assertRonRequest(integration.service_request_id);
    this.assertLocalEditable(integration);
    const files = await this.repository.getRequestFiles(
      integration.service_request_id,
    );
    const documents: Array<
      {
        requestFileId: string;
        fileName: string;
        byteSize: number | null;
        eligible: boolean;
        reason: string | null;
      }
    > = [];
    for (const file of files) {
      const existing = await this.repository.findAsset(integration.id, file.id);
      let reason = existing
        ? "Already mapped to this Proof transaction."
        : metadataIneligibility(file);
      if (!reason) {
        try {
          validateBytes(
            await this.repository.downloadSource(file.file_path),
            file,
          );
        } catch (error) {
          reason = error instanceof ProofError
            ? error.message
            : "The APS source document could not be verified.";
        }
      }
      documents.push({
        requestFileId: file.id,
        fileName: safeName(file.file_name),
        byteSize: file.file_size,
        eligible: !reason,
        reason,
      });
    }
    return { kind: "eligible_documents", documents };
  }

  private async prepare(
    input: DocumentCommandInput,
    adminUserId: string,
  ): Promise<DocumentCommandResult> {
    const integration = await this.integration(input.integrationId);
    this.assertIntegration(integration, input.serviceRequestId);
    await this.assertRonRequest(integration.service_request_id);
    this.assertLocalEditable(integration);
    const requestFileId = uuid(input.requestFileId, "APS request file ID");
    const existing = await this.repository.findAsset(
      integration.id,
      requestFileId,
    );
    if (existing) {
      return {
        kind: "document",
        document: projectProofDocument(existing),
        duplicate: true,
      };
    }
    const file = await this.requiredFile(
      requestFileId,
      integration.service_request_id,
    );
    const flags = validateFlags(input.flags);
    const bytes = await this.repository.downloadSource(file.file_path);
    validateBytes(bytes, file);
    const checksum = await sha256(bytes);
    const assetId = crypto.randomUUID();
    const trackingId = stableTrackingId(integration.id, requestFileId);
    const claimed = await this.repository.claim({
      id: assetId,
      proof_transaction_record_id: integration.id,
      source_request_file_id: requestFileId,
      proof_transaction_id: integration.proof_transaction_id,
      proof_asset_id: null,
      idempotency_key: `proof-document:${integration.id}:${requestFileId}`,
      asset_type: "source_document",
      file_name: safeName(file.file_name),
      storage_bucket: BUCKET,
      storage_path: file.file_path,
      content_type: "application/pdf",
      byte_size: bytes.byteLength,
      sha256: checksum,
      tracking_id: trackingId,
      upload_state: "claimed",
      dispatch_state: "not_dispatched",
      processing_state: "not_uploaded",
      requirement: flags.requirement,
      notarization_required: flags.notarizationRequired,
      esign_required: flags.esignRequired,
      identity_confirmation_required: flags.identityConfirmationRequired,
      witness_required: flags.witnessRequired,
      signing_requires_meeting: flags.signingRequiresMeeting,
      customer_can_annotate: flags.customerCanAnnotate,
      bundle_position: flags.bundlePosition,
      retry_eligible: false,
      created_by: adminUserId,
      updated_by: adminUserId,
    });
    if (!claimed) {
      const raced = await this.repository.findAsset(
        integration.id,
        requestFileId,
      );
      if (!raced) {
        throw new ProofError(
          "PROOF_CONFLICT",
          "The Proof document claim changed concurrently.",
          409,
        );
      }
      return {
        kind: "document",
        document: projectProofDocument(raced),
        duplicate: true,
      };
    }
    await this.audit(claimed, "prepare_upload", "succeeded", adminUserId);
    return { kind: "document", document: projectProofDocument(claimed) };
  }

  private async upload(
    input: DocumentCommandInput,
    adminUserId: string,
  ): Promise<DocumentCommandResult> {
    let asset = await this.asset(input.assetId);
    const integration = await this.integration(
      asset.proof_transaction_record_id,
    );
    this.assertIntegration(integration, input.serviceRequestId);
    if (
      ["uploaded", "processing", "processed", "ambiguous", "manual_review"]
        .includes(asset.upload_state)
    ) {
      return {
        kind: "document",
        document: projectProofDocument(asset),
        duplicate: true,
      };
    }
    if (
      asset.upload_state === "rejected" && asset.retry_eligible &&
      !input.retryConfirmedRejection
    ) {
      return {
        kind: "document",
        document: projectProofDocument(asset),
        duplicate: true,
      };
    }
    if (
      asset.upload_state !== "claimed" &&
      !(asset.upload_state === "rejected" && asset.retry_eligible &&
        input.retryConfirmedRejection)
    ) throw readiness("This Proof document claim is not eligible for upload.");
    const transaction = await this.service.getTransaction(
      asset.proof_transaction_id,
    );
    if (!isEditable(transaction)) {
      throw readiness("The Proof transaction is no longer document-editable.");
    }
    const file = await this.requiredFile(
      asset.source_request_file_id,
      integration.service_request_id,
    );
    const bytes = await this.repository.downloadSource(file.file_path);
    validateBytes(bytes, file);
    if (
      await sha256(bytes) !== asset.sha256 ||
      bytes.byteLength !== asset.byte_size
    ) {
      throw readiness(
        "The APS source document changed after preparation. A new explicit claim is required.",
      );
    }
    asset = await this.repository.update(asset.id, {
      upload_state: "uploading",
      dispatch_state: "dispatched",
      dispatch_started_at: new Date().toISOString(),
      dispatch_attempt_count: asset.dispatch_attempt_count + 1,
      retry_eligible: false,
      updated_by: adminUserId,
    });
    await this.audit(asset, "upload_source_document", "started", adminUserId);
    try {
      const provider = await this.service.addDocument({
        transactionId: asset.proof_transaction_id,
        filename: asset.file_name,
        bytes,
        trackingId: asset.tracking_id,
        requirement: asset.requirement,
        notarizationRequired: asset.notarization_required,
        esignRequired: asset.esign_required,
        identityConfirmationRequired: asset.identity_confirmation_required,
        witnessRequired: asset.witness_required,
        signingRequiresMeeting: asset.signing_requires_meeting,
        customerCanAnnotate: asset.customer_can_annotate,
        bundlePosition: asset.bundle_position,
      });
      const updated = await this.sync(asset, provider, adminUserId, {
        upload_state: provider.processingState === "complete"
          ? "processed"
          : "uploaded",
        dispatch_state: "confirmed",
        uploaded_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
      });
      await this.audit(
        updated,
        "upload_source_document",
        "succeeded",
        adminUserId,
      );
      return { kind: "document", document: projectProofDocument(updated) };
    } catch (error) {
      const normalized = normalizeProofFailure(error);
      if (
        normalized.requestMayHaveReachedProvider ||
        normalized.code === "PROOF_TIMEOUT" ||
        normalized.code === "PROOF_NETWORK_ERROR"
      ) {
        const ambiguous = await this.repository.update(asset.id, {
          upload_state: "ambiguous",
          dispatch_state: "ambiguous",
          ambiguous_at: new Date().toISOString(),
          retry_eligible: false,
          last_error_code: "PROOF_AMBIGUOUS_RESULT",
          last_error_message:
            "Proof may have received the document. Do not upload again; reconcile by tracking ID or review manually.",
          manual_review_reason: "Upload response was ambiguous.",
          updated_by: adminUserId,
        });
        await this.audit(
          ambiguous,
          "upload_source_document",
          "ambiguous",
          adminUserId,
          normalized,
        );
        throw new ProofError(
          "PROOF_AMBIGUOUS_RESULT",
          "Proof may have received the document. The upload claim is preserved for reconciliation.",
          502,
        );
      }
      const confirmed = normalized.providerStatus !== undefined &&
        normalized.providerStatus < 500;
      const failed = await this.repository.update(asset.id, {
        upload_state: confirmed ? "rejected" : "failed",
        dispatch_state: confirmed ? "rejected" : "dispatched",
        retry_eligible: confirmed,
        last_error_code: normalized.code,
        last_error_message: normalized.message,
        updated_by: adminUserId,
      });
      await this.audit(
        failed,
        "upload_source_document",
        confirmed ? "rejected" : "failed",
        adminUserId,
        normalized,
      );
      throw normalized;
    }
  }

  private async refreshOne(input: DocumentCommandInput, adminUserId: string) {
    const asset = await this.asset(input.assetId);
    const integration = await this.integration(
      asset.proof_transaction_record_id,
    );
    this.assertIntegration(integration, input.serviceRequestId);
    const documents = await this.service.getTransactionDocumentMetadata(
      asset.proof_transaction_id,
    );
    const provider = findProviderDocument(asset, documents);
    if (!provider) {
      throw readiness(
        "Proof document metadata could not be reconciled by stored ID or tracking ID.",
      );
    }
    const updated = await this.sync(asset, provider, adminUserId);
    await this.audit(updated, "refresh_document", "succeeded", adminUserId);
    return {
      kind: "document" as const,
      document: projectProofDocument(updated),
    };
  }

  private async refreshAll(
    input: DocumentCommandInput,
    adminUserId: string,
  ): Promise<DocumentCommandResult> {
    const integration = await this.integration(input.integrationId);
    this.assertIntegration(integration, input.serviceRequestId);
    const assets = await this.repository.listAssets(integration.id);
    const documents = await this.service.getTransactionDocumentMetadata(
      integration.proof_transaction_id!,
    );
    const updated: ProofDocumentProjection[] = [];
    for (const asset of assets) {
      const provider = findProviderDocument(asset, documents);
      if (provider) {
        updated.push(
          projectProofDocument(await this.sync(asset, provider, adminUserId)),
        );
      } else updated.push(projectProofDocument(asset));
    }
    return { kind: "documents", documents: updated };
  }

  private async markManualReview(
    input: DocumentCommandInput,
    adminUserId: string,
  ) {
    const asset = await this.asset(input.assetId);
    const reason = String(input.reason ?? "").trim().slice(0, 500);
    if (!reason) {
      throw readiness("A document manual-review reason is required.");
    }
    const updated = await this.repository.update(asset.id, {
      upload_state: "manual_review",
      retry_eligible: false,
      manual_review_reason: reason,
      updated_by: adminUserId,
    });
    await this.audit(
      updated,
      "mark_document_manual_review",
      "manual_review",
      adminUserId,
    );
    return {
      kind: "document" as const,
      document: projectProofDocument(updated),
    };
  }

  private async integration(id?: string) {
    const row = await this.repository.getIntegration(
      uuid(id, "Proof integration ID"),
    );
    if (!row) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof integration record was not found.",
        404,
      );
    }
    return row;
  }
  private async asset(id?: string) {
    const row = await this.repository.getAsset(
      uuid(id, "Proof document asset ID"),
    );
    if (!row) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof document mapping was not found.",
        404,
      );
    }
    return row;
  }
  private assertIntegration(
    row: ProofTransactionRecord,
    requestedServiceId?: string,
  ) {
    if (
      requestedServiceId &&
      uuid(requestedServiceId, "APS request ID") !== row.service_request_id
    ) {
      throw readiness(
        "The Proof integration does not belong to the selected APS request.",
      );
    }
    if (row.workflow_category !== "aps_originated") {
      throw readiness(
        "Proof ODN transactions cannot receive APS document uploads.",
      );
    }
    if (row.environment !== this.environment) {
      throw readiness(
        "The Proof integration environment does not match runtime configuration.",
      );
    }
    if (
      !row.proof_transaction_id || row.creation_state !== "created" ||
      !row.is_active
    ) {
      throw readiness(
        "A confirmed active Proof draft transaction is required.",
      );
    }
  }
  private assertLocalEditable(row: ProofTransactionRecord) {
    if (
      !(row.proof_status === "started" ||
        row.provider_detailed_status === "draft")
    ) {
      throw readiness(
        "The stored Proof transaction state is not document-editable.",
      );
    }
  }
  private async assertRonRequest(serviceRequestId: string) {
    const request = await this.repository.getServiceRequest(serviceRequestId);
    if (!request) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "APS request was not found.",
        404,
      );
    }
    if (request.service_type !== "ron") {
      throw readiness(
        "Only Remote Online Notary requests can upload Proof documents.",
      );
    }
  }
  private async requiredFile(id: string, serviceRequestId: string) {
    const file = await this.repository.getRequestFile(id);
    if (!file) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "APS source document was not found.",
        404,
      );
    }
    if (file.service_request_id !== serviceRequestId) {
      throw readiness("The APS source document belongs to another request.");
    }
    const reason = metadataIneligibility(file);
    if (reason) throw readiness(reason);
    return file;
  }
  private async sync(
    asset: ProofDocumentAssetRecord,
    provider: ProofProviderDocument,
    adminUserId: string,
    extra: Record<string, unknown> = {},
  ) {
    const state = normalizeProcessing(provider.processingState);
    return await this.repository.update(asset.id, {
      proof_asset_id: provider.id,
      proof_status: provider.processingState,
      processing_state: state,
      provider_created_at: provider.createdAt,
      provider_updated_at: provider.updatedAt,
      last_synced_at: new Date().toISOString(),
      processed_at: state === "complete" ? new Date().toISOString() : null,
      upload_state: state === "complete"
        ? "processed"
        : state === "failed"
        ? "processing_failed"
        : asset.upload_state,
      updated_by: adminUserId,
      ...extra,
    });
  }
  private async audit(
    asset: ProofDocumentAssetRecord,
    command: ProofDocumentCommand,
    outcome: string,
    adminUserId: string,
    error?: ProofError,
  ) {
    await this.repository.logAttempt({
      integrationId: asset.proof_transaction_record_id,
      assetId: asset.id,
      requestFileId: asset.source_request_file_id,
      command,
      outcome,
      adminUserId,
      providerStatus: error?.providerStatus,
      errorCode: error?.code,
      providerTraceId: error?.providerRequestId,
    }).catch(() => undefined);
    proofLogger.idempotency({
      asset_id: asset.id,
      request_file_id: asset.source_request_file_id,
      command,
      outcome,
      file_size: asset.byte_size,
      checksum_prefix: asset.sha256.slice(0, 8),
      tracking_id_suffix: asset.tracking_id.slice(-6),
      provider_status: error?.providerStatus,
      processing_state: asset.processing_state,
    });
  }
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
    ),
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function stableTrackingId(integrationId: string, requestFileId: string) {
  return `aps:proof_document:${uuid(integrationId, "Proof integration ID")}:${
    uuid(requestFileId, "APS request file ID")
  }`;
}
function metadataIneligibility(file: RequestFileRecord): string | null {
  if (file.is_active === false) return "The APS source document is inactive.";
  if (
    file.file_type?.toLowerCase() !== "application/pdf" ||
    !file.file_name.toLowerCase().endsWith(".pdf")
  ) return "Only verified PDF source documents are eligible.";
  if (
    !file.file_path || file.file_path.startsWith("/") ||
    file.file_path.includes("..")
  ) return "The APS storage path is not verified.";
  if (
    file.document_category &&
    /identity|id[-_ ]?document|completed/i.test(file.document_category)
  ) return "Identity and completed documents require separate approval.";
  if (
    file.file_size !== null &&
    (file.file_size <= 0 || file.file_size > APS_DOCUMENT_MAX_BYTES ||
      file.file_size > PROOF_DOCUMENT_MAX_BYTES)
  ) return "The PDF exceeds the approved APS or Proof size limit.";
  return null;
}
function validateBytes(bytes: Uint8Array, file: RequestFileRecord) {
  if (!bytes.byteLength) throw readiness("The APS source document is empty.");
  if (
    bytes.byteLength > APS_DOCUMENT_MAX_BYTES ||
    bytes.byteLength > PROOF_DOCUMENT_MAX_BYTES
  ) throw readiness("The PDF exceeds the approved APS or Proof size limit.");
  if (file.file_size !== null && file.file_size !== bytes.byteLength) {
    throw readiness(
      "The stored APS file size does not match the source object.",
    );
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw readiness("The source object is not a verified PDF.");
  }
}
function validateFlags(
  input?: Partial<ProofDocumentFlags>,
): ProofDocumentFlags {
  if (!input || !PROOF_REQUIREMENTS.includes(input.requirement as never)) {
    throw readiness("An explicit supported document requirement is required.");
  }
  const requirement = input.requirement!;
  const expected = {
    notarization: requirement === "notarization",
    esign: requirement === "esign",
    identity: requirement === "identity_confirmation",
  };
  if (
    Boolean(input.notarizationRequired) !== expected.notarization ||
    Boolean(input.esignRequired) !== expected.esign ||
    Boolean(input.identityConfirmationRequired) !== expected.identity
  ) {
    throw readiness(
      "Document flags do not match the selected Proof requirement.",
    );
  }
  if (requirement === "non_essential" && input.customerCanAnnotate) {
    throw readiness(
      "Non-essential documents cannot allow customer annotation.",
    );
  }
  const bundle = input.bundlePosition ?? null;
  if (bundle !== null && (!Number.isInteger(bundle) || bundle < 0)) {
    throw readiness("Bundle position must be a non-negative integer.");
  }
  return {
    requirement,
    notarizationRequired: expected.notarization,
    esignRequired: expected.esign,
    identityConfirmationRequired: expected.identity,
    witnessRequired: Boolean(input.witnessRequired),
    signingRequiresMeeting: Boolean(input.signingRequiresMeeting),
    customerCanAnnotate: Boolean(input.customerCanAnnotate),
    bundlePosition: bundle,
  };
}
function isEditable(transaction: ProofProviderTransaction) {
  return transaction.status === "started" ||
    transaction.detailedStatus === "draft";
}
function findProviderDocument(
  asset: ProofDocumentAssetRecord,
  documents: ProofProviderDocument[],
) {
  return documents.find((document) =>
    asset.proof_asset_id
      ? document.id === asset.proof_asset_id
      : document.trackingId === asset.tracking_id
  );
}
function normalizeProcessing(value: string) {
  const state = value.toLowerCase();
  if (["complete", "completed", "ready", "processed"].includes(state)) {
    return "complete";
  }
  if (["failed", "error", "rejected"].includes(state)) return "failed";
  if (["pending", "uploaded", "queued"].includes(state)) return "pending";
  if (["processing", "in_progress"].includes(state)) return "processing";
  return "unknown";
}
function safeName(value: string) {
  return value.replace(/[\r\n\0]/g, "").slice(0, 255) || "document.pdf";
}
function uuid(value: string | undefined, label: string) {
  const text = String(value ?? "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(text)
  ) throw readiness(`${label} is required and must be a valid UUID.`);
  return text;
}
function readiness(message: string) {
  return new ProofError("PROOF_READINESS_ERROR", message, 422);
}
