import { assertEquals } from "jsr:@std/assert";
import type { ProofRequestOptions } from "./client.ts";
import {
  ProofService,
  type ProofTransport,
  sanitizeTransaction,
} from "./service.ts";

Deno.test("Proof signer access links accept only the supported signer portal", () => {
  const accepted = sanitizeTransaction({
    id: "ot_test",
    signer: {
      email: "signer@example.test",
      transaction_access_link:
        "https://app.proof.com/activate-transaction?bundle_id=test&code=secret",
    },
  }, false);
  assertEquals(
    accepted.signers?.[0].accessLink,
    "https://app.proof.com/activate-transaction?bundle_id=test&code=secret",
  );
  const rejected = sanitizeTransaction({
    id: "ot_test",
    signer: {
      email: "signer@example.test",
      transaction_access_link: "https://internal.example.test/secret",
    },
  }, false);
  assertEquals(rejected.signers?.[0].accessLink, null);
  assertEquals(rejected.signers?.[0].accessLinkPresent, false);
});

Deno.test("Proof primary signer update preserves the draft signer shape", async () => {
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
      signer: {
        email: "signer@example.test",
        first_name: "Test",
        middle_name: undefined,
        last_name: "Signer",
        external_id: "aps:signer:1",
        order: 1,
        entity: undefined,
        capacity: undefined,
      },
    },
  });
});

Deno.test("Proof multi-signer update uses the signers array", async () => {
  let request: { path: string; json: unknown } | null = null;
  const transport: ProofTransport = {
    request<T>(path: string, options?: ProofRequestOptions) {
      request = { path, json: options?.json };
      return Promise.resolve(
        { id: "ot_test", status: "started", signers: [] } as T,
      );
    },
  };
  await new ProofService(transport).configureTransactionSigners("ot_test", [
    { email: "one@example.test", externalId: "aps:signer:1", order: 1 },
    { email: "two@example.test", externalId: "aps:signer:2", order: 2 },
  ]);
  assertEquals(request, {
    path: "/v1/transactions/ot_test",
    json: {
      draft: true,
      signers: [
        {
          email: "one@example.test",
          first_name: undefined,
          middle_name: undefined,
          last_name: undefined,
          external_id: "aps:signer:1",
          order: 1,
          entity: undefined,
          capacity: undefined,
        },
        {
          email: "two@example.test",
          first_name: undefined,
          middle_name: undefined,
          last_name: undefined,
          external_id: "aps:signer:2",
          order: 2,
          entity: undefined,
          capacity: undefined,
        },
      ],
    },
  });
});

Deno.test("Proof draft signer update carries supported handoff enrichment", async () => {
  const requests: unknown[] = [];
  const transport: ProofTransport = {
    request<T>(_path: string, options?: ProofRequestOptions) {
      requests.push(options?.json);
      return Promise.resolve(
        { id: "ot_test", status: "started", signers: [] } as T,
      );
    },
  };
  await new ProofService(transport).configureTransactionSigners("ot_test", [{
    email: "signer@example.invalid",
    firstName: "Avery",
    middleName: "Middle",
    lastName: "Signer",
    phone: { countryCode: "1", number: "4695550101" },
    externalId: "aps:signer:1",
    order: 1,
  }], {
    transactionName: "APS-12345678 — RON — Signer",
    notaryMeetingTime: "2026-09-15T10:00:00-05:00",
    notaryInstructions: "APS REQUEST: APS-12345678",
    messageToSigner: "Your Remote Online Notarization is ready.",
  });
  assertEquals(requests.length, 2);
  const payload = requests[0] as Record<string, unknown>;
  assertEquals(payload.transaction_name, "APS-12345678 — RON — Signer");
  assertEquals(payload.notary_meeting_time, "2026-09-15T10:00:00-05:00");
  assertEquals(payload.notary_instructions, [{
    notary_note: "APS REQUEST: APS-12345678",
  }]);
  assertEquals(
    payload.message_to_signer,
    "Your Remote Online Notarization is ready.",
  );
  const signerPayload = requests[1] as Record<string, unknown>;
  assertEquals((signerPayload.signer as Record<string, unknown>).phone, {
    country_code: "1",
    number: "4695550101",
  });
});
