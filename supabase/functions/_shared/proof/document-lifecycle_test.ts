import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  ProofDocumentLifecycle,
  sha256,
  stableTrackingId,
} from "./document-lifecycle.ts";
import { ProofError } from "./errors.ts";
import { sanitizeProofLogValue } from "./logger.ts";
import type {
  ProofDocumentAssetRecord,
  RequestFileRecord,
} from "./document-types.ts";
import type { ProofTransactionRecord } from "./transaction-types.ts";

const ids = {
  request: "11111111-1111-4111-8111-111111111111",
  integration: "22222222-2222-4222-8222-222222222222",
  file: "33333333-3333-4333-8333-333333333333",
  asset: "44444444-4444-4444-8444-444444444444",
  admin: "55555555-5555-4555-8555-555555555555",
};
const pdf = new TextEncoder().encode("%PDF-1.7\nmock only");
const flags = {
  requirement: "notarization" as const,
  notarizationRequired: true,
  esignRequired: false,
  identityConfirmationRequired: false,
  witnessRequired: false,
  signingRequiresMeeting: true,
  customerCanAnnotate: false,
  bundlePosition: 0,
};

function integration(
  patch: Partial<ProofTransactionRecord> = {},
): ProofTransactionRecord {
  return {
    id: ids.integration,
    service_request_id: ids.request,
    proof_transaction_id: "ot_mock",
    idempotency_key: "k",
    workflow_category: "aps_originated",
    environment: "production",
    external_id: `aps:service_request:${ids.request}`,
    creation_state: "created",
    proof_status: "started",
    provider_detailed_status: "draft",
    aps_status: "preparing",
    is_active: true,
    creation_attempt_count: 1,
    claim_acquired_at: new Date().toISOString(),
    request_dispatched_at: null,
    ambiguous_at: null,
    provider_created_at: null,
    provider_updated_at: null,
    last_synced_at: null,
    deleted_at: null,
    cancelled_at: null,
    last_error_code: null,
    last_error_message: null,
    manual_review_reason: null,
    last_command: null,
    last_command_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  };
}
function file(patch: Partial<RequestFileRecord> = {}): RequestFileRecord {
  return {
    id: ids.file,
    service_request_id: ids.request,
    file_name: "source.pdf",
    file_path: `${ids.request}/documents/source.pdf`,
    file_type: "application/pdf",
    file_size: pdf.byteLength,
    document_category: "source",
    is_active: true,
    ...patch,
  };
}
async function asset(
  patch: Partial<ProofDocumentAssetRecord> = {},
): Promise<ProofDocumentAssetRecord> {
  return {
    id: ids.asset,
    proof_transaction_record_id: ids.integration,
    source_request_file_id: ids.file,
    proof_transaction_id: "ot_mock",
    proof_asset_id: null,
    tracking_id: stableTrackingId(ids.integration, ids.file),
    file_name: "source.pdf",
    content_type: "application/pdf",
    byte_size: pdf.byteLength,
    sha256: await sha256(pdf),
    upload_state: "claimed",
    dispatch_state: "not_dispatched",
    processing_state: "not_uploaded",
    dispatch_attempt_count: 0,
    requirement: "notarization",
    notarization_required: true,
    esign_required: false,
    identity_confirmation_required: false,
    witness_required: false,
    signing_requires_meeting: true,
    customer_can_annotate: false,
    bundle_position: 0,
    retry_eligible: false,
    manual_review_reason: null,
    last_error_code: null,
    last_error_message: null,
    uploaded_at: null,
    processed_at: null,
    last_synced_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  };
}

