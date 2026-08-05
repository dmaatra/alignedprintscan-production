import { requireProofAdmin } from "../_shared/proof/admin-auth.ts";
import {
  proofCorsHeaders,
  proofErrorResponse,
  proofJsonHeaders,
} from "../_shared/proof/admin-handler.ts";
import { getProofConfig } from "../_shared/proof/config.ts";
import { ProofDocumentLifecycle } from "../_shared/proof/document-lifecycle.ts";
import { SupabaseProofDocumentRepository } from "../_shared/proof/document-repository.ts";
import type { DocumentCommandInput } from "../_shared/proof/document-types.ts";
import { ProofService } from "../_shared/proof/service.ts";

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
        { status: 405, headers: { ...proofJsonHeaders, Allow: "POST" } },
      );
    }
    const admin = await requireProofAdmin(request);
    const body = await request.json() as DocumentCommandInput;
    const config = getProofConfig();
    const lifecycle = new ProofDocumentLifecycle(
      new SupabaseProofDocumentRepository(),
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
