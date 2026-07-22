/**
 * Aligned Print & Scan — Customer cancellation/reschedule request.
 *
 * Business rule: a paid request is never cancelled automatically. The function
 * records a review request, verifies the customer's email, writes timeline and
 * communication records, and sends confirmation/administrator notifications.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Aligned Print & Scan <notifications@alignedprintscan.com>";
const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function cleanUuid(v: unknown) { const s = String(v || "").trim(); return /^[0-9a-f-]{36}$/i.test(s) ? s : ""; }
function esc(v: unknown) { return String(v || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] || c)); }
function ref(id: string) { return `APS-${id.slice(0,8).toUpperCase()}`; }
async function db(path: string, init: RequestInit = {}) { return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } }); }
async function rows(response: Response) { if (!response.ok) throw new Error(await response.text()); return response.json(); }
async function send(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return { id: null, skipped: true };
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Email could not be sent.");
  return data;
}
async function logCommunication(requestId: string, direction: string, subject: string, message: string, status: string, providerId: string | null = null) {
  await db("request_communications", { method: "POST", body: JSON.stringify({ service_request_id: requestId, direction, channel: "email", subject, message, delivery_status: status, provider_message_id: providerId }) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const requestId = cleanUuid(body.request_id);
    const email = String(body.email || "").trim().toLowerCase();
    const actionType = String(body.action_type || "").trim().toLowerCase();
    const reason = String(body.reason || "").trim();
    const proposed = body.proposed_appointment_at ? new Date(body.proposed_appointment_at).toISOString() : null;
    if (!requestId || !email) throw new Error("Request ID and customer email are required.");
    if (!["cancel", "reschedule"].includes(actionType)) throw new Error("Invalid customer action.");
    if (actionType === "reschedule" && !proposed) throw new Error("A proposed date and time are required.");

    const requestRows = await rows(await db(`service_requests?select=id,status,paid_amount,customer_id,customers(email,first_name,last_name)&id=eq.${requestId}&limit=1`));
    const request = requestRows?.[0];
    if (!request) return json({ ok: false, error: "Request not found." }, 404);
    const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
    if (String(customer?.email || "").trim().toLowerCase() !== email) return json({ ok: false, error: "The email address does not match this request." }, 403);

    const inserted = await rows(await db("customer_action_requests", { method: "POST", body: JSON.stringify({ service_request_id: requestId, action_type: actionType, customer_email: email, reason, proposed_appointment_at: proposed }) }));
    const action = inserted?.[0];
    const customerStatus = actionType === "cancel" ? "cancellation_requested" : "reschedule_requested";
    await db(`service_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ customer_action_status: customerStatus, customer_action_reason: reason || null, cancellation_requested_at: actionType === "cancel" ? new Date().toISOString() : undefined, reschedule_requested_at: actionType === "reschedule" ? new Date().toISOString() : undefined, proposed_appointment_at: proposed }) });
    await db("request_timeline_events", { method: "POST", body: JSON.stringify({ service_request_id: requestId, event_type: customerStatus, title: actionType === "cancel" ? "Cancellation requested" : "Reschedule requested", detail: reason || (proposed ? `Proposed appointment: ${proposed}` : "Customer submitted a request."), actor_type: "customer", metadata: { customer_action_request_id: action.id } }) });

    const reference = ref(requestId);
    const actionLabel = actionType === "cancel" ? "cancellation" : "rescheduling";
    const statusUrl = `${SITE_URL}/success.html?request_id=${requestId}&ref=${reference}`;
    const customerSubject = `${actionType === "cancel" ? "Cancellation" : "Reschedule"} request received: ${reference}`;
    const customerHtml = `<h1>We received your ${actionLabel} request</h1><p>Hello ${esc(customer?.first_name || "there")},</p><p>Your request for <strong>${esc(reference)}</strong> has been submitted for review. Paid services are not cancelled automatically.</p>${proposed ? `<p><strong>Proposed date/time:</strong> ${esc(new Date(proposed).toLocaleString("en-US", { timeZone: "America/Chicago" }))}</p>` : ""}<p><a href="${esc(statusUrl)}">View your request status</a></p>`;
    const customerSend = await send(email, customerSubject, customerHtml).catch(() => ({ id: null, failed: true }));
    await logCommunication(requestId, "outbound", customerSubject, `Customer ${actionLabel} confirmation.`, customerSend.failed ? "failed" : (customerSend.skipped ? "skipped" : "sent"), customerSend.id || null);

    const adminSubject = `${actionType === "cancel" ? "Cancellation" : "Reschedule"} review required: ${reference}`;
    const adminHtml = `<h1>Customer action requires review</h1><p><strong>Reference:</strong> ${esc(reference)}</p><p><strong>Customer:</strong> ${esc(customer?.first_name)} ${esc(customer?.last_name)} (${esc(email)})</p><p><strong>Action:</strong> ${esc(actionType)}</p><p><strong>Reason:</strong> ${esc(reason || "Not provided")}</p>${proposed ? `<p><strong>Proposed date/time:</strong> ${esc(proposed)}</p>` : ""}<p><strong>Payment recorded:</strong> $${Number(request.paid_amount || 0).toFixed(2)}</p>`;
    const adminSend = await send(ADMIN_EMAIL, adminSubject, adminHtml).catch(() => ({ id: null, failed: true }));
    await logCommunication(requestId, "outbound", adminSubject, "Administrator action alert.", adminSend.failed ? "failed" : (adminSend.skipped ? "skipped" : "sent"), adminSend.id || null);

    return json({ ok: true, action, status: customerStatus, reference_number: reference });
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400); }
});
