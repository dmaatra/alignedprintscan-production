import { requireProofAdmin } from "../_shared/proof/admin-auth.ts";
import {
  proofCorsHeaders,
  proofErrorResponse,
  proofJsonHeaders,
} from "../_shared/proof/admin-handler.ts";
import { getProofConfig } from "../_shared/proof/config.ts";
import { ProofDocumentLifecycle } from "../_shared/proof/document-lifecycle.ts";
import { ProofCompletedAssetLifecycle } from "../_shared/proof/completed-asset-lifecycle.ts";
import { SupabaseCompletedAssetRepository } from "../_shared/proof/completed-asset-repository.ts";
import type { CompletedAssetInput } from "../_shared/proof/completed-asset-types.ts";
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
    const body = await request.json() as
      | DocumentCommandInput
      | CompletedAssetInput;
    const config = getProofConfig();
    const completedCommands = new Set([
      "list_completed_assets",
      "retrieve_completed_document",
      "retrieve_audit_trail",
      "stage_completed_asset",
      "refresh_completed_asset_state",
      "mark_asset_manual_review",
    ]);
    const service = new ProofService();
    const result = completedCommands.has(body.command)
      ? await new ProofCompletedAssetLifecycle(
        new SupabaseCompletedAssetRepository(),
        service,
      ).execute(body as CompletedAssetInput, admin.id)
      : await new ProofDocumentLifecycle(
        new SupabaseProofDocumentRepository(),
        service,
        config.environment,
      ).execute(body as DocumentCommandInput, admin.id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: proofJsonHeaders,
    });
  } catch (error) {
    return proofErrorResponse(error);
  }
});