class Repo {
  integration = integration();
  file = file();
  asset: ProofDocumentAssetRecord | null = null;
  bytes = pdf;
  claimConflict = false;
  audits: unknown[] = [];
  async getIntegration() {
    return this.integration;
  }
  async getServiceRequest() {
    return { id: ids.request, service_type: "ron" };
  }
  async getRequestFiles() {
    return [this.file];
  }
  async getRequestFile() {
    return this.file;
  }
  async downloadSource() {
    return this.bytes;
  }
  async findAsset() {
    return this.asset;
  }
  async getAsset() {
    return this.asset;
  }
  async listAssets() {
    return this.asset ? [this.asset] : [];
  }
  async claim(values: Record<string, unknown>) {
    if (this.claimConflict) return null;
    this.asset = { ...(await asset()), ...values } as ProofDocumentAssetRecord;
    return this.asset;
  }
  async update(_id: string, patch: Record<string, unknown>) {
    this.asset = { ...this.asset!, ...patch } as ProofDocumentAssetRecord;
    return this.asset;
  }
  async logAttempt(value: unknown) {
    this.audits.push(value);
  }
}
class Service {
  addCalls = 0;
  addError: unknown = null;
  state = "processing";
  documents: Array<
    {
      id: string;
      trackingId: string | null;
      processingState: string;
      createdAt: string | null;
      updatedAt: string | null;
    }
  > = [];
  async getTransaction() {
    return {
      id: "ot_mock",
      externalId: null,
      status: "started",
      detailedStatus: "draft" as string | null,
      createdAt: null,
      updatedAt: null,
    };
  }
  async addDocument() {
    this.addCalls++;
    if (this.addError) throw this.addError;
    return {
      id: "doc_mock",
      trackingId: stableTrackingId(ids.integration, ids.file),
      processingState: this.state,
      createdAt: null,
      updatedAt: null,
    };
  }
  async getTransactionDocumentMetadata() {
    return this.documents;
  }
}
function lifecycle(repo = new Repo(), service = new Service()) {
  return {
    repo,
    service,
    value: new ProofDocumentLifecycle(repo, service, "production"),
  };
}

