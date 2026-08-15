function headers(key, prefer = "return=representation") {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

async function parse(response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      value?.message || value?.error ||
        `Communication history request failed (${response.status}).`,
    );
  }
  return value;
}

export function safeDeliveryError(error) {
  const text = error instanceof Error
    ? error.message
    : String(error || "Delivery failed.");
  return text.replace(
    /(bearer|apikey|authorization)\s+[^\s,;]+/gi,
    "$1 [redacted]",
  ).slice(0, 500);
}

export async function beginCustomerCommunication({
  fetchImpl = fetch,
  supabaseUrl,
  serviceRoleKey,
  requestId,
  templateId = null,
  templateKey = null,
  recipient,
  cc = [],
  subject,
  renderedHtml,
  renderedText,
  associatedStatus = null,
  sourceType,
  sourceEvent,
  idempotencyKey = null,
  metadata = {},
}) {
  const body = {
    service_request_id: requestId,
    template_id: templateId,
    template_key: templateKey,
    direction: "outbound",
    visibility: "customer",
    channel: "email",
    recipient,
    cc,
    subject,
    rendered_html: renderedHtml,
    rendered_text: renderedText,
    delivery_state: "sending",
    associated_status: associatedStatus,
    source_type: sourceType,
    source_event: sourceEvent,
    idempotency_key: idempotencyKey,
    attempted_at: new Date().toISOString(),
    metadata,
  };
  const existingEndpoint = idempotencyKey
    ? `${supabaseUrl}/rest/v1/messages?select=*&idempotency_key=eq.${
      encodeURIComponent(idempotencyKey)
    }&limit=1`
    : null;
  if (existingEndpoint) {
    const existing = await parse(
      await fetchImpl(existingEndpoint, { headers: headers(serviceRoleKey) }),
    );
    if (existing?.[0]) return { message: existing[0], shouldSend: false };
  }
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/messages`, {
    method: "POST",
    headers: headers(serviceRoleKey),
    body: JSON.stringify(body),
  });
  if (!response.ok && existingEndpoint && response.status === 409) {
    const existing = await parse(
      await fetchImpl(existingEndpoint, { headers: headers(serviceRoleKey) }),
    );
    if (existing?.[0]) return { message: existing[0], shouldSend: false };
  }
  const rows = await parse(response);
  if (rows?.[0]) return { message: rows[0], shouldSend: true };
  if (!idempotencyKey) {
    throw new Error("Communication history row was not returned.");
  }
  const existing = await parse(
    await fetchImpl(existingEndpoint, { headers: headers(serviceRoleKey) }),
  );
  if (!existing?.[0]) {
    throw new Error("Existing communication history row could not be loaded.");
  }
  return { message: existing[0], shouldSend: false };
}

async function addTimeline(
  {
    fetchImpl,
    supabaseUrl,
    serviceRoleKey,
    requestId,
    messageId,
    sent,
    sourceType,
    subject,
    errorMessage,
  },
) {
  const eventType = sent ? "message_sent" : "message_failed";
  const existing = await parse(
    await fetchImpl(
      `${supabaseUrl}/rest/v1/request_timeline_events?select=id&service_request_id=eq.${requestId}&event_type=eq.${eventType}&metadata-%3E%3Emessage_id=eq.${messageId}&limit=1`,
      { headers: headers(serviceRoleKey) },
    ),
  );
  if (existing?.length) return;
  await parse(
    await fetchImpl(`${supabaseUrl}/rest/v1/request_timeline_events`, {
      method: "POST",
      headers: headers(serviceRoleKey),
      body: JSON.stringify({
        service_request_id: requestId,
        event_type: eventType,
        title: sent ? "Customer message sent" : "Customer message failed",
        detail: sent
          ? subject
          : "Customer communication failed. Review the Messages tab for details.",
        actor_type: sourceType === "admin" ? "admin" : "system",
        visibility: "internal",
        metadata: {
          message_id: messageId,
          source_type: sourceType,
          error_recorded: Boolean(errorMessage),
        },
      }),
    }),
  );
}

export async function completeCustomerCommunication(
  {
    fetchImpl = fetch,
    supabaseUrl,
    serviceRoleKey,
    requestId,
    messageId,
    providerMessageId = null,
    sourceType,
    subject,
  },
) {
  const sentAt = new Date().toISOString();
  await parse(
    await fetchImpl(`${supabaseUrl}/rest/v1/messages?id=eq.${messageId}`, {
      method: "PATCH",
      headers: headers(serviceRoleKey),
      body: JSON.stringify({
        delivery_state: "sent",
        provider_message_id: providerMessageId,
        sent_at: sentAt,
        failed_at: null,
        error_message: null,
      }),
    }),
  );
  await addTimeline({
    fetchImpl,
    supabaseUrl,
    serviceRoleKey,
    requestId,
    messageId,
    sent: true,
    sourceType,
    subject,
  });
}

export async function failCustomerCommunication(
  {
    fetchImpl = fetch,
    supabaseUrl,
    serviceRoleKey,
    requestId,
    messageId,
    sourceType,
    subject,
    error,
  },
) {
  const errorMessage = safeDeliveryError(error);
  await parse(
    await fetchImpl(`${supabaseUrl}/rest/v1/messages?id=eq.${messageId}`, {
      method: "PATCH",
      headers: headers(serviceRoleKey),
      body: JSON.stringify({
        delivery_state: "failed",
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      }),
    }),
  );
  await addTimeline({
    fetchImpl,
    supabaseUrl,
    serviceRoleKey,
    requestId,
    messageId,
    sent: false,
    sourceType,
    subject,
    errorMessage,
  });
}

export async function deliverCustomerCommunication(options, sendProvider) {
  const begun = await beginCustomerCommunication(options);
  if (!begun.shouldSend) {
    return { message: begun.message, duplicate: true, provider: null };
  }
  try {
    const provider = await sendProvider();
    await completeCustomerCommunication({
      ...options,
      messageId: begun.message.id,
      providerMessageId: provider?.id || null,
    });
    return {
      message: {
        ...begun.message,
        delivery_state: "sent",
        provider_message_id: provider?.id || null,
      },
      duplicate: false,
      provider,
    };
  } catch (error) {
    await failCustomerCommunication({
      ...options,
      messageId: begun.message.id,
      error,
    });
    throw error;
  }
}
