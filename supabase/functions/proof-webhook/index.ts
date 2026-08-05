import { proofLogger } from "../_shared/proof/logger.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve((request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "POST required." },
      }),
      { status: 405, headers: { ...headers, Allow: "POST" } },
    );
  }

  // Fail closed until Proof's official signature header, HMAC algorithm,
  // timestamp tolerance, replay rules, and webhook secret name are confirmed.
  // This endpoint must authenticate the exact raw body with HMAC before parsing.
  proofLogger.error({
    operation: "handle_webhook",
    code: "PROOF_HMAC_NOT_IMPLEMENTED",
  });
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "PROOF_HMAC_NOT_IMPLEMENTED",
        message: "Proof webhook authentication is not active.",
      },
    }),
    { status: 501, headers },
  );
});
