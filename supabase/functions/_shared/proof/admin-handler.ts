import { requireProofAdmin } from "./admin-auth.ts";
import { normalizeProofFailure, ProofError } from "./errors.ts";
import { proofLogger } from "./logger.ts";
import {
  assertIdempotencyKey,
  type ProofFoundationOperation,
  ProofService,
} from "./service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, idempotency-key, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

type AdminOperation = Exclude<ProofFoundationOperation, "handle_webhook">;

export function serveProofAdmin(allowedOperations: readonly AdminOperation[]) {
  Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    try {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "METHOD_NOT_ALLOWED", message: "POST required." },
          }),
          { status: 405, headers: { ...jsonHeaders, Allow: "POST" } },
        );
      }
      const admin = await requireProofAdmin(request);
      const body = await request.json().catch(() => ({})) as {
        operation?: string;
      };
      const operation = String(body.operation ?? "") as AdminOperation;
      if (!allowedOperations.includes(operation)) {
        throw new ProofError(
          "PROOF_VALIDATION_ERROR",
          "A supported Proof operation is required.",
          400,
        );
      }
      const mutating = operation === "create_transaction" ||
        operation === "upload_documents" ||
        operation === "activate_transaction";
      const key = mutating
        ? assertIdempotencyKey(request.headers.get("idempotency-key"))
        : undefined;
      const service = new ProofService();
      const result = operation === "create_transaction"
        ? await service.createTransaction(key)
        : operation === "upload_documents"
        ? await service.uploadDocuments(key)
        : operation === "activate_transaction"
        ? await service.activateTransaction(key)
        : operation === "retrieve_transaction"
        ? await service.retrieveTransaction()
        : await service.retrieveCompletedDocuments();
      proofLogger.response({
        operation,
        implemented: false,
        admin_user_id: admin.id,
      });
      return new Response(JSON.stringify(result), {
        status: 501,
        headers: jsonHeaders,
      });
    } catch (error) {
      const normalized = normalizeProofFailure(error);
      proofLogger.error({
        code: normalized.code,
        provider_status: normalized.providerStatus,
      });
      return new Response(JSON.stringify(normalized.toResponseBody()), {
        status: normalized.httpStatus,
        headers: jsonHeaders,
      });
    }
  });
}
