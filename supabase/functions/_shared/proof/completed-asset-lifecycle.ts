import type { CompletedAssetRepository } from "./completed-asset-repository.ts";
import {
  type CompletedAssetInput,
  type CompletedAssetRecord,
  completedProjection,
} from "./completed-asset-types.ts";
import { ProofError } from "./errors.ts";
import { sha256Hex } from "./webhook-security.ts";
import type { ProofRetrievedAsset } from "./service.ts";

export interface CompletedAssetService {
  getCompletedDocument(
    transactionId: string,
    documentId: string,
  ): Promise<ProofRetrievedAsset>;
  getAuditTrail(transactionId: string): Promise<ProofRetrievedAsset>;
}
export class ProofCompletedAssetLifecycle {
  constructor(
    private repository: CompletedAssetRepository,
    private service: CompletedAssetService,
  ) {}
  async execute(input: CompletedAssetInput, admin: string) {
    if (input.command === "list_completed_assets") {
      const tx = await this.integration(input.integrationId);
      return {
        kind: "completed_assets",
        assets: (await this.repository.list(tx.id)).map(completedProjection),
      };
    }
    if (input.command === "mark_asset_manual_review") {
      const asset = await this.asset(input.assetId);
      return {
        kind: "completed_asset",
        asset: completedProjection(
          await this.repository.update(asset.id, {
            retrieval_state: "manual_review",
            availability_state: "manual_review",
            retrieval_manual_review_reason: safeReason(input.reason),
            updated_by: admin,
          }),
        ),
      };
    }
    if (input.command === "refresh_completed_asset_state") {
      const tx = await this.integration(input.integrationId);
      return {
        kind: "completed_assets",
        assets: (await this.repository.list(tx.id)).map(completedProjection),
      };
    }
    if (input.command === "stage_completed_asset") {
      const asset = await this.asset(input.assetId);
      const tx = await this.integration(asset.proof_transaction_record_id);
      this.assertOwned(tx.workflow_category);
      const requestFileId = await this.repository.stageForReview(
        asset,
        tx.service_request_id,
      );
      return {
        kind: "staged_completed_asset",
        asset: completedProjection(asset),
        requestFileId,
      };
    }
    if (input.command === "retrieve_completed_document") {
      return await this.retrieveDocument(input, admin);
    }
    if (input.command === "retrieve_audit_trail") {
      return await this.retrieveAudit(input, admin);
    }
    throw ready("A supported completed-asset command is required.");
  }
  private async retrieveDocument(input: CompletedAssetInput, admin: string) {
    const tx = await this.integration(input.integrationId);
    this.assertOwned(tx.workflow_category);
    if (!tx.completed_assets_available && !tx.released_at) {
      throw ready("Proof has not reported completed documents as released.");
    }
    const source = await this.repository.source(
      required(input.sourceAssetId, "source asset"),
    );
    if (!source?.proof_asset_id) {
      throw ready("The source document has no verified Proof document ID.");
    }
    let asset: CompletedAssetRecord | null | undefined =
      (await this.repository.list(tx.id)).find((x) =>
        x.asset_type === "completed_document" && x.source_asset_id === source.id
      );
    if (asset?.retrieval_state === "retrieved") return result(asset, true);
    asset ??= await this.repository.claim(
      base(
        tx.id,
        tx.proof_transaction_id!,
        "completed_document",
        source.id,
        null,
        source.file_name,
        admin,
      ),
    );
    if (!asset) {
      const raced = (await this.repository.list(tx.id)).find((x) =>
        x.asset_type === "completed_document" && x.source_asset_id === source.id
      );
      if (!raced) throw ready("Completed document claim changed concurrently.");
      return result(raced, true);
    }
    return await this.download(
      asset,
      await this.service.getCompletedDocument(
        tx.proof_transaction_id!,
        source.proof_asset_id,
      ),
      admin,
    );
  }
  private async retrieveAudit(input: CompletedAssetInput, admin: string) {
    const tx = await this.integration(input.integrationId);
    this.assertOwned(tx.workflow_category);
    if (!tx.audit_trail_available && !tx.released_at) {
      throw ready("Proof has not reported the audit trail as available.");
    }
    let asset: CompletedAssetRecord | null | undefined =
      (await this.repository.list(tx.id)).find((x) =>
        x.asset_type === "audit_trail"
      );
    if (asset?.retrieval_state === "retrieved") return result(asset, true);
    asset ??= await this.repository.claim(
      base(
        tx.id,
        tx.proof_transaction_id!,
        "audit_trail",
        null,
        null,
        "Proof Audit Trail.pdf",
        admin,
      ),
    );
    if (!asset) {
      const raced = (await this.repository.list(tx.id)).find((x) =>
        x.asset_type === "audit_trail"
      );
      if (!raced) throw ready("Audit-trail claim changed concurrently.");
      return result(raced, true);
    }
    return await this.download(
      asset,
      await this.service.getAuditTrail(tx.proof_transaction_id!),
      admin,
    );
  }
  private async download(
    asset: CompletedAssetRecord,
    provider: ProofRetrievedAsset,
    admin: string,
  ) {
    validatePdf(provider);
    const checksum = await sha256Hex(provider.bytes);
    const path =
      `${asset.proof_transaction_record_id}/${asset.asset_type}/${asset.id}.pdf`;
    await this.repository.store(path, provider.bytes);
    const saved = await this.repository.update(asset.id, {
      storage_bucket: "proof-assets",
      storage_path: path,
      content_type: "application/pdf",
      byte_size: provider.bytes.byteLength,
      sha256: checksum,
      availability_state: "retrieved",
      retrieval_state: "retrieved",
      retrieved_at: new Date().toISOString(),
      retrieval_attempt_count: asset.retrieval_attempt_count + 1,
      updated_by: admin,
    });
    return result(saved, false);
  }
  private async integration(id?: string) {
    const tx = await this.repository.integration(required(id, "integration"));
    if (!tx?.proof_transaction_id) {
      throw ready("A legitimate stored Proof transaction ID is required.");
    }
    return tx as typeof tx & {
      completed_assets_available?: boolean;
      audit_trail_available?: boolean;
      released_at?: string | null;
    };
  }
  private async asset(id?: string) {
    const row = await this.repository.asset(required(id, "asset"));
    if (!row) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof completed asset was not found.",
        404,
      );
    }
    return row;
  }
  private assertOwned(category: string) {
    if (category !== "aps_originated") {
      throw ready(
        "Proof ODN completed-asset retrieval is blocked without explicit authorization.",
      );
    }
  }
}
function validatePdf(asset: ProofRetrievedAsset) {
  if (
    !asset.contentType.toLowerCase().includes("pdf") ||
    asset.bytes.length < 5 ||
    new TextDecoder().decode(asset.bytes.slice(0, 5)) !== "%PDF-"
  ) throw ready("Proof returned an invalid completed PDF.");
}
function base(
  id: string,
  providerId: string,
  type: string,
  source: string | null,
  proofAsset: string | null,
  name: string,
  admin: string,
) {
  return {
    id: crypto.randomUUID(),
    proof_transaction_record_id: id,
    proof_transaction_id: providerId,
    source_asset_id: source,
    proof_asset_id: proofAsset,
    idempotency_key: `proof-completed:${id}:${type}:${source ?? "audit"}`,
    asset_type: type,
    file_name: name.slice(0, 255),
    availability_state: "available",
    retrieval_state: "claimed",
    retrieval_attempt_count: 0,
    created_by: admin,
    updated_by: admin,
  };
}
function result(asset: CompletedAssetRecord, duplicate: boolean) {
  return {
    kind: "completed_asset",
    asset: completedProjection(asset),
    duplicate,
  };
}
function required(v: string | undefined, name: string) {
  if (!v || !/^[0-9a-f-]{36}$/i.test(v)) {
    throw ready(`A valid ${name} ID is required.`);
  }
  return v;
}
function safeReason(v?: string) {
  if (!v?.trim()) throw ready("A manual-review reason is required.");
  return v.trim().slice(0, 500);
}
function ready(message: string) {
  return new ProofError("PROOF_READINESS_ERROR", message, 422);
}
