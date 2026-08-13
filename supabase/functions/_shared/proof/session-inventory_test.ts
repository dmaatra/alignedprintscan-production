import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ProofSessionInventory } from "./session-inventory.ts";

Deno.test("RON inventory batches synchronized database reads and never calls Proof", async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await new ProofSessionInventory({
    url: "https://aps.example",
    key: "service-role",
    fetcher,
  }).read();
  assertEquals(result.kind, "proof_session_inventory");
  assertEquals(urls.length, 7);
  assertEquals(
    urls.every((url) => url.startsWith("https://aps.example/rest/v1/")),
    true,
  );
  assertEquals(urls.some((url) => url.includes("service_type=eq.ron")), true);
  assertEquals(
    urls.some((url) => /access_link|token|secret/i.test(url)),
    false,
  );
});

Deno.test("RON inventory fails closed when a synchronized read fails", async () => {
  const fetcher: typeof fetch = async () => new Response("no", { status: 500 });
  await assertRejects(() =>
    new ProofSessionInventory({
      url: "https://aps.example",
      key: "service-role",
      fetcher,
    }).read()
  );
});
