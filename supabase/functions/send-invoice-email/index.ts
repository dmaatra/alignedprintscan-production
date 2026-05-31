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
const SUPPORT_PHONE = Deno.env.get("SUPPORT_PHONE") || "(469) 383-8879";
const LOGO_URL = Deno.env.get("EMAIL_LOGO_URL") || `${SITE_URL}/assets/images/logo-full.webp`;

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function refFromId(id: string) { return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST"; }
function esc(v: unknown) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c] || c)); }
function money(v: unknown) { return `$${Number(v || 0).toFixed(2)}`; }
async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
}
function emailShell(title: string, preheader: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e7dcc5"><tr><td style="background:#161c4d;padding:28px 34px;text-align:center"><img src="${LOGO_URL}" alt="Aligned Print & Scan" style="max-width:190px;margin:0 auto 12px;display:block"><div style="height:2px;background:#c8a96b;width:120px;margin:0 auto"></div></td></tr><tr><td style="padding:34px">${body}</td></tr><tr><td style="padding:26px 34px;background:#fffaf2;border-top:1px solid #e7dcc5;color:#5b5a61;font-size:14px"><strong style="color:#161c4d">Need assistance?</strong><br>If you have additional questions, contact customer support and include your APS reference number.<br><br><a href="mailto:${SUPPORT_EMAIL}" style="color:#161c4d;font-weight:bold">${SUPPORT_EMAIL}</a><br>${SUPPORT_PHONE}<br>Waxahachie, Texas<br><br><a href="${SITE_URL}/support.html" style="color:#c8a96b;font-weight:bold">Customer Support</a><div style="margin-top:18px;color:#8a8072">Aligned Print & Scan LLC · Remote Online & Mobile Notary Services · Professional Print, Scan & Document Support</div></td></tr></table></td></tr></table></body></html>`;
}
function itemTable(items: any[], total: number) {
  const rows = (items || []).map(i => `<tr><td style="padding:12px;border-bottom:1px solid #eee">${esc(i.description || "Service")}</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right">${esc(i.quantity || 1)}</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right">${money(i.unit_price)}</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right"><strong>${money(i.line_total || (Number(i.quantity||1)*Number(i.unit_price||0)))}</strong></td></tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid #eee;border-radius:14px;overflow:hidden;margin:18px 0"><thead><tr style="background:#161c4d;color:#fff"><th align="left" style="padding:12px">Service Item</th><th align="right" style="padding:12px">Qty</th><th align="right" style="padding:12px">Rate</th><th align="right" style="padding:12px">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#fffaf2;color:#161c4d"><td colspan="3" style="padding:14px;text-align:right"><strong>Total Due</strong></td><td style="padding:14px;text-align:right"><strong>${money(total)}</strong></td></tr></tfoot></table>`;
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
    const itemsRes = await supabaseFetch(`invoice_items?select=description,quantity,unit_price,line_total,item_type&service_request_id=eq.${request_id}&order=created_at.asc`);
    const items = itemsRes.ok ? await itemsRes.json() : [];
    const amount = Number(request.quote_amount || 0);
    const statusUrl = `${SITE_URL}/success.html?request_id=${request_id}&ref=${encodeURIComponent(ref)}`;
    const body = `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Quote Ready</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Aligned Print & Scan Quote Is Ready</h1><p>Hello ${esc(customer.first_name || "there")},</p><p>Your request <strong>${esc(ref)}</strong> has been reviewed and your itemized quote is ready for approval.</p><div style="display:inline-block;background:#f6f3ee;border-radius:999px;padding:8px 14px;color:#161c4d;font-weight:800;margin:8px 0">${esc(ref)}</div>${itemTable(items, amount)}${request.quote_notes ? `<div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:16px;margin:18px 0"><strong style="color:#161c4d">Client Note</strong><br>${esc(request.quote_notes)}</div>` : ""}<p>Your appointment/order is not confirmed until the quote is approved, payment is received, and any required scheduling details are finalized.</p><p><a href="${statusUrl}" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Review Quote & Next Steps</a></p>`;
    const html = emailShell("Quote Ready", `Your quote is ready: ${ref}`, body);
    const resendRes = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_EMAIL, to: [customer.email], subject: `Your quote is ready: ${ref}`, html }) });
    const resend = await resendRes.json();
    if (!resendRes.ok) throw new Error(resend?.message || "Resend email failed.");
    await supabaseFetch(`service_requests?id=eq.${request_id}`, { method: "PATCH", body: JSON.stringify({ status: "awaiting_approval", invoice_url: statusUrl }) });
    await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: request_id, status: "awaiting_approval", message: "Quote email sent to client.", sent_email: true, sent_sms: false }) });
    return json({ ok: true, id: resend.id, status_url: statusUrl });
  } catch (err) { return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400); }
});
