import { ProofClient, type ProofRequestOptions } from "./client.ts";
import { ProofError } from "./errors.ts";

export interface ProofTransport {
  request<T>(path: string, options?: ProofRequestOptions): Promise<T>;
}

export interface ProofOrganization {
  id: string;
  name: string | null;
}

export interface ProofProviderTransaction {
  id: string;
  externalId: string | null;
  status: string | null;
  detailedStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateDraftInput {
  externalId: string;
  signerEmail: string;
}

export class ProofService {
  constructor(private readonly client: ProofTransport = new ProofClient()) {}

  async getOrganization(): Promise<ProofOrganization> {
    const data = await this.client.request<unknown>("/v1/organization", {
      method: "GET",
      retry: true,
    });
    const object = asObject(data);
    const id = safeString(object.id ?? object.organization_id);
    if (!id) {
      throw malformed(
        "Proof organization response did not include an identifier.",
      );
    }
    return { id, name: safeString(object.name ?? object.organization_name) };
  }

  async createDraftTransaction(
    input: CreateDraftInput,
  ): Promise<ProofProviderTransaction> {
    const data = await this.client.request<unknown>("/v1/transactions", {
      method: "POST",
      retry: false,
      json: {
        draft: true,
        external_id: input.externalId,
        signer: { email: input.signerEmail },
      },
    });
    return sanitizeTransaction(data, true);
  }

  async getTransaction(
    transactionId: string,
  ): Promise<ProofProviderTransaction> {
    assertProviderId(transactionId);
    const data = await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(transactionId)}`,
      { method: "GET", retry: true },
    );
    return sanitizeTransaction(data, false);
  }

  async deleteDraftTransaction(
    transactionId: string,
  ): Promise<{ deleted: true }> {
    assertProviderId(transactionId);
    await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(transactionId)}`,
      { method: "DELETE", retry: false },
    );
    return { deleted: true };
  }
}

export function sanitizeTransaction(
  data: unknown,
  createResponse: boolean,
): ProofProviderTransaction {
  const object = asObject(data);
  const id = safeString(object.id);
  if (!id) {
    throw new ProofError(
      "PROOF_MALFORMED_RESPONSE",
      "Proof returned a transaction without an identifier.",
      502,
      false,
      undefined,
      undefined,
      createResponse,
    );
  }
  assertProviderId(id);
  return {
    id,
    externalId: safeString(object.external_id),
    status: safeString(object.status),
    detailedStatus: safeString(object.detailed_status),
    createdAt: safeTimestamp(object.date_created),
    updatedAt: safeTimestamp(object.date_updated),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw malformed("Proof returned an invalid response shape.");
  }
  return value as Record<string, unknown>;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 5000)
    : null;
}

function safeTimestamp(value: unknown): string | null {
  const text = safeString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function malformed(message: string): ProofError {
  return new ProofError("PROOF_MALFORMED_RESPONSE", message, 502);
}

function assertProviderId(value: string) {
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(value)) {
    throw new ProofError(
      "PROOF_VALIDATION_ERROR",
      "The Proof transaction identifier is invalid.",
      400,
    );
  }
}
