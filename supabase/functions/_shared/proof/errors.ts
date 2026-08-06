export type ProofErrorCode =
  | "PROOF_CONFIGURATION_ERROR"
  | "PROOF_NETWORK_ERROR"
  | "PROOF_TIMEOUT"
  | "PROOF_UNAUTHORIZED"
  | "PROOF_FORBIDDEN"
  | "PROOF_NOT_FOUND"
  | "PROOF_CONFLICT"
  | "PROOF_VALIDATION_ERROR"
  | "PROOF_RATE_LIMITED"
  | "PROOF_PROVIDER_ERROR"
  | "PROOF_MALFORMED_RESPONSE"
  | "PROOF_AMBIGUOUS_RESULT"
  | "PROOF_READINESS_ERROR"
  | "PROOF_NOT_IMPLEMENTED";

const statusCodes: Record<
  number,
  { code: ProofErrorCode; message: string; retryable: boolean }
> = {
  400: {
    code: "PROOF_VALIDATION_ERROR",
    message: "Proof rejected the submitted request.",
    retryable: false,
  },
  401: {
    code: "PROOF_UNAUTHORIZED",
    message: "Proof authentication failed.",
    retryable: false,
  },
  403: {
    code: "PROOF_FORBIDDEN",
    message: "Proof denied this operation.",
    retryable: false,
  },
  404: {
    code: "PROOF_NOT_FOUND",
    message: "The requested Proof resource was not found.",
    retryable: false,
  },
  409: {
    code: "PROOF_CONFLICT",
    message: "The Proof operation conflicts with existing state.",
    retryable: false,
  },
  422: {
    code: "PROOF_VALIDATION_ERROR",
    message: "Proof rejected the submitted data.",
    retryable: false,
  },
  429: {
    code: "PROOF_RATE_LIMITED",
    message: "Proof is temporarily rate limiting requests.",
    retryable: false,
  },
};

export class ProofError extends Error {
  constructor(
    public readonly code: ProofErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly retryable = false,
    public readonly providerStatus?: number,
    public readonly providerRequestId?: string,
    public readonly requestMayHaveReachedProvider = false,
  ) {
    super(message);
    this.name = "ProofError";
  }

  toResponseBody() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
      },
    };
  }
}

export class ProofConfigurationError extends ProofError {
  constructor(message: string) {
    super("PROOF_CONFIGURATION_ERROR", message, 503, false);
  }
}

export function normalizeProofHttpError(response: Response): ProofError {
  const mapped = statusCodes[response.status];
  const providerRequestId = response.headers.get("x-request-id") ?? undefined;
  if (mapped) {
    return new ProofError(
      mapped.code,
      mapped.message,
      mapped.code === "PROOF_RATE_LIMITED" ? 503 : response.status,
      mapped.retryable,
      response.status,
      providerRequestId,
    );
  }
  return new ProofError(
    "PROOF_PROVIDER_ERROR",
    "Proof is temporarily unavailable.",
    502,
    response.status >= 500,
    response.status,
    providerRequestId,
  );
}

export function normalizeProofFailure(error: unknown): ProofError {
  if (error instanceof ProofError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProofError(
      "PROOF_TIMEOUT",
      "The Proof request timed out.",
      504,
      true,
    );
  }
  return new ProofError(
    "PROOF_NETWORK_ERROR",
    "APS could not reach Proof.",
    502,
    true,
  );
}