Deno.test("eligible PDF listed", async () => {
  const { value } = lifecycle();
  const result = await value.execute({
    command: "list_eligible_source_documents",
    integrationId: ids.integration,
    serviceRequestId: ids.request,
  }, ids.admin);
  assertEquals(result.kind, "eligible_documents");
  if (result.kind === "eligible_documents") {
    assertEquals(result.documents[0].eligible, true);
  }
});
Deno.test("unrelated request file blocked", async () => {
  const x = lifecycle();
  x.repo.file = file({ service_request_id: crypto.randomUUID() });
  await assertRejects(
    () =>
      x.value.execute({
        command: "prepare_upload",
        integrationId: ids.integration,
        requestFileId: ids.file,
        flags,
      }, ids.admin),
    ProofError,
  );
});
Deno.test("non-PDF blocked", async () => {
  const x = lifecycle();
  x.repo.file = file({ file_type: "image/png", file_name: "scan.png" });
  await assertRejects(
    () =>
      x.value.execute({
        command: "prepare_upload",
        integrationId: ids.integration,
        requestFileId: ids.file,
        flags,
      }, ids.admin),
    ProofError,
  );
});
Deno.test("oversized PDF blocked", async () => {
  const x = lifecycle();
  x.repo.file = file({ file_size: 10 * 1024 * 1024 + 1 });
  await assertRejects(
    () =>
      x.value.execute({
        command: "prepare_upload",
        integrationId: ids.integration,
        requestFileId: ids.file,
        flags,
      }, ids.admin),
    ProofError,
  );
});
Deno.test("missing storage object blocked", async () => {
  const x = lifecycle();
  x.repo.downloadSource = () =>
    Promise.reject(new ProofError("PROOF_NOT_FOUND", "missing", 404));
  await assertRejects(
    () =>
      x.value.execute({
        command: "prepare_upload",
        integrationId: ids.integration,
        requestFileId: ids.file,
        flags,
      }, ids.admin),
    ProofError,
  );
});
Deno.test("valid SHA-256 calculation", async () =>
  assertEquals(
    await sha256(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ));
Deno.test("stable tracking ID", () =>
  assertEquals(
    stableTrackingId(ids.integration, ids.file),
    stableTrackingId(ids.integration, ids.file),
  ));
Deno.test("upload success persists provider ID", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  const result = await x.value.execute({
    command: "upload_source_document",
    assetId: ids.asset,
    serviceRequestId: ids.request,
  }, ids.admin);
  assertEquals(x.service.addCalls, 1);
  if (result.kind === "document") {
    assertEquals(result.document.providerDocumentId, "doc_mock");
  }
});
Deno.test("duplicate click returns existing asset", async () => {
  const x = lifecycle();
  x.repo.asset = await asset({
    upload_state: "uploaded",
    proof_asset_id: "doc_mock",
  });
  const result = await x.value.execute({
    command: "upload_source_document",
    assetId: ids.asset,
  }, ids.admin);
  assertEquals(x.service.addCalls, 0);
  if (result.kind === "document") assertEquals(result.duplicate, true);
});
Deno.test("concurrent upload claim returns winner", async () => {
  const x = lifecycle();
  x.repo.claimConflict = true;
  x.repo.asset = await asset();
  const result = await x.value.execute({
    command: "prepare_upload",
    integrationId: ids.integration,
    requestFileId: ids.file,
    flags,
  }, ids.admin);
  if (result.kind === "document") assertEquals(result.duplicate, true);
});
Deno.test("provider 422 is confirmed and retry eligible", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  x.service.addError = new ProofError(
    "PROOF_VALIDATION_ERROR",
    "rejected",
    422,
    false,
    422,
  );
  await assertRejects(
    () =>
      x.value.execute(
        { command: "upload_source_document", assetId: ids.asset },
        ids.admin,
      ),
    ProofError,
  );
  assertEquals(x.repo.asset?.upload_state, "rejected");
  assertEquals(x.repo.asset?.retry_eligible, true);
});
Deno.test("provider 429 upload is not retried", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  x.service.addError = new ProofError(
    "PROOF_RATE_LIMITED",
    "limited",
    503,
    false,
    429,
  );
  await assertRejects(
    () =>
      x.value.execute(
        { command: "upload_source_document", assetId: ids.asset },
        ids.admin,
      ),
    ProofError,
  );
  assertEquals(x.service.addCalls, 1);
});
Deno.test("provider 500 upload is not automatically retried", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  x.service.addError = new ProofError(
    "PROOF_PROVIDER_ERROR",
    "down",
    502,
    true,
    500,
    undefined,
    true,
  );
  await assertRejects(
    () =>
      x.value.execute(
        { command: "upload_source_document", assetId: ids.asset },
        ids.admin,
      ),
    ProofError,
  );
  assertEquals(x.service.addCalls, 1);
});
Deno.test("pre-dispatch-safe failure leaves claim", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  x.repo.bytes = new TextEncoder().encode("changed");
  await assertRejects(
    () =>
      x.value.execute(
        { command: "upload_source_document", assetId: ids.asset },
        ids.admin,
      ),
    ProofError,
  );
  assertEquals(x.service.addCalls, 0);
  assertEquals(x.repo.asset?.upload_state, "claimed");
});
Deno.test("ambiguous post-dispatch timeout retains claim", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  x.service.addError = new ProofError("PROOF_TIMEOUT", "timeout", 504, true);
  await assertRejects(
    () =>
      x.value.execute(
        { command: "upload_source_document", assetId: ids.asset },
        ids.admin,
      ),
    ProofError,
  );
  assertEquals(x.repo.asset?.upload_state, "ambiguous");
  assertEquals(x.repo.asset?.retry_eligible, false);
});
Deno.test("processing state refresh", async () => {
  const x = lifecycle();
  x.repo.asset = await asset({
    upload_state: "uploaded",
    proof_asset_id: "doc_mock",
  });
  x.service.documents = [{
    id: "doc_mock",
    trackingId: x.repo.asset.tracking_id,
    processingState: "complete",
    createdAt: null,
    updatedAt: null,
  }];
  const result = await x.value.execute({
    command: "refresh_document",
    assetId: ids.asset,
  }, ids.admin);
  if (result.kind === "document") {
    assertEquals(result.document.processingState, "complete");
  }
});
Deno.test("all-documents refresh", async () => {
  const x = lifecycle();
  x.repo.asset = await asset({
    upload_state: "uploaded",
    proof_asset_id: "doc_mock",
  });
  x.service.documents = [{
    id: "doc_mock",
    trackingId: x.repo.asset.tracking_id,
    processingState: "processing",
    createdAt: null,
    updatedAt: null,
  }];
  const result = await x.value.execute({
    command: "refresh_all_documents",
    integrationId: ids.integration,
  }, ids.admin);
  if (result.kind === "documents") assertEquals(result.documents.length, 1);
});
Deno.test("transaction no longer editable", async () => {
  const x = lifecycle();
  x.repo.asset = await asset();
  x.service.getTransaction = async () => ({
    id: "ot_mock",
    externalId: null,
    status: "completed",
    detailedStatus: null,
    createdAt: null,
    updatedAt: null,
  });
  await assertRejects(
    () =>
      x.value.execute(
        { command: "upload_source_document", assetId: ids.asset },
        ids.admin,
      ),
    ProofError,
  );
});
Deno.test("ODN upload blocked", async () => {
  const x = lifecycle();
  x.repo.integration = integration({ workflow_category: "proof_odn" });
  await assertRejects(
    () =>
      x.value.execute({
        command: "prepare_upload",
        integrationId: ids.integration,
        requestFileId: ids.file,
        flags,
      }, ids.admin),
    ProofError,
  );
});
Deno.test("explicit witness requirement is preserved for Proof upload", async () => {
  const x = lifecycle();
  await x.value.execute({
    command: "prepare_upload",
    integrationId: ids.integration,
    requestFileId: ids.file,
    flags: { ...flags, witnessRequired: true },
  }, ids.admin);
  assertEquals(x.repo.asset?.witness_required, true);
});
Deno.test("document projection contains no storage path or bytes", async () => {
  const x = lifecycle();
  const result = await x.value.execute({
    command: "prepare_upload",
    integrationId: ids.integration,
    requestFileId: ids.file,
    flags,
  }, ids.admin);
  assertEquals(JSON.stringify(result).includes("file_path"), false);
  assertEquals(JSON.stringify(result).includes("%PDF"), false);
});
Deno.test("no activation method exists", () =>
  assertEquals("activate" in ProofDocumentLifecycle.prototype, false));
