import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertResourceOrganization,
  documentMayBeReleased,
  roleAllows,
  safePick,
} from "./business-authorization.ts";

Deno.test("organization roles enforce the Release 3 capability matrix", () => {
  assertEquals(roleAllows("organization_admin", "manage_members"), true);
  assertEquals(roleAllows("order_creator", "mutate_request"), true);
  assertEquals(roleAllows("viewer", "mutate_request"), false);
  assertEquals(roleAllows("billing", "view_billing"), true);
  assertEquals(roleAllows("billing", "view_documents"), false);
  assertEquals(roleAllows("viewer", "view_billing"), false);
});

Deno.test("cross-tenant resource identifiers fail closed", () => {
  assertEquals(
    assertResourceOrganization(
      { id: "request-a", organization_id: "org-a" },
      "org-a",
    ).id,
    "request-a",
  );
  assertThrows(
    () =>
      assertResourceOrganization(
        { id: "request-b", organization_id: "org-b" },
        "org-a",
      ),
    Error,
    "Resource access denied",
  );
  assertThrows(
    () => assertResourceOrganization(undefined, "org-a"),
    Error,
    "Resource access denied",
  );
});

Deno.test("synthetic Org A and Org B resource attacks are denied in both directions", () => {
  for (
    const resourceType of [
      "request",
      "appointment",
      "signer",
      "document",
      "message",
      "invoice",
      "payment",
      "profile",
      "member",
    ]
  ) {
    assertThrows(() =>
      assertResourceOrganization({
        id: `${resourceType}-b`,
        organization_id: "org-b",
      }, "org-a")
    );
    assertThrows(() =>
      assertResourceOrganization({
        id: `${resourceType}-a`,
        organization_id: "org-a",
      }, "org-b")
    );
  }
  assertThrows(() =>
    assertResourceOrganization(
      { id: "consumer", organization_id: null },
      "org-a",
    )
  );
});

Deno.test("document release classification is fail closed", () => {
  assertEquals(
    documentMayBeReleased({
      is_active: true,
      customer_visible: true,
      eligible_for_delivery: true,
      document_classification: "customer_copy",
    }),
    true,
  );
  for (
    const document_classification of [
      "internal",
      "internal_qc",
      "proof_admin",
      "provider_payload",
      "stipulation",
    ]
  ) {
    assertEquals(
      documentMayBeReleased({
        is_active: true,
        customer_visible: true,
        eligible_for_delivery: true,
        document_classification,
      }),
      false,
    );
  }
  assertEquals(
    documentMayBeReleased({
      is_active: true,
      customer_visible: false,
      eligible_for_delivery: true,
    }),
    false,
  );
});

Deno.test("safe projections omit internal and identity-sensitive fields", () => {
  const projected = safePick({
    id: "1",
    full_legal_name: "Synthetic Signer",
    email: "private@example.test",
    identity_answer: "secret",
    internal_admin_notes: "staff only",
    stripe_payment_intent_id: "pi_test",
  }, ["id", "full_legal_name"]);
  assertEquals(projected, { id: "1", full_legal_name: "Synthetic Signer" });
});
