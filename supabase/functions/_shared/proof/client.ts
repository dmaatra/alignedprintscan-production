import { getProofConfig, type ProofConfig } from "./config.ts";
import {
  normalizeProofFailure,
  normalizeProofHttpError,
  ProofError,
} from "./errors.ts";
import { proofLogger } from "./logger.ts";

export interface ProofRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  timeoutMs?: number;
  retry?: boolean;
}

export class ProofClient {
  constructor(private readonly config: ProofConfig = getProofConfig()) {}

  async request<T>(
    path: string,
    options: ProofRequestOptions = {},
  ): Promise<T> {
    if (options.json !== undefined && options.formData) {
      throw new ProofError(
        "PROOF_VALIDATION_ERROR",
        "Use either JSON or multipart form data, not both.",
        400,
      );
    }
    const method = options.method ?? "GET";
    const url = new URL(path.replace(/^\//, ""), `${this.config.apiBaseUrl}/`);
    if (url.origin !== new URL(this.config.apiBaseUrl).origin) {
      throw new ProofError(
        "PROOF_VALIDATION_ERROR",
        "Proof request path is invalid.",
        400,
      );
    }
    const retryEnabled = options.retry ??
      (["GET", "PUT", "DELETE"].includes(method) ||
        Boolean(options.idempotencyKey));
    const maxAttempts = retryEnabled ? this.config.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? this.config.timeoutMs,
      );
      const headers = new Headers(options.headers);
      headers.set("ApiKey", this.config.apiKey);
      headers.set("Accept", "application/json");
      if (options.idempotencyKey) {
        headers.set("Idempotency-Key", options.idempotencyKey);
      }
      let body: BodyInit | undefined;
      if (options.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.json);
      } else if (options.formData) {
        body = options.formData;
      }

      proofLogger.request({
        method,
        path: url.pathname,
        attempt,
        idempotency_key: options.idempotencyKey,
      });
      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
          redirect: "error",
        });
        proofLogger.response({
          method,
          path: url.pathname,
          status: response.status,
          duration_ms: Date.now() - startedAt,
          attempt,
        });
        if (response.ok) {
          if (response.status === 204) return undefined as T;
          return await response.json() as T;
        }
        const normalized = normalizeProofHttpError(response);
        if (!normalized.retryable || attempt === maxAttempts) throw normalized;
        await this.waitBeforeRetry(response, attempt);
      } catch (error) {
        const normalized = normalizeProofFailure(error);
        proofLogger.error({
          code: normalized.code,
          method,
          path: url.pathname,
          attempt,
          provider_status: normalized.providerStatus,
        });
        if (!normalized.retryable || attempt === maxAttempts) throw normalized;
        proofLogger.retry({
          code: normalized.code,
          method,
          path: url.pathname,
          next_attempt: attempt + 1,
        });
        await delay(
          250 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 100),
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ProofError(
      "PROOF_PROVIDER_ERROR",
      "Proof is temporarily unavailable.",
      502,
      true,
    );
  }

  private async waitBeforeRetry(response: Response, attempt: number) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0
      ? Math.min(retryAfter * 1000, 10_000)
      : 250 * (2 ** (attempt - 1));
    proofLogger.retry({
      provider_status: response.status,
      wait_ms: waitMs,
      next_attempt: attempt + 1,
    });
    await delay(waitMs + Math.floor(Math.random() * 100));
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
