const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function refFromId(id: string) {
  return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST";
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { request_id, reference_number } = await req.json();
    let id = request_id;
    if (!id && reference_number) {
      const prefix = String(reference_number).replace(/^APS-/i, "").toLowerCase();
      const lookup = await supabaseFetch(`service_requests?select=id&id=ilike.${encodeURIComponent(prefix)}*`);
      const rows = await lookup.json();
      id = rows?.[0]?.id;
    }
    if (!id) return json({ ok: false, error: "Request reference not found." }, 404);

    const reqRes = await supabaseFetch(`service_requests?select=id,created_at,service_type,status,preferred_date,preferred_time_window,estimated_total,quote_amount,quote_notes,invoice_number,invoice_status,invoice_url,invoice_pdf_url,receipt_url,receipt_pdf_url,payment_status,paid_at,appointment_confirmed_at,customer_message,review_link_google,review_link_yelp,prep_video_url,customers(first_name,last_name,email)&id=eq.${id}`);
    if (!reqRes.ok) throw new Error(await reqRes.text());
    const requestRows = await reqRes.json();
    const request = requestRows?.[0];
    if (!request) return json({ ok: false, error: "Request not found." }, 404);

    const itemsRes = await supabaseFetch(`invoice_items?select=description,quantity,unit_price,line_total,item_type&service_request_id=eq.${id}&order=created_at.asc`);
    const items = itemsRes.ok ? await itemsRes.json() : [];
    const detailTable = request.service_type === "ron" ? "ron_requests" : request.service_type === "mobile" ? "mobile_notary_requests" : request.service_type === "print" ? "print_scan_requests" : null;
    let service_detail = null;
    if (detailTable) {
      const detailRes = await supabaseFetch(`${detailTable}?select=*&service_request_id=eq.${id}`);
      if (detailRes.ok) {
        const detailRows = await detailRes.json();
        service_detail = detailRows?.[0] || null;
      }
    }
    const filesRes = await supabaseFetch(`request_files?select=id&service_request_id=eq.${id}`);
    const fileRows = filesRes.ok ? await filesRes.json() : [];
    return json({ ok: true, request, items, service_detail, file_count: Array.isArray(fileRows) ? fileRows.length : 0, reference_number: refFromId(id) });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
