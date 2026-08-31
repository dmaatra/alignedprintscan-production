import type { ProofTransactionRecord } from "./transaction-types.ts";

export type ActivationCommand =
  | "list_signers"
  | "configure_signers"
  | "configure_approved_signers"
  | "refresh_signers"
  | "evaluate_activation_readiness"
  | "activate"
  | "mark_signer_manual_review"
  | "mark_activation_manual_review";
export interface SignerInput {
  apsSignerReference: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email: string;
  order: number;
  entity?: string;
  capacity?: string;
  phone?: string;
}
export interface SignerRecord {
  id: string;
  proof_transaction_record_id: string;
  proof_signer_id: string | null;
  external_id: string;
  aps_signer_reference: string;
  signer_position: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string;
  entity: string | null;
  capacity: string | null;
  configuration_state: string;
  invitation_state: string;
  access_link_present: boolean;
  aps_status: string;
  proof_status: string | null;
  manual_review_reason: string | null;
  configured_at: string | null;
  invited_at: string | null;
  opened_at: string | null;
  completed_at: string | null;
  last_synced_at: string | null;
}
export interface ActivationTransaction extends ProofTransactionRecord {
  signer_configuration_state: string;
  activation_state: string;
  activation_attempt_count: number;
  activation_claimed_at: string | null;
  activation_dispatched_at: string | null;
  activation_ambiguous_at: string | null;
  activated_at: string | null;
  activation_manual_review_reason: string | null;
  proof_email_ownership: boolean;
  document_preparation_confirmed_at: string | null;
  document_preparation_confirmed_by: string | null;
}
export interface ReadinessContext {
  approvedSignerIdentitySource: boolean;
  participants: Array<{
    id: string;
    participant_type: string;
    full_legal_name: string | null;
    email: string | null;
    sort_order: number | null;
    identity_name_confirmed: boolean | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    mobile_phone?: string | null;
  }>;
  request: {
    id: string;
    service_type: string;
    appointment_confirmed_at: string | null;
    appointment_date: string | null;
    appointment_time: string | null;
    appointment_timezone: string | null;
    appointment_state: string | null;
    notes?: string | null;
    appointment_instructions?: string | null;
    estimate_components?: unknown;
  };
  ron: {
    number_of_signers: number | null;
    number_of_notarizations?: number | null;
    witness_need: string | null;
    witness_count: string | null;
    witness_provider: string | null;
    client_witness_count: number | null;
    provided_witness_count: number | null;
    witness_review_required: boolean | null;
  } | null;
  invoices: Array<
    {
      status: string | null;
      payment_status: string | null;
      balance_due: number | null;
      amount_due: number | null;
      amount_paid: number | null;
      paid_amount: number | null;
    }
  >;
  signers: SignerRecord[];
  assets: Array<
    {
      proof_asset_id: string | null;
      upload_state: string;
      processing_state: string;
      requirement: string | null;
      manual_review_reason: string | null;
      source_request_file_id?: string | null;
      file_name?: string | null;
      detected_page_count?: number | null;
      witness_required?: boolean | null;
    }
  >;
}

export function approvedSignerInputs(context: ReadinessContext): SignerInput[] {
  if (!context.approvedSignerIdentitySource) return [];
  return context.participants
    .filter((participant) => participant.participant_type === "signer")
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((participant, index) => {
      const names = String(participant.full_legal_name || "").trim().split(
        /\s+/,
      );
      return {
        apsSignerReference: participant.id,
        firstName: participant.first_name?.trim() || names[0] || undefined,
        middleName: participant.middle_name?.trim() ||
          (names.length > 2 ? names.slice(1, -1).join(" ") : undefined),
        lastName: participant.last_name?.trim() ||
          (names.length > 1 ? names.at(-1) : undefined),
        email: String(participant.email || "").trim().toLowerCase(),
        ...(participant.mobile_phone?.trim()
          ? { phone: participant.mobile_phone.trim() }
          : {}),
        order: index + 1,
      };
    });
}
export interface ActivationCommandInput {
  command: ActivationCommand;
  serviceRequestId?: string;
  integrationId?: string;
  signers?: SignerInput[];
  signerId?: string;
  reason?: string;
  confirmActivation?: boolean;
  retryConfirmedRejection?: boolean;
}
export interface ReadinessResult {
  ready: boolean;
  blockingCodes: string[];
  warnings: string[];
  summary: string;
}
export function signerProjection(s: SignerRecord) {
  return {
    signerId: s.id,
    apsSignerReference: s.aps_signer_reference,
    externalId: s.external_id,
    position: s.signer_position,
    firstName: s.first_name,
    middleName: s.middle_name,
    lastName: s.last_name,
    email: s.email,
    entity: s.entity,
    capacity: s.capacity,
    configurationState: s.configuration_state,
    invitationState: s.invitation_state,
    accessLinkPresent: s.access_link_present,
    apsStatus: s.aps_status,
    providerStatus: s.proof_status,
    requiresManualReview: Boolean(s.manual_review_reason),
    configuredAt: s.configured_at,
    invitedAt: s.invited_at,
    openedAt: s.opened_at,
    completedAt: s.completed_at,
    lastSyncedAt: s.last_synced_at,
  };
}
