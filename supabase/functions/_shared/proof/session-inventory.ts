import { ProofError } from "./errors.ts";

type Fetcher = typeof fetch;

/** Admin-only, synchronized APS inventory. This never calls the Proof API. */
export class ProofSessionInventory {
  private url: string;
  private key: string;
  private fetcher: Fetcher;

  constructor(options: { url?: string; key?: string; fetcher?: Fetcher } = {}) {
    this.url = options.url ?? Deno.env.get("SUPABASE_URL")?.trim() ?? "";
    this.key = options.key ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
    this.fetcher = options.fetcher ?? fetch;
    if (!this.url || !this.key) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "RON session inventory is unavailable.",
        503,
      );
    }
  }

  async read() {
    const [
      requests,
      transactions,
      signers,
      assets,
      invoices,
      participants,
      files,
    ] = await Promise.all([
      this.rows(
        "service_requests?select=id,created_at,service_type,status,workflow_status,payment_state,appointment_state,appointment_date,appointment_time,appointment_timezone,appointment_confirmed_at,preferred_date,preferred_time_window,document_state,participant_state,fulfillment_state,archived_at,customers(id,first_name,last_name,email,phone),ron_requests(number_of_signers,number_of_notarizations,witness_review_required)&service_type=eq.ron&archived_at=is.null&order=created_at.desc",
      ),
      this.rows(
        "proof_transactions?select=id,service_request_id,proof_transaction_id,creation_state,provider_detailed_status,proof_status,aps_status,is_active,signer_configuration_state,activation_state,activated_at,meeting_state,completed_assets_available,last_synced_at,provider_updated_at,last_webhook_occurred_at,completed_at,released_at,last_error_code,manual_review_reason,activation_manual_review_reason,webhook_refresh_required,webhook_manual_review_reason,created_at,updated_at&is_active=eq.true",
      ),
      this.rows(
        "proof_signers?select=proof_transaction_record_id,configuration_state,invitation_state,aps_status,proof_status,completed_at,last_synced_at,manual_review_reason,updated_at",
      ),
      this.rows(
        "proof_transaction_assets?select=proof_transaction_record_id,asset_type,upload_state,processing_state,availability_state,retrieval_state,retrieved_at,last_synced_at,manual_review_reason,retrieval_manual_review_reason,updated_at",
      ),
      this.rows(
        "invoices?select=service_request_id,status,payment_status,amount_due,amount_paid,paid_amount,balance_due,updated_at",
      ),
      this.rows(
        "request_participants?select=service_request_id,participant_type,full_legal_name,email,identity_name_confirmed,sort_order,updated_at",
      ),
      this.rows(
        "request_files?select=service_request_id,document_classification,review_state,customer_visible,eligible_for_delivery,is_active,created_at",
      ),
    ]);
    return {
      kind: "proof_session_inventory",
      requests,
      transactions,
      signers,
      assets,
      invoices,
      participants,
      files,
    };
  }

  private async rows(path: string): Promise<Array<Record<string, unknown>>> {
    const response = await this.fetcher(`${this.url}/rest/v1/${path}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!response.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not load synchronized RON session state.",
        500,
      );
    }
    return await response.json();
  }
}
