import {
  type ProofBinaryResponse,
  ProofClient,
  type ProofRequestOptions,
} from "./client.ts";
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
  email: string | null;
  status: string | null;
  accessLinkPresent: boolean;
  accessLink: string | null;
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
  phone?: { countryCode: string; number: string } | null;
}

export interface DraftEnrichmentInput {
  transactionName?: string | null;
  notaryMeetingTime?: string | null;
  notaryInstructions?: string | null;
  messageToSigner?: string | null;
}

export interface CreateDraftInput {
  externalId: string;
  signerEmail: string;
  transactionName?: string;
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
  witnessRequired: boolean;
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
export interface ProofRetrievedAsset {
  bytes: Uint8Array;
  contentType: string;
}

export interface ProofWebhookSubscription {
  id: string;
  url: string;
  enabled: boolean;
  subscriptions: string[];
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

  async listWebhookSubscriptions(): Promise<ProofWebhookSubscription[]> {
    const data = await this.client.request<unknown>("/v2/webhooks", {
      method: "GET",
      retry: true,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(asObject(data).webhooks)
      ? asObject(data).webhooks as unknown[]
      : [];
    return rows.map(sanitizeWebhookSubscription);
  }

  async createWebhookSubscription(input: {
    url: string;
    subscriptions: string[];
    signingKey: string;
  }): Promise<ProofWebhookSubscription> {
    const data = await this.client.request<unknown>("/v2/webhooks", {
      method: "POST",
      retry: false,
      json: {
        url: input.url,
        subscriptions: input.subscriptions,
        signing_key: input.signingKey,
      },
    });
    return sanitizeWebhookSubscription(data);
  }

  async updateWebhookSubscription(
    id: string,
    input: { url: string; subscriptions: string[]; signingKey: string },
  ): Promise<ProofWebhookSubscription> {
    assertProviderId(id);
    const data = await this.client.request<unknown>(
      `/v2/webhooks/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        retry: false,
        json: {
          url: input.url,
          subscriptions: input.subscriptions,
          signing_key: input.signingKey,
        },
      },
    );
    return sanitizeWebhookSubscription(data);
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
        transaction_name: input.transactionName || undefined,
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
    enrichment: DraftEnrichmentInput = {},
  ): Promise<ProofProviderTransaction> {
    assertProviderId(transactionId);
    const providerSigners = signers.map((signer) => ({
      email: signer.email,
      first_name: signer.firstName || undefined,
      middle_name: signer.middleName || undefined,
      last_name: signer.lastName || undefined,
      external_id: signer.externalId,
      // Proof's signer object defines signing order as a string even though
      // APS keeps it as an integer for stable local sorting.
      order: String(signer.order),
      entity: signer.entity || undefined,
      capacity: signer.capacity || undefined,
      ...(signer.phone
        ? {
          phone: {
            country_code: signer.phone.countryCode,
            number: signer.phone.number,
          },
        }
        : {}),
    }));
    const enrichmentPayload = {
      ...(enrichment.transactionName
        ? { transaction_name: enrichment.transactionName }
        : {}),
      ...(enrichment.notaryMeetingTime
        ? { notary_meeting_time: enrichment.notaryMeetingTime }
        : {}),
      ...(enrichment.notaryInstructions
        ? {
          notary_instructions: [{
            notary_note: enrichment.notaryInstructions,
          }],
        }
        : {}),
      ...(enrichment.messageToSigner
        ? { message_to_signer: enrichment.messageToSigner }
        : {}),
    };
    const data = await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(transactionId)}`,
      {
        method: "PUT",
        retry: false,
        json: {
          draft: true,
          ...enrichmentPayload,
          // Drafts created with Proof's primary `signer` field must continue
          // to use that field when APS enriches a single signer. Sending a
          // one-item `signers` array attempts to add a second signer instead.
          // Proof also validates transaction metadata in the context of the
          // draft's signer set, so keep both in this single supported update.
          ...(providerSigners.length === 1
            ? { signer: providerSigners[0] }
            : { signers: providerSigners }),
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
    form.set("witness_required", String(input.witnessRequired));
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

  async getCompletedDocument(
    transactionId: string,
    documentId: string,
  ): Promise<ProofRetrievedAsset> {
    assertProviderId(transactionId);
    assertProviderId(documentId);
    const data = await this.client.request<unknown>(
      `/v1/transactions/${encodeURIComponent(transactionId)}/documents/${
        encodeURIComponent(documentId)
      }?encoding=base64&document_url_version=v2`,
      { method: "GET", retry: true },
    );
    const object = asObject(data);
    const candidate = object.document ?? object.resource ?? object.data;
    const encoded = typeof candidate === "string" ? candidate.trim() : "";
    if (
      !encoded || encoded.length > 42_000_000 ||
      !/^[A-Za-z0-9+/=\s]+$/.test(encoded)
    ) {
      throw malformed("Proof returned an invalid completed document.");
    }
    try {
      return {
        bytes: Uint8Array.from(
          atob(encoded.replace(/\s/g, "")),
          (c) => c.charCodeAt(0),
        ),
        contentType: "application/pdf",
      };
    } catch {
      throw malformed("Proof returned an unreadable completed document.");
    }
  }

  async getAuditTrail(transactionId: string): Promise<ProofRetrievedAsset> {
    assertProviderId(transactionId);
    const result = await this.client.request<ProofBinaryResponse>(
      `/v1/transactions/${
        encodeURIComponent(transactionId)
      }/assets/audit_trail`,
      {
        method: "GET",
        retry: true,
        responseType: "bytes",
        headers: { Accept: "application/pdf" },
      },
    );
    return {
      bytes: result.bytes,
      contentType: result.contentType ?? "application/pdf",
    };
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

export function sanitizeWebhookSubscription(
  data: unknown,
): ProofWebhookSubscription {
  const object = asObject(data);
  const id = safeString(object.id ?? object.webhook_id);
  const url = safeString(object.url);
  if (!id || !url) {
    throw malformed("Proof returned an invalid webhook subscription.");
  }
  assertProviderId(id);
  const subscriptions = Array.isArray(object.subscriptions)
    ? object.subscriptions.map(safeString).filter((value): value is string =>
      Boolean(value)
    )
    : [];
  return {
    id,
    url,
    enabled: object.enabled === true,
    subscriptions,
  };
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
      : object.signer && typeof object.signer === "object"
      ? [sanitizeSigner(object.signer)]
      : object.signer_info && typeof object.signer_info === "object"
      ? [
        sanitizeSigner(object.signer_info),
        ...(object.cosigner_info && typeof object.cosigner_info === "object"
          ? [sanitizeSigner(object.cosigner_info)]
          : []),
      ]
      : [],
  };
}

function sanitizeSigner(value: unknown): ProofProviderSigner {
  const signer = asObject(value);
  const accessLink = safeProofAccessLink(
    signer.transaction_access_link ?? signer.access_link,
  );
  return {
    id: safeString(signer.id ?? signer.signer_id),
    externalId: safeString(signer.external_id),
    email: safeString(signer.email)?.toLowerCase() ?? null,
    status: safeString(signer.status),
    accessLinkPresent: Boolean(accessLink),
    accessLink,
  };
}

function safeProofAccessLink(value: unknown): string | null {
  const text = safeString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname === "app.proof.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
