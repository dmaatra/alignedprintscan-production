// Aligned Document Services — Branded order-status emails
// Purpose: Send customer + admin emails for every client workflow phase.
// Phases handled here: quote_ready/awaiting_approval, payment_received,
// appointment_confirmed, final_balance_due/final_payment_received, completed, and general status updates.

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
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || `Aligned Document Services <${SUPPORT_EMAIL}>`;
const SUPPORT_PHONE = Deno.env.get("SUPPORT_PHONE") || "(469) 383-8879";
const LOGO_URL = Deno.env.get("EMAIL_LOGO_URL") || `${SITE_URL}/assets/images/logo-full.webp`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c] || c));
}

function money(value: unknown) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function refFromId(id: string) {
  return id ? `APS-${id.slice(0, 8).toUpperCase()}` : "APS-REQUEST";
}

function serviceLabel(service: string) {
  return ({ ron: "Remote Online Notary", mobile: "Mobile Notary", print: "Document Services" } as Record<string, string>)[service] || "Service Request";
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

async function readJsonOrEmpty(response: Response) {
  if (!response.ok) return null;
  try { return await response.json(); } catch (_) { return null; }
}

async function sendEmail(to: string | string[], subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) return null;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject, html }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Resend email failed.");
  return result;
}

function emailShell(body: string, preheader: string) {
  return `<!doctype html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e7dcc5"><tr><td style="background:#ffffff;padding:30px 34px 20px;text-align:center;border-bottom:4px solid #c8a96b"><img src="${LOGO_URL}" alt="Aligned Document Services" style="max-width:210px;margin:0 auto 14px;display:block"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#161c4d;font-weight:800">Remote & Mobile Notary · Print, Scan, Copies & Courier Support</div></td></tr><tr><td style="padding:34px;background:#ffffff;color:#2d2d2d">${body}</td></tr><tr><td style="padding:26px 34px;background:#fffaf2;border-top:1px solid #e7dcc5;color:#5b5a61;font-size:14px"><strong style="color:#161c4d">Need assistance?</strong><br>Contact customer support and include your APS reference number.<br><br><a href="mailto:${SUPPORT_EMAIL}" style="color:#161c4d;font-weight:bold">${SUPPORT_EMAIL}</a><br>${SUPPORT_PHONE}<br>Waxahachie, Texas<br><br><a href="${SITE_URL}/support.html" style="color:#c8a96b;font-weight:bold">Customer Support</a><div style="margin-top:18px;color:#8a8072">Aligned Document Services LLC</div></td></tr></table></td></tr></table></body></html>`;
}

function button(url: string, label: string) {
  return `<p><a href="${esc(url)}" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;
}

function itemTable(items: any[], total: number) {
  if (!Array.isArray(items) || !items.length) return "";

  const rows = items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const unit = Number(item.unit_price || 0);
    const lineTotal = Number(item.line_total || quantity * unit || 0);
    return `<tr><td style="padding:12px;border-bottom:1px solid #eee">${esc(item.description || "Service")}</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right">${esc(quantity)}</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right">${money(unit)}</td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right"><strong>${money(lineTotal)}</strong></td></tr>`;
  }).join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid #eee;border-radius:14px;overflow:hidden;margin:18px 0"><thead><tr style="background:#161c4d;color:#fff"><th align="left" style="padding:12px">Service Item</th><th align="right" style="padding:12px">Qty</th><th align="right" style="padding:12px">Rate</th><th align="right" style="padding:12px">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#fffaf2;color:#161c4d"><td colspan="3" style="padding:14px;text-align:right"><strong>Total</strong></td><td style="padding:14px;text-align:right"><strong>${money(total)}</strong></td></tr></tfoot></table>`;
}

