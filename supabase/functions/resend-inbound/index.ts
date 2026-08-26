import { serviceRows } from "../_shared/release2-auth.ts";
const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") || "",
  apiKey = Deno.env.get("RESEND_API_KEY") || "",
  receivingDomain = (Deno.env.get("RESEND_RECEIVING_DOMAIN") || "").trim()
    .toLowerCase().replace(/^\.+|\.+$/g, "");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ).map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (value: string) => {
  const normalized = value.replace(/^v1,/, "").replace(/-/g, "+").replace(
    /_/g,
    "/",
  );
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
};
const emailAddress = (value: unknown) =>
  String(value || "").match(/<([^<>\s]+@[^<>\s]+)>/)?.[1]?.toLowerCase() ||
  String(value || "").trim().toLowerCase();
const safeText = (text: unknown, html: unknown) => {
  const plain = String(text || "").trim();
  if (plain) return plain.slice(0, 50000);
  return String(html || "")
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p\s*>/gi, "\n").replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim().slice(
      0,
      50000,
    );
};
async function verify(raw: string, req: Request) {
  const id = req.headers.get("svix-id") || "",
    timestamp = req.headers.get("svix-timestamp") || "",
    signatures =
      (req.headers.get("svix-signature") || "").match(/v1,[^ ,]+/g) || [];
  if (
    !secret || !id || !timestamp ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  ) return false;
  const key = b64(secret.replace(/^whsec_/, "")),
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    ),
    payload = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
  for (const signature of signatures) {
    try {
      if (
        await crypto.subtle.verify("HMAC", cryptoKey, b64(signature), payload)
      ) return true;
    } catch {}
  }
  return false;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const raw = await req.text();
  if (!await verify(raw, req)) {
    return json({ ok: false, error: "Invalid webhook signature." }, 401);
  }
  try {
    const event = JSON.parse(raw);
    if (event.type !== "email.received") {
      return json({ ok: true, ignored: true });
    }
    const eventId = req.headers.get("svix-id") || "",
      to = Array.isArray(event.data?.to) ? event.data.to : [],
      replyRecipient = receivingDomain
        ? to.map(emailAddress).find((address: string) => {
          const separator = address.lastIndexOf("@");
          if (separator < 0) return false;
          return address.slice(separator + 1) === receivingDomain &&
            /^reply\+[a-f0-9]{32}$/i.test(address.slice(0, separator));
        })
        : undefined;
    if (!replyRecipient) return json({ ok: true, ignored: true });
    const tokenHash = await hash(replyRecipient.slice(6, 38)),
      routes = await serviceRows(
        `message_reply_routes?select=conversation_id&token_hash=eq.${tokenHash}&limit=1`,
      );
    if (!routes[0]) return json({ ok: true, ignored: true });
    const conversations = await serviceRows(
        `message_conversations?select=*&id=eq.${
          routes[0].conversation_id
        }&status=eq.open&limit=1`,
      ),
      conversation = conversations[0];
    if (!conversation) return json({ ok: true, ignored: true });
    if (
      emailAddress(event.data.from) !== emailAddress(conversation.contact_email)
    ) return json({ ok: true, ignored: true });
    const duplicate = await serviceRows(
      `messages?select=id&provider_event_id=eq.${
        encodeURIComponent(eventId)
      }&limit=1`,
    );
    if (duplicate.length) return json({ ok: true, duplicate: true });
    const received = await fetch(
        `https://api.resend.com/emails/receiving/${event.data.email_id}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      ),
      content = await received.json();
    if (!received.ok) throw new Error("Inbound content retrieval failed.");
    const now = new Date().toISOString(),
      sender = String(event.data.from || "").slice(0, 500),
      renderedText = safeText(content.text, content.html),
      headers = content.headers && typeof content.headers === "object"
        ? content.headers
        : {};
    const references = String(headers.references || "").split(/\s+/).map((
      value: string,
    ) => value.trim()).filter(Boolean).slice(-50);
    const inserted = await serviceRows("messages", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        service_request_id: conversation.service_request_id,
        conversation_id: conversation.id,
        direction: "inbound",
        visibility: "customer",
        sender,
        recipient: to.join(", "),
        subject: String(event.data.subject || conversation.subject).slice(
          0,
          300,
        ),
        rendered_html: null,
        rendered_text: renderedText ||
          "(No readable message body was received.)",
        delivery_state: "received",
        provider_event_id: eventId,
        provider_email_id: event.data.email_id,
        provider_message_identifier: event.data.message_id ||
          content.message_id || null,
        received_at: now,
        source_type: "inbound_reply",
        source_event: "email.received",
        metadata: {
          in_reply_to: String(headers["in-reply-to"] || "").slice(0, 500) ||
            null,
          references,
          attachments: Array.isArray(event.data.attachments)
            ? event.data.attachments.map((a: any) => ({
              filename: String(a.filename || "").slice(0, 255),
              content_type: String(a.content_type || "").slice(0, 120),
            }))
            : [],
        },
      }),
    });
    if (!inserted.length) return json({ ok: true, duplicate: true });
    await serviceRows(`message_conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        unread_count: Number(conversation.unread_count || 0) + 1,
        last_message_at: now,
        updated_at: now,
      }),
    });
    await serviceRows("admin_notifications", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        service_request_id: conversation.service_request_id,
        event_type: "inbound_customer_reply",
        severity: "action_required",
        title: "Customer email reply received",
        body: conversation.service_request_id
          ? "A customer reply is ready in the request Messages conversation."
          : "A reply is ready in Communications / Messages.",
        target_tab: "messages",
        dedupe_key: `inbound-email:${eventId}`,
      }),
    });
    return json({ ok: true });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
