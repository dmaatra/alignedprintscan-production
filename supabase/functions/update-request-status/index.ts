// Aligned Print & Scan — Admin status updater
// Purpose: Optional backend endpoint for dashboard status changes.
// This keeps status updates, status history, and emails in one server-side place.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function onlyNonEmptyAppointmentFields(details: any) {
  const update: Record<string, unknown> = {};
  const map: Record<string, string> = {
    appointment_date: "appointment_date",
    appointment_time: "appointment_time",
    appointment_timezone: "appointment_timezone",
    appointment_location: "appointment_location",
    appointment_link: "appointment_link",
    appointment_platform: "appointment_platform",
    appointment_instructions: "appointment_instructions",
    appointment_line_items_note: "appointment_line_items_note",
  };

  for (const [incoming, column] of Object.entries(map)) {
    const value = details?.[incoming];
    if (value !== undefined && value !== null && String(value).trim() !== "") update[column] = value;
  }

  if (details?.balance_due_at_appointment !== undefined && details?.balance_due_at_appointment !== null && String(details.balance_due_at_appointment).trim() !== "") {
    update.balance_due_at_appointment = Number(details.balance_due_at_appointment) || 0;
  }

  if (update.appointment_link) update.ron_session_url = update.appointment_link;
  return update;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const requestId = cleanUuid(body.request_id);
    const status = String(body.status || "").trim();
    const note = String(body.note || "").trim();

    if (!requestId) throw new Error("Missing or invalid request_id.");
    if (!status) throw new Error("Missing status.");

    const update: Record<string, unknown> = { status };
    Object.assign(update, onlyNonEmptyAppointmentFields(body.appointment || {}));

    if (status === "payment_received") {
      update.payment_status = "paid";
      update.paid_at = new Date().toISOString();
      if (body.paid_amount !== undefined && body.paid_amount !== null && String(body.paid_amount).trim() !== "") {
        update.paid_amount = Number(body.paid_amount) || 0;
      }
    }

    if (status === "quote_expired") update.invoice_status = "expired";

    if (status === "appointment_confirmed") update.appointment_confirmed_at = new Date().toISOString();

    const updateRes = await supabaseFetch(`service_requests?id=eq.${requestId}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    });
    if (!updateRes.ok) throw new Error(await updateRes.text());

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

    // Trigger the branded customer/admin email for client-facing statuses.
    const emailStatuses = ["quote_ready", "awaiting_approval", "payment_received", "appointment_confirmed", "appointment_needs_rescheduling", "quote_expired", "completed"];
    if (emailStatuses.includes(status)) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ request_id: requestId, status, note }),
      });
    }

    return json({ ok: true, status, update });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
