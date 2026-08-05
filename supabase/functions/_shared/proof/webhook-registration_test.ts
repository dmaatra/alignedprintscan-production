import {
  registerProofWebhook,
  type WebhookRegistrationService,
} from "./webhook-registration.ts";
import type { ProofWebhookSubscription } from "./service.ts";
import { PROOF_WEBHOOK_EVENTS } from "./webhook-types.ts";

const endpoint =
  "https://sfsdniavqldgbiretply.supabase.co/functions/v1/proof-webhook";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryService implements WebhookRegistrationService {
  rows: ProofWebhookSubscription[] = [];
  creates = 0;
  updates = 0;
  receivedSigningKey: string | null = null;

  async listWebhookSubscriptions() {
    return this.rows;
  }
  async createWebhookSubscription(input: {
    url: string;
    subscriptions: string[];
    signingKey: string;
  }) {
    this.creates += 1;
    this.receivedSigningKey = input.signingKey;
    return {
      id: "wh_aps_new",
      url: input.url,
      enabled: true,
      subscriptions: input.subscriptions,
    };
  }
  async updateWebhookSubscription(
    id: string,
    input: { url: string; subscriptions: string[]; signingKey: string },
  ) {
    this.updates += 1;
    this.receivedSigningKey = input.signingKey;
    return {
      id,
      url: input.url,
      enabled: true,
      subscriptions: input.subscriptions,
    };
  }
}

const options = {
  environment: "production" as const,
  signingKey: "dedicated-test-signing-key",
};

Deno.test("registration creates exactly one APS subscription when absent", async () => {
  const service = new MemoryService();
  const result = await registerProofWebhook(service, options);
  assert(service.creates === 1 && service.updates === 0);
  assert(result.subscription.url === endpoint);
  assert(
    result.subscription.subscriptions.length === PROOF_WEBHOOK_EVENTS.length,
  );
  assert(result.subscription.enabled);
  assert(JSON.stringify(result).indexOf("dedicated-test-signing-key") === -1);
});

Deno.test("registration reuses an existing APS URL without creating a duplicate", async () => {
  const service = new MemoryService();
  service.rows = [{
    id: "wh_aps_existing",
    url: `${endpoint}/`,
    enabled: true,
    subscriptions: [...PROOF_WEBHOOK_EVENTS],
  }];
  const result = await registerProofWebhook(service, options);
  assert(service.creates === 0 && service.updates === 1);
  assert(result.reused && result.updated);
  assert(result.subscription.id === "wh_aps_existing");
  assert(service.receivedSigningKey === "dedicated-test-signing-key");
});
