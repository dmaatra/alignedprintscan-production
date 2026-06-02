const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Aligned Print & Scan <hello@alignedprintscan.com>";
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "hello@alignedprintscan.com";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || SUPPORT_EMAIL;
const SUPPORT_PHONE = Deno.env.get("SUPPORT_PHONE") || "(469) 383-8879";
const LOGO_URL = Deno.env.get("EMAIL_LOGO_URL") || `${SITE_URL}/assets/images/logo-full.webp`;

async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
}
function refFromId(id: string) { return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST"; }
function esc(v: unknown) { return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c] || c)); }
function money(v: unknown) { return `$${Number(v || 0).toFixed(2)}`; }
function emailShell(body: string, preheader: string) {
  return `<!doctype html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e7dcc5"><tr><td style="background:#ffffff;padding:30px 34px 20px;text-align:center;border-bottom:4px solid #c8a96b"><img src="${LOGO_URL}" alt="Aligned Print & Scan" style="max-width:210px;margin:0 auto 14px;display:block"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#161c4d;font-weight:800">Remote & Mobile Notary · Print, Scan & Document Support</div></td></tr><tr><td style="padding:34px">${body}</td></tr><tr><td style="padding:26px 34px;background:#fffaf2;border-top:1px solid #e7dcc5;color:#5b5a61;font-size:14px"><strong style="color:#161c4d">Need assistance?</strong><br>If you have additional questions, contact customer support and include your APS reference number.<br><br><a href="mailto:${SUPPORT_EMAIL}" style="color:#161c4d;font-weight:bold">${SUPPORT_EMAIL}</a><br>${SUPPORT_PHONE}<br>Waxahachie, Texas<div style="margin-top:18px;color:#8a8072">Aligned Print & Scan LLC</div></td></tr></table></td></tr></table></body></html>`;
}
async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }) });
}

async function stripeGet(path: string) {
  if (!STRIPE_SECRET_KEY) return null;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

async function receiptUrlForSession(session: any) {
  try {
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntentId) return null;
    const pi = await stripeGet(`payment_intents/${paymentIntentId}?expand[]=latest_charge`);
    const charge = pi?.latest_charge;
    return charge?.receipt_url || null;
  } catch (_) {
    return null;
  }
}
async function notifyPaymentSubmitted(requestId: string, session: any, invoice: any = null) {
  const reqRes = await supabaseFetch(`service_requests?select=id,service_type,invoice_number,customers(first_name,last_name,email)&id=eq.${requestId}`);
  const rows = reqRes.ok ? await reqRes.json() : [];
  const request = rows?.[0] || {};
  const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const ref = session.metadata?.reference_number || refFromId(requestId);
  const amount = Number(session.amount_total || 0) / 100;
  const isFinalBalance = !!invoice?.id;
  const invoiceLine = isFinalBalance ? `<br><strong style="color:#161c4d">Invoice:</strong> ${esc(invoice.invoice_number || "Final Balance Invoice")}` : "";
  const heading = isFinalBalance ? "Final Balance Payment Submitted" : "Payment Submitted — Review Needed";
  const subject = isFinalBalance ? `Final balance payment submitted: ${ref}` : `Payment submitted needs review: ${ref}`;
  const body = isFinalBalance
    ? "A client completed Stripe checkout for a final balance invoice. Please verify the payment, then update the order to Final Payment Received or Completed as appropriate."
    : "A client completed Stripe checkout. Please review Stripe/Supabase and manually update the request to Payment Received when confirmed.";

  const adminHtml = emailShell(`<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Admin Alert</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">${heading}</h1><p>${body}</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}${invoiceLine}<br><strong style="color:#161c4d">Amount:</strong> ${money(amount)}<br><strong style="color:#161c4d">Stripe Session:</strong> ${esc(session.id)}</div><p><a href="${SITE_URL}/admin-dashboard.html" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open Admin Dashboard</a></p>`, subject);
  await sendEmail(ADMIN_EMAIL, subject, adminHtml);
}


Deno.serve(async (req) => {
  try {
    const event = await req.json();
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const requestId = session.metadata?.request_id;
      const invoiceId = session.metadata?.invoice_id || null;
      if (requestId) {
        const ref = session.metadata?.reference_number || refFromId(requestId);
        const amount = Number(session.amount_total || 0) / 100;
        const receiptUrl = await receiptUrlForSession(session);
        let invoice: any = null;
        if (invoiceId) {
          const invRes = await supabaseFetch(`invoices?select=*&id=eq.${invoiceId}&limit=1`);
          const invRows = invRes.ok ? await invRes.json().catch(() => []) : [];
          invoice = invRows?.[0] || null;
          await supabaseFetch(`invoices?id=eq.${invoiceId}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "payment_submitted",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent || null,
              paid_amount: amount,
              amount_paid: amount,
              paid_at: new Date().toISOString(),
              receipt_url: receiptUrl,
            }),
          });
        } else {
          await supabaseFetch(`service_requests?id=eq.${requestId}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "payment_submitted",
              payment_status: "submitted",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent || null,
              paid_amount: amount,
              receipt_url: receiptUrl,
            }),
          });
        }
        await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: requestId, status: invoiceId ? "final_balance_payment_submitted" : "payment_submitted", message: `Stripe checkout completed for ${ref}. Admin payment review needed.`, sent_email: !!RESEND_API_KEY, sent_sms: false }) });
        await notifyPaymentSubmitted(requestId, session, invoice);
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
});
