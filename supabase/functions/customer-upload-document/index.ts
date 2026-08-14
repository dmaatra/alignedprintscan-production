/** Secure request-scoped customer upload after matching the request email. */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const U = Deno.env.get("SUPABASE_URL") || "";
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAX = 10 * 1024 * 1024;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
async function db(path: string, init: RequestInit = {}) {
  return fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}
async function rows(response: Response) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
function safeName(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(
    0,
    120,
  ) || "document";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const stored: string[] = [];
  try {
    const body = await req.json();
    const id = String(body.request_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    const files = Array.isArray(body.files) ? body.files : [];
    if (!id || !email || !files.length) {
      throw new Error("Request, email, and at least one file are required.");
    }
    if (files.length > 12) throw new Error("Select no more than 12 documents.");
    const requestRows = await rows(
      await db(
        `service_requests?select=id,customers(email)&id=eq.${
          encodeURIComponent(id)
        }&limit=1`,
      ),
    );
    const request = requestRows?.[0];
    const customer = Array.isArray(request?.customers)
      ? request.customers[0]
      : request?.customers;
    if (String(customer?.email || "").toLowerCase() !== email) {
      return json({
        ok: false,
        error: "The email address does not match this request.",
      }, 403);
    }
    const created = [];
    for (const file of files) {
      const name = safeName(String(file.name || "document"));
      const mime = String(file.type || "application/octet-stream");
      const raw = Uint8Array.from(
        atob(String(file.base64 || "")),
        (char) => char.charCodeAt(0),
      );
      if (!raw.length || raw.length > MAX) {
        throw new Error(`${name} is empty or larger than 10 MB.`);
      }
      const path = `${id}/customer/${crypto.randomUUID()}-${name}`;
      const upload = await fetch(
        `${U}/storage/v1/object/service-request-files/${path}`,
        {
          method: "POST",
          headers: {
            apikey: K,
            Authorization: `Bearer ${K}`,
            "Content-Type": mime,
            "x-upsert": "false",
          },
          body: raw,
        },
      );
      if (!upload.ok) throw new Error(await upload.text());
      stored.push(path);
      const inserted = await rows(
        await db("request_files", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: id,
            file_name: name,
            file_path: path,
            file_type: mime,
            file_size: raw.length,
            uploaded_by: "customer",
            document_category: String(body.category || "additional"),
            document_classification: "customer_document",
            customer_visible: true,
            eligible_for_delivery: false,
            review_state: "pending",
            is_active: true,
          }),
        }),
      );
      created.push(inserted?.[0]);
    }
    await db("request_timeline_events", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: id,
        event_type: "documents_uploaded",
        title: "Additional documents uploaded",
        detail: `Customer uploaded ${created.length} additional document(s).`,
        actor_type: "customer",
        visibility: "customer",
        metadata: { file_count: created.length },
      }),
    });
    return json({ ok: true, files: created });
  } catch (error) {
    if (stored.length) {
      await fetch(`${U}/storage/v1/object/service-request-files`, {
        method: "DELETE",
        headers: {
          apikey: K,
          Authorization: `Bearer ${K}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: stored }),
      }).catch(() => undefined);
    }
    console.error("customer_document_upload_failed", error);
    return json({
      ok: false,
      error:
        "Documents could not be uploaded. Please try again or contact Aligned Print & Scan.",
    }, 400);
  }
});
