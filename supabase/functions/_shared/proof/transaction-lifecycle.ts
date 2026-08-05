import { normalizeProofFailure, ProofError } from "./errors.ts";
import { proofLogger } from "./logger.ts";
import type { AttemptInput, ProofTransactionRepository } from "./repository.ts";
import type {
  ProofOrganization,
  ProofProviderTransaction,
  ProofService,
} from "./service.ts";
import { mapProofTransactionStatus } from "./status-map.ts";
import {
  projectProofTransaction,
  type ProofEnvironment,
  type ProofTransactionCommand,
  type ProofTransactionProjection,
  type ProofTransactionRecord,
  type ProofWorkflowCategory,
} from "./transaction-types.ts";

export interface ProofLifecycleService {
  getOrganization(): Promise<ProofOrganization>;
  createDraftTransaction(
    input: { externalId: string; signerEmail: string },
  ): Promise<ProofProviderTransaction>;
  getTransaction(transactionId: string): Promise<ProofProviderTransaction>;
  deleteDraftTransaction(transactionId: string): Promise<{ deleted: true }>;
}

export interface TransactionCommandInput {
  command: ProofTransactionCommand;
  serviceRequestId?: string;
  integrationId?: string;
  signerEmail?: string;
  workflowCategory?: ProofWorkflowCategory;
  retryConfirmedRejection?: boolean;
  confirmDelete?: boolean;
  reason?: string;
}

export type TransactionCommandResult =
  | { kind: "organization"; organization: ProofOrganization }
  | {
    kind: "transaction";
    transaction: ProofTransactionProjection;
    duplicate?: boolean;
  };

export class ProofTransactionLifecycle {
  constructor(
    private readonly repository: ProofTransactionRepository,
    private readonly service: ProofLifecycleService,
    private readonly environment: ProofEnvironment,
  ) {}

  async execute(
    input: TransactionCommandInput,
    adminUserId: string,
  ): Promise<TransactionCommandResult> {
    switch (input.command) {
      case "organization_check":
        return {
          kind: "organization",
          organization: await this.service.getOrganization(),
        };
      case "create_draft":
        return await this.createDraft(input, adminUserId);
      case "retrieve":
      case "refresh":
        return await this.retrieve(input, adminUserId);
      case "delete_draft":
        return await this.deleteDraft(input, adminUserId);
      case "cancel_local":
        return await this.cancelLocal(input, adminUserId);
      case "mark_manual_review":
        return await this.markManualReview(input, adminUserId);
      default:
        throw readiness("A supported Proof transaction command is required.");
    }
  }

