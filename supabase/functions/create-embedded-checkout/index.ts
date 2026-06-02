// Aligned Print & Scan — Stripe Embedded Checkout
// Creates an embedded Stripe Checkout Session for either the main request quote
// or an additional invoice tied to the same service request.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_PUBLISHABLE_KEY = Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function refFromId(id: string) { return id ? "APS-" + id.slice(0, 8).toUpperCase() : "APS-REQUEST"; }
async function readBody(req: Request) {
  try { return await req.json(); } catch (_) { return {}; }
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
async function stripePost(path: string, params: URLSearchParams) {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) throw new Error("Stripe keys are not configured.");

    const body = await readBody(req);
    const requestId = String(body.request_id || body.id || "").trim();
    const invoiceId = String(body.invoice_id || "").trim() || null;
    if (!requestId) throw new Error("Missing request_id.");

    const requestRes = await supabaseFetch(`service_requests?select=id,service_type,quote_amount,estimated_total,invoice_number,customers(email,first_name,last_name)&id=eq.${requestId}&limit=1`);
    const requestRows = await readJsonOrEmpty(requestRes);
    const request = requestRows?.[0];
    if (!request) return json({ ok: false, error: "Request not found." }, 404);

    const invoiceFilter = invoiceId ? `invoice_id=eq.${invoiceId}` : `service_request_id=eq.${requestId}&invoice_id=is.null`;
    const itemsRes = await supabaseFetch(`invoice_items?select=description,quantity,unit_price,line_total&${invoiceFilter}&order=created_at.asc`);
    const items = (await readJsonOrEmpty(itemsRes)) || [];

    let invoice: any = null;
    if (invoiceId) {
      const invoiceRes = await supabaseFetch(`invoices?select=*&id=eq.${invoiceId}&limit=1`);
      const invoiceRows = await readJsonOrEmpty(invoiceRes);
      invoice = invoiceRows?.[0] || null;
      if (!invoice) throw new Error("Invoice not found.");
      if (["paid", "void"].includes(invoice.status)) throw new Error("This invoice is not payable.");
    }

    const total = invoiceId ? Number(invoice?.amount_due || 0) : Number(request.quote_amount || request.estimated_total || 0);
    if (!total || total <= 0) throw new Error("Invoice amount is not ready yet.");

    const ref = refFromId(requestId);
    const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
    const params = new URLSearchParams();

    params.set("mode", "payment");
    params.set("ui_mode", "embedded");
    params.set("return_url", `${SITE_URL}/success.html?request_id=${requestId}&ref=${encodeURIComponent(ref)}&session_id={CHECKOUT_SESSION_ID}`);
    params.set("metadata[request_id]", requestId);
    params.set("metadata[reference_number]", ref);
    if (invoiceId) params.set("metadata[invoice_id]", invoiceId);
    if (customer?.email) params.set("customer_email", customer.email);

    if (items.length) {
      items.forEach((item: any, idx: number) => {
        const unitAmount = Math.round(Number(item.unit_price || item.line_total || 0) * 100);
        const qty = Math.max(1, Math.round(Number(item.quantity || 1)));
        params.set(`line_items[${idx}][price_data][currency]`, "usd");
        params.set(`line_items[${idx}][price_data][product_data][name]`, String(item.description || "Aligned Print & Scan Service"));
        params.set(`line_items[${idx}][price_data][unit_amount]`, String(unitAmount));
        params.set(`line_items[${idx}][quantity]`, String(qty));
      });
    } else {
      params.set("line_items[0][price_data][currency]", "usd");
      params.set("line_items[0][price_data][product_data][name]", invoiceId ? `Aligned Print & Scan Additional Invoice ${ref}` : `Aligned Print & Scan Invoice ${ref}`);
      params.set("line_items[0][price_data][unit_amount]", String(Math.round(total * 100)));
      params.set("line_items[0][quantity]", "1");
    }

    const stripeRes = await stripePost("checkout/sessions", params);
    const session = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) throw new Error(session?.error?.message || "Stripe session could not be created.");

    if (invoiceId) {
      await supabaseFetch(`invoices?id=eq.${invoiceId}`, { method: "PATCH", body: JSON.stringify({ status: "awaiting_payment", stripe_checkout_session_id: session.id }) });
    } else {
      await supabaseFetch(`service_requests?id=eq.${requestId}`, { method: "PATCH", body: JSON.stringify({ status: "awaiting_payment", payment_status: "awaiting_payment", stripe_checkout_session_id: session.id }) });
    }

    return json({ ok: true, client_secret: session.client_secret, publishable_key: STRIPE_PUBLISHABLE_KEY, invoice_id: invoiceId });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
