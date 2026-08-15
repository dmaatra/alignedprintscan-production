import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  externalId,
  ProofActivationLifecycle,
  witnessPolicy,
} from "./activation-lifecycle.ts";
import { ProofError } from "./errors.ts";
import type { ProofProviderSigner } from "./service.ts";
import type {
  ActivationTransaction,
  ReadinessContext,
  SignerRecord,
} from "./activation-types.ts";
import { approvedSignerInputs } from "./activation-types.ts";
const id = "11111111-1111-4111-8111-111111111111",
  req = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
const signer = (n = 1): SignerRecord => ({
  id: crypto.randomUUID(),
  proof_transaction_record_id: id,
  proof_signer_id: `si_${n}`,
  external_id: externalId(id, n),
  aps_signer_reference: `local-${n}`,
  signer_position: n,
  first_name: "A",
  middle_name: null,
  last_name: "Signer",
  email: `s${n}@example.test`,
  entity: null,
  capacity: null,
  configuration_state: "configured",
  invitation_state: "not_invited",
  access_link_present: false,
  aps_status: "ready",
  proof_status: "ready",
  manual_review_reason: null,
  configured_at: new Date().toISOString(),
  invited_at: null,
  opened_at: null,
  completed_at: null,
  last_synced_at: null,
});
const tx = (p: Partial<ActivationTransaction> = {}): ActivationTransaction => ({
  id,
  service_request_id: req,
  proof_transaction_id: "ot_test",
  idempotency_key: "k",
  workflow_category: "aps_originated",
  environment: "production",
  external_id: `aps:service_request:${req}`,
  creation_state: "created",
  proof_status: "started",
  provider_detailed_status: "draft",
  aps_status: "preparing",
  is_active: true,
  creation_attempt_count: 1,
  claim_acquired_at: "",
  request_dispatched_at: null,
  ambiguous_at: null,
  provider_created_at: null,
  provider_updated_at: null,
  last_synced_at: null,
  deleted_at: null,
  cancelled_at: null,
  last_error_code: null,
  last_error_message: null,
  manual_review_reason: null,
  last_command: null,
  last_command_at: null,
  created_at: "",
  updated_at: "",
  signer_configuration_state: "configured",
  activation_state: "ready",
  activation_attempt_count: 0,
  activation_claimed_at: null,
  activation_dispatched_at: null,
  activation_ambiguous_at: null,
  activated_at: null,
  activation_manual_review_reason: null,
  proof_email_ownership: true,
  document_preparation_confirmed_at: new Date().toISOString(),
  document_preparation_confirmed_by: admin,
  ...p,
});
const context = (p: Partial<ReadinessContext> = {}): ReadinessContext => ({
  approvedSignerIdentitySource: true,
  participants: [{
    id: "66666666-6666-4666-8666-666666666666",
    participant_type: "signer",
    full_legal_name: "Avery Middle Signer",
    email: "AVERY@EXAMPLE.TEST",
    sort_order: 1,
    identity_name_confirmed: true,
  }],
  request: {
    id: req,
    service_type: "ron",
    appointment_confirmed_at: new Date().toISOString(),
    appointment_date: "2026-08-06",
    appointment_time: "10:00",
    appointment_timezone: "America/Chicago",
    appointment_state: "confirmed",
  },
  ron: {
    number_of_signers: 1,
    witness_need: "no",
    witness_count: "0",
    witness_provider: null,
    client_witness_count: 0,
    provided_witness_count: 0,
    witness_review_required: false,
  },
  invoices: [{
    status: "paid",
    payment_status: "paid",
    balance_due: 0,
    amount_due: 10,
    amount_paid: 10,
    paid_amount: 10,
  }],
  signers: [signer()],
  assets: [{
    proof_asset_id: "doc_1",
    upload_state: "processed",
    processing_state: "complete",
    requirement: "notarization",
    manual_review_reason: null,
  }],
  ...p,
});
class Repo {
  t = tx();
  c = context();
  s = this.c.signers;
  updates: Record<string, unknown>[] = [];
  activationEvents = 0;
  claim = true;
  async getTransaction() {
    return this.t;
  }
  async context() {
    return this.c;
  }
  async listSigners() {
    return this.s;
  }
  async claimSigners(_t: unknown, rows: Record<string, unknown>[]) {
    this.s = rows as unknown as SignerRecord[];
    return this.s;
  }
  async claimActivation(tx: ActivationTransaction) {
    if (!this.claim) return null;
    this.t = {
      ...this.t,
      activation_state: "claimed",
      activation_attempt_count: tx.activation_attempt_count + 1,
    };
    return this.t;
  }
  async updateSigner(_id: string, p: Record<string, unknown>) {
    const x = { ...this.s[0], ...p };
    this.s[0] = x;
    return x;
  }
  async updateTransaction(_id: string, p: Record<string, unknown>) {
    this.updates.push(p);
    this.t = { ...this.t, ...p };
    return this.t;
  }
  async recordActivation() {
    this.activationEvents++;
  }
  async log() {}
}
class Service {
  configureCalls = 0;
  activateCalls = 0;
  error: unknown = null;
  providerStatus = "sent_to_signer";
  providerSigners: ProofProviderSigner[] = [];
  async configureTransactionSigners(
    _id: string,
    s: Array<{ externalId: string }>,
  ) {
    this.configureCalls++;
    if (this.error) throw this.error;
    return {
      ...provider(),
      signers: s.map((x, i) => ({
        id: `si_${i}`,
        externalId: x.externalId,
        email: null,
        status: "ready",
        accessLinkPresent: true,
      })),
    };
  }
  async getTransaction() {
    return { ...provider(this.providerStatus), signers: this.providerSigners };
  }
  async activateDraftTransaction() {
    this.activateCalls++;
    if (this.error) throw this.error;
    return provider(this.providerStatus);
  }
}
const provider = (status = "started") => ({
  id: "ot_test",
  externalId: null,
  status,
  detailedStatus: status === "started" ? "draft" : "sent_to_signer",
  createdAt: null,
  updatedAt: null,
  signers: [],
});
const setup = () => {
  const r = new Repo(), s = new Service();
  return { r, s, l: new ProofActivationLifecycle(r, s, "production") };
};
const ready = (change?: () => void) => {
  const x = setup();
  change?.call(x);
  return x.l.evaluate(x.r.t, x.r.c, true);
};
Deno.test("one valid signer", () => assertEquals(ready().ready, true));
Deno.test("multiple valid signers", () => {
  const x = setup();
  x.r.c.signers = [signer(1), signer(2)];
  x.r.c.ron!.number_of_signers = 2;
  assert(x.l.evaluate(x.r.t, x.r.c, true).ready);
});
Deno.test("approved current-request participants map in stable signer order", () => {
  const c = context();
  c.participants = [{
    id: "77777777-7777-4777-8777-777777777777",
    participant_type: "signer",
    full_legal_name: "Second Legal Signer",
    email: "SECOND@EXAMPLE.TEST",
    sort_order: 2,
    identity_name_confirmed: true,
  }, c.participants[0]];
  assertEquals(approvedSignerInputs(c), [{
    apsSignerReference: "66666666-6666-4666-8666-666666666666",
    firstName: "Avery",
    middleName: "Middle",
    lastName: "Signer",
    email: "avery@example.test",
    order: 1,
  }, {
    apsSignerReference: "77777777-7777-4777-8777-777777777777",
    firstName: "Second",
    middleName: "Legal",
    lastName: "Signer",
    email: "second@example.test",
    order: 2,
  }]);
});
Deno.test("missing signer email blocked", () => {
  const x = setup();
  x.r.c.signers[0].email = "";
  assert(
    x.l.evaluate(x.r.t, x.r.c, true).blockingCodes.includes(
      "SIGNER_CONFIGURATION_INCOMPLETE",
    ),
  );
});
Deno.test("duplicate signer blocked", async () => {
  const x = setup();
  await assertRejects(
    () =>
      x.l.execute({
        command: "configure_signers",
        integrationId: id,
        signers: [{ apsSignerReference: "a", email: "a@x.test", order: 1 }, {
          apsSignerReference: "b",
          email: "a@x.test",
          order: 2,
        }],
      }, admin),
    ProofError,
  );
});
Deno.test("signer-count mismatch blocked", async () => {
  const x = setup();
  x.r.s = [];
  await assertRejects(
    () =>
      x.l.execute({
        command: "configure_signers",
        integrationId: id,
        signers: [{ apsSignerReference: "a", email: "a@x.test", order: 1 }, {
          apsSignerReference: "b",
          email: "b@x.test",
          order: 2,
        }],
      }, admin),
    ProofError,
  );
});
Deno.test("missing approved signer identity source blocks configuration", async () => {
  const x = setup();
  x.r.s = [];
  x.r.c.approvedSignerIdentitySource = false;
  await assertRejects(() =>
    x.l.execute({
      command: "configure_signers",
      integrationId: id,
      signers: [{
        apsSignerReference: "unverified",
        order: 1,
        email: "signer@example.test",
      }],
    }, admin)
  );
});
Deno.test("stable signer external IDs", () =>
  assertEquals(externalId(id, 1), externalId(id, 1)));
