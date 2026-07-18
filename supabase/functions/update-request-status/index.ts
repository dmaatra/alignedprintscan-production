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

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
    const body = await request.json();
    const requestId = cleanUuid(body.request_id);
    const status = String(body.status || "").trim();
    const note = String(body.note || "").trim();

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
      update.appointment_state = "completed";
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

    if (emailStatuses.includes(status)) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
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
      });
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
