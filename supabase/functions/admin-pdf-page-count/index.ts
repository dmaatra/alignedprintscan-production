import { requireProofAdmin } from "../_shared/proof/admin-auth.ts";
import { detectPdfPageCount, isPdf } from "../_shared/pdf-page-count.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const U = Deno.env.get("SUPABASE_URL") || "";
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const validId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value || ""));
async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = await requireProofAdmin(req);
    const body = await req.json();
    const requestId = String(body.request_id || "");
    const fileId = String(body.file_id || "");
    if (!validId(requestId) || !validId(fileId)) throw new Error("A valid request and file are required.");
    const file = (await rest(`request_files?select=*&id=eq.${fileId}&service_request_id=eq.${requestId}&is_active=eq.true&limit=1`))[0];
    if (!file) throw new Error("Active request document not found.");

    const manual = Number(body.manual_page_count);
    let result;
    if (Number.isInteger(manual) && manual > 0) {
      result = { count: manual, status: "manual", error: null, source: "admin_manual" };
    } else {
      if (!isPdf(file.file_name, file.file_type)) throw new Error("Page counting applies only to PDF documents.");
      const download = await fetch(`${U}/storage/v1/object/service-request-files/${file.file_path}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
      if (!download.ok) throw new Error("The private document could not be read for page counting.");
      const detected = await detectPdfPageCount(new Uint8Array(await download.arrayBuffer()), file.file_name, file.file_type);
      result = { ...detected, source: detected.status === "detected" ? "server" : null };
    }
    const updated = await rest(`request_files?id=eq.${fileId}`, { method: "PATCH", body: JSON.stringify({ detected_page_count: result.count, page_count_status: result.status, page_count_source: result.source, page_count_error: result.error, page_count_updated_at: new Date().toISOString() }) });
    if (result.status === "manual") await rest("request_timeline_events", { method: "POST", body: JSON.stringify({ service_request_id: requestId, event_type: "pdf_page_count_verified", title: "PDF page count verified", detail: `${file.file_name}: ${manual} page(s) verified by administrator.`, actor_type: "admin", visibility: "internal", metadata: { request_file_id: fileId, page_count: manual, admin_id: admin.id } }) });
    return json({ ok: true, file: updated[0], result });
  } catch (error) {
    console.error("admin_pdf_page_count_failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Page count update failed." }, 400);
  }
});