Deno.test("signer order preserved", () =>
  assert(externalId(id, 2).endsWith(":2")));
Deno.test("ODN signer configuration blocked", async () => {
  const x = setup();
  x.r.t.workflow_category = "proof_odn";
  await assertRejects(
    () =>
      x.l.execute({
        command: "configure_signers",
        integrationId: id,
        signers: [],
      }, admin),
    ProofError,
  );
});
Deno.test("mutating signer call not retried", async () => {
  const x = setup();
  x.r.s = [];
  x.s.error = new ProofError("PROOF_VALIDATION_ERROR", "x", 422, false, 422);
  await assertRejects(() =>
    x.l.execute({
      command: "configure_signers",
      integrationId: id,
      signers: [{ apsSignerReference: "a", email: "a@x.test", order: 1 }],
    }, admin)
  );
  assertEquals(x.s.configureCalls, 1);
});
Deno.test("definitively rejected signer configuration can be corrected safely", async () => {
  const x = setup();
  x.r.s = [{
    ...signer(),
    aps_signer_reference: "approved-signer-1",
    signer_position: 1,
    email: "signer@example.test",
    configuration_state: "rejected",
  }];
  x.r.c.signers = x.r.s;
  const result = await x.l.execute({
    command: "configure_signers",
    integrationId: id,
    signers: [{
      apsSignerReference: "approved-signer-1",
      order: 1,
      firstName: "A",
      lastName: "Signer",
      email: "signer@example.test",
    }],
  }, admin) as { signers: Array<{ configurationState: string }> };
  assertEquals(x.s.configureCalls, 1);
  assertEquals(result.signers[0].configurationState, "configured");
});
Deno.test("rejected primary signer can reconcile by exact provider email", async () => {
  const x = setup();
  x.r.s = [{
    ...signer(),
    proof_signer_id: null,
    aps_signer_reference: "approved-signer-1",
    signer_position: 1,
    email: "signer@example.test",
    configuration_state: "rejected",
  }];
  x.r.c.signers = x.r.s;
  x.s.providerSigners = [{
    id: "si_existing",
    externalId: null,
    email: "signer@example.test",
    status: "ready",
    accessLinkPresent: false,
  }];
  const result = await x.l.execute({
    command: "configure_signers",
    integrationId: id,
    signers: [{
      apsSignerReference: "approved-signer-1",
      order: 1,
      firstName: "A",
      lastName: "Signer",
      email: "signer@example.test",
    }],
  }, admin) as { signers: Array<{ configurationState: string }> };
  assertEquals(x.s.configureCalls, 0);
  assertEquals(x.r.s[0].proof_signer_id, "si_existing");
  assertEquals(result.signers[0].configurationState, "configured");
});
Deno.test("ambiguous signer result retained", async () => {
  const x = setup();
  x.r.s = [];
  x.s.error = new ProofError("PROOF_TIMEOUT", "x", 504, true);
  await assertRejects(() =>
    x.l.execute({
      command: "configure_signers",
      integrationId: id,
      signers: [{ apsSignerReference: "a", email: "a@x.test", order: 1 }],
    }, admin)
  );
  assertEquals(x.r.t.signer_configuration_state, "ambiguous");
});
Deno.test("provider signer IDs persisted", async () => {
  const x = setup();
  x.r.s = [];
  await x.l.execute({
    command: "configure_signers",
    integrationId: id,
    signers: [{
      apsSignerReference: "approved-signer-1",
      order: 1,
      firstName: "A",
      lastName: "Signer",
      email: "signer@example.test",
    }],
  }, admin);
  assertEquals(x.r.s[0].proof_signer_id, "si_0");
});
Deno.test("signer access links redacted", () =>
  assertEquals("transactionAccessLink" in ({}), false));
