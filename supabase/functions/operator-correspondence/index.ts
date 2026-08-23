import { requireRelease2Staff, serviceRows } from "../_shared/release2-auth.ts";
import { renderCustomerEmailShell } from "../_shared/customer-email.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const text = (value: unknown, max = 10000) =>
  String(value || "").trim().slice(0, max);
const RESEND = Deno.env.get("RESEND_API_KEY") || "",
  FROM = Deno.env.get("FROM_EMAIL") ||
    "Aligned Print & Scan <hello@alignedprintscan.com>",
  SITE = Deno.env.get("SITE_URL") || "https://alignedprintscan.com",
  INBOUND = Deno.env.get("RESEND_RECEIVING_DOMAIN") || "";
const escape = (value: unknown) =>
  text(value).replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c),
  );
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ).map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const staff = await requireRelease2Staff(req, "communications"),
      body = await req.json(),
      command = text(body.command, 40);
    if (command === "snapshot") {
      const conversations = await serviceRows(
        "message_conversations?select=*&order=last_message_at.desc&limit=200",
      );
      const messages = await serviceRows(
        "messages?select=*&conversation_id=not.is.null&order=created_at.asc&limit=1000",
      );
      return json({
        ok: true,
        conversations,
        messages,
        operator: {
          id: staff.profile.id,
          full_name: staff.profile.full_name,
          public_title: staff.profile.public_title,
          professional_email: staff.profile.professional_email,
        },
      });
    }
    if (command === "mark_read") {
      const conversationId = text(body.conversation_id, 36);
      await serviceRows(
        `messages?conversation_id=eq.${conversationId}&direction=eq.inbound&read_at=is.null`,
        {
          method: "PATCH",
          body: JSON.stringify({ read_at: new Date().toISOString() }),
        },
      );
      await serviceRows(`message_conversations?id=eq.${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          unread_count: 0,
          updated_at: new Date().toISOString(),
        }),
      });
      return json({ ok: true });
    }
    if (command !== "send") {
      throw new Error("Unsupported correspondence command.");
    }
    let recipient = text(body.to, 254).toLowerCase(),
      subject = text(body.subject, 300),
      requestId = text(body.request_id, 36) || null;
    const message = text(body.message, 20000);
    if (!recipient.includes("@") || !subject || !message) {
      throw new Error("Recipient, subject, and message are required.");
    }
    if (!RESEND) {
      throw new Error("Correspondence provider configuration is incomplete.");
    }
    let conversationId = text(body.conversation_id, 36),
      token = INBOUND
        ? crypto.randomUUID().replaceAll("-", "") +
          crypto.randomUUID().replaceAll("-", "")
        : "";
    const replying = Boolean(conversationId);
    if (!conversationId) {
      const rows = await serviceRows("message_conversations", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          subject,
          contact_email: recipient,
          contact_name: text(body.contact_name, 180) || null,
          reply_token_hash: await hash(token || crypto.randomUUID()),
          created_by: staff.id,
        }),
      });
      conversationId = rows[0].id;
    } else {
      const rows = await serviceRows(
        `message_conversations?id=eq.${conversationId}&status=eq.open&limit=1`,
      );
      if (!rows[0]) throw new Error("Open conversation not found.");
      recipient = text(rows[0].contact_email, 254).toLowerCase();
      subject = text(rows[0].subject, 300);
      requestId = text(rows[0].service_request_id, 36) || null;
    }
    if (token) {
      await serviceRows("message_reply_routes", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          token_hash: await hash(token),
        }),
      });
    }
    const priorMessages = replying
      ? await serviceRows(
        `messages?select=provider_message_identifier,metadata&conversation_id=eq.${conversationId}&provider_message_identifier=not.is.null&order=created_at.asc&limit=100`,
      )
      : [];
    const messageIdentifiers = priorMessages.map((item: any) =>
      text(item.provider_message_identifier, 500)
    ).filter(Boolean);
    const inReplyTo = messageIdentifiers.at(-1) || "";
    const references = [
      ...new Set(
        priorMessages.flatMap((item: any) => [
          ...(Array.isArray(item.metadata?.references)
            ? item.metadata.references
            : []),
          item.provider_message_identifier,
        ]).map((value: unknown) => text(value, 500)).filter(Boolean),
      ),
    ].slice(-50);
    const displayName = text(staff.profile.full_name, 180),
      title = text(staff.profile.public_title, 100),
      credentials = Array.isArray(staff.profile.credentials)
        ? staff.profile.credentials.map((x: unknown) => text(x, 100)).filter(
          Boolean,
        )
        : [];
    const bodyHtml = `<p>${
      escape(message).replace(/\n/g, "<br>")
    }</p><hr><table role="presentation" style="font-family:Arial,sans-serif;color:#0c1930"><tr><td><img src="${SITE}/assets/images/logo-symbol.webp" width="56" height="56" alt="Aligned Print &amp; Scan" style="display:block;width:56px;height:56px;border-radius:50%"></td><td style="padding-left:12px"><strong>${
      escape(displayName)
    }</strong><br>${escape(title)}${
      credentials.length ? `<br>${escape(credentials.join(" | "))}` : ""
    }<br>Aligned Print &amp; Scan · 469-383-8879 · <a href="${SITE}">alignedprintscan.com</a></td></tr></table>`;
    const html = renderCustomerEmailShell({
      title: subject,
      preheader: subject,
      body: bodyHtml,
      siteUrl: SITE,
    });
    const outboundSubject = replying && !/^re:/i.test(subject)
      ? `Re: ${subject}`
      : subject;
    const threadHeaders = inReplyTo
      ? {
        "In-Reply-To": inReplyTo,
        "References": [...references, inReplyTo].filter((value, index, all) =>
          all.indexOf(value) === index
        ).join(" "),
      }
      : {};
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [recipient],
        ...(token ? { reply_to: `reply+${token}@${INBOUND}` } : {}),
        subject: outboundSubject,
        html,
        text: message,
        ...(inReplyTo ? { headers: threadHeaders } : {}),
      }),
    });
    const data = await sent.json().catch(() => ({})),
      now = new Date().toISOString();
    await serviceRows("messages", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        conversation_id: conversationId,
        direction: "outbound",
        visibility: "customer",
        sender: staff.profile.professional_email || staff.profile.email,
        recipient,
        subject: outboundSubject,
        rendered_html: html,
        rendered_text: message,
        delivery_state: sent.ok ? "sent" : "failed",
        provider_message_id: data.id || null,
        error_message: sent.ok ? null : text(data.message, 500),
        sent_at: sent.ok ? now : null,
        created_by: staff.id,
        source_type: "operator",
        source_event: "operator_correspondence",
        attempted_at: now,
        failed_at: sent.ok ? null : now,
        metadata: {
          operator_profile_id: staff.profile.id,
          signature_snapshot: {
            full_name: displayName,
            public_title: title,
            credentials,
          },
          in_reply_to: inReplyTo || null,
          references,
        },
      }),
    });
    await serviceRows(`message_conversations?id=eq.${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ last_message_at: now, updated_at: now }),
    });
    if (!sent.ok) throw new Error("Email delivery was not accepted.");
    return json({
      ok: true,
      conversation_id: conversationId,
      provider_message_id: data.id || null,
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
