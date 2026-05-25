import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "hello@alignedprintscan.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Aligned Print & Scan <hello@alignedprintscan.com>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function label(service: string) {
  return service === "ron" ? "Remote Online Notary" : service === "mobile" ? "Mobile Notary" : service === "print" ? "Print & Scan" : "Service Request";
}

function nextSteps(service: string) {
  if (service === "ron") return "After review, you will receive scheduling/payment instructions and the next steps for continuing through our approved Remote Online Notary platform.";
  if (service === "mobile") return "After review, you will receive the quote and required dispatch/preparation payment instructions before travel is confirmed.";
  if (service === "print") return "After review, you will receive pricing/payment instructions before printing, scanning, delivery, or fulfillment begins.";
  return "After review, you will receive next steps by email.";
}

async function sendEmail(payload: Record<string, unknown>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Resend error ${response.status}: ${text}`);
  return text;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { request_id, reference_number } = await req.json();
    if (!request_id) throw new Error("Missing request_id");

    const { data: request, error: requestError } = await admin
      .from("service_requests")
      .select("id, created_at, service_type, status, preferred_date, preferred_time_window, notes, estimated_total, customers(first_name,last_name,email,phone,preferred_contact)")
      .eq("id", request_id)
      .single();
    if (requestError) throw requestError;

    const { data: files, error: filesError } = await admin
      .from("request_files")
      .select("file_name,file_path,file_type,file_size")
      .eq("service_request_id", request_id);
    if (filesError) throw filesError;

    const fileLinks: string[] = [];
    for (const file of files || []) {
      const { data: signed, error: signedError } = await admin.storage
        .from("service-request-files")
        .createSignedUrl(file.file_path, 60 * 60 * 24 * 7);
      if (!signedError && signed?.signedUrl) {
        fileLinks.push(`<li><a href="${signed.signedUrl}">${file.file_name}</a></li>`);
      }
    }

    const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
    const ref = reference_number || `APS-${String(request.id).slice(0, 8).toUpperCase()}`;
    const serviceName = label(request.service_type);
    const clientName = `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() || "Client";

    const clientHtml = `
      <div style="font-family:Arial,sans-serif;color:#2d2d2d;line-height:1.6">
        <h2 style="color:#161c4d">We’ve received your request</h2>
        <p>Thank you, ${clientName}. Your request has been received and is now under review.</p>
        <p><strong>Reference Number:</strong> ${ref}</p>
        <p><strong>Service:</strong> ${serviceName}</p>
        <p><strong>Status:</strong> Under Review</p>
        <p>${nextSteps(request.service_type)}</p>
        <p>A confirmation and any next steps will come from <strong>hello@alignedprintscan.com</strong>. Please check your inbox, junk, or spam folder.</p>
        <p style="margin-top:24px;color:#161c4d"><strong>Aligned Print & Scan</strong><br>Secure Document & Notary Solutions</p>
      </div>`;

    const ownerHtml = `
      <div style="font-family:Arial,sans-serif;color:#2d2d2d;line-height:1.6">
        <h2 style="color:#161c4d">New Website Request: ${ref}</h2>
        <p><strong>Service:</strong> ${serviceName}</p>
        <p><strong>Status:</strong> ${request.status || "under_review"}</p>
        <p><strong>Estimated Total:</strong> ${request.estimated_total ? `$${Number(request.estimated_total).toFixed(2)}` : "Pending review"}</p>
        <h3>Client</h3>
        <p>${clientName}<br>${customer?.email || ""}<br>${customer?.phone || ""}</p>
        <h3>Scheduling</h3>
        <p>${request.preferred_date || "No date selected"} · ${request.preferred_time_window || "No time window selected"}</p>
        <h3>Notes</h3>
        <p>${request.notes || "None"}</p>
        <h3>Uploaded Files</h3>
        ${fileLinks.length ? `<ul>${fileLinks.join("")}</ul><p>Signed links expire in 7 days.</p>` : "<p>No files uploaded.</p>"}
      </div>`;

    await sendEmail({
      from: FROM_EMAIL,
      to: [customer?.email || OWNER_EMAIL],
      subject: `Request received — ${ref}`,
      html: clientHtml,
    });

    await sendEmail({
      from: FROM_EMAIL,
      to: [OWNER_EMAIL],
      subject: `New Website Request — ${ref}`,
      html: ownerHtml,
    });

    await admin.from("request_status_updates").insert({
      service_request_id: request_id,
      status: "confirmation_email_sent",
      message: `Confirmation email attempted for ${ref}.`,
      sent_email: true,
      sent_sms: false,
    });

    return new Response(JSON.stringify({ ok: true, reference_number: ref }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: String((error as Error)?.message || error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
