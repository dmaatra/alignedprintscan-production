import { ProofConfigurationError } from "./errors.ts";

export interface ProofConfig {
  apiKey: string;
  apiBaseUrl: string;
  environment: ProofEnvironment;
  timeoutMs: number;
  maxRetries: number;
}

export type ProofEnvironment = "production" | "fairfax";

const proofApiOrigins: Readonly<Record<ProofEnvironment, string>> = Object
  .freeze({
    production: "https://api.proof.com",
    fairfax: "https://api.fairfax.proof.com",
  });

export function getProofConfig(): ProofConfig {
  const apiKey = Deno.env.get("PROOF_API_KEY")?.trim();
  const apiBaseUrl = Deno.env.get("PROOF_API_BASE_URL")?.trim();
  const environmentValue = Deno.env.get("PROOF_ENVIRONMENT")?.trim()
    .toLowerCase();

  if (!apiKey || !apiBaseUrl || !environmentValue) {
    throw new ProofConfigurationError("Proof integration is not configured.");
  }

  if (environmentValue !== "production" && environmentValue !== "fairfax") {
    throw new ProofConfigurationError(
      "PROOF_ENVIRONMENT must be production or fairfax.",
    );
  }
  const environment: ProofEnvironment = environmentValue;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiBaseUrl);
  } catch {
    throw new ProofConfigurationError(
      "PROOF_API_BASE_URL must be a valid URL.",
    );
  }
  if (parsedUrl.protocol !== "https:") {
    throw new ProofConfigurationError("PROOF_API_BASE_URL must use HTTPS.");
  }
  const expectedOrigin = proofApiOrigins[environment];
  if (
    parsedUrl.origin !== expectedOrigin || parsedUrl.pathname !== "/" ||
    parsedUrl.username || parsedUrl.password || parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new ProofConfigurationError(
      `PROOF_API_BASE_URL must be ${expectedOrigin}/ for the ${environment} environment.`,
    );
  }

  return {
    apiKey,
    apiBaseUrl: expectedOrigin,
    environment,
    timeoutMs: 15_000,
    maxRetries: 2,
  };
}
