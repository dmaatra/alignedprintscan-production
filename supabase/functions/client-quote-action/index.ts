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
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "hello@alignedprintscan.com";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || SUPPORT_EMAIL;
const LOGO_URL = Deno.env.get("EMAIL_LOGO_URL") || `${SITE_URL}/assets/images/logo-full.webp`;
function refFromId(id: string) { return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST"; }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function esc(v: unknown) { return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c] || c)); }
async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
}
function shell(body: string, preheader: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e7dcc5"><tr><td style="background:#ffffff;padding:30px 34px 20px;text-align:center;border-bottom:4px solid #c8a96b"><img src="${LOGO_URL}" alt="Aligned Print & Scan" style="max-width:210px;margin:0 auto 14px;display:block"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#161c4d;font-weight:800">Remote & Mobile Notary · Print, Scan & Document Support</div></td></tr><tr><td style="padding:34px">${body}</td></tr><tr><td style="padding:26px 34px;background:#fffaf2;border-top:1px solid #e7dcc5;color:#5b5a61;font-size:14px"><strong style="color:#161c4d">Aligned Print & Scan LLC</strong><br><a href="mailto:${SUPPORT_EMAIL}" style="color:#161c4d;font-weight:bold">${SUPPORT_EMAIL}</a></td></tr></table></td></tr></table></body></html>`;
}
async function sendAdmin(subject: string, html: string) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_EMAIL, to: [ADMIN_EMAIL], subject, html }) });
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
      await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: id, status: "awaiting_payment", message: "Client approved the quote. Request is awaiting secure payment.", sent_email: !!RESEND_API_KEY, sent_sms: false }) });
      await sendAdmin(`Quote approved / awaiting payment: ${ref}`, shell(`<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Admin Alert</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Quote Approved</h1><p>The client approved the quote for <strong>${esc(ref)}</strong>. The request is now awaiting secure payment.</p><p><a href="${SITE_URL}/admin-dashboard.html" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open Admin Dashboard</a></p>`, `Quote approved: ${ref}`));
      return json({ ok: true, status: "awaiting_payment", reference_number: ref });
    }
    if (action === "changes_requested") {
      const note = String(message || "Client requested changes to quote.");
      await supabaseFetch(`service_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "changes_requested", invoice_status: "changes_requested" }) });
      await supabaseFetch(`support_tickets`, { method: "POST", body: JSON.stringify({ first_name: contact?.first_name || "Client", last_name: contact?.last_name || "", email: contact?.email || "unknown@alignedprintscan.com", reference_number: ref, reason: "quote_change_request", issue_type: "quote_change_request", urgency: "time_sensitive", message: note, status: "new", related_to_request: true }) });
      await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: id, status: "changes_requested", message: note, sent_email: !!RESEND_API_KEY, sent_sms: false }) });
      await sendAdmin(`Quote changes requested: ${ref}`, shell(`<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Admin Alert</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Client Requested Quote Changes</h1><p>The client requested changes for <strong>${esc(ref)}</strong>.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0">${esc(note)}</div><p><a href="${SITE_URL}/admin-dashboard.html" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open Admin Dashboard</a></p>`, `Quote changes requested: ${ref}`));
      return json({ ok: true, status: "changes_requested", reference_number: ref });
    }
    return json({ ok: false, error: "Unsupported action." }, 400);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
