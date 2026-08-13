import { ProofError } from "./errors.ts";
import type { CompletedAssetRecord } from "./completed-asset-types.ts";
import type { ProofTransactionRecord } from "./transaction-types.ts";

export interface CompletedAssetRepository {
  integration(id: string): Promise<ProofTransactionRecord | null>;
  asset(id: string): Promise<CompletedAssetRecord | null>;
  list(id: string): Promise<CompletedAssetRecord[]>;
  source(
    id: string,
  ): Promise<{ id: string; proof_asset_id: string; file_name: string } | null>;
  claim(values: Record<string, unknown>): Promise<CompletedAssetRecord | null>;
  update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<CompletedAssetRecord>;
  store(path: string, bytes: Uint8Array): Promise<void>;
  stageForReview(
    asset: CompletedAssetRecord,
    serviceRequestId: string,
  ): Promise<string>;
}
export class SupabaseCompletedAssetRepository
  implements CompletedAssetRepository {
  private url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  private key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  constructor() {
    if (!this.url || !this.key) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "Proof completed-asset storage is unavailable.",
        503,
      );
    }
  }
  async integration(id: string) {
    return (await this.rows<ProofTransactionRecord>(
      `proof_transactions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    ))[0] ?? null;
  }
  async asset(id: string) {
    return (await this.rows<CompletedAssetRecord>(
      `proof_transaction_assets?select=*&id=eq.${
        encodeURIComponent(id)
      }&limit=1`,
    ))[0] ?? null;
  }
  async list(id: string) {
    return this.rows<CompletedAssetRecord>(
      `proof_transaction_assets?select=*&proof_transaction_record_id=eq.${
        encodeURIComponent(id)
      }&asset_type=in.(completed_document,audit_trail)&order=created_at.asc`,
    );
  }
  async source(id: string) {
    return (await this.rows<
      { id: string; proof_asset_id: string; file_name: string }
    >(`proof_transaction_assets?select=id,proof_asset_id,file_name&id=eq.${
      encodeURIComponent(id)
    }&asset_type=eq.source_document&limit=1`))[0] ?? null;
  }
  async claim(values: Record<string, unknown>) {
    const response = await this.request("proof_transaction_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(values),
    });
    if (response.status === 409) return null;
    return (await this.read<CompletedAssetRecord>(response))[0] ?? null;
  }
  async update(id: string, patch: Record<string, unknown>) {
    const rows = await this.read<CompletedAssetRecord>(
      await this.request(
        `proof_transaction_assets?id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            ...patch,
            updated_at: new Date().toISOString(),
          }),
        },
      ),
    );
    if (!rows[0]) throw missing();
    return rows[0];
  }
  async store(path: string, bytes: Uint8Array) {
    const response = await fetch(
      `${this.url}/storage/v1/object/proof-assets/${
        path.split("/").map(encodeURIComponent).join("/")
      }`,
      {
        method: "POST",
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/pdf",
          "x-upsert": "false",
        },
        body: bytes.slice().buffer,
        redirect: "error",
      },
    );
    if (!response.ok && response.status !== 409) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS protected storage rejected the completed asset.",
        500,
        true,
      );
    }
  }
  async stageForReview(asset: CompletedAssetRecord, serviceRequestId: string) {
    if (
      asset.retrieval_state !== "retrieved" || !asset.storage_path ||
      asset.storage_bucket !== "proof-assets"
    ) {
      throw new ProofError(
        "PROOF_READINESS_ERROR",
        "Retrieve the completed Proof asset before staging it for APS review.",
        422,
      );
    }
    const destination = `${serviceRequestId}/proof-completed/${asset.id}.pdf`;
    const existing = await this.rows<{ id: string }>(
      `request_files?select=id&service_request_id=eq.${serviceRequestId}&file_path=eq.${
        encodeURIComponent(destination)
      }&limit=1`,
    );
    if (existing[0]) return existing[0].id;
    const source = await fetch(
      `${this.url}/storage/v1/object/proof-assets/${
        asset.storage_path.split("/").map(encodeURIComponent).join("/")
      }`,
      { headers: { apikey: this.key, Authorization: `Bearer ${this.key}` } },
    );
    if (!source.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not read the protected completed asset.",
        500,
        true,
      );
    }
    const bytes = new Uint8Array(await source.arrayBuffer());
    const stored = await fetch(
      `${this.url}/storage/v1/object/service-request-files/${
        destination.split("/").map(encodeURIComponent).join("/")
      }`,
      {
        method: "POST",
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/pdf",
          "x-upsert": "false",
        },
        body: bytes,
      },
    );
    if (!stored.ok && stored.status !== 409) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not stage the completed document for review.",
        500,
        true,
      );
    }
    const response = await this.request("request_files", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        service_request_id: serviceRequestId,
        file_name: asset.file_name || "Completed Notarized Document.pdf",
        file_path: destination,
        file_type: "application/pdf",
        file_size: bytes.byteLength,
        uploaded_by: "proof",
        document_category: "proof-completed",
        document_classification: asset.asset_type === "completed_document"
          ? "completed_notarized_document"
          : "internal_document",
        customer_visible: false,
        eligible_for_delivery: false,
        review_state: "pending",
        is_active: true,
        content_fingerprint: asset.sha256,
      }),
    });
    const rows = await this.read<{ id: string }>(response);
    if (!rows[0]) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not create the review document record.",
        500,
        true,
      );
    }
    return rows[0].id;
  }
  private request(path: string, init: RequestInit = {}) {
    return fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }
  private async rows<T>(path: string) {
    return this.read<T>(await this.request(path));
  }
  private async read<T>(response: Response): Promise<T[]> {
    if (!response.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not persist completed-asset state.",
        500,
        true,
      );
    }
    return await response.json() as T[];
  }
}
function missing() {
  return new ProofError(
    "PROOF_NOT_FOUND",
    "Proof completed asset was not found.",
    404,
  );
}
