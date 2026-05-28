const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Aligned Print & Scan <hello@alignedprintscan.com>";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function refFromId(id: string) { return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST"; }
async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    const { request_id, reference_number } = await req.json();
    if (!request_id) throw new Error("Missing request_id.");
    const ref = reference_number || refFromId(request_id);
    const requestRes = await supabaseFetch(`service_requests?select=id,service_type,status,quote_amount,invoice_number,quote_notes,customers(first_name,last_name,email)&id=eq.${request_id}`);
    const requestRows = await requestRes.json();
    const request = requestRows?.[0];
    if (!request) throw new Error("Request not found.");
    const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
    if (!customer?.email) throw new Error("Customer email missing.");
    const statusUrl = `${SITE_URL}/success.html?request_id=${request_id}&ref=${encodeURIComponent(ref)}`;
    const amount = Number(request.quote_amount || 0).toFixed(2);
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#161c4d;line-height:1.6">
        <h1 style="color:#161c4d">Your Aligned Print & Scan Quote Is Ready</h1>
        <p>Hello ${customer.first_name || 'there'},</p>
        <p>Your request <strong>${ref}</strong> has been reviewed and your itemized quote is ready for approval.</p>
        <p><strong>Invoice total:</strong> $${amount}</p>
        ${request.quote_notes ? `<p>${request.quote_notes}</p>` : ''}
        <p><a href="${statusUrl}" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Review Quote & Next Steps</a></p>
        <p>Your appointment/order is not confirmed until payment and service details are finalized.</p>
        <p>Aligned Print & Scan<br><a href="mailto:hello@alignedprintscan.com">hello@alignedprintscan.com</a></p>
      </div>`;
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [customer.email], subject: `Your quote is ready: ${ref}`, html }),
    });
    const resend = await resendRes.json();
    if (!resendRes.ok) throw new Error(resend?.message || "Resend email failed.");
    await supabaseFetch(`service_requests?id=eq.${request_id}`, { method: "PATCH", body: JSON.stringify({ status: "awaiting_approval", invoice_url: statusUrl }) });
    await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: request_id, status: "awaiting_approval", message: "Quote email sent to client.", sent_email: true, sent_sms: false }) });
    return json({ ok: true, id: resend.id, status_url: statusUrl });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
