import { assertEquals } from "jsr:@std/assert@1.0.14";
import { isReservedSyntheticRecipient } from "./synthetic-recipient.ts";

Deno.test("reserved invalid-domain identities suppress certification delivery", () => {
  assertEquals(isReservedSyntheticRecipient("aps-cert@example.invalid"), true);
  assertEquals(isReservedSyntheticRecipient("APS@SUB.EXAMPLE.INVALID"), true);
  assertEquals(isReservedSyntheticRecipient("owner@example.com"), false);
  assertEquals(isReservedSyntheticRecipient("not-example.invalid"), false);
});
