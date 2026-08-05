import { getProofConfig } from "./config.ts";
import { ProofError } from "./errors.ts";
import { ProofService, type ProofWebhookSubscription } from "./service.ts";
import { PROOF_WEBHOOK_EVENTS } from "./webhook-types.ts";

const PRODUCTION_WEBHOOK_URL =
  "https://sfsdniavqldgbiretply.supabase.co/functions/v1/proof-webhook";

export interface ProofWebhookRegistrationResult {
  subscription: ProofWebhookSubscription;
  reused: boolean;
  updated: boolean;
  environment: "production";
  verifiedAt: string;
}

export interface WebhookRegistrationService {
  listWebhookSubscriptions(): Promise<ProofWebhookSubscription[]>;
  createWebhookSubscription(input: {
    url: string;
    subscriptions: string[];
    signingKey: string;
  }): Promise<ProofWebhookSubscription>;
  updateWebhookSubscription(
    id: string,
    input: { url: string; subscriptions: string[]; signingKey: string },
  ): Promise<ProofWebhookSubscription>;
}

export interface WebhookRegistrationOptions {
  environment: "production" | "fairfax";
  signingKey: string;
}

export async function registerProofWebhook(
  service: WebhookRegistrationService = new ProofService(),
  options?: WebhookRegistrationOptions,
): Promise<ProofWebhookRegistrationResult> {
  const environment = options?.environment ?? getProofConfig().environment;
  if (environment !== "production") {
    throw new ProofError(
      "PROOF_CONFIGURATION_ERROR",
      "Proof webhook registration is restricted to production.",
      503,
    );
  }
  const signingKey = options?.signingKey ??
    Deno.env.get("PROOF_WEBHOOK_SECRET")?.trim();
  if (!signingKey) {
    throw new ProofError(
      "PROOF_CONFIGURATION_ERROR",
      "Proof webhook signing is not configured.",
      503,
    );
  }

  const existing = (await service.listWebhookSubscriptions()).filter((item) =>
    normalizeUrl(item.url) === PRODUCTION_WEBHOOK_URL
  );
  if (existing.length > 1) {
    throw new ProofError(
      "PROOF_CONFLICT",
      "Multiple APS webhook subscriptions require manual review.",
      409,
    );
  }

  const desiredEvents = [...PROOF_WEBHOOK_EVENTS];
  let subscription: ProofWebhookSubscription;
  let updated = false;
  if (existing[0]) {
    // Reapply the server-only key while reusing the same subscription ID.
    // Proof deliberately does not return signing keys from list responses.
    subscription = await service.updateWebhookSubscription(existing[0].id, {
      url: PRODUCTION_WEBHOOK_URL,
      subscriptions: desiredEvents,
      signingKey,
    });
    updated = true;
  } else {
    subscription = await service.createWebhookSubscription({
      url: PRODUCTION_WEBHOOK_URL,
      subscriptions: desiredEvents,
      signingKey,
    });
  }

  if (
    normalizeUrl(subscription.url) !== PRODUCTION_WEBHOOK_URL ||
    !subscription.enabled ||
    !sameEvents(subscription.subscriptions, desiredEvents)
  ) {
    throw new ProofError(
      "PROOF_MALFORMED_RESPONSE",
      "Proof did not confirm the required webhook configuration.",
      502,
    );
  }
  return {
    subscription,
    reused: Boolean(existing[0]),
    updated,
    environment: "production",
    verifiedAt: new Date().toISOString(),
  };
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function sameEvents(left: string[], right: readonly string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === sortedRight[index]);
}
