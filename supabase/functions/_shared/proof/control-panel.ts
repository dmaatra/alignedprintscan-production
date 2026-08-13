import { ProofError } from "./errors.ts";
import { getProofConfig } from "./config.ts";

export class ProofControlPanel {
  private url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  private key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";

  constructor() {
    if (!this.url || !this.key) {
      throw new ProofError(
        "PROOF_CONFIGURATION_ERROR",
        "Proof control-panel persistence is unavailable.",
        503,
      );
    }
  }

  async read(serviceRequestId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(serviceRequestId)) {
      throw new ProofError(
        "PROOF_VALIDATION_ERROR",
        "A valid APS request ID is required.",
        400,
      );
    }
    const [requests, ron, participants, files, transactions] = await Promise
      .all([
        this.rows(
          `service_requests?select=id,service_type,workflow_status,appointment_date,appointment_time,appointment_timezone,appointment_confirmed_at,appointment_state&id=eq.${serviceRequestId}&limit=1`,
        ),
        this.rows(
          `ron_requests?select=number_of_signers,number_of_notarizations,witness_need,witness_count,witness_provider,witness_review_required&service_request_id=eq.${serviceRequestId}&limit=1`,
        ),
        this.rows(
          `request_participants?select=id,participant_type,full_legal_name,email,sort_order,witness_source,identity_name_confirmed&service_request_id=eq.${serviceRequestId}&order=sort_order.asc`,
        ),
        this.rows(
          `request_files?select=id,file_name,file_type,file_size,document_category,document_classification,review_state,customer_visible,eligible_for_delivery,is_active&service_request_id=eq.${serviceRequestId}&is_active=eq.true&order=created_at.asc`,
        ),
        this.rows(
          `proof_transactions?select=*&service_request_id=eq.${serviceRequestId}&is_active=eq.true&order=created_at.desc&limit=1`,
        ),
      ]);
    const request = requests[0] as Record<string, unknown> | undefined;
    if (!request) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "APS request was not found.",
        404,
      );
    }
    if (request.service_type !== "ron") {
      return {
        kind: "proof_control_panel",
        applicable: false,
        request: { id: request.id, serviceType: request.service_type },
      };
    }
    const transaction = transactions[0] as Record<string, unknown> | undefined;
    const integrationId = String(transaction?.id || "");
    const [signers, assets, invoices] = await Promise.all([
      integrationId
        ? this.rows(
          `proof_signers?select=id,aps_signer_reference,signer_position,first_name,middle_name,last_name,email,configuration_state,invitation_state,access_link_present,aps_status,proof_status,manual_review_reason,configured_at,opened_at,completed_at,last_synced_at&proof_transaction_record_id=eq.${integrationId}&order=signer_position.asc`,
        )
        : [],
      integrationId
        ? this.rows(
          `proof_transaction_assets?select=id,source_request_file_id,source_asset_id,asset_type,file_name,proof_asset_id,upload_state,processing_state,requirement,notarization_required,witness_required,availability_state,retrieval_state,retrieved_at,manual_review_reason,retrieval_manual_review_reason,last_synced_at&proof_transaction_record_id=eq.${integrationId}&order=created_at.asc`,
        )
        : [],
      this.rows(
        `invoices?select=status,payment_status,amount_due,amount_paid,paid_amount,balance_due&service_request_id=eq.${serviceRequestId}`,
      ),
    ]);
    const issuedInvoices = invoices.filter((raw) => {
      const invoice = raw as Record<string, unknown>;
      return !["void", "cancelled", "draft"].includes(
        String(invoice.status || "").toLowerCase(),
      );
    });
    const openBalance = issuedInvoices.reduce((sum, raw) => {
      const invoice = raw as Record<string, unknown>;
      if (
        ["void", "cancelled", "draft"].includes(
          String(invoice.status || "").toLowerCase(),
        )
      ) return sum;
      const balance = invoice.balance_due ??
        (Number(invoice.amount_due || 0) -
          Number(invoice.amount_paid ?? invoice.paid_amount ?? 0));
      return sum + Math.max(0, Number(balance || 0));
    }, 0);
    let configured = true;
    let environment: string | null = null;
    try {
      environment = getProofConfig().environment;
    } catch {
      configured = false;
    }
    return {
      kind: "proof_control_panel",
      applicable: true,
      configured,
      environment,
      request,
      ron: ron[0] ?? null,
      participants,
      files,
      invoices: {
        primaryPaymentReady: issuedInvoices.length > 0 && openBalance === 0,
        openBalance,
      },
      transaction: transaction ?? null,
      signers,
      assets,
    };
  }

  private async rows(path: string): Promise<Array<Record<string, unknown>>> {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!response.ok) {
      throw new ProofError(
        "PROOF_PROVIDER_ERROR",
        "APS could not load Proof control-panel state.",
        500,
      );
    }
    return await response.json();
  }
}