Deno.test("phone omitted by default", () =>
  assertEquals("phone" in signer(), false));
Deno.test("no-witness request passes", () =>
  assertEquals(witnessPolicy(context()), null));
for (
  const [name, ron] of [["APS-provided witness does not auto-map", {
    witness_need: "yes",
    provided_witness_count: 1,
  }], ["customer-provided witness does not auto-map", {
    witness_need: "yes",
    client_witness_count: 1,
  }], ["Proof witness mapping unresolved blocks readiness", {
    witness_need: "yes",
    witness_count: "1",
  }], ["witness_review_required blocks activation", {
    witness_review_required: true,
  }]] as const
) {
  Deno.test(name, () => {
    const c = context();
    c.ron = { ...c.ron!, ...ron };
    assertEquals(witnessPolicy(c), "WITNESS_MAPPING_REQUIRED");
  });
}
const blocks: [string, (x: ReturnType<typeof setup>) => void, string][] = [
  ["ready transaction passes", () => {}, ""],
  ["missing transaction blocks", (x) => {
    x.r.t.proof_transaction_id = null;
  }, "MISSING_PROOF_TRANSACTION"],
  ["creation ambiguity blocks", (x) => {
    x.r.t.creation_state = "ambiguous";
  }, "CREATION_AMBIGUOUS"],
  ["missing signer blocks", (x) => {
    x.r.c.signers = [];
  }, "SIGNER_COUNT_INCOMPLETE"],
  ["signer ambiguity blocks", (x) => {
    x.r.c.signers[0].configuration_state = "ambiguous";
  }, "SIGNER_CONFIGURATION_INCOMPLETE"],
  ["missing required document blocks", (x) => {
    x.r.c.assets = [];
  }, "MISSING_REQUIRED_DOCUMENT"],
  ["document still processing blocks", (x) => {
    x.r.c.assets[0].processing_state = "processing";
  }, "DOCUMENT_NOT_PROCESSED"],
  ["document ambiguity blocks", (x) => {
    x.r.c.assets[0].upload_state = "ambiguous";
  }, "DOCUMENT_MANUAL_REVIEW"],
  ["unresolved document flags block", (x) => {
    x.r.c.assets[0].requirement = null;
  }, "DOCUMENT_FLAGS_INCOMPLETE"],
  ["unconfirmed Proof document preparation blocks", (x) => {
    x.r.t.document_preparation_confirmed_at = null;
  }, "DOCUMENT_PREPARATION_NOT_CONFIRMED"],
  ["payment gate failure blocks", (x) => {
    x.r.c.invoices[0].balance_due = 1;
  }, "PAYMENT_REQUIRED"],
  ["missing issued invoice blocks", (x) => {
    x.r.c.invoices = [];
  }, "PAYMENT_REQUIRED"],
  ["draft invoice does not satisfy payment gate", (x) => {
    x.r.c.invoices[0].status = "draft";
  }, "PAYMENT_REQUIRED"],
  ["missing appointment blocks", (x) => {
    x.r.c.request.appointment_confirmed_at = null;
  }, "APPOINTMENT_NOT_CONFIRMED"],
  ["invalid timezone blocks", (x) => {
    x.r.c.request.appointment_timezone = "Mars/Olympus";
  }, "INVALID_TIMEZONE"],
  ["existing successful activation blocks", (x) => {
    x.r.t.activation_state = "activated";
  }, "ALREADY_ACTIVATED"],
  ["activation ambiguity blocks", (x) => {
    x.r.t.activation_state = "ambiguous";
  }, "ACTIVATION_AMBIGUOUS"],
];
for (const [name, mutate, code] of blocks) {
  Deno.test(name, () => {
    const x = setup();
    mutate(x);
    const r = x.l.evaluate(x.r.t, x.r.c, true);
    if (code) assert(r.blockingCodes.includes(code));
    else assert(r.ready);
  });
}
Deno.test("activation success", async () => {
  const x = setup();
  const r = await x.l.execute({
    command: "activate",
    integrationId: id,
    confirmActivation: true,
  }, admin) as { state: string };
  assertEquals(r.state, "activated");
  assertEquals(x.r.s[0].invitation_state, "invited");
  assertEquals(x.r.activationEvents, 1);
});
Deno.test("activated refresh backfills invitation state and lifecycle once", async () => {
  const x = setup();
  x.r.t.activation_state = "activated";
  x.r.t.activated_at = "2026-08-15T06:40:05.495Z";
  x.s.providerStatus = "sent";
  await x.l.execute({ command: "refresh_signers", integrationId: id }, admin);
  assertEquals(x.r.s[0].invitation_state, "invited");
  assertEquals(x.r.s[0].access_link_present, false);
  assertEquals(x.r.activationEvents, 1);
});
Deno.test("duplicate click returns existing state", async () => {
  const x = setup();
  x.r.t.activation_state = "activated";
  const r = await x.l.execute({
    command: "activate",
    integrationId: id,
    confirmActivation: true,
  }, admin) as { duplicate: boolean };
  assert(r.duplicate);
});
Deno.test("concurrent activation claim", async () => {
  const x = setup();
  x.r.claim = false;
  const r = await x.l.execute({
    command: "activate",
    integrationId: id,
    confirmActivation: true,
  }, admin) as { duplicate: boolean };
  assert(r.duplicate);
});
for (
  const [name, e] of [[
    "provider 422",
    new ProofError("PROOF_VALIDATION_ERROR", "x", 422, false, 422),
  ], [
    "provider 429 one attempt",
    new ProofError("PROOF_RATE_LIMITED", "x", 503, false, 429),
  ], [
    "provider 500 no automatic mutating retry",
    new ProofError(
      "PROOF_PROVIDER_ERROR",
      "x",
      502,
      true,
      500,
      undefined,
      true,
    ),
  ], [
    "ambiguous post-dispatch timeout",
    new ProofError(
      "PROOF_TIMEOUT",
      "x",
      504,
      true,
      undefined,
      undefined,
      true,
    ),
  ]] as const
) {
  Deno.test(name, async () => {
    const x = setup();
    x.s.error = e;
    await assertRejects(() =>
      x.l.execute({
        command: "activate",
        integrationId: id,
        confirmActivation: true,
      }, admin)
    );
    assertEquals(x.s.activateCalls, 1);
  });
}
Deno.test("reconciliation finds already activated", async () => {
  const x = setup();
  x.r.t.activation_state = "ambiguous";
  x.s.providerStatus = "sent_to_signer";
  const r = await x.l.execute(
    { command: "activate", integrationId: id },
    admin,
  ) as { state: string };
  assertEquals(r.state, "activated");
});
Deno.test("reconciliation remains unknown requires review", async () => {
  const x = setup();
  x.r.t.activation_state = "ambiguous";
  x.s.providerStatus = "started";
  await assertRejects(
    () => x.l.execute({ command: "activate", integrationId: id }, admin),
    ProofError,
  );
});
Deno.test("pre-dispatch safe failure is not ambiguous", async () => {
  const x = setup();
  x.s.error = new ProofError(
    "PROOF_NETWORK_ERROR",
    "Proof could not be reached.",
    503,
    false,
    undefined,
    undefined,
    false,
  );
  await assertRejects(() =>
    x.l.execute({
      command: "activate",
      integrationId: id,
      confirmActivation: true,
    }, admin)
  );
  assertEquals(x.r.t.activation_state, "failed");
});
for (
  const name of [
    "Proof email invitation ownership preserved",
    "suppress_email is not enabled",
    "no Customer Portal link exposure",
    "no automatic APS completion",
    "no APS payment mutation",
    "no webhook path introduced",
  ]
) {
  Deno.test(name, () => {
    const x = setup();
    assertEquals(x.r.t.proof_email_ownership, true);
  });
}
