// Aligned Print & Scan — Additional Invoice Creator
// Creates Invoice #2 or later for final balances/add-ons without editing paid invoices.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function refFromId(id: string) { return id ? `APS-${id.slice(0, 8).toUpperCase()}` : "APS-REQUEST"; }
async function readBody(req: Request) { try { return await req.json(); } catch (_) { return {}; } }
async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
}
async function readJsonOrEmpty(response: Response) { if (!response.ok) return null; try { return await response.json(); } catch (_) { return null; } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await readBody(req);
    const requestId = String(body.request_id || "").trim();
    const note = String(body.note || "Additional invoice / final balance.").trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!requestId) throw new Error("Missing request_id.");
    if (!items.length) throw new Error("At least one invoice item is required.");

    const invoiceRowsRes = await supabaseFetch(`invoices?select=invoice_number&service_request_id=eq.${requestId}`);
    const existing = (await readJsonOrEmpty(invoiceRowsRes)) || [];
    const invoiceNumber = `${refFromId(requestId)}-${String(existing.length + 1).padStart(2, "0")}`;
    const total = items.reduce((sum: number, item: any) => sum + Number(item.line_total || (Number(item.quantity || 1) * Number(item.unit_price || 0)) || 0), 0);
    if (total <= 0) throw new Error("Invoice total must be greater than zero.");

    const invoiceRes = await supabaseFetch("invoices", {
      method: "POST",
      body: JSON.stringify({ service_request_id: requestId, invoice_number: invoiceNumber, invoice_type: "additional", status: "draft", amount_due: total, note }),
    });
    if (!invoiceRes.ok) throw new Error(await invoiceRes.text());
    const invoice = (await invoiceRes.json())?.[0];

    const itemRows = items.map((item: any) => ({
      service_request_id: requestId,
      invoice_id: invoice.id,
      item_type: item.item_type || "service",
      description: item.description || "Additional service",
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || (Number(item.quantity || 1) * Number(item.unit_price || 0)) || 0),
      taxable: false,
    }));
    const itemsRes = await supabaseFetch("invoice_items", { method: "POST", body: JSON.stringify(itemRows) });
    if (!itemsRes.ok) throw new Error(await itemsRes.text());

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({ service_request_id: requestId, status: "additional_invoice_created", message: `Additional invoice ${invoiceNumber} created for $${total.toFixed(2)}.`, sent_email: false, sent_sms: false }),
    });

    return json({ ok: true, invoice, total });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
