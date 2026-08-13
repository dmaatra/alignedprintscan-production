/**
 * Aligned Print & Scan — Admin status updater.
 *
 * Workflow, payment, and appointment states are stored separately. Payment
 * buttons use record-admin-payment first; this function does not invent money
 * or mark an invoice paid merely because a workflow button was clicked.
 */

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
    await requireAdmin(request);
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
      // Financial safeguard: a request may not be completed while any active
      // invoice still has an unpaid balance.
      const invoiceResponse = await supabaseFetch(
        `invoices?select=id,invoice_number,status,amount_due,amount_paid,paid_amount,balance_due&service_request_id=eq.${requestId}`,
      );
      if (!invoiceResponse.ok) throw new Error(await invoiceResponse.text());
      const invoiceRows = await invoiceResponse.json();
      const outstanding = (invoiceRows || []).filter((invoice: any) => {
        const invoiceStatus = String(invoice.status || "").toLowerCase();
        if (["void", "cancelled"].includes(invoiceStatus)) return false;
        const due = Number(
          invoice.balance_due ??
            (Number(invoice.amount_due || 0) -
              Number(invoice.amount_paid || invoice.paid_amount || 0)),
        );
        return due > 0.009;
      });
      if (outstanding.length) {
        throw new Error(
          `Cannot complete this request while ${outstanding.length} invoice(s) have an outstanding balance.`,
        );
      }
      update.appointment_state = "completed";
      update.balance_due = 0;
      update.payment_state = "paid_in_full";
      update.payment_status = "paid_in_full";
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

    await supabaseFetch("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        event_type: sendMessage && emailStatuses.includes(status)
          ? "status_changed"
          : "status_changed_without_message",
        title: sendMessage && emailStatuses.includes(status)
          ? `Status Changed to ${status.replaceAll("_", " ")}`
          : `Status Changed Without Message to ${status.replaceAll("_", " ")}`,
        detail: note || null,
        actor_type: "admin",
        metadata: {
          status,
          message_sent: sendMessage && emailStatuses.includes(status),
        },
      }),
    });

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
