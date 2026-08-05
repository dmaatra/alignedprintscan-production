import { requireProofAdmin } from "./admin-auth.ts";
import { normalizeProofFailure, ProofError } from "./errors.ts";
import { proofLogger } from "./logger.ts";

export const proofCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const proofJsonHeaders = {
  ...proofCorsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export function proofErrorResponse(error: unknown): Response {
  const normalized = normalizeProofFailure(error);
  proofLogger.error({
    code: normalized.code,
    provider_status: normalized.providerStatus,
  });
  return new Response(JSON.stringify(normalized.toResponseBody()), {
    status: normalized.httpStatus,
    headers: proofJsonHeaders,
  });
}

export function serveProofDocumentPlaceholder() {
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
      await requireProofAdmin(request);
      throw new ProofError(
        "PROOF_NOT_IMPLEMENTED",
        "Proof document operations are reserved for a future increment.",
        501,
      );
    } catch (error) {
      return proofErrorResponse(error);
    }
  });
}
