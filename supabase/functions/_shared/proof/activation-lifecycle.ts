import { normalizeProofFailure, ProofError } from "./errors.ts";
import type {
  ProofProviderSigner,
  ProofProviderTransaction,
} from "./service.ts";
import { proofLogger } from "./logger.ts";
import type { ActivationRepository } from "./activation-repository.ts";
import {
  type ActivationCommandInput,
  type ActivationTransaction,
  approvedSignerInputs,
  type ReadinessContext,
  type ReadinessResult,
  type SignerInput,
  signerProjection,
  type SignerRecord,
} from "./activation-types.ts";

export interface ActivationService {
  configureTransactionSigners(
    id: string,
    signers: Array<
      {
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
    >,
    enrichment?: {
      transactionName?: string | null;
      notaryMeetingTime?: string | null;
      notaryInstructions?: string | null;
      messageToSigner?: string | null;
    },
  ): Promise<ProofProviderTransaction>;
  getTransaction(id: string): Promise<ProofProviderTransaction>;
  activateDraftTransaction(id: string): Promise<ProofProviderTransaction>;
}
export class ProofActivationLifecycle {
  constructor(
    private repo: ActivationRepository,
    private service: ActivationService,
    private environment: "production" | "fairfax",
  ) {}
  async execute(
    input: ActivationCommandInput,
    admin: string,
  ): Promise<unknown> {
    const tx = await this.transaction(input.integrationId);
    this.ownership(tx, input.serviceRequestId);
    switch (input.command) {
      case "list_signers":
        return {
          kind: "signers",
          signers: (await this.repo.listSigners(tx.id)).map(signerProjection),
        };
      case "configure_signers":
        return this.configure(tx, input, admin);
      case "configure_approved_signers": {
        const context = await this.repo.context(tx);
        return this.configure(
          tx,
          { ...input, signers: approvedSignerInputs(context) },
          admin,
        );
      }
      case "refresh_signers":
        return this.refresh(tx, admin);
      case "evaluate_activation_readiness":
        return {
          kind: "readiness",
          readiness: this.evaluate(
            tx,
            await this.repo.context(tx),
            Boolean(input.confirmActivation),
          ),
        };
      case "activate":
        return this.activate(tx, input, admin);
      case "mark_signer_manual_review":
        return this.markSigner(tx, input, admin);
      case "mark_activation_manual_review":
        return this.markActivation(tx, input, admin);
    }
  }
  private async configure(
    tx: ActivationTransaction,
    input: ActivationCommandInput,
    admin: string,
  ) {
    if (tx.workflow_category !== "aps_originated") {
      throw readyError("Proof ODN signer configuration is blocked.");
    }
    if (!editable(tx)) {
      throw readyError("Proof transaction is not draft/editable.");
    }
    const ctx = await this.repo.context(tx);
    if (!ctx.approvedSignerIdentitySource) {
      throw readyError(
        "APS has no approved structured signer identity source for this request.",
      );
    }
    const signers = validateSigners(input.signers, ctx.ron?.number_of_signers);
    const existing = await this.repo.listSigners(tx.id);
    if (
      existing.length &&
      !existing.every((signer) =>
        ["rejected", "failed"].includes(signer.configuration_state)
      )
    ) {
      return {
        kind: "signers",
        duplicate: true,
        signers: existing.map(signerProjection),
      };
    }
    const now = new Date().toISOString();
    const rows = signers.map((s) => ({
      id: crypto.randomUUID(),
      proof_transaction_record_id: tx.id,
      proof_transaction_id: tx.proof_transaction_id,
      idempotency_key: `proof-signer:${tx.id}:${s.order}`,
      signer_role: "signer",
      aps_signer_reference: s.apsSignerReference,
      external_id: externalId(tx.id, s.order),
      signer_position: s.order,
      first_name: s.firstName ?? null,
      middle_name: s.middleName ?? null,
      last_name: s.lastName ?? null,
      email: s.email.toLowerCase(),
      entity: s.entity ?? null,
      capacity: s.capacity ?? null,
      configuration_state: "claimed",
      invitation_state: "not_invited",
      access_link_present: false,
      access_link: null,
      aps_status: "not_started",
      created_by: admin,
      updated_by: admin,
    }));
    let claimed: SignerRecord[];
    if (existing.length) {
      if (
        existing.length !== rows.length ||
        existing.some((row, index) =>
          row.aps_signer_reference !== rows[index].aps_signer_reference ||
          row.email !== rows[index].email ||
          row.signer_position !== rows[index].signer_position
        )
      ) {
        throw readyError(
          "Rejected signer claims no longer match the approved APS signer set.",
        );
      }
      const provider = await this.service.getTransaction(
        tx.proof_transaction_id!,
      );
      const providerSigners = provider.signers ?? [];
      if (
        providerSigners.length === existing.length &&
        existing.every((row) => this.providerMatch(row, providerSigners))
      ) {
        const recovered = await this.persistProvider(
          existing,
          providerSigners,
          admin,
        );
        await this.repo.updateTransaction(tx.id, {
          signer_configuration_state: "configured",
          updated_by: admin,
        });
        await this.audit(tx, "configure_signers", "succeeded", admin);
        return { kind: "signers", signers: recovered.map(signerProjection) };
      }
      claimed = [];
      for (const row of existing) {
        claimed.push(
          await this.repo.updateSigner(row.id, {
            configuration_state: "claimed",
            ambiguous_at: null,
            manual_review_reason: null,
            last_error_code: null,
            last_error_message: null,
            updated_by: admin,
          }),
        );
      }
    } else {
      const inserted = await this.repo.claimSigners(tx, rows);
      if (!inserted) {
        return {
          kind: "signers",
          duplicate: true,
          signers: (await this.repo.listSigners(tx.id)).map(signerProjection),
        };
      }
      claimed = inserted;
    }
    await this.repo.updateTransaction(tx.id, {
      signer_configuration_state: "dispatched",
      signer_configuration_dispatched_at: now,
      updated_by: admin,
    });
    try {
      const provider = await this.service.configureTransactionSigners(
        tx.proof_transaction_id!,
        signers.map((s) => ({
          ...s,
          externalId: externalId(tx.id, s.order),
          phone: proofPhone(s.phone),
        })),
        draftEnrichment(tx, ctx, signers),
      );
      const updated = await this.persistProvider(
        claimed,
        provider.signers ?? [],
        admin,
      );
      await this.repo.updateTransaction(tx.id, {
        signer_configuration_state: "configured",
        updated_by: admin,
      });
      await this.audit(tx, "configure_signers", "succeeded", admin);
      return { kind: "signers", signers: updated.map(signerProjection) };
    } catch (error) {
      const e = normalizeProofFailure(error),
        ambiguous = e.requestMayHaveReachedProvider ||
          ["PROOF_TIMEOUT", "PROOF_NETWORK_ERROR"].includes(e.code);
      for (const row of claimed) {
        await this.repo.updateSigner(row.id, {
          configuration_state: ambiguous
            ? "ambiguous"
            : e.providerStatus && e.providerStatus < 500
            ? "rejected"
            : "failed",
          ambiguous_at: ambiguous ? now : null,
          manual_review_reason: ambiguous
            ? "Signer configuration response was ambiguous."
            : null,
          last_error_code: e.code,
          last_error_message: e.message,
          updated_by: admin,
        });
      }
      await this.repo.updateTransaction(tx.id, {
        signer_configuration_state: ambiguous ? "ambiguous" : "rejected",
        signer_configuration_ambiguous_at: ambiguous ? now : null,
        updated_by: admin,
      });
      await this.audit(
        tx,
        "configure_signers",
        ambiguous ? "ambiguous" : "rejected",
        admin,
        e,
      );
      throw e;
    }
  }
  private async refresh(tx: ActivationTransaction, admin: string) {
    if (!tx.proof_transaction_id) {
      throw readyError("Proof transaction ID is missing.");
    }
    const provider = await this.service.getTransaction(tx.proof_transaction_id),
      rows = await this.repo.listSigners(tx.id),
      invitationSent = providerInvitationSent(provider),
      updated = await this.persistProvider(
        rows,
        provider.signers ?? [],
        admin,
        invitationSent,
      );
    if (invitationSent) {
      await this.repo.recordActivation(
        tx,
        tx.activated_at || provider.updatedAt || new Date().toISOString(),
      );
    }
    return { kind: "signers", signers: updated.map(signerProjection) };
  }
  private async activate(
    tx: ActivationTransaction,
    input: ActivationCommandInput,
    admin: string,
  ) {
    if (tx.activation_state === "activated") {
      return { kind: "activation", duplicate: true, state: "activated" };
    }
    if (tx.activation_state === "ambiguous") {
      const current = await this.service.getTransaction(
        tx.proof_transaction_id!,
      );
      if (!editableProvider(current)) {
        await this.repo.updateTransaction(tx.id, {
          activation_state: "activated",
          activated_at: new Date().toISOString(),
          proof_status: current.status,
          provider_detailed_status: current.detailedStatus,
          updated_by: admin,
        });
        return { kind: "activation", reconciled: true, state: "activated" };
      }
      throw readyError(
        "Activation remains ambiguous and requires manual review.",
      );
    }
    if (
      ["rejected", "failed"].includes(tx.activation_state) &&
      !input.retryConfirmedRejection
    ) {
      throw readyError(
        "A prior activation failure must be explicitly reviewed before retry.",
      );
    }
    const context = await this.repo.context(tx),
      readiness = this.evaluate(tx, context, Boolean(input.confirmActivation));
    if (!readiness.ready) return { kind: "readiness", readiness };
    const claim = await this.repo.claimActivation(tx, admin);
    if (!claim) {
      return {
        kind: "activation",
        duplicate: true,
        state: (await this.transaction(tx.id)).activation_state,
      };
    }
    const now = new Date().toISOString();
    await this.repo.updateTransaction(tx.id, {
      activation_state: "dispatched",
      activation_dispatched_at: now,
      updated_by: admin,
    });
    try {
      const provider = await this.service.activateDraftTransaction(
        tx.proof_transaction_id!,
      );
      await this.repo.updateTransaction(tx.id, {
        activation_state: "activated",
        activated_at: now,
        proof_status: provider.status,
        provider_detailed_status: provider.detailedStatus,
        aps_status: "in_progress",
        proof_email_ownership: true,
        updated_by: admin,
      });
      const rows = await this.repo.listSigners(tx.id);
      await this.persistProvider(
        rows,
        provider.signers ?? [],
        admin,
        providerInvitationSent(provider),
      );
      await this.repo.recordActivation(tx, now);
      await this.audit(tx, "activate", "succeeded", admin);
      return {
        kind: "activation",
        state: "activated",
        proofEmailInvitation: true,
      };
    } catch (error) {
      const e = normalizeProofFailure(error),
        ambiguous = e.requestMayHaveReachedProvider ||
          Boolean(e.providerStatus && e.providerStatus >= 500);
      await this.repo.updateTransaction(tx.id, {
        activation_state: ambiguous
          ? "ambiguous"
          : e.providerStatus
          ? "rejected"
          : "failed",
        activation_ambiguous_at: ambiguous ? now : null,
        last_error_code: e.code,
        last_error_message: e.message,
        activation_manual_review_reason: ambiguous
          ? "Activation result is ambiguous; reconcile before retry."
          : null,
        updated_by: admin,
      });
      await this.audit(
        tx,
        "activate",
        ambiguous ? "ambiguous" : e.providerStatus ? "rejected" : "failed",
        admin,
        e,
      );
      throw e;
    }
  }
  evaluate(
    tx: ActivationTransaction,
    c: ReadinessContext,
    confirmed: boolean,
  ): ReadinessResult {
    const b: string[] = [], w: string[] = [];
    if (c.request.service_type !== "ron") b.push("SERVICE_NOT_RON");
    if (tx.workflow_category !== "aps_originated") b.push("ODN_NOT_OWNED");
    if (!tx.proof_transaction_id) b.push("MISSING_PROOF_TRANSACTION");
    if (!editable(tx)) b.push("TRANSACTION_NOT_EDITABLE");
    if (tx.creation_state === "ambiguous") b.push("CREATION_AMBIGUOUS");
    if (
      tx.creation_state === "manual_review" ||
      tx.activation_manual_review_reason
    ) b.push("TRANSACTION_MANUAL_REVIEW");
    if (
      !c.ron?.number_of_signers || c.signers.length !== c.ron.number_of_signers
    ) b.push("SIGNER_COUNT_INCOMPLETE");
    if (!c.approvedSignerIdentitySource) {
      b.push("SIGNER_IDENTITY_SOURCE_MISSING");
    }
    if (
      c.signers.some((s) => !s.email || s.configuration_state !== "configured")
    ) b.push("SIGNER_CONFIGURATION_INCOMPLETE");
    if (
      c.signers.some((s) =>
        ["ambiguous", "manual_review"].includes(s.configuration_state)
      )
    ) b.push("SIGNER_MANUAL_REVIEW");
    if (!c.assets.length) b.push("MISSING_REQUIRED_DOCUMENT");
    if (
      c.assets.some((a) =>
        !a.proof_asset_id || a.processing_state !== "complete"
      )
    ) b.push("DOCUMENT_NOT_PROCESSED");
    if (
      c.assets.some((a) =>
        ["ambiguous", "manual_review", "processing_failed"].includes(
          a.upload_state,
        )
      )
    ) b.push("DOCUMENT_MANUAL_REVIEW");
    if (c.assets.some((a) => !a.requirement)) {
      b.push("DOCUMENT_FLAGS_INCOMPLETE");
    }
    if (!tx.document_preparation_confirmed_at) {
      b.push("DOCUMENT_PREPARATION_NOT_CONFIRMED");
    }
    const witness = witnessPolicy(c);
    if (witness) b.push(witness);
    const issuedInvoices = c.invoices.filter((invoice) =>
      !["draft", "void", "cancelled"].includes(
        (invoice.status ?? "").toLowerCase(),
      )
    );
    if (
      !issuedInvoices.length ||
      issuedInvoices.some((invoice) =>
        Number(
          invoice.balance_due ??
            (Number(invoice.amount_due ?? 0) -
              Number(invoice.amount_paid ?? invoice.paid_amount ?? 0)),
        ) > 0
      )
    ) b.push("PAYMENT_REQUIRED");
    if (
      !c.request.appointment_confirmed_at || !c.request.appointment_date ||
      !c.request.appointment_time
    ) b.push("APPOINTMENT_NOT_CONFIRMED");
    if (!validTimezone(c.request.appointment_timezone)) {
      b.push("INVALID_TIMEZONE");
    }
    if (tx.activation_state === "activated") b.push("ALREADY_ACTIVATED");
    if (tx.activation_state === "ambiguous") b.push("ACTIVATION_AMBIGUOUS");
    if (!confirmed) b.push("ADMIN_CONFIRMATION_REQUIRED");
    if (!issuedInvoices.length) w.push("NO_REQUIRED_INVOICES_FOUND");
    return {
      ready: b.length === 0,
      blockingCodes: [...new Set(b)],
      warnings: w,
      summary: b.length
        ? "Proof activation is blocked pending administrator review."
        : "Proof transaction is ready for confirmed activation.",
    };
  }
  private async persistProvider(
    rows: SignerRecord[],
    provider: ProofProviderSigner[],
    admin: string,
    invitationSent = false,
  ) {
    const out = [];
    for (const row of rows) {
      const match = this.providerMatch(row, provider);
      out.push(
        await this.repo.updateSigner(row.id, {
          proof_signer_id: match?.id ?? row.proof_signer_id,
          proof_status: match?.status ?? row.proof_status,
          configuration_state: match ? "configured" : row.configuration_state,
          invitation_state:
            invitationSent && row.invitation_state === "not_invited"
              ? "invited"
              : row.invitation_state,
          invited_at: invitationSent
            ? row.invited_at ?? new Date().toISOString()
            : row.invited_at,
          access_link_present: row.access_link_present ||
            Boolean(match?.accessLinkPresent),
          access_link: match?.accessLink ?? row.access_link,
          configured_at: match ? new Date().toISOString() : row.configured_at,
          last_synced_at: new Date().toISOString(),
          updated_by: admin,
        }),
      );
    }
    return out;
  }
  private providerMatch(row: SignerRecord, provider: ProofProviderSigner[]) {
    const external = provider.find((p) => p.externalId === row.external_id);
    if (external) return external;
    const email = row.email.toLowerCase();
    const matches = provider.filter((p) => p.email === email);
    return matches.length === 1 ? matches[0] : undefined;
  }
  private async markSigner(
    tx: ActivationTransaction,
    input: ActivationCommandInput,
    admin: string,
  ) {
    const reason = requiredReason(input.reason),
      row = (await this.repo.listSigners(tx.id)).find((s) =>
        s.id === input.signerId
      );
    if (!row) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof signer was not found.",
        404,
      );
    }
    return {
      kind: "signer",
      signer: signerProjection(
        await this.repo.updateSigner(row.id, {
          configuration_state: "manual_review",
          manual_review_reason: reason,
          updated_by: admin,
        }),
      ),
    };
  }
  private async markActivation(
    tx: ActivationTransaction,
    input: ActivationCommandInput,
    admin: string,
  ) {
    const updated = await this.repo.updateTransaction(tx.id, {
      activation_state: "manual_review",
      activation_manual_review_reason: requiredReason(input.reason),
      updated_by: admin,
    });
    return { kind: "activation", state: updated.activation_state };
  }
  private async transaction(id?: string) {
    if (!id) throw readyError("Proof integration ID is required.");
    const tx = await this.repo.getTransaction(id);
    if (!tx) {
      throw new ProofError(
        "PROOF_NOT_FOUND",
        "Proof integration was not found.",
        404,
      );
    }
    return tx;
  }
  private ownership(tx: ActivationTransaction, request?: string) {
    if (request && request !== tx.service_request_id) {
      throw readyError(
        "Proof integration does not belong to the selected APS request.",
      );
    }
    if (tx.environment !== this.environment) {
      throw readyError("Proof environment mismatch.");
    }
  }
  private audit(
    tx: ActivationTransaction,
    c: string,
    o: string,
    a: string,
    e?: ProofError,
  ) {
    proofLogger.idempotency({
      aps_request_id: tx.service_request_id,
      integration_id: tx.id,
      command: c,
      outcome: o,
      signer_count: undefined,
      transaction_id_suffix: tx.proof_transaction_id?.slice(-6),
      provider_status: e?.providerStatus,
      normalized_error_code: e?.code,
    });
    return this.repo.log(tx, c, o, a, e).catch(() => undefined);
  }
}
function validateSigners(
  input: SignerInput[] | undefined,
  count: number | null | undefined,
) {
  if (!Array.isArray(input) || !input.length || input.length > 10) {
    throw readyError("One to ten explicitly approved signers are required.");
  }
  if (!count || input.length !== count) {
    throw readyError("Signer count does not match the APS RON request.");
  }
  const emails = new Set<string>(),
    refs = new Set<string>(),
    orders = new Set<number>();
  return input.map((s) => {
    const email = String(s.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw readyError("Every signer requires a valid email.");
    }
    if (
      emails.has(email) || refs.has(s.apsSignerReference) || orders.has(s.order)
    ) {
      throw readyError(
        "Duplicate signer email, reference, or order is not allowed.",
      );
    }
    if (!Number.isInteger(s.order) || s.order < 1 || s.order > 10) {
      throw readyError("Signer order must be between 1 and 10.");
    }
    if (Boolean(s.entity) !== Boolean(s.capacity)) {
      throw readyError("Signer entity and capacity must be supplied together.");
    }
    emails.add(email);
    refs.add(s.apsSignerReference);
    orders.add(s.order);
    return { ...s, email };
  }).sort((a, b) => a.order - b.order);
}
export function externalId(tx: string, order: number) {
  return `aps:proof_signer:${tx}:${order}`;
}
export function witnessPolicy(c: ReadinessContext) {
  if (c.ron?.witness_review_required) return "WITNESS_MAPPING_REQUIRED";
  if (Number(c.ron?.client_witness_count ?? 0) > 0) {
    return "WITNESS_MAPPING_REQUIRED";
  }
  if (Number(c.ron?.provided_witness_count ?? 0) > 0) {
    return c.assets.length &&
        c.assets.every((asset) =>
          asset.requirement !== "notarization" ||
          asset.witness_required === true
        )
      ? null
      : "WITNESS_REQUIREMENT_MISMATCH";
  }
  return null;
}

