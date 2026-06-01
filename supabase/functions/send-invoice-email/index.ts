// Aligned Print & Scan — Quote email wrapper
// Purpose: Admin dashboard uses this function when the quote is ready.
// It updates the request, then delegates branded customer/admin email to send-order-email.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function refFromId(id: string) { return id ? `APS-${id.slice(0, 8).toUpperCase()}` : "APS-REQUEST"; }

async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey:SERVICE_ROLE_KEY, Authorization:`Bearer ${SERVICE_ROLE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation", ...(init.headers || {}) } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const requestId = String(body.request_id || "").trim();
    const ref = body.reference_number || refFromId(requestId);
    if (!requestId) throw new Error("Missing request_id.");

    const statusUrl = `${SITE_URL}/success.html?request_id=${requestId}&ref=${encodeURIComponent(ref)}`;

    const updateRes = await supabaseFetch(`service_requests?id=eq.${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "awaiting_approval", invoice_status: "sent", invoice_url: statusUrl }),
    });
    if (!updateRes.ok) throw new Error(await updateRes.text());

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({ service_request_id: requestId, status: "awaiting_approval", message: "Quote ready email requested.", sent_email: false, sent_sms: false }),
    });

    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, status: "awaiting_approval", note: body.note || "" }),
    });
    const emailJson = await emailRes.json().catch(() => ({}));
    if (!emailRes.ok) throw new Error(emailJson?.error || "send-order-email failed.");

    return json({ ok: true, status: "awaiting_approval", status_url: statusUrl, email: emailJson });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
