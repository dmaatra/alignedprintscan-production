import { ProofError } from "./errors.ts";

const SIGNATURE = /^[0-9a-f]{64}$/i;

export async function verifyProofWebhook(
  rawBody: Uint8Array,
  signature: string | null,
  secret: string | undefined = Deno.env.get("PROOF_WEBHOOK_SECRET"),
): Promise<string> {
  if (!secret?.trim()) {
    throw auth("Proof webhook authentication is unavailable.", 503);
  }
  if (!signature) throw auth("Proof webhook signature is required.", 401);
  const supplied = signature.trim();
  if (!SIGNATURE.test(supplied)) {
    throw auth("Proof webhook signature is malformed.", 401);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, rawBody.slice().buffer),
  );
  const actual = hexBytes(supplied);
  if (!constantTimeEqual(expected, actual)) {
    throw auth("Proof webhook signature is invalid.", 403);
  }
  return await sha256Hex(rawBody);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hexBytes(value: string): Uint8Array {
  return new Uint8Array(value.match(/../g)!.map((part) => parseInt(part, 16)));
}
function auth(message: string, status: number) {
  return new ProofError("PROOF_UNAUTHORIZED", message, status, false);
}