  private async createDraft(
    input: TransactionCommandInput,
    adminUserId: string,
  ): Promise<TransactionCommandResult> {
    const serviceRequestId = requiredUuid(
      input.serviceRequestId,
      "APS request ID",
    );
    if ((input.workflowCategory ?? "aps_originated") !== "aps_originated") {
      throw readiness("APS cannot create a draft for a Proof ODN workflow.");
    }
    const signerEmail = requiredEmail(input.signerEmail);
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
        "Only Remote Online Notary requests can create Proof drafts.",
      );
    }

    let existing = await this.repository.findActive(
      serviceRequestId,
      this.environment,
    );
    if (!existing) {
      existing = await this.repository.findLatest(
        serviceRequestId,
        this.environment,
      );
    }
    if (existing && !input.retryConfirmedRejection) {
      await this.audit(existing, "create_draft", "duplicate", adminUserId);
      return {
        kind: "transaction",
        transaction: projectProofTransaction(existing),
        duplicate: true,
      };
    }

    const externalId = `aps:service_request:${serviceRequestId}`;
    if (existing && input.retryConfirmedRejection) {
      if (
        !(["rejected", "failed"] as string[]).includes(existing.creation_state)
      ) {
        throw readiness(
          "Only a confirmed rejected or pre-dispatch failed attempt can be deliberately retried.",
        );
      }
      const attempt = existing.creation_attempt_count + 1;
      const key = creationKey(serviceRequestId, this.environment, attempt);
      existing = await this.repository.retryRejected(
        existing.id,
        key,
        attempt,
        adminUserId,
      );
      if (!existing) {
        const raced = await this.repository.findActive(
          serviceRequestId,
          this.environment,
        );
        if (!raced) {
          throw new ProofError(
            "PROOF_CONFLICT",
            "The Proof creation claim changed concurrently.",
            409,
          );
        }
        return {
          kind: "transaction",
          transaction: projectProofTransaction(raced),
          duplicate: true,
        };
      }
    }

    if (!existing) {
      const id = crypto.randomUUID();
      const key = creationKey(serviceRequestId, this.environment, 1);
      existing = await this.repository.claim({
        id,
        serviceRequestId,
        environment: this.environment,
        externalId,
        idempotencyKey: key,
        adminUserId,
      });
      if (!existing) {
        const raced = await this.repository.findActive(
          serviceRequestId,
          this.environment,
        );
        if (!raced) {
          throw new ProofError(
            "PROOF_CONFLICT",
            "APS could not acquire the Proof creation claim.",
            409,
          );
        }
        await this.audit(raced, "create_draft", "duplicate", adminUserId);
        return {
          kind: "transaction",
          transaction: projectProofTransaction(raced),
          duplicate: true,
        };
      }
    }

    await this.audit(existing, "create_draft", "started", adminUserId);
    existing = await this.repository.update(existing.id, {
      creation_state: "request_dispatched",
      request_dispatched_at: new Date().toISOString(),
      last_command: "create_draft",
      last_command_at: new Date().toISOString(),
      updated_by: adminUserId,
    });

    try {
      const provider = await this.service.createDraftTransaction({
        externalId,
        signerEmail,
      });
      const updated = await this.syncProvider(existing, provider, adminUserId, {
        creation_state: "created",
        last_error_code: null,
        last_error_message: null,
        manual_review_reason: null,
      });
      await this.audit(updated, "create_draft", "succeeded", adminUserId);
      return {
        kind: "transaction",
        transaction: projectProofTransaction(updated),
      };
    } catch (error) {
      const normalized = normalizeProofFailure(error);
      if (normalized.requestMayHaveReachedProvider) {
        const ambiguous = await this.repository.update(existing.id, {
          creation_state: "ambiguous",
          ambiguous_at: new Date().toISOString(),
          aps_status: "requires_attention",
          last_error_code: "PROOF_AMBIGUOUS_RESULT",
          last_error_message:
            "Proof may have received the create request. Do not retry; manual reconciliation is required.",
          manual_review_reason:
            "Create response was ambiguous and external_id search is not documented by Proof.",
          updated_by: adminUserId,
        });
        await this.audit(
          ambiguous,
          "create_draft",
          "ambiguous",
          adminUserId,
          normalized,
        );
        throw new ProofError(
          "PROOF_AMBIGUOUS_RESULT",
          "Proof may have received the draft request. The claim is preserved for manual review.",
          502,
        );
      }

      const confirmedRejection = normalized.providerStatus !== undefined &&
        normalized.providerStatus < 500;
      const failed = await this.repository.update(existing.id, {
        creation_state: confirmedRejection ? "rejected" : "failed",
        is_active: confirmedRejection,
        aps_status: confirmedRejection ? "requires_attention" : "failed",
        last_error_code: normalized.code,
        last_error_message: normalized.message,
        updated_by: adminUserId,
      });
      await this.audit(
        failed,
        "create_draft",
        confirmedRejection ? "rejected" : "failed",
        adminUserId,
        normalized,
      );
      throw normalized;
    }
  }

  private async retrieve(
    input: TransactionCommandInput,
    adminUserId: string,
  ): Promise<TransactionCommandResult> {
    const record = await this.requiredIntegration(input.integrationId);
    if (!record.proof_transaction_id) {
      throw readiness(
        "This integration has no stored Proof transaction identifier.",
      );
    }
    const provider = await this.service.getTransaction(
      record.proof_transaction_id,
    );
    const updated = await this.syncProvider(record, provider, adminUserId);
    await this.audit(updated, input.command, "succeeded", adminUserId);
    return {
      kind: "transaction",
      transaction: projectProofTransaction(updated),
    };
  }

  private async deleteDraft(
    input: TransactionCommandInput,
    adminUserId: string,
  ): Promise<TransactionCommandResult> {
    const record = await this.requiredIntegration(input.integrationId);
    if (record.workflow_category !== "aps_originated") {
      throw readiness("APS cannot delete a Proof ODN transaction.");
    }
    if (!input.confirmDelete) {
      throw readiness("Explicit draft deletion confirmation is required.");
    }
    if (!record.proof_transaction_id) {
      throw readiness(
        "This integration has no stored Proof transaction identifier.",
      );
    }

    const provider = await this.service.getTransaction(
      record.proof_transaction_id,
    );
    const deletable = provider.status === "started" ||
      provider.detailedStatus === "draft";
    if (!deletable) {
      const review = await this.repository.update(record.id, {
        creation_state: "manual_review",
        aps_status: "requires_attention",
        manual_review_reason:
          "Proof transaction is no longer an incomplete draft and cannot be deleted automatically.",
        updated_by: adminUserId,
      });
      await this.audit(review, "delete_draft", "manual_review", adminUserId);
      throw readiness(
        "Proof no longer reports this transaction as an incomplete draft. Manual review is required.",
      );
    }

    try {
      await this.service.deleteDraftTransaction(record.proof_transaction_id);
      const deleted = await this.repository.update(record.id, {
        creation_state: "deleted",
        is_active: false,
        aps_status: "cancelled",
        proof_status: "deleted",
        provider_detailed_status: "deleted",
        deleted_at: new Date().toISOString(),
        last_command: "delete_draft",
        last_command_at: new Date().toISOString(),
        updated_by: adminUserId,
      });
      await this.audit(deleted, "delete_draft", "succeeded", adminUserId);
      return {
        kind: "transaction",
        transaction: projectProofTransaction(deleted),
      };
    } catch (error) {
      const normalized = normalizeProofFailure(error);
      if (normalized.providerStatus === 422) {
        const review = await this.repository.update(record.id, {
          creation_state: "manual_review",
          aps_status: "requires_attention",
          last_error_code: normalized.code,
          last_error_message: normalized.message,
          manual_review_reason:
            "Proof rejected deletion for the provider transaction state.",
          updated_by: adminUserId,
        });
        await this.audit(
          review,
          "delete_draft",
          "manual_review",
          adminUserId,
          normalized,
        );
      }
      throw normalized;
    }
  }

  private async cancelLocal(
    input: TransactionCommandInput,
    adminUserId: string,
  ): Promise<TransactionCommandResult> {
    const record = await this.requiredIntegration(input.integrationId);
    if (
      record.proof_transaction_id ||
      ["ambiguous", "request_dispatched", "created"].includes(
        record.creation_state,
      )
    ) {
      throw readiness(
        "Local cancellation is unsafe after a Proof request may have been dispatched.",
      );
    }
    const cancelled = await this.repository.update(record.id, {
      creation_state: "cancelled",
      is_active: false,
      aps_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      last_command: "cancel_local",
      last_command_at: new Date().toISOString(),
      updated_by: adminUserId,
    });
    await this.audit(cancelled, "cancel_local", "succeeded", adminUserId);
    return {
      kind: "transaction",
      transaction: projectProofTransaction(cancelled),
    };
  }

  private async markManualReview(
    input: TransactionCommandInput,
    adminUserId: string,
  ): Promise<TransactionCommandResult> {
    const record = await this.requiredIntegration(input.integrationId);
    const reason = String(input.reason ?? "").trim().slice(0, 500);
    if (!reason) throw readiness("A manual-review reason is required.");
    const updated = await this.repository.update(record.id, {
      creation_state: "manual_review",
      aps_status: "requires_attention",
      manual_review_reason: reason,
      last_command: "mark_manual_review",
      last_command_at: new Date().toISOString(),
      updated_by: adminUserId,
    });
    await this.audit(
      updated,
      "mark_manual_review",
      "manual_review",
      adminUserId,
    );
    return {
      kind: "transaction",
      transaction: projectProofTransaction(updated),
    };
  }

  private async syncProvider(
    record: ProofTransactionRecord,
    provider: ProofProviderTransaction,
    adminUserId: string,
    extra: Record<string, unknown> = {},
  ): Promise<ProofTransactionRecord> {
    const raw = provider.detailedStatus ?? provider.status;
    return await this.repository.update(record.id, {
      proof_transaction_id: provider.id,
      proof_status: provider.status,
      provider_detailed_status: provider.detailedStatus,
      aps_status: mapProofTransactionStatus(raw),
      provider_created_at: provider.createdAt,
      provider_updated_at: provider.updatedAt,
      last_synced_at: new Date().toISOString(),
      last_command: record.last_command,
      last_command_at: new Date().toISOString(),
      updated_by: adminUserId,
      ...extra,
    });
  }

  private async requiredIntegration(
    id: string | undefined,
  ): Promise<ProofTransactionRecord> {
    const integrationId = requiredUuid(id, "Proof integration ID");
    const record = await this.repository.getById(integrationId);
    if (!record) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof integration record was not found.",
        404,
      );
    }
    return record;
  }

  private async audit(
    record: ProofTransactionRecord,
    command: ProofTransactionCommand,
    outcome: string,
    adminUserId: string,
    error?: ProofError,
  ) {
    const attempt: AttemptInput = {
      integrationId: record.id,
      serviceRequestId: record.service_request_id,
      environment: record.environment,
      command,
      outcome,
      adminUserId,
      idempotencyKey: record.idempotency_key,
      providerStatus: error?.providerStatus,
      errorCode: error?.code,
      providerTraceId: error?.providerRequestId,
    };
    await this.repository.logAttempt(attempt).catch(() => undefined);
    proofLogger.idempotency({
      aps_request_id: record.service_request_id,
      integration_id: record.id,
      command,
      outcome,
      attempt: record.creation_attempt_count,
      provider_status: error?.providerStatus,
      normalized_error_code: error?.code,
      transaction_id_suffix: record.proof_transaction_id?.slice(-6),
    });
  }
}

function requiredUuid(value: string | undefined, label: string): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(text)
  ) {
    throw readiness(`${label} is required and must be a valid UUID.`);
  }
  return text;
}

function requiredEmail(value: string | undefined): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw readiness(
      "An explicitly confirmed signer email is required to create a Proof draft.",
    );
  }
  return email;
}

function creationKey(
  serviceRequestId: string,
  environment: ProofEnvironment,
  attempt: number,
) {
  return `proof-create:${environment}:${serviceRequestId}:attempt:${attempt}`;
}

function readiness(message: string): ProofError {
  return new ProofError("PROOF_READINESS_ERROR", message, 400);
}

export type { ProofService };
