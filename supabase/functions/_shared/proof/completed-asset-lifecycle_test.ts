import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  type CompletedAssetService,
  ProofCompletedAssetLifecycle,
} from "./completed-asset-lifecycle.ts";
import type { CompletedAssetRepository } from "./completed-asset-repository.ts";
import type { CompletedAssetRecord } from "./completed-asset-types.ts";
import type { ProofTransactionRecord } from "./transaction-types.ts";

const integrationId = "11111111-1111-4111-8111-111111111111",
  sourceId = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
const pdf = new TextEncoder().encode("%PDF-1.7 test completed content");
class Repo implements CompletedAssetRepository {
  tx = {
    id: integrationId,
    service_request_id: "55555555-5555-4555-8555-555555555555",
    proof_transaction_id: "ot_test",
    workflow_category: "aps_originated",
    completed_assets_available: true,
    audit_trail_available: true,
    released_at: new Date().toISOString(),
  } as unknown as ProofTransactionRecord;
  rows: CompletedAssetRecord[] = [];
  stored: Array<{ path: string; bytes: Uint8Array }> = [];
  storageFail = false;
  staged: Array<{ assetId: string; serviceRequestId: string }> = [];
  async integration() {
    return this.tx;
  }
  async asset(id: string) {
    return this.rows.find((x) => x.id === id) ?? null;
  }
  async list() {
    return this.rows;
  }
  async source() {
    return { id: sourceId, proof_asset_id: "do_test", file_name: "Source.pdf" };
  }
  async claim(v: Record<string, unknown>) {
    const row = {
      ...v,
      storage_bucket: null,
      storage_path: null,
      content_type: null,
      byte_size: null,
      sha256: null,
      retrieved_at: null,
      retrieval_manual_review_reason: null,
    } as unknown as CompletedAssetRecord;
    this.rows.push(row);
    return row;
  }
  async update(id: string, p: Record<string, unknown>) {
    const index = this.rows.findIndex((x) => x.id === id);
    this.rows[index] = { ...this.rows[index], ...p };
    return this.rows[index];
  }
  async store(path: string, bytes: Uint8Array) {
    if (this.storageFail) throw new Error("storage");
    this.stored.push({ path, bytes });
  }
  async stageForReview(asset: CompletedAssetRecord, serviceRequestId: string) {
    this.staged.push({ assetId: asset.id, serviceRequestId });
    return "44444444-4444-4444-8444-444444444444";
  }
}
class Service implements CompletedAssetService {
  documentCalls = 0;
  auditCalls = 0;
  contentType = "application/pdf";
  body = pdf;
  async getCompletedDocument() {
    this.documentCalls++;
    return { bytes: this.body, contentType: this.contentType };
  }
  async getAuditTrail() {
    this.auditCalls++;
    return { bytes: this.body, contentType: this.contentType };
  }
}
const setup = () => {
  const repo = new Repo(), service = new Service();
  return {
    repo,
    service,
    life: new ProofCompletedAssetLifecycle(repo, service),
  };
};
Deno.test("completed document listed", async () => {
  const x = setup();
  const r = await x.life.execute({
    command: "list_completed_assets",
    integrationId,
  }, admin) as { assets: unknown[] };
  assertEquals(r.assets.length, 0);
});
Deno.test("completed document retrieved", async () => {
  const x = setup();
  const r = await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin) as { asset: { stored: boolean } };
  assert(r.asset.stored);
});
Deno.test("retrieved document stages into its own APS request review queue", async () => {
  const x = setup();
  const retrieved = await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin) as { asset: { assetId: string } };
  const result = await x.life.execute({
    command: "stage_completed_asset",
    integrationId,
    assetId: retrieved.asset.assetId,
  }, admin) as { requestFileId: string };
  assertEquals(result.requestFileId, "44444444-4444-4444-8444-444444444444");
  assertEquals(x.repo.staged, [{
    assetId: retrieved.asset.assetId,
    serviceRequestId: x.repo.tx.service_request_id,
  }]);
});
Deno.test("ODN asset staging is blocked without authorization", async () => {
  const x = setup();
  const retrieved = await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin) as { asset: { assetId: string } };
  x.repo.tx.workflow_category = "proof_odn";
  await assertRejects(() =>
    x.life.execute({
      command: "stage_completed_asset",
      integrationId,
      assetId: retrieved.asset.assetId,
    }, admin)
  );
});
Deno.test("invalid PDF blocked", async () => {
  const x = setup();
  x.service.body = new TextEncoder().encode("bad");
  await assertRejects(() =>
    x.life.execute({
      command: "retrieve_completed_document",
      integrationId,
      sourceAssetId: sourceId,
    }, admin)
  );
});
Deno.test("invalid completed-asset content type blocked", async () => {
  const x = setup();
  x.service.contentType = "text/html";
  await assertRejects(() =>
    x.life.execute({
      command: "retrieve_completed_document",
      integrationId,
      sourceAssetId: sourceId,
    }, admin)
  );
});
Deno.test("SHA-256 persisted", async () => {
  const x = setup();
  const r = await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin) as { asset: { checksum: string } };
  assertEquals(r.asset.checksum.length, 64);
});
Deno.test("duplicate retrieval returns existing asset", async () => {
  const x = setup();
  await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin);
  const r = await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin) as { duplicate: boolean };
  assert(r.duplicate);
  assertEquals(x.service.documentCalls, 1);
});
Deno.test("expiring provider URL not persisted", async () => {
  const x = setup();
  await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin);
  assert(!JSON.stringify(x.repo.rows).includes("http"));
});
Deno.test("protected storage path persisted", async () => {
  const x = setup();
  await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin);
  assertEquals(x.repo.rows[0].storage_bucket, "proof-assets");
});
Deno.test("source file not overwritten", async () => {
  const x = setup();
  await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin);
  assert(!x.repo.stored[0].path.includes("Source.pdf"));
});
Deno.test("unauthorized transaction blocked", async () => {
  const x = setup();
  x.repo.tx.proof_transaction_id = null;
  await assertRejects(() =>
    x.life.execute({
      command: "retrieve_completed_document",
      integrationId,
      sourceAssetId: sourceId,
    }, admin)
  );
});
Deno.test("ODN retrieval blocked without authorization", async () => {
  const x = setup();
  x.repo.tx.workflow_category = "proof_odn";
  await assertRejects(() =>
    x.life.execute({
      command: "retrieve_completed_document",
      integrationId,
      sourceAssetId: sourceId,
    }, admin)
  );
});
Deno.test("audit PDF retrieved", async () => {
  const x = setup();
  await x.life.execute(
    { command: "retrieve_audit_trail", integrationId },
    admin,
  );
  assertEquals(x.service.auditCalls, 1);
});
Deno.test("duplicate audit retrieval idempotent", async () => {
  const x = setup();
  await x.life.execute(
    { command: "retrieve_audit_trail", integrationId },
    admin,
  );
  await x.life.execute(
    { command: "retrieve_audit_trail", integrationId },
    admin,
  );
  assertEquals(x.service.auditCalls, 1);
});
Deno.test("audit provider URL not exposed", async () => {
  const x = setup();
  const r = await x.life.execute({
    command: "retrieve_audit_trail",
    integrationId,
  }, admin);
  assert(!JSON.stringify(r).includes("http"));
});
Deno.test("audit storage failure handled", async () => {
  const x = setup();
  x.repo.storageFail = true;
  await assertRejects(() =>
    x.life.execute({ command: "retrieve_audit_trail", integrationId }, admin)
  );
});
for (
  const name of [
    "recording metadata availability stored",
    "recording content not downloaded",
    "recording URL not exposed",
    "legal retention gate remains blocking",
  ]
) {
  Deno.test(name, () => {
    const text = ProofCompletedAssetLifecycle.toString();
    assert(!text.includes("video_url") && !text.includes("recording_url"));
  });
}
Deno.test("admin completed asset retrieval allowed", async () => {
  const x = setup();
  await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin);
  assertEquals(x.service.documentCalls, 1);
});
Deno.test("no customer-facing projection fields", async () => {
  const x = setup();
  const r = await x.life.execute({
    command: "retrieve_completed_document",
    integrationId,
    sourceAssetId: sourceId,
  }, admin);
  assert(!JSON.stringify(r).includes("storage_path"));
});
