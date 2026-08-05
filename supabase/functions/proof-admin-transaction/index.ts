import { requireProofAdmin } from "../_shared/proof/admin-auth.ts";
import {
  proofCorsHeaders,
  proofErrorResponse,
  proofJsonHeaders,
} from "../_shared/proof/admin-handler.ts";
import { getProofConfig } from "../_shared/proof/config.ts";
import { ProofError } from "../_shared/proof/errors.ts";
import { SupabaseProofTransactionRepository } from "../_shared/proof/repository.ts";
import { ProofService } from "../_shared/proof/service.ts";
import {
  ProofTransactionLifecycle,
  type TransactionCommandInput,
} from "../_shared/proof/transaction-lifecycle.ts";

const commands = new Set([
  "organization_check",
  "create_draft",
  "retrieve",
  "refresh",
  "delete_draft",
  "cancel_local",
  "mark_manual_review",
]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: proofCorsHeaders });
  }
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "POST required." },
        }),
        {
          status: 405,
          headers: { ...proofJsonHeaders, Allow: "POST" },
        },
      );
    }
    const admin = await requireProofAdmin(request);
    const body = await request.json().catch(() => null) as
      | TransactionCommandInput
      | null;
    if (!body || !commands.has(String(body.command ?? ""))) {
      throw new ProofError(
        "PROOF_VALIDATION_ERROR",
        "A supported Proof transaction command is required.",
        400,
      );
    }
    const config = getProofConfig();
    const lifecycle = new ProofTransactionLifecycle(
      new SupabaseProofTransactionRepository(),
      new ProofService(),
      config.environment,
    );
    const result = await lifecycle.execute(body, admin.id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: proofJsonHeaders,
    });
  } catch (error) {
    return proofErrorResponse(error);
  }
});
