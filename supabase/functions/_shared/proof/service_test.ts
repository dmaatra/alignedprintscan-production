import { assertEquals } from "jsr:@std/assert";
import type { ProofRequestOptions } from "./client.ts";
import { ProofService, type ProofTransport } from "./service.ts";

Deno.test("Proof signer order is serialized as the documented string", async () => {
  let request: { path: string; json: unknown } | null = null;
  const transport: ProofTransport = {
    request<T>(path: string, options?: ProofRequestOptions) {
      request = { path, json: options?.json };
      return Promise.resolve({
        id: "ot_test",
        status: "started",
        signers: [{
          id: "si_test",
          external_id: "aps:signer:1",
          status: "ready",
        }],
      } as T);
    },
  };
  await new ProofService(transport).configureTransactionSigners("ot_test", [{
    email: "signer@example.test",
    firstName: "Test",
    lastName: "Signer",
    externalId: "aps:signer:1",
    order: 1,
  }]);
  assertEquals(request, {
    path: "/v1/transactions/ot_test",
    json: {
      draft: true,
      signers: [{
        email: "signer@example.test",
        first_name: "Test",
        middle_name: undefined,
        last_name: "Signer",
        external_id: "aps:signer:1",
        order: "1",
        entity: undefined,
        capacity: undefined,
      }],
    },
  });
});
