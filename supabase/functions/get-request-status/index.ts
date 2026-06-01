// Aligned Print & Scan — Public status reader
// Purpose: Success page calls this function to safely retrieve the current order status.
// Notes: Uses the service role key server-side so the public success page does not need direct table access.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function refFromId(id: string) {
  return id ? `APS-${id.slice(0, 8).toUpperCase()}` : "APS-REQUEST";
}

function cleanUuid(value: unknown) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : "";
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
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    let requestId = cleanUuid(body.request_id || body.id);
    const referenceNumber = String(body.reference_number || body.ref || "").trim();

    // Allow fallback lookup by APS reference number when the URL has ref but not request_id.
    if (!requestId && referenceNumber.toUpperCase().startsWith("APS-")) {
      const prefix = referenceNumber.replace(/^APS-/i, "").slice(0, 8).toLowerCase();
      const lookup = await supabaseFetch(`service_requests?select=id&id=ilike.${encodeURIComponent(prefix)}*&limit=1`);
      const rows = await readJsonOrEmpty(lookup);
      requestId = rows?.[0]?.id || "";
    }

    if (!requestId) {
      return json({ ok: false, error: "Missing or invalid request_id." }, 400);
    }

    // Use broad selects to prevent 400 errors when optional columns are still being migrated.
    const requestRes = await supabaseFetch(`service_requests?select=*&id=eq.${requestId}&limit=1`);
    if (!requestRes.ok) throw new Error(await requestRes.text());

    const requestRows = await requestRes.json();
    const request = requestRows?.[0];
    if (!request) return json({ ok: false, error: "Request not found." }, 404);

    let customer = null;
    if (request.customer_id) {
      const customerRes = await supabaseFetch(`customers?select=*&id=eq.${request.customer_id}&limit=1`);
      const customerRows = await readJsonOrEmpty(customerRes);
      customer = customerRows?.[0] || null;
    }
    request.customers = customer ? [customer] : [];

    const itemsRes = await supabaseFetch(`invoice_items?select=*&service_request_id=eq.${requestId}&order=created_at.asc`);
    const items = (await readJsonOrEmpty(itemsRes)) || [];

    const detailTable = request.service_type === "ron"
      ? "ron_requests"
      : request.service_type === "mobile"
      ? "mobile_notary_requests"
      : request.service_type === "print"
      ? "print_scan_requests"
      : null;

    let serviceDetail = null;
    if (detailTable) {
      const detailRes = await supabaseFetch(`${detailTable}?select=*&service_request_id=eq.${requestId}&limit=1`);
      const detailRows = await readJsonOrEmpty(detailRes);
      serviceDetail = detailRows?.[0] || null;
    }

    const filesRes = await supabaseFetch(`request_files?select=id&service_request_id=eq.${requestId}`);
    const files = (await readJsonOrEmpty(filesRes)) || [];

    return json({
      ok: true,
      request,
      items,
      service_detail: serviceDetail,
      file_count: Array.isArray(files) ? files.length : 0,
      reference_number: refFromId(requestId),
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
