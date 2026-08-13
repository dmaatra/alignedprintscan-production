import { emailButton, renderCustomerEmailShell } from "../_shared/customer-email.mjs";

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
  return renderCustomerEmailShell({ body, preheader, siteUrl: SITE_URL, logoUrl: LOGO_URL, supportEmail: SUPPORT_EMAIL, supportPhone: SUPPORT_PHONE });
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, "Content-Type":"application/json" }, body:JSON.stringify({ from: FROM_EMAIL, to:[to], subject, html }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Resend email failed.");
  return data;
}
function renderTemplate(value: string, values: Record<string, string>) { return String(value || "").replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => values[key] || ""); }

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

    const templateResponse = await supabaseFetch("message_templates?select=*&template_key=eq.request_received&active=eq.true&limit=1");
    const template = templateResponse.ok ? (await templateResponse.json())?.[0] : null;
    if (!template) throw new Error("The centralized request_received message template is unavailable.");
    const templateValues = { request_reference: ref, customer_first_name: customer.first_name || "there", portal_url: statusUrl };
    const customerSubject = renderTemplate(template.subject_template, templateValues);
    const customerHtml = emailShell(`${renderTemplate(template.html_template, templateValues)}${emailButton(statusUrl, "View My Request")}`, customerSubject);

    const adminHtml = emailShell(`<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">New Request</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">New Client Request Received</h1><p>A new request was submitted and needs admin review.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}<br><strong style="color:#161c4d">Client:</strong> ${esc([customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Client")}<br><strong style="color:#161c4d">Email:</strong> ${esc(customer.email)}<br><strong style="color:#161c4d">Phone:</strong> ${esc(customer.phone || "Not provided")}<br><strong style="color:#161c4d">Preferred Contact:</strong> ${esc(customer.preferred_contact || "Not provided")}<br><strong style="color:#161c4d">Service:</strong> ${esc(serviceLabel(request?.service_type))}</div><p><a href="${SITE_URL}/admin-dashboard.html" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open Admin Dashboard</a></p>`, `New request: ${ref}`);

    const customerSend = await sendEmail(customer.email, customerSubject, customerHtml);
    const adminSend = await sendEmail(ADMIN_EMAIL, `New request received: ${ref}`, adminHtml);

    if (requestId) {
      await supabaseFetch("messages", { method:"POST", body: JSON.stringify({ service_request_id: requestId, template_id: template.id, recipient: customer.email, subject: customerSubject, rendered_html: customerHtml, rendered_text: renderTemplate(template.text_template || "", templateValues), delivery_state:"sent", provider_message_id: customerSend?.id || null, sent_at:new Date().toISOString() }) });
      await supabaseFetch("request_status_updates", { method:"POST", body: JSON.stringify({ service_request_id: requestId, status:"under_review", message:"New request confirmation and admin alert sent.", sent_email:true, sent_sms:false }) });
    }

    return json({ ok:true, customer_email_id: customerSend?.id, admin_email_id: adminSend?.id });
  } catch (err) {
    return json({ ok:false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
