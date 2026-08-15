import { renderFullTemplateEmail } from "../_shared/template-preview.mjs";
import { customerPortalUrl } from "../_shared/customer-email.mjs";
import { safeDeliveryError } from "../_shared/communication-history.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ||
  "Aligned Print & Scan <hello@alignedprintscan.com>";
const GOOGLE_REVIEW_URL = "https://g.page/r/CeY4X1XsHwJFEAI/review";
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function cleanUuid(value: unknown) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
    ? text
    : "";
}
async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}
async function rows(path: string) {
  const response = await rest(path);
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}
async function requireAdmin(request: Request) {
  const token = request.headers.get("Authorization") || "";
  if (!token.startsWith("Bearer ")) {
    throw new Error("Administrator authentication is required.");
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: token },
  });
  if (!response.ok) {
    throw new Error("Administrator authentication is required.");
  }
  const user = await response.json();
  const adminResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!adminResponse.ok || await adminResponse.json() !== true) {
    throw new Error("Administrator access is required.");
  }
  return user.id;
}
function render(template: string, values: Record<string, unknown>) {
  return String(template || "").replace(
    /{{\s*([a-z0-9_]+)\s*}}/gi,
    (_, key) => String(values[key] ?? ""),
  );
}
function isDeliverable(file: any) {
  return file?.is_active !== false && file?.customer_visible === true &&
    file?.eligible_for_delivery === true &&
    file?.document_classification !== "internal_document";
}
function isSafeCustomerAttachment(file: any) {
  return isDeliverable(file) ||
    (file?.is_active !== false && file?.uploaded_by === "customer" &&
      file?.document_classification === "customer_document");
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
function customerDate(value: unknown) {
  if (!value) return "";
  const date = new Date(
    String(value).length === 10 ? `${value}T12:00:00-05:00` : String(value),
  );
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Chicago",
    }).format(date);
}
async function finalizeReviewRequest(requestId: string, messageId: string) {
  const completedAt = new Date().toISOString();
  const stateResponse = await rest("service_requests?id=eq." + requestId, {
    method: "PATCH",
    body: JSON.stringify({
      review_request_state: "sent",
      review_request_sent_at: completedAt,
      review_destination_key: "google",
      review_message_id: messageId,
    }),
  });
  if (!stateResponse.ok) throw new Error(await stateResponse.text());
  const prior = await rows(
    `request_timeline_events?select=id&service_request_id=eq.${requestId}&event_type=eq.review_request_sent&metadata-%3E%3Emessage_id=eq.${messageId}&limit=1`,
  );
  if (!prior.length) {
    const timelineResponse = await rest("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        event_type: "review_request_sent",
        title: "Review request sent",
        detail: "A neutral optional Google review invitation was delivered.",
        actor_type: "admin",
        visibility: "internal",
        metadata: {
          message_id: messageId,
          destination: "google",
          review_received: false,
        },
      }),
    });
    if (!timelineResponse.ok) throw new Error(await timelineResponse.text());
  }
}
function templateAction(
  key: string,
  serviceRequest: any,
  releasedFiles: any[],
) {
  const actions: Record<string, [string, string]> = {
    request_received: ["View My Request", "overview"],
    quote_ready: ["Review Quote", "quote-payment"],
    awaiting_payment_reminder: ["Make Payment", "quote-payment"],
    payment_received: ["View Payment Status", "quote-payment"],
    final_invoice: ["Review & Pay Balance", "quote-payment"],
    appointment_confirmed: ["View Appointment", "fulfillment"],
    appointment_reminder: ["View Appointment", "fulfillment"],
    appointment_rescheduled: ["View Updated Appointment", "fulfillment"],
    ron_session_ready: ["View Appointment", "fulfillment"],
    mobile_appointment_confirmation: ["View Appointment", "fulfillment"],
    completed_scan_delivery: ["View Documents", "documents"],
    document_delivery: ["View Documents", "documents"],
    cancellation: ["View My Request", "overview"],
    general_customer_message: ["View My Request", "overview"],
  };
  if (key === "order_completed") {
    return releasedFiles.length
      ? ["View Documents", "documents"]
      : ["View Completed Request", "overview"];
  }
  return actions[key] || ["View My Request", "overview"];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  let messageId = "";
  let requestId = "";
  let providerAccepted = false;
  try {
    const adminId = await requireAdmin(request);
    const body = await request.json();
    requestId = cleanUuid(body.request_id);
    const templateId = cleanUuid(body.template_id),
      targetStatus = String(body.status || "").trim();
    if (!requestId || !templateId) {
      throw new Error("A request and message template are required.");
    }
    const [requestRows, templateRows, quotes, invoices, files, invoiceItems] =
      await Promise.all([
        rows(`service_requests?select=*&id=eq.${requestId}&limit=1`),
        rows(
          `message_templates?select=*&id=eq.${templateId}&active=eq.true&limit=1`,
        ),
        rows(
          `quotes?select=*&service_request_id=eq.${requestId}&order=version.desc&limit=1`,
        ),
        rows(
          `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.desc`,
        ),
        rows(
          `request_files?select=*&service_request_id=eq.${requestId}&is_active=eq.true&order=created_at.desc`,
        ),
        rows(
          `invoice_items?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
        ),
      ]);
    const serviceRequest = requestRows[0], template = templateRows[0];
    if (!serviceRequest || !template) {
      throw new Error("Request or active template not found.");
    }
    const customers = serviceRequest.customer_id
      ? await rows(
        `customers?select=*&id=eq.${serviceRequest.customer_id}&limit=1`,
      )
      : [];
    const customer = customers[0] || {}, quote = quotes[0];
    const isReviewRequest = template.template_key === "review_request";
    const reviewIdempotencyKey = `review-request:${requestId}:google`;
    if (isReviewRequest) {
      if (serviceRequest.review_request_state === "sent") {
        const existing = await rows(
          `messages?select=*&idempotency_key=eq.${encodeURIComponent(reviewIdempotencyKey)}&delivery_state=eq.sent&limit=1`,
        );
        const existingMessage = existing[0];
        if (existingMessage) {
          await finalizeReviewRequest(requestId, existingMessage.id);
          return json({
            ok: true,
            duplicate: true,
            message_id: existingMessage.id,
            provider_message_id: existingMessage.provider_message_id || null,
            status: serviceRequest.status,
          });
        }
        throw new Error("This request's review invitation has already been sent.");
      }
      if (serviceRequest.review_request_state !== "eligible") {
        throw new Error(
          "This request is not eligible for a review invitation. Completion, customer deliverable release, and financial resolution are required.",
        );
      }
      const existing = await rows(
        `messages?select=*&idempotency_key=eq.${encodeURIComponent(reviewIdempotencyKey)}&limit=1`,
      );
      if (existing[0]?.delivery_state === "sent") {
        await finalizeReviewRequest(requestId, existing[0].id);
        return json({
          ok: true,
          duplicate: true,
          message_id: existing[0].id,
          provider_message_id: existing[0].provider_message_id || null,
          status: serviceRequest.status,
        });
      }
      if (existing[0]) {
        throw new Error(
          "A prior review invitation attempt is already recorded. Inspect its delivery state before retrying.",
        );
      }
    }
    const invoice = invoices.find((item: any) =>
      !["void", "cancelled"].includes(String(item.status || "").toLowerCase())
    );
    const selectedIds =
      (Array.isArray(body.request_file_ids) ? body.request_file_ids : []).map(
        cleanUuid,
      ).filter(Boolean);
    const selectedFiles = files.filter((file: any) =>
      selectedIds.includes(file.id)
    );
    if (selectedFiles.some((file: any) => !isSafeCustomerAttachment(file))) {
      throw new Error(
        "Only intentionally released customer deliverables or request-scoped customer uploads may be attached.",
      );
    }
    if (template.required_attachment_type === "quote" && !quote) {
      throw new Error("This template requires the current quote.");
    }
    if (template.required_attachment_type === "invoice" && !invoice) {
      throw new Error("This template requires a current invoice.");
    }
    if (
      template.required_attachment_type === "deliverable" &&
      !selectedFiles.length
    ) {
      throw new Error(
        "This template requires at least one released customer deliverable.",
      );
    }
    const reference = `APS-${requestId.slice(0, 8).toUpperCase()}`;
    if (targetStatus === "completed") {
      const validation = await fetch(
        `${SUPABASE_URL}/functions/v1/update-request-status`,
        {
          method: "POST",
          headers: {
            Authorization: request.headers.get("Authorization") || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: requestId,
            status: "completed",
            validate_only: true,
            send_message: false,
          }),
        },
      );
      const validationResult = await validation.json().catch(() => ({}));
      if (!validation.ok || validationResult?.validation?.allowed !== true) {
        const summary = (validationResult?.validation?.blockers ||
          validationResult?.blockers || []).map((item: any) => item.message)
          .join("; ");
        throw new Error(
          summary || validationResult?.error ||
            "Completion requirements are not satisfied.",
        );
      }
    }
    const releasedFiles = files.filter(isDeliverable);
    const [actionLabel, actionTab] = templateAction(
      template.template_key,
      serviceRequest,
      releasedFiles,
    );
    const effectiveCompletionAt = targetStatus === "completed" &&
        !serviceRequest.completed_at
      ? new Date().toISOString()
      : serviceRequest.completed_at;
    const values = {
      request_reference: reference,
      customer_first_name: customer.first_name || "",
      customer_name:
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        "",
      service_name: ({
        ron: "Remote Online Notary",
        mobile: "Mobile Notary",
        print: "Print & Scan",
      } as Record<string, string>)[serviceRequest.service_type] ||
        "Service Request",
      requested_date: customerDate(serviceRequest.preferred_date),
      requested_time: serviceRequest.preferred_time_window || "",
      quote_number: quote?.quote_number || "",
      quote_amount: Number(quote?.amount || serviceRequest.quote_amount || 0)
        .toFixed(2),
      balance_due: Number(
        serviceRequest.balance_due || invoice?.balance_due || 0,
      ).toFixed(2),
      amount_paid: Number(
        serviceRequest.paid_amount || invoice?.amount_paid || 0,
      ).toFixed(2),
      invoice_number: invoice?.invoice_number || "",
      appointment_date: customerDate(serviceRequest.appointment_date),
      appointment_time: serviceRequest.appointment_time || "",
      appointment_location: serviceRequest.appointment_location || "",
      appointment_link: serviceRequest.appointment_link ||
        serviceRequest.ron_session_url || "",
      completion_date: customerDate(effectiveCompletionAt),
      released_document_names: releasedFiles.map((file: any) => file.file_name)
        .join(", "),
      portal_url: customerPortalUrl(
        "https://alignedprintscan.com",
        requestId,
        actionTab,
      ),
    };
    const recipient = String(body.recipient || customer.email || "").trim();
    const cc =
      (Array.isArray(body.cc) ? body.cc : String(body.cc || "").split(",")).map(
        (value: unknown) => String(value).trim(),
      ).filter(Boolean);
    const subject = String(
      body.subject || render(template.subject_template, values),
    ).trim();
    const previewContext = {
      requestId,
      reference,
      customer,
      serviceType: serviceRequest.service_type,
      serviceName: values.service_name,
      requestedDate: values.requested_date,
      requestedTime: values.requested_time,
      appointmentDate: values.appointment_date,
      appointmentTime: values.appointment_time,
      appointmentLocation: values.appointment_location,
      appointmentLink: values.appointment_link,
      appointmentInstructions: serviceRequest.appointment_instructions || "",
      preferredContact: customer.preferred_contact || "",
      quoteNumber: values.quote_number,
      quoteVersion: quote?.version || "",
      quoteAmount: values.quote_amount,
      quoteItems: invoiceItems.map((item: any) => ({
        name: item.description || "Service",
        quantity: item.quantity || 1,
        rate: `$${Number(item.unit_price || 0).toFixed(2)}`,
        total: `$${Number(item.line_total || 0).toFixed(2)}`,
      })),
      invoiceNumber: values.invoice_number,
      paymentAmount: values.amount_paid,
      paymentDate: customerDate(serviceRequest.paid_at),
      paidAmount: values.amount_paid,
      balanceDue: values.balance_due,
      releasedDocumentNames: releasedFiles.map((file: any) => file.file_name),
      completionDate: values.completion_date,
      siteUrl: "https://alignedprintscan.com",
      actionUrl: isReviewRequest ? GOOGLE_REVIEW_URL : undefined,
    };
    const html = renderFullTemplateEmail({
      template,
      context: previewContext,
      editedBody: String(body.html || render(template.html_template, values)),
      subjectOverride: subject,
    }).html;
    const text = String(
      body.text ||
        render(
          template.text_template ||
            template.html_template.replace(/<[^>]+>/g, " "),
          values,
        ),
    );
    if (!recipient || !subject || !html) {
      throw new Error("Recipient, subject, and message body are required.");
    }
    const inserted = await rest("messages", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        template_id: templateId,
        template_key: template.template_key || null,
        channel: "email",
        recipient,
        cc,
        subject,
        rendered_html: html,
        rendered_text: text,
        delivery_state: "sending",
        associated_status: targetStatus || template.associated_status || null,
        source_type: "admin",
        source_event: "admin_composed",
        idempotency_key: isReviewRequest ? reviewIdempotencyKey : null,
        attempted_at: new Date().toISOString(),
        created_by: adminId,
      }),
    });
    if (!inserted.ok) throw new Error(await inserted.text());
    messageId = (await inserted.json())[0].id;
    const attachments: any[] = [];
    if (template.required_attachment_type === "quote") {
      attachments.push({
        message_id: messageId,
        attachment_type: "quote",
        quote_id: quote.id,
      });
    }
    if (template.required_attachment_type === "invoice") {
      attachments.push({
        message_id: messageId,
        attachment_type: "invoice",
        invoice_id: invoice.id,
      });
    }
    selectedFiles.forEach((file: any) =>
      attachments.push({
        message_id: messageId,
        attachment_type: "document",
        request_file_id: file.id,
      })
    );
    if (attachments.length) {
      const response = await rest("message_attachments", {
        method: "POST",
        body: JSON.stringify(attachments),
      });
      if (!response.ok) throw new Error(await response.text());
    }
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    const providerAttachments: any[] = [];
    if (template.required_attachment_type === "quote") {
      providerAttachments.push({
        filename: `${quote.quote_number || reference + "-quote"}.html`,
        content: base64(
          new TextEncoder().encode(
            `<h1>Service Quote ${reference}</h1><p>Total: $${values.quote_amount}</p><p>${
              quote.notes || ""
            }</p>`,
          ),
        ),
      });
    }
    if (template.required_attachment_type === "invoice") {
      providerAttachments.push({
        filename: `${invoice.invoice_number || reference + "-invoice"}.html`,
        content: base64(
          new TextEncoder().encode(
            `<h1>Invoice ${
              invoice.invoice_number || reference
            }</h1><p>Amount due: $${
              Number(invoice.amount_due || 0).toFixed(2)
            }</p>`,
          ),
        ),
      });
    }
    for (const file of selectedFiles) {
      const download = await fetch(
        `${SUPABASE_URL}/storage/v1/object/service-request-files/${file.file_path}`,
        {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
        },
      );
      if (!download.ok) throw new Error(`Could not attach ${file.file_name}.`);
      providerAttachments.push({
        filename: file.file_name,
        content: base64(new Uint8Array(await download.arrayBuffer())),
      });
    }
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        cc,
        subject,
        html,
        text,
        attachments: providerAttachments,
      }),
    });
    const provider = await sent.json().catch(() => ({}));
    if (!sent.ok) {
      throw new Error(
        provider.message || "Email provider rejected the message.",
      );
    }
    providerAccepted = true;
    const messageUpdate = await rest(`messages?id=eq.${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        delivery_state: "sent",
        provider_message_id: provider.id || null,
        sent_at: new Date().toISOString(),
      }),
    });
    if (!messageUpdate.ok) throw new Error(await messageUpdate.text());
    await rest("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        event_type: "message_sent",
        title: "Customer message sent",
        detail: subject,
        actor_type: "admin",
        visibility: "internal",
        metadata: { message_id: messageId, source_type: "admin" },
      }),
    }).catch(() => null);
    if (isReviewRequest) {
      await finalizeReviewRequest(requestId, messageId);
    }
    if (targetStatus) {
      if (targetStatus === "completed") {
        const completion = await fetch(
          `${SUPABASE_URL}/functions/v1/update-request-status`,
          {
            method: "POST",
            headers: {
              Authorization: request.headers.get("Authorization") || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              request_id: requestId,
              status: "completed",
              send_message: false,
            }),
          },
        );
        const completionResult = await completion.json().catch(() => ({}));
        if (!completion.ok || completionResult?.ok === false) {
          throw new Error(
            completionResult?.error ||
              "Completion state could not be recorded.",
          );
        }
      } else {
        const statusUpdate: Record<string, unknown> = {
          status: targetStatus,
          workflow_status: targetStatus,
        };
        if (targetStatus === "appointment_confirmed") {
          statusUpdate.appointment_confirmed_at = new Date().toISOString();
          statusUpdate.appointment_state = "scheduled";
        } else if (targetStatus === "appointment_needs_rescheduling") {
          statusUpdate.appointment_state = "rescheduling_requested";
        }
        const response = await rest(`service_requests?id=eq.${requestId}`, {
          method: "PATCH",
          body: JSON.stringify(statusUpdate),
        });
        if (!response.ok) throw new Error(await response.text());
      }
    }
    if (targetStatus) {
      await rest("request_timeline_events", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          event_type: "status_changed",
          title: "Request status updated",
          detail: targetStatus,
          actor_type: "admin",
          visibility: "customer",
        }),
      }).catch(() => null);
    }
    return json({
      ok: true,
      message_id: messageId,
      provider_message_id: provider.id || null,
      status: targetStatus || serviceRequest.status,
    });
  } catch (error) {
    const errorMessage = safeDeliveryError(error);
    if (messageId && !providerAccepted) {
      await rest(`messages?id=eq.${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          delivery_state: "failed",
          error_message: errorMessage.slice(0, 500),
          failed_at: new Date().toISOString(),
        }),
      }).catch(() => null);
      await rest("request_timeline_events", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          event_type: "message_failed",
          title: "Customer message failed",
          detail:
            "Customer communication failed. Review the Messages tab for details.",
          actor_type: "admin",
          visibility: "internal",
          metadata: { message_id: messageId, source_type: "admin" },
        }),
      }).catch(() => null);
    }
    if (messageId && providerAccepted) {
      await rest(`messages?id=eq.${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          error_message:
            `Message sent, but follow-up state failed: ${errorMessage}`,
        }),
      }).catch(() => null);
    }
    return json({
      ok: false,
      error: providerAccepted
        ? `Message was sent, but the status update failed: ${errorMessage}`
        : errorMessage,
      message_sent: providerAccepted,
      status_updated: false,
    }, providerAccepted ? 409 : 400);
  }
});
