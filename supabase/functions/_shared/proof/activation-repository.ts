import { ProofError } from "./errors.ts";
import type {
  ActivationTransaction,
  ReadinessContext,
  SignerRecord,
} from "./activation-types.ts";

export interface ActivationRepository {
  getTransaction(id: string): Promise<ActivationTransaction | null>;
  context(tx: ActivationTransaction): Promise<ReadinessContext>;
  listSigners(id: string): Promise<SignerRecord[]>;
  claimSigners(
    tx: ActivationTransaction,
    rows: Record<string, unknown>[],
  ): Promise<SignerRecord[] | null>;
  claimActivation(
    tx: ActivationTransaction,
    admin: string,
  ): Promise<ActivationTransaction | null>;
  updateSigner(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<SignerRecord>;
  updateTransaction(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<ActivationTransaction>;
  recordActivation(
    tx: ActivationTransaction,
    occurredAt: string,
  ): Promise<void>;
  log(
    tx: ActivationTransaction,
    command: string,
    outcome: string,
    admin: string,
    error?: ProofError,
  ): Promise<void>;
}
export class SupabaseActivationRepository implements ActivationRepository {
  private url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  private key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  constructor() {
    if (!this.url || !this.key) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "Proof activation persistence is not configured.",
        503,
      );
    }
  }
  async getTransaction(id: string) {
    return (await this.rows<ActivationTransaction>(
      `proof_transactions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    ))[0] ?? null;
  }
  async context(tx: ActivationTransaction): Promise<ReadinessContext> {
    const [request, ron, invoices, signers, assets, participants, files] =
      await Promise.all([
        this.rows<ReadinessContext["request"]>(
          `service_requests?select=id,service_type,appointment_confirmed_at,appointment_date,appointment_time,appointment_timezone,appointment_state,notes,appointment_instructions,estimate_components&id=eq.${tx.service_request_id}&limit=1`,
        ),
        this.rows<NonNullable<ReadinessContext["ron"]>>(
          `ron_requests?select=number_of_signers,number_of_notarizations,witness_need,witness_count,witness_provider,client_witness_count,provided_witness_count,witness_review_required&service_request_id=eq.${tx.service_request_id}&limit=1`,
        ),
        this.rows<ReadinessContext["invoices"][number]>(
          `invoices?select=status,payment_status,balance_due,amount_due,amount_paid,paid_amount&service_request_id=eq.${tx.service_request_id}`,
        ),
        this.listSigners(tx.id),
        this.rows<ReadinessContext["assets"][number]>(
          `proof_transaction_assets?select=proof_asset_id,source_request_file_id,file_name,upload_state,processing_state,requirement,witness_required,manual_review_reason&proof_transaction_record_id=eq.${tx.id}&asset_type=eq.source_document`,
        ),
        this.rows<ReadinessContext["participants"][number]>(
          `request_participants?select=id,participant_type,first_name,middle_name,last_name,full_legal_name,email,mobile_phone,sort_order,identity_name_confirmed&service_request_id=eq.${tx.service_request_id}&participant_type=eq.signer&order=sort_order.asc`,
        ),
        this.rows<{ id: string; file_name: string | null; detected_page_count: number | null }>(
          `request_files?select=id,file_name,detected_page_count&service_request_id=eq.${tx.service_request_id}&is_active=eq.true`,
        ),
      ]);
    if (!request[0]) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "APS request was not found.",
        404,
      );
    }
    return {
      approvedSignerIdentitySource: Boolean(
        ron[0]?.number_of_signers &&
          participants.length === ron[0].number_of_signers &&
          participants.every((participant) =>
            participant.id && participant.identity_name_confirmed === true &&
            participant.full_legal_name?.trim() &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participant.email || "")
          ),
      ),
      participants,
      request: request[0],
      ron: ron[0] ?? null,
      invoices,
      signers,
      assets: assets.map((asset) => {
        const file = files.find((candidate) => candidate.id === asset.source_request_file_id);
        return {
          ...asset,
          file_name: asset.file_name ?? file?.file_name ?? null,
          detected_page_count: file?.detected_page_count ?? null,
        };
      }),
    };
  }
  async listSigners(id: string) {
    return this.rows<SignerRecord>(
      `proof_signers?select=*&proof_transaction_record_id=eq.${id}&order=signer_position.asc`,
    );
  }
  async claimSigners(
    tx: ActivationTransaction,
    rows: Record<string, unknown>[],
  ) {
    const response = await this.request("proof_signers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (response.status === 409) return null;
    return this.read<SignerRecord>(response);
  }
  async claimActivation(tx: ActivationTransaction, admin: string) {
    const rows = await this.patch<ActivationTransaction>(
      `proof_transactions?id=eq.${tx.id}&activation_state=eq.${tx.activation_state}&activation_attempt_count=eq.${tx.activation_attempt_count}`,
      {
        activation_state: "claimed",
        activation_claimed_at: new Date().toISOString(),
        activation_attempt_count: tx.activation_attempt_count + 1,
        updated_by: admin,
      },
    );
    return rows[0] ?? null;
  }
  async updateSigner(id: string, patch: Record<string, unknown>) {
    return (await this.patch<SignerRecord>(`proof_signers?id=eq.${id}`, patch))[
      0
    ];
  }
  async updateTransaction(id: string, patch: Record<string, unknown>) {
    return (await this.patch<ActivationTransaction>(
      `proof_transactions?id=eq.${id}`,
      patch,
    ))[0];
  }
  async recordActivation(tx: ActivationTransaction, occurredAt: string) {
    const eventType = "proof_transaction_activated";
    const existing = await this.rows<{ id: string }>(
      `request_timeline_events?select=id&service_request_id=eq.${tx.service_request_id}&event_type=eq.${eventType}&metadata-%3E%3Eproof_transaction_id=eq.${encodeURIComponent(tx.proof_transaction_id || "")}&limit=1`,
    );
    if (existing[0]) return;
    const response = await this.request("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: tx.service_request_id,
        event_type: eventType,
        title: "Proof transaction activated",
        detail: "Proof sent the secure invitation to the approved signer.",
        actor_type: "system",
        visibility: "internal",
        created_at: occurredAt,
        metadata: {
          proof_transaction_id: tx.proof_transaction_id,
          invitation_owner: "proof",
        },
      }),
    });
    if (!response.ok && response.status !== 409) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not persist the Proof activation timeline event.",
        500,
      );
    }
  }
  async log(
    tx: ActivationTransaction,
    command: string,
    outcome: string,
    admin: string,
    error?: ProofError,
  ) {
    await this.request("proof_transaction_command_attempts", {
      method: "POST",
      body: JSON.stringify({
        proof_transaction_record_id: tx.id,
        service_request_id: tx.service_request_id,
        environment: tx.environment,
        command,
        outcome,
        admin_user_id: admin,
        provider_status: error?.providerStatus ?? null,
        normalized_error_code: error?.code ?? null,
        provider_trace_id: error?.providerRequestId ?? null,
      }),
    });
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
  private async read<T>(r: Response): Promise<T[]> {
    if (!r.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not persist Proof activation state.",
        500,
      );
    }
    return r.json();
  }
  private async patch<T>(path: string, body: Record<string, unknown>) {
    return this.read<T>(
      await this.request(path, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      }),
    );
  }
}
