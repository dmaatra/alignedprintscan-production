import { ProofError } from "./errors.ts";
import type {
  ProofEnvironment,
  ProofTransactionCommand,
  ProofTransactionRecord,
  ServiceRequestProofReadiness,
} from "./transaction-types.ts";

export interface ClaimInput {
  id: string;
  serviceRequestId: string;
  environment: ProofEnvironment;
  externalId: string;
  idempotencyKey: string;
  adminUserId: string;
}

export interface AttemptInput {
  integrationId?: string | null;
  serviceRequestId: string;
  environment: ProofEnvironment;
  command: ProofTransactionCommand;
  outcome: string;
  adminUserId: string;
  idempotencyKey?: string | null;
  providerStatus?: number;
  errorCode?: string;
  providerTraceId?: string;
}

export interface ProofTransactionRepository {
  getServiceRequest(id: string): Promise<ServiceRequestProofReadiness | null>;
  getById(id: string): Promise<ProofTransactionRecord | null>;
  findActive(
    serviceRequestId: string,
    environment: ProofEnvironment,
  ): Promise<ProofTransactionRecord | null>;
  findLatest(
    serviceRequestId: string,
    environment: ProofEnvironment,
  ): Promise<ProofTransactionRecord | null>;
  claim(input: ClaimInput): Promise<ProofTransactionRecord | null>;
  retryRejected(
    id: string,
    idempotencyKey: string,
    attemptCount: number,
    adminUserId: string,
  ): Promise<ProofTransactionRecord | null>;
  update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<ProofTransactionRecord>;
  logAttempt(input: AttemptInput): Promise<void>;
}

export class SupabaseProofTransactionRepository
  implements ProofTransactionRepository {
  private readonly url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  private readonly serviceRole =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";

  constructor() {
    if (!this.url || !this.serviceRole) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "Proof database access is not configured.",
        503,
      );
    }
  }

  async getServiceRequest(
    id: string,
  ): Promise<ServiceRequestProofReadiness | null> {
    const rows = await this.rows<ServiceRequestProofReadiness>(
      `service_requests?select=id,service_type&id=eq.${
        encodeURIComponent(id)
      }&limit=1`,
    );
    return rows[0] ?? null;
  }

  async getById(id: string): Promise<ProofTransactionRecord | null> {
    const rows = await this.rows<ProofTransactionRecord>(
      `proof_transactions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return rows[0] ?? null;
  }

  async findActive(
    serviceRequestId: string,
    environment: ProofEnvironment,
  ): Promise<ProofTransactionRecord | null> {
    const rows = await this.rows<ProofTransactionRecord>(
      `proof_transactions?select=*&service_request_id=eq.${
        encodeURIComponent(serviceRequestId)
      }&environment=eq.${environment}&workflow_category=eq.aps_originated&is_active=eq.true&limit=1`,
    );
    return rows[0] ?? null;
  }

  async findLatest(
    serviceRequestId: string,
    environment: ProofEnvironment,
  ): Promise<ProofTransactionRecord | null> {
    const rows = await this.rows<ProofTransactionRecord>(
      `proof_transactions?select=*&service_request_id=eq.${
        encodeURIComponent(serviceRequestId)
      }&environment=eq.${environment}&workflow_category=eq.aps_originated&order=created_at.desc&limit=1`,
    );
    return rows[0] ?? null;
  }

  async claim(input: ClaimInput): Promise<ProofTransactionRecord | null> {
    const response = await this.request("proof_transactions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: input.id,
        service_request_id: input.serviceRequestId,
        environment: input.environment,
        external_id: input.externalId,
        idempotency_key: input.idempotencyKey,
        workflow_category: "aps_originated",
        creation_state: "claimed",
        aps_status: "preparing",
        is_active: true,
        creation_attempt_count: 1,
        claim_acquired_at: new Date().toISOString(),
        last_command: "create_draft",
        last_command_at: new Date().toISOString(),
        created_by: input.adminUserId,
        updated_by: input.adminUserId,
      }),
    });
    if (response.status === 409) return null;
    return (await this.readRows<ProofTransactionRecord>(response))[0] ?? null;
  }

  async retryRejected(
    id: string,
    idempotencyKey: string,
    attemptCount: number,
    adminUserId: string,
  ): Promise<ProofTransactionRecord | null> {
    const response = await this.request(
      `proof_transactions?id=eq.${
        encodeURIComponent(id)
      }&creation_state=in.(rejected,failed)`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          creation_attempt_count: attemptCount,
          creation_state: "claimed",
          is_active: true,
          claim_acquired_at: new Date().toISOString(),
          request_dispatched_at: null,
          ambiguous_at: null,
          last_error_code: null,
          last_error_message: null,
          manual_review_reason: null,
          last_command: "create_draft",
          last_command_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: adminUserId,
        }),
      },
    );
    const rows = await this.readRows<ProofTransactionRecord>(response);
    return rows[0] ?? null;
  }

  async update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<ProofTransactionRecord> {
    const response = await this.request(
      `proof_transactions?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...patch,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    const row = (await this.readRows<ProofTransactionRecord>(response))[0];
    if (!row) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof integration record was not found.",
        404,
      );
    }
    return row;
  }

  async logAttempt(input: AttemptInput): Promise<void> {
    const response = await this.request("proof_transaction_command_attempts", {
      method: "POST",
      body: JSON.stringify({
        proof_transaction_record_id: input.integrationId ?? null,
        service_request_id: input.serviceRequestId,
        environment: input.environment,
        command: input.command,
        outcome: input.outcome,
        admin_user_id: input.adminUserId,
        idempotency_key: input.idempotencyKey ?? null,
        provider_status: input.providerStatus ?? null,
        normalized_error_code: input.errorCode ?? null,
        provider_trace_id: input.providerTraceId ?? null,
      }),
    });
    if (!response.ok) {
      console.warn("Proof command audit logging failed", response.status);
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

  private async rows<T>(path: string): Promise<T[]> {
    return this.readRows<T>(await this.request(path));
  }

  private async readRows<T>(response: Response): Promise<T[]> {
    if (!response.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not persist Proof integration state.",
        500,
      );
    }
    return await response.json() as T[];
  }
}
