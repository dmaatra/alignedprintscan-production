import { getProofConfig } from "../_shared/proof/config.ts";
import { normalizeProofFailure } from "../_shared/proof/errors.ts";
import { ProofWebhookLifecycle } from "../_shared/proof/webhook-lifecycle.ts";
import { SupabaseWebhookRepository } from "../_shared/proof/webhook-repository.ts";
import { verifyProofWebhook } from "../_shared/proof/webhook-security.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "POST required." },
      }),
      { status: 405, headers: { ...headers, Allow: "POST" } },
    );
  }

  try {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const fingerprint = await verifyProofWebhook(
      rawBody,
      request.headers.get("X-Notarize-Signature"),
    );
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return safeError(
        "PROOF_MALFORMED_RESPONSE",
        "Proof webhook JSON is malformed.",
        400,
      );
    }
    const config = getProofConfig();
    const result = await new ProofWebhookLifecycle(
      new SupabaseWebhookRepository(),
    ).accept(payload, fingerprint, config.environment);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers,
    });
  } catch (error) {
    const normalized = normalizeProofFailure(error);
    return safeError(
      normalized.code,
      normalized.message,
      normalized.httpStatus,
    );
  }
});

function safeError(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers,
  });
}