Deno.test("confirmed rejection requires deliberate retry", async () => {
  const x = lifecycle();
  x.repo.asset = await asset({
    upload_state: "rejected",
    dispatch_state: "rejected",
    retry_eligible: true,
  });
  const first = await x.value.execute({
    command: "upload_source_document",
    assetId: ids.asset,
  }, ids.admin);
  assertEquals(x.service.addCalls, 0);
  if (first.kind === "document") assertEquals(first.duplicate, true);
  await x.value.execute({
    command: "upload_source_document",
    assetId: ids.asset,
    retryConfirmedRejection: true,
  }, ids.admin);
  assertEquals(x.service.addCalls, 1);
});
Deno.test("unsupported flag combination blocked", async () => {
  const x = lifecycle();
  await assertRejects(
    () =>
      x.value.execute({
        command: "prepare_upload",
        integrationId: ids.integration,
        requestFileId: ids.file,
        flags: { ...flags, esignRequired: true },
      }, ids.admin),
    ProofError,
  );
});
Deno.test("document body signed URL and storage path logging redacted", () => {
  const safe = sanitizeProofLogValue({
    document_body: "%PDF-secret",
    signed_url: "https://signed",
    storage_path: "private/path.pdf",
    authorization: "secret",
  });
  assertEquals(safe, {
    document_body: "[REDACTED]",
    signed_url: "[REDACTED]",
    storage_path: "[REDACTED]",
    authorization: "[REDACTED]",
  });
});
