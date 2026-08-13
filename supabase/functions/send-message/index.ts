import { customerPortalUrl, renderCustomerEmailShell } from "../_shared/customer-email.mjs";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Aligned Print & Scan <hello@alignedprintscan.com>";
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function cleanUuid(value: unknown) { const text = String(value || "").trim(); return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : ""; }
async function rest(path: string, init: RequestInit = {}) { return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } }); }
async function rows(path: string) { const response = await rest(path); if (!response.ok) throw new Error(await response.text()); return await response.json(); }
async function requireAdmin(request: Request) {
  const token = request.headers.get("Authorization") || "";
  if (!token.startsWith("Bearer ")) throw new Error("Administrator authentication is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: token } });
  if (!response.ok) throw new Error("Administrator authentication is required.");
  const user = await response.json();
  const adminResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: SERVICE_ROLE_KEY, Authorization: token, "Content-Type": "application/json" }, body: "{}" });
  if (!adminResponse.ok || await adminResponse.json() !== true) throw new Error("Administrator access is required.");
  return user.id;
}
function render(template: string, values: Record<string, unknown>) { return String(template || "").replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => String(values[key] ?? "")); }
function isDeliverable(file: any) { return file?.is_active !== false && file?.customer_visible === true && file?.eligible_for_delivery === true && file?.document_classification !== "internal_document"; }
function base64(bytes: Uint8Array) { let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(binary); }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let messageId = "";
  let providerAccepted = false;
  try {
    const adminId = await requireAdmin(request);
    const body = await request.json();
    const requestId = cleanUuid(body.request_id), templateId = cleanUuid(body.template_id), targetStatus = String(body.status || "").trim();
    if (!requestId || !templateId) throw new Error("A request and message template are required.");
    const [requestRows, templateRows, quotes, invoices, files] = await Promise.all([
      rows(`service_requests?select=*&id=eq.${requestId}&limit=1`), rows(`message_templates?select=*&id=eq.${templateId}&active=eq.true&limit=1`),
      rows(`quotes?select=*&service_request_id=eq.${requestId}&order=version.desc&limit=1`), rows(`invoices?select=*&service_request_id=eq.${requestId}&order=created_at.desc`),
      rows(`request_files?select=*&service_request_id=eq.${requestId}&is_active=eq.true&order=created_at.desc`),
    ]);
    const serviceRequest = requestRows[0], template = templateRows[0];
    if (!serviceRequest || !template) throw new Error("Request or active template not found.");
    const customers = serviceRequest.customer_id ? await rows(`customers?select=*&id=eq.${serviceRequest.customer_id}&limit=1`) : [];
    const customer = customers[0] || {}, quote = quotes[0];
    const invoice = invoices.find((item: any) => !["void", "cancelled"].includes(String(item.status || "").toLowerCase()));
    const selectedIds = (Array.isArray(body.request_file_ids) ? body.request_file_ids : []).map(cleanUuid).filter(Boolean);
    const selectedFiles = files.filter((file: any) => selectedIds.includes(file.id));
    if (selectedFiles.some((file: any) => !isDeliverable(file))) throw new Error("Only intentionally released customer deliverables may be attached.");
    if (template.required_attachment_type === "quote" && !quote) throw new Error("This template requires the current quote.");
    if (template.required_attachment_type === "invoice" && !invoice) throw new Error("This template requires a current invoice.");
    if (template.required_attachment_type === "deliverable" && !selectedFiles.length) throw new Error("This template requires at least one released customer deliverable.");
    const reference = `APS-${requestId.slice(0, 8).toUpperCase()}`;
    if (targetStatus === "completed") {
      const validation = await fetch(`${SUPABASE_URL}/functions/v1/update-request-status`, { method: "POST", headers: { Authorization: request.headers.get("Authorization") || "", "Content-Type": "application/json" }, body: JSON.stringify({ request_id: requestId, status: "completed", validate_only: true, send_message: false }) });
      const validationResult = await validation.json().catch(() => ({}));
      if (!validation.ok || validationResult?.validation?.allowed !== true) {
        const summary = (validationResult?.validation?.blockers || validationResult?.blockers || []).map((item: any) => item.message).join("; ");
        throw new Error(summary || validationResult?.error || "Completion requirements are not satisfied.");
      }
    }
    const values = { request_reference: reference, customer_first_name: customer.first_name || "", customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "", quote_amount: Number(quote?.amount || serviceRequest.quote_amount || 0).toFixed(2), balance_due: Number(serviceRequest.balance_due || invoice?.balance_due || 0).toFixed(2), invoice_number: invoice?.invoice_number || "", appointment_date: serviceRequest.appointment_date || serviceRequest.preferred_date || "", appointment_time: serviceRequest.appointment_time || serviceRequest.preferred_time_window || "", appointment_location: serviceRequest.appointment_location || "", appointment_link: serviceRequest.appointment_link || serviceRequest.ron_session_url || "", portal_url: customerPortalUrl("https://alignedprintscan.com", requestId, "overview") };
    const recipient = String(body.recipient || customer.email || "").trim();
    const cc = (Array.isArray(body.cc) ? body.cc : String(body.cc || "").split(",")).map((value: unknown) => String(value).trim()).filter(Boolean);
    const subject = String(body.subject || render(template.subject_template, values)).trim();
    const renderedBody = String(body.html || render(template.html_template, values));
    const html = renderCustomerEmailShell({ body: renderedBody, preheader: subject, eyebrow: template.name || "APS Update", title: template.name || "Your Request Update" });
    const text = String(body.text || render(template.text_template || template.html_template.replace(/<[^>]+>/g, " "), values));
    if (!recipient || !subject || !html) throw new Error("Recipient, subject, and message body are required.");
    const inserted = await rest("messages", { method: "POST", body: JSON.stringify({ service_request_id: requestId, template_id: templateId, recipient, cc, subject, rendered_html: html, rendered_text: text, delivery_state: "sending", associated_status: targetStatus || template.associated_status || null, created_by: adminId }) });
    if (!inserted.ok) throw new Error(await inserted.text());
    messageId = (await inserted.json())[0].id;
    const attachments: any[] = [];
    if (template.required_attachment_type === "quote") attachments.push({ message_id: messageId, attachment_type: "quote", quote_id: quote.id });
    if (template.required_attachment_type === "invoice") attachments.push({ message_id: messageId, attachment_type: "invoice", invoice_id: invoice.id });
    selectedFiles.forEach((file: any) => attachments.push({ message_id: messageId, attachment_type: "document", request_file_id: file.id }));
    if (attachments.length) { const response = await rest("message_attachments", { method: "POST", body: JSON.stringify(attachments) }); if (!response.ok) throw new Error(await response.text()); }
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    const providerAttachments: any[] = [];
    if (template.required_attachment_type === "quote") providerAttachments.push({ filename: `${quote.quote_number || reference + "-quote"}.html`, content: base64(new TextEncoder().encode(`<h1>Service Quote ${reference}</h1><p>Total: $${values.quote_amount}</p><p>${quote.notes || ""}</p>`)) });
    if (template.required_attachment_type === "invoice") providerAttachments.push({ filename: `${invoice.invoice_number || reference + "-invoice"}.html`, content: base64(new TextEncoder().encode(`<h1>Invoice ${invoice.invoice_number || reference}</h1><p>Amount due: $${Number(invoice.amount_due || 0).toFixed(2)}</p>`)) });
    for (const file of selectedFiles) {
      const download = await fetch(`${SUPABASE_URL}/storage/v1/object/service-request-files/${file.file_path}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
      if (!download.ok) throw new Error(`Could not attach ${file.file_name}.`);
      providerAttachments.push({ filename: file.file_name, content: base64(new Uint8Array(await download.arrayBuffer())) });
    }
    const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_EMAIL, to: [recipient], cc, subject, html, text, attachments: providerAttachments }) });
    const provider = await sent.json().catch(() => ({}));
    if (!sent.ok) throw new Error(provider.message || "Email provider rejected the message.");
    providerAccepted = true;
    await rest(`messages?id=eq.${messageId}`, { method: "PATCH", body: JSON.stringify({ delivery_state: "sent", provider_message_id: provider.id || null, sent_at: new Date().toISOString() }) });
    await rest("request_timeline_events", { method: "POST", body: JSON.stringify({ service_request_id: requestId, event_type: "message_sent", title: "Customer message sent", detail: subject, actor_type: "admin", visibility: "customer" }) }).catch(() => null);
    if (targetStatus) {
      if (targetStatus === "completed") {
        const completion = await fetch(`${SUPABASE_URL}/functions/v1/update-request-status`, { method: "POST", headers: { Authorization: request.headers.get("Authorization") || "", "Content-Type": "application/json" }, body: JSON.stringify({ request_id: requestId, status: "completed", send_message: false }) });
        const completionResult = await completion.json().catch(() => ({}));
        if (!completion.ok || completionResult?.ok === false) throw new Error(completionResult?.error || "Completion state could not be recorded.");
      } else {
        const response = await rest(`service_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ status: targetStatus, workflow_status: targetStatus }) }); if (!response.ok) throw new Error(await response.text());
      }
    }
    if (targetStatus) await rest("request_timeline_events", { method: "POST", body: JSON.stringify({ service_request_id: requestId, event_type: "status_changed", title: "Request status updated", detail: targetStatus, actor_type: "admin", visibility: "customer" }) }).catch(() => null);
    return json({ ok: true, message_id: messageId, provider_message_id: provider.id || null, status: targetStatus || serviceRequest.status });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (messageId && !providerAccepted) await rest(`messages?id=eq.${messageId}`, { method: "PATCH", body: JSON.stringify({ delivery_state: "failed", error_message: errorMessage }) }).catch(() => null);
    if (messageId && providerAccepted) await rest(`messages?id=eq.${messageId}`, { method: "PATCH", body: JSON.stringify({ error_message: `Message sent, but follow-up state failed: ${errorMessage}` }) }).catch(() => null);
    return json({ ok: false, error: providerAccepted ? `Message was sent, but the status update failed: ${errorMessage}` : errorMessage, message_sent: providerAccepted, status_updated: false }, providerAccepted ? 409 : 400);
  }
});