export function draftEnrichment(
  tx: ActivationTransaction,
  context: ReadinessContext,
  signers: SignerInput[],
) {
  const reference = `APS-${tx.service_request_id.slice(0, 8).toUpperCase()}`;
  const confirmed = Boolean(
    context.request.appointment_confirmed_at &&
      context.request.appointment_date &&
      context.request.appointment_time &&
      validTimezone(context.request.appointment_timezone),
  );
  const appointment = confirmed
    ? proofAppointment(
      context.request.appointment_date!,
      context.request.appointment_time!,
      context.request.appointment_timezone!,
    )
    : null;
  const signerNames = signers.map((signer) =>
    [signer.firstName, signer.middleName, signer.lastName].filter(Boolean).join(
      " ",
    )
  ).filter(Boolean);
  const acts = notarialActs(
    context.request.estimate_components,
    context.ron?.number_of_notarizations ?? 0,
  );
  const documents = context.assets.map((asset) => {
    const pages = asset.detected_page_count
      ? ` (${asset.detected_page_count} page${
        asset.detected_page_count === 1 ? "" : "s"
      })`
      : "";
    return `${asset.file_name || "Selected APS source document"}${pages}`;
  });
  const provided = Number(context.ron?.provided_witness_count ?? 0);
  const customer = Number(context.ron?.client_witness_count ?? 0);
  const witness = provided
    ? `PROOF ON-DEMAND WITNESS REQUIRED × ${provided} — call the required witness through Proof during the live session.`
    : customer
    ? `Customer-provided witness × ${customer}`
    : "None";
  const customerNotes = safeNote(context.request.notes) || "None";
  const operatorNotes = safeNote(context.request.appointment_instructions) ||
    "None";
  const appointmentText = confirmed && appointment
    ? `${context.request.appointment_date}\n${context.request.appointment_time}\n${context.request.appointment_timezone}`
    : "Not yet confirmed in APS";
  const notaryInstructions = [
    `APS REQUEST: ${reference}`,
    "SERVICE: Remote Online Notarization",
    `APPOINTMENT:\n${appointmentText}`,
    `SIGNER(S):\n${signerNames.join("\n") || "Not provided"}`,
    `REQUESTED NOTARIAL ACTS:\n${acts}`,
    `DOCUMENT(S):\n${documents.join("\n") || "No APS document selected"}`,
    `WITNESS:\n${witness}`,
    `CUSTOMER NOTES:\n${customerNotes}`,
    `APS OPERATOR NOTES:\n${operatorNotes}`,
    `APS REFERENCE: ${reference}`,
  ].join("\n\n").slice(0, 12_000);
  const messageToSigner = confirmed
    ? [
      "Your Remote Online Notarization with Aligned Print & Scan is ready.",
      `Appointment: ${context.request.appointment_date} · ${context.request.appointment_time} · ${context.request.appointment_timezone}`,
      "Please use the secure Proof link in this message to complete the required identity-verification steps and access your online notarization.",
      "Please have your acceptable government-issued identification available and join from a compatible device with a working camera, microphone, and stable internet connection.",
      `For help with your APS appointment, contact Aligned Print & Scan and reference ${reference}.`,
    ].join("\n\n")
    : null;
  return {
    transactionName: `${reference} — RON — ${signers[0]?.lastName || "Signer"}`,
    notaryMeetingTime: appointment,
    notaryInstructions,
    messageToSigner,
  };
}

