import { ProofError } from "./errors.ts";
import type { ProofTransactionRecord } from "./transaction-types.ts";
import type {
  ProofDocumentAssetRecord,
  ProofDocumentCommand,
  RequestFileRecord,
} from "./document-types.ts";

const BUCKET = "service-request-files";

export interface DocumentAttemptInput {
  integrationId: string;
  assetId?: string;
  serviceRequestId?: string;
  requestFileId?: string;
  command: ProofDocumentCommand;
  outcome: string;
  adminUserId: string;
  providerStatus?: number;
  errorCode?: string;
  providerTraceId?: string;
}

export interface ProofDocumentRepository {
  getServiceRequest(
    id: string,
  ): Promise<{ id: string; service_type: string } | null>;
  getIntegration(id: string): Promise<ProofTransactionRecord | null>;
  getRequestFiles(serviceRequestId: string): Promise<RequestFileRecord[]>;
  getRequestFile(id: string): Promise<RequestFileRecord | null>;
  downloadSource(path: string): Promise<Uint8Array>;
  findAsset(
    integrationId: string,
    requestFileId: string,
  ): Promise<ProofDocumentAssetRecord | null>;
  getAsset(id: string): Promise<ProofDocumentAssetRecord | null>;
  listAssets(integrationId: string): Promise<ProofDocumentAssetRecord[]>;
  claim(
    values: Record<string, unknown>,
  ): Promise<ProofDocumentAssetRecord | null>;
  update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<ProofDocumentAssetRecord>;
  logAttempt(input: DocumentAttemptInput): Promise<void>;
}

export class SupabaseProofDocumentRepository
  implements ProofDocumentRepository {
  private readonly url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  private readonly serviceRole =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  constructor() {
    if (!this.url || !this.serviceRole) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "Proof document storage is not configured.",
        503,
      );
    }
  }
  async getServiceRequest(id: string) {
    return (await this.rows<{ id: string; service_type: string }>(
      `service_requests?select=id,service_type&id=eq.${
        encodeURIComponent(id)
      }&limit=1`,
    ))[0] ?? null;
  }
  async getIntegration(id: string) {
    return (await this.rows<ProofTransactionRecord>(
      `proof_transactions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    ))[0] ?? null;
  }
  async getRequestFiles(serviceRequestId: string) {
    return await this.rows<RequestFileRecord>(
      `request_files?select=id,service_request_id,file_name,file_path,file_type,file_size,document_category,is_active&service_request_id=eq.${
        encodeURIComponent(serviceRequestId)
      }&is_active=eq.true&order=created_at.asc`,
    );
  }
  async getRequestFile(id: string) {
    return (await this.rows<RequestFileRecord>(
      `request_files?select=id,service_request_id,file_name,file_path,file_type,file_size,document_category,is_active&id=eq.${
        encodeURIComponent(id)
      }&limit=1`,
    ))[0] ?? null;
  }
  async downloadSource(path: string): Promise<Uint8Array> {
    const response = await fetch(
      `${this.url}/storage/v1/object/${BUCKET}/${encodeStoragePath(path)}`,
      {
        headers: {
          apikey: this.serviceRole,
          Authorization: `Bearer ${this.serviceRole}`,
        },
        redirect: "error",
      },
    );
    if (response.status === 404) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "The APS source document is missing from storage.",
        404,
      );
    }
    if (!response.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not retrieve the source document.",
        502,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  async findAsset(integrationId: string, requestFileId: string) {
    return (await this.rows<ProofDocumentAssetRecord>(
      `proof_transaction_assets?select=*&proof_transaction_record_id=eq.${
        encodeURIComponent(integrationId)
      }&source_request_file_id=eq.${encodeURIComponent(requestFileId)}&limit=1`,
    ))[0] ?? null;
  }
  async getAsset(id: string) {
    return (await this.rows<ProofDocumentAssetRecord>(
      `proof_transaction_assets?select=*&id=eq.${
        encodeURIComponent(id)
      }&limit=1`,
    ))[0] ?? null;
  }
  async listAssets(integrationId: string) {
    return await this.rows<ProofDocumentAssetRecord>(
      `proof_transaction_assets?select=*&proof_transaction_record_id=eq.${
        encodeURIComponent(integrationId)
      }&asset_type=eq.source_document&order=created_at.asc`,
    );
  }
  async claim(values: Record<string, unknown>) {
    const response = await this.request("proof_transaction_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(values),
    });
    if (response.status === 409) return null;
    return (await this.readRows<ProofDocumentAssetRecord>(response))[0] ?? null;
  }
  async update(id: string, patch: Record<string, unknown>) {
    const response = await this.request(
      `proof_transaction_assets?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...patch,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    const row = (await this.readRows<ProofDocumentAssetRecord>(response))[0];
    if (!row) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof document mapping was not found.",
        404,
      );
    }
    return row;
  }
  async logAttempt(input: DocumentAttemptInput) {
    const serviceRequestId = input.serviceRequestId ??
      (await this.getIntegration(input.integrationId))?.service_request_id;
    if (!serviceRequestId) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof integration audit context was not found.",
        404,
      );
    }
    const response = await this.request("proof_document_command_attempts", {
      method: "POST",
      body: JSON.stringify({
        proof_transaction_record_id: input.integrationId,
        proof_transaction_asset_id: input.assetId ?? null,
        service_request_id: serviceRequestId,
        request_file_id: input.requestFileId ?? null,
        command: input.command,
        outcome: input.outcome,
        admin_user_id: input.adminUserId,
        provider_status: input.providerStatus ?? null,
        normalized_error_code: input.errorCode ?? null,
        provider_trace_id: input.providerTraceId ?? null,
      }),
    });
    if (!response.ok) {
      console.warn("Proof document audit logging failed", response.status);
    }
  }
  private request(path: string, init: RequestInit = {}) {
    return fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRole,
        Authorization: `Bearer ${this.serviceRole}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }
  private async rows<T>(path: string) {
    return this.readRows<T>(await this.request(path));
  }
  private async readRows<T>(response: Response): Promise<T[]> {
    if (!response.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not persist Proof document state.",
        500,
      );
    }
    return await response.json() as T[];
  }
}

function encodeStoragePath(path: string): string {
  if (
    !path || path.startsWith("/") || path.includes("..") || path.includes("\\")
  ) {
    throw new ProofError(
      "PROOF_READINESS_ERROR",
      "The APS storage path is not verified.",
      422,
    );
  }
  return path.split("/").map(encodeURIComponent).join("/");
}
