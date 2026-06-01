// Aligned Print & Scan — New request notification emails
// Sends a branded customer confirmation and an admin alert to hello@alignedprintscan.com.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "hello@alignedprintscan.com";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || SUPPORT_EMAIL;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || `Aligned Print & Scan <${SUPPORT_EMAIL}>`;
const SUPPORT_PHONE = Deno.env.get("SUPPORT_PHONE") || "(469) 383-8879";
const LOGO_URL = Deno.env.get("EMAIL_LOGO_URL") || `${SITE_URL}/assets/images/logo-full.webp`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function esc(v: unknown) { return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c] || c)); }
function serviceLabel(s: string) { return ({ ron:"Remote Online Notary", mobile:"Mobile Notary", print:"Print & Scan" } as Record<string,string>)[s] || "Service Request"; }

async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation", ...(init.headers || {}) } });
}

function emailShell(body: string, preheader: string) {
  return `<!doctype html><html><head><meta name="color-scheme" content="light only"></head><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e7dcc5"><tr><td style="background:#ffffff;padding:30px 34px 20px;text-align:center;border-bottom:4px solid #c8a96b"><img src="${LOGO_URL}" alt="Aligned Print & Scan" style="max-width:210px;margin:0 auto 14px;display:block"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#161c4d;font-weight:800">Remote & Mobile Notary · Print, Scan & Document Support</div></td></tr><tr><td style="padding:34px">${body}</td></tr><tr><td style="padding:26px 34px;background:#fffaf2;border-top:1px solid #e7dcc5;color:#5b5a61;font-size:14px"><strong style="color:#161c4d">Need assistance?</strong><br><a href="mailto:${SUPPORT_EMAIL}" style="color:#161c4d;font-weight:bold">${SUPPORT_EMAIL}</a><br>${SUPPORT_PHONE}<br>Waxahachie, Texas<div style="margin-top:18px;color:#8a8072">Aligned Print & Scan LLC</div></td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, "Content-Type":"application/json" }, body:JSON.stringify({ from: FROM_EMAIL, to:[to], subject, html }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Resend email failed.");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    const body = await req.json();
    const requestId = body.request_id || "";
    const ref = body.reference_number || body.ref || "APS-REQUEST";
    const statusUrl = `${SITE_URL}/success.html?request_id=${requestId}&ref=${encodeURIComponent(ref)}`;

    let request: any = null;
    let customer: any = {
      first_name: body.first_name || body.firstName || body.customer?.first_name || "there",
      last_name: body.last_name || body.customer?.last_name || "",
      email: body.email || body.customer?.email || "",
      phone: body.phone || body.customer?.phone || "",
      preferred_contact: body.preferred_contact || body.customer?.preferred_contact || "",
    };

    if (requestId) {
      const reqRes = await supabaseFetch(`service_requests?select=*&id=eq.${requestId}&limit=1`);
      const reqRows = reqRes.ok ? await reqRes.json() : [];
      request = reqRows?.[0] || null;
      if (request?.customer_id) {
        const customerRes = await supabaseFetch(`customers?select=*&id=eq.${request.customer_id}&limit=1`);
        const customerRows = customerRes.ok ? await customerRes.json() : [];
        customer = { ...customer, ...(customerRows?.[0] || {}) };
      }
    }

    if (!customer.email) throw new Error("Customer email missing.");

    const customerHtml = emailShell(`<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Request Received</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Request Was Received</h1><p>Hello ${esc(customer.first_name || "there")},</p><p>Thank you for choosing Aligned Print & Scan. Your request has been securely received and is now under review.</p><div style="display:inline-block;background:#f6f3ee;border-radius:999px;padding:8px 14px;color:#161c4d;font-weight:800;margin:8px 0">${esc(ref)}</div><p>We will review the service details, documents, availability, and preparation requirements before sending your next step.</p><p><a href="${statusUrl}" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">View Request Status</a></p>`, `Request received: ${ref}`);

    const adminHtml = emailShell(`<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">New Request</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">New Client Request Received</h1><p>A new request was submitted and needs admin review.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}<br><strong style="color:#161c4d">Client:</strong> ${esc([customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Client")}<br><strong style="color:#161c4d">Email:</strong> ${esc(customer.email)}<br><strong style="color:#161c4d">Phone:</strong> ${esc(customer.phone || "Not provided")}<br><strong style="color:#161c4d">Preferred Contact:</strong> ${esc(customer.preferred_contact || "Not provided")}<br><strong style="color:#161c4d">Service:</strong> ${esc(serviceLabel(request?.service_type))}</div><p><a href="${SITE_URL}/admin-dashboard.html" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open Admin Dashboard</a></p>`, `New request: ${ref}`);

    const customerSend = await sendEmail(customer.email, `Request received: ${ref}`, customerHtml);
    const adminSend = await sendEmail(ADMIN_EMAIL, `New request received: ${ref}`, adminHtml);

    if (requestId) {
      await supabaseFetch("request_status_updates", { method:"POST", body: JSON.stringify({ service_request_id: requestId, status:"under_review", message:"New request confirmation and admin alert sent.", sent_email:true, sent_sms:false }) });
    }

    return json({ ok:true, customer_email_id: customerSend?.id, admin_email_id: adminSend?.id });
  } catch (err) {
    return json({ ok:false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
