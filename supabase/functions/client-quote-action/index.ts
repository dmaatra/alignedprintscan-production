const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
function refFromId(id: string) { return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST"; }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { request_id, reference_number, action, message, contact } = await req.json();
    let id = request_id;
    if (!id && reference_number) {
      const prefix = String(reference_number).replace(/^APS-/i, "").toLowerCase();
      const lookup = await supabaseFetch(`service_requests?select=id&id=ilike.${encodeURIComponent(prefix)}*`);
      const rows = await lookup.json();
      id = rows?.[0]?.id;
    }
    if (!id) return json({ ok: false, error: "Request reference not found." }, 404);
    const ref = refFromId(id);
    if (action === "approve") {
      const updateRes = await supabaseFetch(`service_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "awaiting_payment", invoice_status: "approved", payment_status: "awaiting_payment" }) });
      if (!updateRes.ok) throw new Error(await updateRes.text());
      await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: id, status: "awaiting_payment", message: "Client approved the quote. Request is awaiting secure payment.", sent_email: false, sent_sms: false }) });
      return json({ ok: true, status: "awaiting_payment", reference_number: ref });
    }
    if (action === "changes_requested") {
      const note = String(message || "Client requested changes to quote.");
      await supabaseFetch(`service_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "changes_requested", invoice_status: "changes_requested" }) });
      await supabaseFetch(`support_tickets`, { method: "POST", body: JSON.stringify({ first_name: contact?.first_name || "Client", last_name: contact?.last_name || "", email: contact?.email || "unknown@alignedprintscan.com", reference_number: ref, reason: "quote_change_request", issue_type: "quote_change_request", urgency: "time_sensitive", message: note, status: "new", related_to_request: true }) });
      return json({ ok: true, status: "changes_requested", reference_number: ref });
    }
    return json({ ok: false, error: "Unsupported action." }, 400);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
