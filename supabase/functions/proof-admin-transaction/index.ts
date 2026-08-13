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
import { ProofActivationLifecycle } from "../_shared/proof/activation-lifecycle.ts";
import { SupabaseActivationRepository } from "../_shared/proof/activation-repository.ts";
import type { ActivationCommandInput } from "../_shared/proof/activation-types.ts";
import {
  ProofTransactionLifecycle,
  type TransactionCommandInput,
} from "../_shared/proof/transaction-lifecycle.ts";
import { registerProofWebhook } from "../_shared/proof/webhook-registration.ts";
import { ProofControlPanel } from "../_shared/proof/control-panel.ts";

const commands = new Set([
  "organization_check",
  "create_draft",
  "retrieve",
  "refresh",
  "delete_draft",
  "cancel_local",
  "mark_manual_review",
]);
const activationCommands = new Set([
  "list_signers",
  "configure_signers",
  "configure_approved_signers",
  "refresh_signers",
  "evaluate_activation_readiness",
  "activate",
  "mark_signer_manual_review",
  "mark_activation_manual_review",
]);
const infrastructureCommands = new Set(["register_webhook"]);
const readCommands = new Set(["get_control_panel"]);

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
    if (
      !body ||
      !(commands.has(String(body.command ?? "")) ||
        activationCommands.has(String(body.command ?? "")) ||
        infrastructureCommands.has(String(body.command ?? "")) ||
        readCommands.has(String(body.command ?? "")))
    ) {
      throw new ProofError(
        "PROOF_VALIDATION_ERROR",
        "A supported Proof transaction command is required.",
        400,
      );
    }
    const result = readCommands.has(String(body.command))
      ? await new ProofControlPanel().read(String(body.serviceRequestId || ""))
      : await executeConfigured(body, admin.id);
    return new Response(
      JSON.stringify({ ok: true, ...(result as Record<string, unknown>) }),
      {
        status: 200,
        headers: proofJsonHeaders,
      },
    );
  } catch (error) {
    return proofErrorResponse(error);
  }
});

async function executeConfigured(
  body: TransactionCommandInput,
  adminId: string,
) {
  const config = getProofConfig();
  const service = new ProofService();
  return infrastructureCommands.has(String(body.command))
    ? await registerProofWebhook(service)
    : activationCommands.has(String(body.command))
    ? await new ProofActivationLifecycle(
      new SupabaseActivationRepository(),
      service,
      config.environment,
    ).execute(body as unknown as ActivationCommandInput, adminId)
    : await new ProofTransactionLifecycle(
      new SupabaseProofTransactionRepository(),
      service,
      config.environment,
    ).execute(body, adminId);
}