function appointmentBlock(request: any) {
  const service = String(request.service_type || "").toLowerCase();
  const methodLabel = service === "ron" ? "RON Platform / Method" : "Service Method";
  const locationLabel = service === "ron" ? "Secure Session Link" : "Service Address / Delivery Address";
  const details = [
    ["Date", request.appointment_date],
    ["Time", request.appointment_time],
    [methodLabel, request.appointment_platform],
    [locationLabel, request.appointment_location],
    ["Secure Link", request.appointment_link || request.ron_session_url],
  ].filter(([, value]) => value);

  const rows = details.map(([label, value]) => {
    const text = String(value || "");
    const display = text.startsWith("http") ? `<a href="${esc(text)}" style="color:#161c4d;font-weight:bold">Open secure link</a>` : esc(text);
    return `<tr><td style="padding:10px;border-bottom:1px solid #eee;color:#161c4d;font-weight:bold">${esc(label)}</td><td style="padding:10px;border-bottom:1px solid #eee">${display}</td></tr>`;
  }).join("");

  return `<div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><h2 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 10px">Appointment Details</h2>${rows ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>` : `<p>Appointment details are being finalized.</p>`}${request.appointment_instructions ? `<p><strong>Preparation notes:</strong><br>${esc(request.appointment_instructions)}</p>` : ""}${Number(request.balance_due_at_appointment || 0) > 0 ? `<p><strong>Due at appointment:</strong> ${money(request.balance_due_at_appointment)}</p>` : ""}${request.appointment_line_items_note ? `<p><strong>Additional onsite items:</strong><br>${esc(request.appointment_line_items_note)}</p>` : ""}</div>`;
}

function requestSummary(request: any, customer: any, ref: string, total: number) {
  return `<div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}<br><strong style="color:#161c4d">Client:</strong> ${esc([customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Client")}<br><strong style="color:#161c4d">Service:</strong> ${esc(serviceLabel(request.service_type))}<br><strong style="color:#161c4d">Requested Date:</strong> ${esc(request.preferred_date || "Not provided")}<br><strong style="color:#161c4d">Requested Time:</strong> ${esc(request.preferred_time_window || "Not provided")}<br><strong style="color:#161c4d">Preferred Contact:</strong> ${esc(customer?.preferred_contact || "Not provided")}<br><strong style="color:#161c4d">Quote Total:</strong> ${money(total)}</div>`;
}

function buildCustomerContent(status: string, request: any, customer: any, items: any[], note: string, invoice: any = null) {
  const ref = refFromId(request.id);
  const total = Number(invoice?.amount_due || request.quote_amount || request.paid_amount || request.estimated_total || 0);
  const statusUrl = `${SITE_URL}/success.html?request_id=${request.id}&ref=${encodeURIComponent(ref)}`;
  const first = customer?.first_name || "there";
  const service = serviceLabel(request.service_type);

  if (["quote_ready", "awaiting_approval"].includes(status)) {
    return {
      subject: `Quote ready: ${ref}`,
      preheader: `Your Aligned Document Services quote is ready for review.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Quote Ready</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Quote Is Ready</h1><p>Hello ${esc(first)},</p><p>Your ${esc(service)} request has been reviewed. Please review the request summary and itemized quote, then approve or request changes from your secure status page.</p>${requestSummary(request, customer, ref, total)}${itemTable(items, total)}${request.quote_notes ? `<p><strong>Quote note:</strong> ${esc(request.quote_notes)}</p>` : ""}${button(statusUrl, "Review Quote")}`,
    };
  }

  if (status === "appointment_needs_rescheduling") {
    return {
      subject: `Appointment needs rescheduling: ${ref}`,
      preheader: `Your requested appointment time needs to be updated.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Rescheduling Needed</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Appointment Needs Rescheduling</h1><p>Hello ${esc(first)},</p><p>Your payment/request has been received, but your requested appointment time is no longer available or requires adjustment. Please reply with your next best availability, or watch for an updated appointment option from Aligned Print & Scan.</p>${note ? `<p><strong>Note:</strong> ${esc(note)}</p>` : ""}${button(statusUrl, "View Status")}`,
    };
  }

  if (status === "quote_expired") {
    return {
      subject: `Quote expired: ${ref}`,
      preheader: `Your quote has expired and may need review.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Quote Expired</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">This Quote Has Expired</h1><p>Hello ${esc(first)},</p><p>The secure payment option for <strong>${esc(ref)}</strong> is no longer active. Please submit a new request or contact support if you would like this quote reviewed again.</p>${button(statusUrl, "View Status")}`,
    };
  }

  if (status === "final_balance_due") {
    const invoiceNumber = invoice?.invoice_number || "Final Balance Invoice";
    return {
      subject: `Final balance due: ${ref}`,
      preheader: `A final balance invoice is ready for your review and payment.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Final Balance Due</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Final Balance Invoice Ready</h1><p>Hello ${esc(first)},</p><p>A final balance invoice has been issued for additional on-site, courier, document, or fulfillment services connected to your request.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}<br><strong style="color:#161c4d">Invoice:</strong> ${esc(invoiceNumber)}<br><strong style="color:#161c4d">Final Balance:</strong> ${money(total)}</div>${itemTable(items, total)}${note ? `<p><strong>Note:</strong> ${esc(note)}</p>` : ""}${button(statusUrl, "Review & Pay Final Balance")}`,
    };
  }

  if (status === "payment_received") {
    return {
      subject: `Payment received: ${ref}`,
      preheader: `Your payment has been received.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Payment Received</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Payment Has Been Received</h1><p>Hello ${esc(first)},</p><p>Thank you. Your payment for <strong>${esc(ref)}</strong> has been received and recorded. Please watch for your appointment confirmation email with the final date, time, link/location, and preparation instructions.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Amount Recorded:</strong> ${money(request.paid_amount || total)}<br><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}</div>${note ? `<p><strong>Note:</strong> ${esc(note)}</p>` : ""}${button(statusUrl, "View Payment Status")}`,
    };
  }

  if (status === "final_payment_received") {
    return {
      subject: `Final payment received: ${ref}`,
      preheader: `Your final balance payment has been received.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Final Payment Received</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Final Balance Payment Received</h1><p>Hello ${esc(first)},</p><p>Thank you. Your final balance payment for <strong>${esc(ref)}</strong> has been received and recorded. Your request is fully paid. Your service summary and receipts are available on your status page. Aligned Print & Scan will close the request once the service record is reviewed.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Amount Recorded:</strong> ${money(total)}<br><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}</div>${button(statusUrl, "View Updated Status")}`,
    };
  }

  if (status === "appointment_confirmed") {
    return {
      subject: `Appointment confirmed: ${ref}`,
      preheader: `Your appointment details are confirmed.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Appointment Confirmed</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Appointment Is Confirmed</h1><p>Hello ${esc(first)},</p><p>Your ${esc(service)} appointment has been confirmed. Please review the appointment details below and keep this email for reference.</p><p>If additional services are completed on site, a final balance invoice may be issued before the order is marked complete.</p>${appointmentBlock(request)}${note ? `<p><strong>Admin note:</strong> ${esc(note)}</p>` : ""}${button(statusUrl, "View Appointment Details")}`,
    };
  }

  if (status === "completed") {
    return {
      subject: `Service completed: ${ref}`,
      preheader: `Your Aligned Document Services request is complete.`,
      html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Service Completed</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Service Is Complete</h1><p>Hello ${esc(first)},</p><p>Thank you for choosing Aligned Document Services. Your request <strong>${esc(ref)}</strong> has been marked complete. Your secure status page remains available for confirmation details, support options, and review links.</p>${note ? `<p><strong>Completion note:</strong> ${esc(note)}</p>` : ""}${button(statusUrl, "View Completed Request")}`,
    };
  }

  return {
    subject: `Status update: ${ref}`,
    preheader: `Your request status has been updated.`,
    html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Status Update</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Your Request Has Been Updated</h1><p>Hello ${esc(first)},</p><p>Your ${esc(service)} request has been updated to <strong>${esc(status.replaceAll("_", " "))}</strong>.</p>${note ? `<p><strong>Note:</strong> ${esc(note)}</p>` : ""}${button(statusUrl, "View Updated Status")}`,
  };
}

function buildAdminContent(status: string, request: any, customer: any, note: string) {
  const ref = refFromId(request.id);
  const statusUrl = `${SITE_URL}/success.html?request_id=${request.id}&ref=${encodeURIComponent(ref)}`;
  const adminUrl = `${SITE_URL}/admin-dashboard.html`;
  const clientName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Client";

  return {
    subject: `Admin update — ${status.replaceAll("_", " ")}: ${ref}`,
    preheader: `Admin movement recorded for ${ref}.`,
    html: `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Admin Notification</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Order Movement Recorded</h1><p>An order status changed and may need admin attention.</p><div style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;padding:18px;margin:18px 0"><strong style="color:#161c4d">Reference:</strong> ${esc(ref)}<br><strong style="color:#161c4d">Client:</strong> ${esc(clientName)}<br><strong style="color:#161c4d">Email:</strong> ${esc(customer?.email || "Not provided")}<br><strong style="color:#161c4d">Phone:</strong> ${esc(customer?.phone || "Not provided")}<br><strong style="color:#161c4d">Preferred Contact:</strong> ${esc(customer?.preferred_contact || "Not provided")}<br><strong style="color:#161c4d">Service:</strong> ${esc(serviceLabel(request.service_type))}<br><strong style="color:#161c4d">Status:</strong> ${esc(status.replaceAll("_", " "))}</div>${note ? `<p><strong>Note:</strong> ${esc(note)}</p>` : ""}${button(adminUrl, "Open Admin Dashboard")}${button(statusUrl, "Open Customer Status Page")}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const requestId = String(body.request_id || "").trim();
    const status = String(body.status || "status_update").trim();
    const note = String(body.note || "").trim();
    const invoiceId = String(body.invoice_id || body.invoiceId || "").trim();

    if (!requestId) throw new Error("Missing request_id.");

    const requestRes = await supabaseFetch(`service_requests?select=*&id=eq.${requestId}&limit=1`);
    if (!requestRes.ok) throw new Error(await requestRes.text());
    const requestRows = await requestRes.json();
    const request = requestRows?.[0];
    if (!request) throw new Error("Request not found.");

    let customer: any = null;
    if (request.customer_id) {
      const customerRes = await supabaseFetch(`customers?select=*&id=eq.${request.customer_id}&limit=1`);
      const customerRows = await readJsonOrEmpty(customerRes);
      customer = customerRows?.[0] || null;
    }
    if (!customer?.email) throw new Error("Customer email missing.");

    let invoice: any = null;
    if (invoiceId) {
      const invoiceRes = await supabaseFetch(`invoices?select=*&id=eq.${invoiceId}&limit=1`);
      const invoiceRows = await readJsonOrEmpty(invoiceRes);
      invoice = invoiceRows?.[0] || null;
    }

    const itemsQuery = invoiceId
      ? `invoice_items?select=*&invoice_id=eq.${invoiceId}&order=created_at.asc`
      : `invoice_items?select=*&service_request_id=eq.${requestId}&invoice_id=is.null&order=created_at.asc`;
    const itemsRes = await supabaseFetch(itemsQuery);
    const items = (await readJsonOrEmpty(itemsRes)) || [];

    const customerContent = buildCustomerContent(status, request, customer, items, note, invoice);

    // Admin emails are reserved for customer/admin-action events.
    // Do not email admin for statuses the admin manually sets, such as quote_ready.
    const adminEmailStatuses = ["payment_submitted", "quote_approved", "changes_requested", "support_requested"];
    const shouldSendAdmin = adminEmailStatuses.includes(status);

    const customerSend = await sendEmail(customer.email, customerContent.subject, emailShell(customerContent.html, customerContent.preheader));
    let adminSend: any = null;
    let adminSubject = "Not sent";
    if (shouldSendAdmin) {
      const adminContent = buildAdminContent(status, request, customer, note);
      adminSubject = adminContent.subject;
      adminSend = await sendEmail(ADMIN_EMAIL, adminContent.subject, emailShell(adminContent.html, adminContent.preheader));
    }

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status,
        message: shouldSendAdmin
          ? `Emails sent. Customer: ${customerContent.subject}. Admin: ${adminSubject}.`
          : `Customer email sent. Admin email skipped for ${status}.`,
        sent_email: true,
        sent_sms: false,
      }),
    });

    return json({ ok: true, customer_email_id: customerSend?.id, admin_email_id: adminSend?.id || null, admin_email_sent: shouldSendAdmin, status });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
