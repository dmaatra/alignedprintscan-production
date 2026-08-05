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
  signers?: ProofProviderSigner[];
}

export interface ProofProviderSigner {
  id: string | null;
  externalId: string | null;
  status: string | null;
  accessLinkPresent: boolean;
}

export interface ConfigureSignerInput {
  email: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  externalId: string;
  order: number;
  entity?: string | null;
  capacity?: string | null;
}

export interface CreateDraftInput {
  externalId: string;
  signerEmail: string;
}

export interface AddDocumentInput {
  transactionId: string;
  filename: string;
  bytes: Uint8Array;
  trackingId: string;
  requirement:
    | "notarization"
    | "esign"
    | "identity_confirmation"
    | "readonly"
    | "non_essential";
  notarizationRequired: boolean;
  esignRequired: boolean;
  identityConfirmationRequired: boolean;
  witnessRequired: false;
  signingRequiresMeeting: boolean;
  customerCanAnnotate: boolean;
  bundlePosition: number | null;
}

export interface ProofProviderDocument {
  id: string;
  trackingId: string | null;
  processingState: string;
  createdAt: string | null;
  updatedAt: string | null;
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

  async configureTransactionSigners(
    transactionId: string,
    signers: ConfigureSignerInput[],
  ): Promise<ProofProviderTransaction> {
    assertProviderId(transactionId);
    const data = await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(transactionId)}`,
      {
        method: "PUT",
        retry: false,
        json: {
          draft: true,
          signers: signers.map((signer) => ({
            email: signer.email,
            first_name: signer.firstName || undefined,
            middle_name: signer.middleName || undefined,
            last_name: signer.lastName || undefined,
            external_id: signer.externalId,
            order: signer.order,
            entity: signer.entity || undefined,
            capacity: signer.capacity || undefined,
          })),
        },
      },
    );
    return sanitizeTransaction(data, true);
  }

  async activateDraftTransaction(
    transactionId: string,
  ): Promise<ProofProviderTransaction> {
    assertProviderId(transactionId);
    const data = await this.client.request<unknown>(
      `/v1/transactions/${
        encodeURIComponent(transactionId)
      }/notarization_ready`,
      {
        method: "POST",
        retry: false,
        json: { suppress_email: false },
      },
    );
    return sanitizeTransaction(data, true);
  }

  async addDocument(input: AddDocumentInput): Promise<ProofProviderDocument> {
    assertProviderId(input.transactionId);
    const form = new FormData();
    form.set(
      "resource",
      new Blob([input.bytes.slice().buffer], { type: "application/pdf" }),
      input.filename,
    );
    form.set("filename", input.filename);
    form.set("tracking_id", input.trackingId);
    form.set("requirement", input.requirement);
    form.set("notarization_required", String(input.notarizationRequired));
    form.set("esign_required", String(input.esignRequired));
    form.set(
      "identity_confirmation_required",
      String(input.identityConfirmationRequired),
    );
    form.set("witness_required", "false");
    form.set("signing_requires_meeting", String(input.signingRequiresMeeting));
    form.set("customer_can_annotate", String(input.customerCanAnnotate));
    if (input.bundlePosition !== null) {
      form.set("bundle_position", String(input.bundlePosition));
    }
    const data = await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(input.transactionId)}/documents`,
      { method: "POST", formData: form, retry: false },
    );
    return sanitizeDocument(data, true);
  }

  async getTransactionDocumentMetadata(
    transactionId: string,
  ): Promise<ProofProviderDocument[]> {
    const transaction = await this.getTransactionWithDocuments(transactionId);
    return transaction.documents;
  }

  private async getTransactionWithDocuments(
    transactionId: string,
  ): Promise<{ documents: ProofProviderDocument[] }> {
    assertProviderId(transactionId);
    const data = await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(transactionId)}`,
      { method: "GET", retry: true },
    );
    const object = asObject(data);
    const documents = Array.isArray(object.documents) ? object.documents : [];
    return {
      documents: documents.map((document) => sanitizeDocument(document, false)),
    };
  }
}

export function sanitizeDocument(
  data: unknown,
  uploadResponse: boolean,
): ProofProviderDocument {
  const object = asObject(data);
  const id = safeString(object.id ?? object.document_id);
  if (!id) {
    throw new ProofError(
      "PROOF_MALFORMED_RESPONSE",
      "Proof returned a document without an identifier.",
      502,
      false,
      undefined,
      undefined,
      uploadResponse,
    );
  }
  assertProviderId(id);
  return {
    id,
    trackingId: safeString(object.tracking_id),
    processingState: safeString(object.processing_state ?? object.status) ??
      "unknown",
    createdAt: safeTimestamp(object.date_created ?? object.created_at),
    updatedAt: safeTimestamp(object.date_updated ?? object.updated_at),
  };
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
    signers: Array.isArray(object.signers)
      ? object.signers.map(sanitizeSigner)
      : [],
  };
}

function sanitizeSigner(value: unknown): ProofProviderSigner {
  const signer = asObject(value);
  return {
    id: safeString(signer.id ?? signer.signer_id),
    externalId: safeString(signer.external_id),
    status: safeString(signer.status),
    accessLinkPresent: Boolean(
      signer.transaction_access_link ?? signer.access_link,
    ),
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
