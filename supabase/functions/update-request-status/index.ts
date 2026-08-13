/**
 * Aligned Print & Scan — Admin status updater.
 *
 * Workflow, payment, and appointment states are stored separately. Payment
 * buttons use record-admin-payment first; this function does not invent money
 * or mark an invoice paid merely because a workflow button was clicked.
 */
import { evaluateCompletion } from "../_shared/completion-gate.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Administrator authentication is required.");
  }
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: authorization },
  });
  if (!userResponse.ok) throw new Error("Administrator authentication is required.");
  const user = await userResponse.json();
  const adminResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!adminResponse.ok || await adminResponse.json() !== true) {
    throw new Error("Administrator access is required.");
  }
  return user;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
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

function cleanUuid(value: unknown) {
  const text = String(value || "").trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
    ? text
    : "";
}

function appointmentFields(details: any) {
  const update: Record<string, unknown> = {};
  const keys = [
    "appointment_date",
    "appointment_time",
    "appointment_timezone",
    "appointment_location",
    "appointment_link",
    "appointment_platform",
    "appointment_instructions",
    "appointment_line_items_note",
  ];

  keys.forEach((key) => {
    const value = details?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      update[key] = value;
    }
  });

  if (details?.balance_due_at_appointment !== undefined) {
    update.balance_due_at_appointment =
      Number(details.balance_due_at_appointment) || 0;
  }

  if (update.appointment_link) {
    update.ron_session_url = update.appointment_link;
  }

  return update;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const requestId = cleanUuid(body.request_id);
    const status = String(body.status || "").trim();
    const note = String(body.note || "").trim();
    const sendMessage = body.send_message !== false;

    if (!requestId) {
      throw new Error("Missing or invalid request_id.");
    }

    if (!status) {
      throw new Error("Missing status.");
    }

    const update: Record<string, unknown> = {
      status,
      workflow_status: status,
      ...appointmentFields(body.appointment || {}),
    };

    if (status === "quote_expired") {
      update.invoice_status = "expired";
    }

    if (status === "appointment_confirmed") {
      update.appointment_confirmed_at = new Date().toISOString();
      update.appointment_state = "scheduled";
    }

    if (status === "appointment_needs_rescheduling") {
      update.appointment_state = "rescheduling_requested";
    }

    if (status === "completed") {
      const requestResponse = await supabaseFetch(`service_requests?select=*&id=eq.${requestId}&limit=1`);
      if (!requestResponse.ok) throw new Error(await requestResponse.text());
      const serviceRequest = (await requestResponse.json())?.[0];
      if (!serviceRequest) throw new Error("Request not found.");
      const detailTable = serviceRequest.service_type === "ron" ? "ron_requests" : serviceRequest.service_type === "mobile" ? "mobile_notary_requests" : "print_scan_requests";
      const [invoiceResponse, reviewResponse, fileResponse, participantResponse, detailResponse, factsResponse, proofResponse] = await Promise.all([
        supabaseFetch(`invoices?select=*&service_request_id=eq.${requestId}`),
        supabaseFetch(`review_queue_items?select=*&service_request_id=eq.${requestId}&state=eq.open`),
        supabaseFetch(`request_files?select=*&service_request_id=eq.${requestId}&is_active=eq.true`),
        supabaseFetch(`request_participants?select=*&service_request_id=eq.${requestId}`),
        supabaseFetch(`${detailTable}?select=*&service_request_id=eq.${requestId}&limit=1`),
        supabaseFetch(`request_completion_facts?select=*&service_request_id=eq.${requestId}&limit=1`),
        supabaseFetch(`proof_transactions?select=proof_status,aps_status&service_request_id=eq.${requestId}&order=created_at.desc&limit=1`),
      ]);
      for (const response of [invoiceResponse, reviewResponse, fileResponse, participantResponse, detailResponse, factsResponse, proofResponse]) {
        if (!response.ok) throw new Error(await response.text());
      }
      const result = evaluateCompletion({
        request: serviceRequest,
        invoices: await invoiceResponse.json(),
        reviewItems: await reviewResponse.json(),
        files: await fileResponse.json(),
        participants: await participantResponse.json(),
        detail: (await detailResponse.json())?.[0] || {},
        facts: (await factsResponse.json())?.[0] || {},
        proofTransaction: (await proofResponse.json())?.[0] || null,
      });
      if (body.validate_only === true) return json({ ok: true, validation: result });

      const completeWithException = body.complete_with_exception === true;
      let exceptionId: string | null = null;
      if (!result.allowed && !completeWithException) {
        return json({ ok: false, code: "COMPLETION_BLOCKED", blockers: result.blockers, validation: result }, 409);
      }
      if (completeWithException) {
        if (sendMessage) throw new Error("Complete with Exception must be recorded first; send any customer-facing explanation separately.");
        const exceptionType = String(body.exception_type || "").trim();
        const explanation = String(body.exception_explanation || "").trim();
        const allowedTypes = new Set(["approved_balance_exception", "physical_only_no_portal_deliverable", "customer_declined_optional_deliverable", "external_platform_delivery", "administrative_closure", "other"]);
        if (!allowedTypes.has(exceptionType)) throw new Error("Select a valid completion exception type.");
        if (explanation.length < 5) throw new Error("Complete with Exception requires an explanation.");
        const exceptionResponse = await supabaseFetch("request_completion_exceptions", {
          method: "POST",
          body: JSON.stringify({ service_request_id: requestId, exception_type: exceptionType, explanation, overridden_blockers: result.blockers, created_by: admin.id }),
        });
        if (!exceptionResponse.ok) throw new Error(await exceptionResponse.text());
        exceptionId = (await exceptionResponse.json())?.[0]?.id || null;
      }
      update.appointment_state = "completed";
      update.fulfillment_state = "completed";
      update.completed_at = new Date().toISOString();
      update.completion_path = completeWithException ? "exception" : "normal";
      update.completion_exception_id = exceptionId;
      if (result.outstanding_balance <= 0.009) {
        update.balance_due = 0;
        update.payment_state = "paid_in_full";
        update.payment_status = "paid_in_full";
      }
      body._completion = { result, completeWithException, exceptionId };
    }

    const emailStatuses = [
      "quote_ready",
      "awaiting_approval",
      "payment_received",
      "final_payment_received",
      "appointment_confirmed",
      "appointment_needs_rescheduling",
      "quote_expired",
      "completed",
    ];

    // Customer communication is sent first. A failed delivery must never
    // produce a false operational transition.
    if (sendMessage && emailStatuses.includes(status)) {
      const emailResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/send-order-email`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: requestId,
            status,
            note,
            invoice_id: body.invoice_id || body.invoiceId || null,
          }),
        },
      );
      const emailResult = await emailResponse.json().catch(() => ({}));
      if (!emailResponse.ok || emailResult?.ok === false) {
        await supabaseFetch("request_timeline_events", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: requestId,
            event_type: "message_failed",
            title: "Message Failed",
            detail: emailResult?.error || "Customer message could not be sent.",
            actor_type: "system",
            metadata: { attempted_status: status },
          }),
        });
        throw new Error(
          emailResult?.error ||
            "Customer message could not be sent; status was not changed.",
        );
      }
    }

    const updateResponse = await supabaseFetch(
      `service_requests?id=eq.${requestId}`,
      {
        method: "PATCH",
        body: JSON.stringify(update),
      },
    );

    if (!updateResponse.ok) {
      throw new Error(await updateResponse.text());
    }

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status,
        message: note || `Status updated to ${status}.`,
        sent_email: false,
        sent_sms: false,
      }),
    });

    const timelineResponse = await supabaseFetch("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        event_type: status === "completed" && body._completion?.completeWithException
          ? "order_completed_with_exception"
          : status === "completed"
          ? "order_completed"
          : sendMessage && emailStatuses.includes(status)
          ? "status_changed"
          : "status_changed_without_message",
        title: status === "completed" && body._completion?.completeWithException
          ? "Order Completed with Exception"
          : status === "completed"
          ? "Order Completed"
          : sendMessage && emailStatuses.includes(status)
          ? `Status Changed to ${status.replaceAll("_", " ")}`
          : `Status Changed Without Message to ${status.replaceAll("_", " ")}`,
        detail: note || null,
        actor_type: "admin",
        metadata: {
          status,
          message_sent: sendMessage && emailStatuses.includes(status),
          completion_path: body._completion?.completeWithException ? "exception" : status === "completed" ? "normal" : null,
          completion_components: body._completion?.result?.components || null,
          overridden_blockers: body._completion?.completeWithException ? body._completion?.result?.blockers : null,
          exception_id: body._completion?.exceptionId || null,
          admin_id: admin.id,
        },
      }),
    });
    if (!timelineResponse.ok && status === "completed") {
      throw new Error(`Completion was recorded, but its required audit event failed: ${await timelineResponse.text()}`);
    }

    return json({ ok: true, status, update });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});
