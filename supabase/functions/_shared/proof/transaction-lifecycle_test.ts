import { requireProofAdmin } from "./admin-auth.ts";
import { ProofError } from "./errors.ts";
import { sanitizeProofLogValue } from "./logger.ts";
import type {
  AttemptInput,
  ClaimInput,
  ProofTransactionRepository,
} from "./repository.ts";
import { type ProofProviderTransaction, ProofService } from "./service.ts";
import { mapProofTransactionStatus } from "./status-map.ts";
import {
  type ProofLifecycleService,
  ProofTransactionLifecycle,
} from "./transaction-lifecycle.ts";
import type {
  ProofTransactionRecord,
  ServiceRequestProofReadiness,
} from "./transaction-types.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}
async function rejects(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof ProofError && error.code === code,
      `expected ${code}`,
    );
    return;
  }
  throw new Error(`expected rejection ${code}`);
}

class MemoryRepository implements ProofTransactionRepository {
  rows = new Map<string, ProofTransactionRecord>();
  attempts: AttemptInput[] = [];
  request: ServiceRequestProofReadiness | null = {
    id: requestId,
    service_type: "ron",
  };
  claimBarrier = false;
  async getServiceRequest() {
    return this.request;
  }
  async getById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findActive(serviceRequestId: string) {
    return [...this.rows.values()].find((row) =>
      row.service_request_id === serviceRequestId && row.is_active
    ) ?? null;
  }
  async findLatest(serviceRequestId: string) {
    return [...this.rows.values()].find((row) =>
      row.service_request_id === serviceRequestId
    ) ?? null;
  }
  async claim(input: ClaimInput) {
    const active = await this.findActive(input.serviceRequestId);
    if (this.claimBarrier || active) {
      return null;
    }
    this.claimBarrier = true;
    const row = record({
      id: input.id,
      service_request_id: input.serviceRequestId,
      environment: input.environment,
      external_id: input.externalId,
      idempotency_key: input.idempotencyKey,
    });
    this.rows.set(row.id, row);
    return row;
  }
  async retryRejected(id: string, key: string, count: number) {
    const row = this.rows.get(id);
    if (!row || !["rejected", "failed"].includes(row.creation_state)) {
      return null;
    }
    return await this.update(id, {
      creation_state: "claimed",
      idempotency_key: key,
      creation_attempt_count: count,
    });
  }
  async update(id: string, patch: Record<string, unknown>) {
    const current = this.rows.get(id);
    if (!current) throw new Error("missing row");
    const updated = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    } as ProofTransactionRecord;
    this.rows.set(id, updated);
    return updated;
  }
  async logAttempt(input: AttemptInput) {
    this.attempts.push(input);
  }
}

function record(
  patch: Partial<ProofTransactionRecord> = {},
): ProofTransactionRecord {
  const now = new Date().toISOString();
  return {
    id: integrationId,
    service_request_id: requestId,
    proof_transaction_id: null,
    idempotency_key: "key",
    workflow_category: "aps_originated",
    environment: "production",
    external_id: `aps:service_request:${requestId}`,
    creation_state: "claimed",
    proof_status: null,
    provider_detailed_status: null,
    aps_status: "preparing",
    is_active: true,
    creation_attempt_count: 1,
    claim_acquired_at: now,
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
    last_command: "create_draft",
    last_command_at: now,
    created_at: now,
    updated_at: now,
    ...patch,
  };
}

function provider(
  patch: Partial<ProofProviderTransaction> = {},
): ProofProviderTransaction {
  return {
    id: "proof_tx_123",
    externalId: `aps:service_request:${requestId}`,
    status: "started",
    detailedStatus: "draft",
    createdAt: null,
    updatedAt: null,
    ...patch,
  };
}

function fakeService(
  overrides: Partial<ProofLifecycleService> = {},
): ProofLifecycleService {
  return {
    getOrganization: async () => ({ id: "org_123", name: "APS" }),
    createDraftTransaction: async () => provider(),
    getTransaction: async () => provider(),
    deleteDraftTransaction: async () => ({ deleted: true }),
    ...overrides,
  };
}

function lifecycle(repo = new MemoryRepository(), service = fakeService()) {
  return {
    repo,
    sut: new ProofTransactionLifecycle(repo, service, "production"),
  };
}

