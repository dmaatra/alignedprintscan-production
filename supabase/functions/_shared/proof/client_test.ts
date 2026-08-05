import { ProofClient } from "./client.ts";
import { ProofError } from "./errors.ts";

Deno.test("ProofClient never retries HTTP 429", async () => {
  let attempts = 0;
  const fetcher: typeof fetch = () => {
    attempts += 1;
    return Promise.resolve(
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "0" },
      }),
    );
  };
  const client = new ProofClient({
    apiKey: "test-only-not-a-secret",
    apiBaseUrl: "https://api.proof.com",
    environment: "production",
    timeoutMs: 100,
    maxRetries: 2,
  }, fetcher);

  try {
    await client.request("/v1/organization", { method: "GET", retry: true });
    throw new Error("Expected HTTP 429 to fail.");
  } catch (error) {
    if (!(error instanceof ProofError)) throw error;
    if (error.code !== "PROOF_RATE_LIMITED") {
      throw new Error(`Expected PROOF_RATE_LIMITED, received ${error.code}.`);
    }
    if (error.retryable) throw new Error("HTTP 429 must not be retryable.");
  }

  if (attempts !== 1) {
    throw new Error(`Expected exactly one HTTP attempt, received ${attempts}.`);
  }
});
