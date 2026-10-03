// Run with node --experimental-transform-types --test.
import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseCompletedAssetRepository } from "../supabase/functions/_shared/proof/completed-asset-repository.ts";

test("concurrent staging and retries preserve one reviewed/released canonical identity", async () => {
  const previousFetch = globalThis.fetch, previousDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: name => name === "SUPABASE_URL" ? "https://fixture.invalid" : "fixture-key" } };
  let canonical = null, insertAttempts = 0;
  const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status });
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.includes("/rest/v1/request_files?") && !init.method) return json(canonical ? [canonical] : []);
    if (path.includes("/storage/v1/object/proof-assets/")) return new Response(new Uint8Array([37, 80, 68, 70]));
    if (path.includes("/storage/v1/object/service-request-files/")) return new Response(null, { status: 409 });
    if (path.endsWith("/rest/v1/request_files") && init.method === "POST") {
      insertAttempts++;
      if (canonical) return json({ code: "23505" }, 409);
      const body = JSON.parse(init.body);
      assert.equal(body.uploaded_by, "proof");
      assert.equal(body.customer_visible, false);
      canonical = { ...body, id: "canonical", review_state: "approved", customer_visible: true, eligible_for_delivery: true };
      return json([canonical]);
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  try {
    const repo = new SupabaseCompletedAssetRepository();
    const asset = { id: "asset", asset_type: "completed_document", retrieval_state: "retrieved", storage_bucket: "proof-assets", storage_path: "artifact.pdf", file_name: "completed.pdf", sha256: "fingerprint" };
    assert.deepEqual(await Promise.all([repo.stageForReview(asset, "request"), repo.stageForReview(asset, "request")]), ["canonical", "canonical"]);
    assert.equal(insertAttempts, 2);
    assert.equal(await repo.stageForReview(asset, "request"), "canonical");
    assert.equal(insertAttempts, 2);
    assert.equal(canonical.review_state, "approved");
    assert.equal(canonical.customer_visible, true);
    await assert.rejects(repo.stageForReview({ ...asset, retrieval_state: "not_retrieved" }, "request"), /Retrieve the completed Proof asset/);
  } finally { globalThis.fetch = previousFetch; globalThis.Deno = previousDeno; }
});
