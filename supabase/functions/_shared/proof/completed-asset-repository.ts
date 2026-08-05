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