Deno.test("valid organization check returns safe metadata", async () => {
  const { sut } = lifecycle();
  const result = await sut.execute({ command: "organization_check" }, adminId);
  assert(
    result.kind === "organization" && result.organization.id === "org_123",
  );
});

Deno.test("invalid API key is normalized", async () => {
  const service = new ProofService({
    request: () =>
      Promise.reject(
        new ProofError(
          "PROOF_UNAUTHORIZED",
          "Proof authentication failed.",
          401,
        ),
      ),
  });
  await rejects(() => service.getOrganization(), "PROOF_UNAUTHORIZED");
});

Deno.test("draft creation succeeds and stores provider identity", async () => {
  const { sut } = lifecycle();
  const result = await sut.execute({
    command: "create_draft",
    serviceRequestId: requestId,
    signerEmail: "signer@example.test",
  }, adminId);
  assert(
    result.kind === "transaction" &&
      result.transaction.providerTransactionId === "proof_tx_123",
  );
});

Deno.test("duplicate click returns existing integration", async () => {
  const { repo, sut } = lifecycle();
  repo.rows.set(integrationId, record());
  const result = await sut.execute({
    command: "create_draft",
    serviceRequestId: requestId,
    signerEmail: "signer@example.test",
  }, adminId);
  assert(result.kind === "transaction" && result.duplicate === true);
});

Deno.test("concurrent claim loser returns winner", async () => {
  let creates = 0;
  const repo = new MemoryRepository();
  const service = fakeService({
    createDraftTransaction: async () => {
      creates += 1;
      return provider();
    },
  });
  const first = new ProofTransactionLifecycle(repo, service, "production");
  const second = new ProofTransactionLifecycle(repo, service, "production");
  const results = await Promise.all([
    first.execute({
      command: "create_draft",
      serviceRequestId: requestId,
      signerEmail: "signer@example.test",
    }, adminId),
    second.execute({
      command: "create_draft",
      serviceRequestId: requestId,
      signerEmail: "signer@example.test",
    }, adminId),
  ]);
  assert(creates === 1, `expected one provider create, got ${creates}`);
  assert(
    results.some((result) =>
      result.kind === "transaction" && result.duplicate === true
    ),
    "expected one command to return the winning claim as a duplicate",
  );
});

Deno.test("pre-validation blocks missing signer email before claim", async () => {
  const { repo, sut } = lifecycle();
  await rejects(
    () =>
      sut.execute(
        { command: "create_draft", serviceRequestId: requestId },
        adminId,
      ),
    "PROOF_READINESS_ERROR",
  );
  assert(repo.rows.size === 0);
});

for (
  const [name, error, state] of [
    [
      "provider 422 is a confirmed rejection",
      new ProofError("PROOF_VALIDATION_ERROR", "rejected", 422, false, 422),
      "rejected",
    ],
    [
      "provider 500 is ambiguous after dispatch",
      new ProofError(
        "PROOF_PROVIDER_ERROR",
        "unknown",
        502,
        true,
        500,
        undefined,
        true,
      ),
      "ambiguous",
    ],
    [
      "timeout before possible dispatch releases claim",
      new ProofError(
        "PROOF_TIMEOUT",
        "timeout",
        504,
        true,
        undefined,
        undefined,
        false,
      ),
      "failed",
    ],
    [
      "timeout after possible dispatch preserves claim",
      new ProofError(
        "PROOF_TIMEOUT",
        "timeout",
        504,
        true,
        undefined,
        undefined,
        true,
      ),
      "ambiguous",
    ],
  ] as const
) {
  Deno.test(name, async () => {
    const { repo, sut } = lifecycle(
      new MemoryRepository(),
      fakeService({ createDraftTransaction: () => Promise.reject(error) }),
    );
    await rejects(
      () =>
        sut.execute({
          command: "create_draft",
          serviceRequestId: requestId,
          signerEmail: "signer@example.test",
        }, adminId),
      state === "ambiguous" ? "PROOF_AMBIGUOUS_RESULT" : error.code,
    );
    assert([...repo.rows.values()][0].creation_state === state);
  });
}

Deno.test("existing created transaction is returned without a create", async () => {
  let called = false;
  const { repo, sut } = lifecycle(
    new MemoryRepository(),
    fakeService({
      createDraftTransaction: async () => {
        called = true;
        return provider();
      },
    }),
  );
  repo.rows.set(
    integrationId,
    record({ creation_state: "created", proof_transaction_id: "proof_tx_123" }),
  );
  await sut.execute({
    command: "create_draft",
    serviceRequestId: requestId,
    signerEmail: "signer@example.test",
  }, adminId);
  assert(!called);
});