function proofPhone(value?: string) {
  const digits = String(value || "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
  return national.length === 10 ? { countryCode: "1", number: national } : null;
}

function proofAppointment(date: string, time: string, timezone: string) {
  const match = time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  const [year, month, day] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess).map((part) => [part.type, part.value]),
  );
  const rendered = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  const offsetMinutes = Math.round((rendered - guess.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${
    String(Math.floor(absolute / 60)).padStart(2, "0")
  }:${String(absolute % 60).padStart(2, "0")}`;
  return `${date}T${String(hour).padStart(2, "0")}:${
    String(minute).padStart(2, "0")
  }:00${offset}`;
}

function notarialActs(value: unknown, fallback: number) {
  const labels: string[] = [];
  const walk = (item: unknown) => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const label = String(row.label || row.name || row.description || "").trim();
    const quantity = Number(row.quantity || row.count || 0);
    if (
      label &&
      /(acknowledg|jurat|notarial act|signature witness|certified copy)/i.test(
        label,
      )
    ) {
      labels.push(`${label}${quantity > 0 ? ` × ${quantity}` : ""}`);
    }
    Object.values(row).forEach(walk);
  };
  walk(value);
  return [...new Set(labels)].join("\n") ||
    `Notarial act${fallback === 1 ? "" : "s"} × ${fallback || 1}`;
}

function safeNote(value?: string | null) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(
    /\s+/g,
    " ",
  ).trim().slice(0, 1500);
}
function editable(tx: ActivationTransaction) {
  return tx.creation_state === "created" &&
    (tx.proof_status === "started" || tx.provider_detailed_status === "draft");
}
function editableProvider(tx: ProofProviderTransaction) {
  return tx.status === "started" || tx.detailedStatus === "draft";
}

function providerInvitationSent(tx: ProofProviderTransaction) {
  return tx.status === "sent" || tx.detailedStatus === "sent_to_signer";
}
function validTimezone(v: string | null) {
  if (!v) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}
function requiredReason(v?: string) {
  const r = String(v ?? "").trim().slice(0, 500);
  if (!r) throw readyError("A manual-review reason is required.");
  return r;
}
function readyError(m: string) {
  return new ProofError("PROOF_READINESS_ERROR", m, 422);
}
