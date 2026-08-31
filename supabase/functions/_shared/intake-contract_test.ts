import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1.0.14";
import { normalizedIntakeParticipants } from "./intake-contract.ts";

Deno.test("signer and APS witness rows use one PostgREST bulk-insert shape", () => {
  const rows = normalizedIntakeParticipants([
    {
      participant_type: "signer",
      first_name: "Casey",
      last_name: "Certifier",
      full_legal_name: "Casey Certifier",
      email: "casey@example.invalid",
      identity_name_confirmed: true,
      sort_order: 0,
    },
    {
      participant_type: "witness",
      witness_source: "aps",
      quantity: 1,
      identity_name_confirmed: false,
      sort_order: 1,
    },
  ], "00000000-0000-4000-8000-000000000001");

  assertEquals(Object.keys(rows[0]).sort(), Object.keys(rows[1]).sort());
  assertObjectMatch(rows[0], {
    participant_type: "signer",
    witness_source: null,
    quantity: 1,
  });
  assertObjectMatch(rows[1], {
    participant_type: "witness",
    first_name: null,
    full_legal_name: null,
    witness_source: "aps",
    quantity: 1,
  });
});

Deno.test("customer witnesses and Loan Signing signer addresses retain canonical values", () => {
  const rows = normalizedIntakeParticipants([
    {
      participant_type: "witness",
      full_legal_name: "Taylor Witness",
      witness_source: "customer",
    },
    {
      participant_type: "signer",
      first_name: "Morgan",
      last_name: "Borrower",
      address: {
        line1: "100 Test Way",
        city: "Waxahachie",
        state: "TX",
        zip: "75165",
      },
    },
  ], "00000000-0000-4000-8000-000000000002");

  assertEquals(rows[0].full_legal_name, "Taylor Witness");
  assertEquals(rows[1].address, {
    line1: "100 Test Way",
    city: "Waxahachie",
    state: "TX",
    zip: "75165",
  });
  assertEquals(Object.keys(rows[0]).sort(), Object.keys(rows[1]).sort());
});