Deno.test("retrieve synchronizes only provider-owned projection", async () => {
  const { repo, sut } = lifecycle();
  repo.rows.set(
    integrationId,
    record({ proof_transaction_id: "proof_tx_123" }),
  );
  const result = await sut.execute(
    { command: "retrieve", integrationId },
    adminId,
  );
  assert(
    result.kind === "transaction" &&
      result.transaction.providerDetailedStatus === "draft",
  );
});

Deno.test("retrieve not found is safe", async () => {
  const { sut } = lifecycle(
    new MemoryRepository(),
    fakeService({
      getTransaction: () =>
        Promise.reject(new ProofError("PROOF_NOT_FOUND", "not found", 404)),
    }),
  );
  const repo = (sut as unknown as { repository: MemoryRepository }).repository;
  repo.rows.set(
    integrationId,
    record({ proof_transaction_id: "proof_tx_123" }),
  );
  await rejects(
    () => sut.execute({ command: "retrieve", integrationId }, adminId),
    "PROOF_NOT_FOUND",
  );
});

Deno.test("status normalization hides raw terminology", () => {
  assert(
    mapProofTransactionStatus("complete_with_rejections") ===
      "requires_attention",
  );
});

Deno.test("delete incomplete draft preserves local row", async () => {
  const { repo, sut } = lifecycle();
  repo.rows.set(
    integrationId,
    record({ proof_transaction_id: "proof_tx_123", creation_state: "created" }),
  );
  const result = await sut.execute({
    command: "delete_draft",
    integrationId,
    confirmDelete: true,
  }, adminId);
  assert(
    result.kind === "transaction" &&
      result.transaction.creationState === "deleted" &&
      repo.rows.has(integrationId),
  );
});

Deno.test("delete rejected due to provider state requires review", async () => {
  const { repo, sut } = lifecycle(
    new MemoryRepository(),
    fakeService({
      getTransaction: async () =>
        provider({ status: "sent", detailedStatus: "active" }),
    }),
  );
  repo.rows.set(
    integrationId,
    record({ proof_transaction_id: "proof_tx_123", creation_state: "created" }),
  );
  await rejects(
    () =>
      sut.execute({
        command: "delete_draft",
        integrationId,
        confirmDelete: true,
      }, adminId),
    "PROOF_READINESS_ERROR",
  );
  assert(repo.rows.get(integrationId)?.creation_state === "manual_review");
});

Deno.test("Proof ODN create is blocked", async () => {
  const { sut } = lifecycle();
  await rejects(
    () =>
      sut.execute({
        command: "create_draft",
        serviceRequestId: requestId,
        signerEmail: "signer@example.test",
        workflowCategory: "proof_odn",
      }, adminId),
    "PROOF_READINESS_ERROR",
  );
});

Deno.test("non-admin is blocked", async () => {
  const fetcher: typeof fetch = (input) =>
    Promise.resolve(
      new Response(
        String(input).includes("/auth/")
          ? JSON.stringify({ id: adminId, email: "admin@example.test" })
          : "false",
        { status: 200 },
      ),
    );
  await rejects(
    () =>
      requireProofAdmin(
        new Request("https://local", {
          headers: { Authorization: "Bearer user-jwt" },
        }),
        {
          supabaseUrl: "https://project.supabase.co",
          anonKey: "anon",
          fetcher,
        },
      ),
    "PROOF_FORBIDDEN",
  );
});

Deno.test("anonymous request is blocked", async () => {
  await rejects(
    () =>
      requireProofAdmin(new Request("https://local"), {
        supabaseUrl: "https://project.supabase.co",
        anonKey: "anon",
        fetcher: fetch,
      }),
    "PROOF_UNAUTHORIZED",
  );
});

Deno.test("secret and raw payload fields are redacted", () => {
  const safe = sanitizeProofLogValue({
    authorization: "secret",
    payload: { signer: "person" },
    nested: { api_key: "secret" },
  }) as Record<string, unknown>;
  assert(safe.authorization === "[REDACTED]" && safe.payload === "[REDACTED]");
});
