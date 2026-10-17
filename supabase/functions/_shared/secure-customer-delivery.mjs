import { issuePortalToken } from "./portal-access.ts";
import { deliverCustomerCommunication } from "./communication-history.mjs";

/** Issue a request-scoped link before recording the exact email sent to the provider. */
export async function deliverSecureCustomerCommunication(options, {
  siteUrl,
  portalUrl,
  sendProvider,
}) {
  if (!options.requestId || !options.recipient || !portalUrl?.startsWith(`${siteUrl.replace(/\/$/, "")}/success.html?`)) {
    throw new Error("A canonical request-specific portal link and recipient are required.");
  }
  const token = await issuePortalToken(options.requestId, options.supabaseUrl, options.serviceRoleKey);
  const secureUrl = `${portalUrl}#access_token=${token}`;
  const secure = {
    ...options,
    renderedHtml: options.renderedHtml.replaceAll(portalUrl, secureUrl),
    renderedText: options.renderedText.replaceAll(portalUrl, secureUrl),
  };
  if (!secure.renderedHtml.includes(secureUrl)) throw new Error("Customer email is missing the secure portal link.");
  return deliverCustomerCommunication(secure, (message) =>
    sendProvider(message.rendered_html, message.subject));
}
