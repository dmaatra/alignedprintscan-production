import { ProofError } from "./errors.ts";
import { proofLogger } from "./logger.ts";

export type ProofFoundationOperation =
  | "create_transaction"
  | "upload_documents"
  | "activate_transaction"
  | "retrieve_transaction"
  | "retrieve_completed_documents"
  | "handle_webhook";

export interface ProofPlaceholderResult {
  ok: true;
  implemented: false;
  operation: ProofFoundationOperation;
  message: string;
}

export class ProofService {
  createTransaction(idempotencyKey?: string) {
    return this.placeholder("create_transaction", idempotencyKey);
  }
  uploadDocuments(idempotencyKey?: string) {
    return this.placeholder("upload_documents", idempotencyKey);
  }
  activateTransaction(idempotencyKey?: string) {
    return this.placeholder("activate_transaction", idempotencyKey);
  }
  retrieveTransaction() {
    return this.placeholder("retrieve_transaction");
  }
  retrieveCompletedDocuments() {
    return this.placeholder("retrieve_completed_documents");
  }
  handleWebhook(idempotencyKey?: string) {
    return this.placeholder("handle_webhook", idempotencyKey);
  }

  private async placeholder(
    operation: ProofFoundationOperation,
    idempotencyKey?: string,
  ): Promise<ProofPlaceholderResult> {
    if (idempotencyKey) {
      proofLogger.idempotency({
        operation,
        idempotency_key: idempotencyKey,
        result: "placeholder",
      });
    }
    return {
      ok: true,
      implemented: false,
      operation,
      message:
        "Proof foundation is installed; this operation is reserved for a future increment.",
    };
  }
}

export function assertIdempotencyKey(value: string | null): string {
  const key = value?.trim();
  if (!key || key.length > 255) {
    throw new ProofError(
      "PROOF_VALIDATION_ERROR",
      "A valid Idempotency-Key header is required.",
      400,
    );
  }
  return key;
}
