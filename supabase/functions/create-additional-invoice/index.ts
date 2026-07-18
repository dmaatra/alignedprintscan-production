// Aligned Print & Scan — Final Balance Invoice Creator
// Creates Invoice #2 or later for final balance/on-site add-ons without editing paid invoices.

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

function shortCode(id: string) {
  return id ? id.slice(0, 8).toUpperCase() : "REQUEST";
}

function refFromId(id: string) {
  return `APS-${shortCode(id)}`;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await readBody(req);
    const requestId = String(body.request_id || "").trim();
    const note = String(body.note || "Final balance invoice for additional on-site or fulfillment services.").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!requestId) throw new Error("Missing request_id.");
    if (!items.length) throw new Error("At least one final balance line item is required.");

    const requestRes = await supabaseFetch(`service_requests?select=id,customer_id,status&id=eq.${requestId}&limit=1`);
    const requestRows = await readJsonOrEmpty(requestRes);
    if (!requestRows?.[0]) throw new Error("Request not found.");

    const invoiceRowsRes = await supabaseFetch(`invoices?select=id,invoice_number,status&service_request_id=eq.${requestId}&order=created_at.asc`);
    const existing = (await readJsonOrEmpty(invoiceRowsRes)) || [];
    const openFinal = existing.find((row: any) => {
      const status = String(row.status || "").toLowerCase();
      const number = String(row.invoice_number || "");
      return number.endsWith("-02") && !["paid", "payment_received", "final_payment_received", "void", "cancelled"].includes(status);
    });
    const suffixes = existing
      .map((row: any) => String(row.invoice_number || "").match(/-(\d+)$/)?.[1])
      .filter(Boolean)
      .map((n: string) => Number(n));
    const nextNumber = openFinal ? Number(String(openFinal.invoice_number || "").match(/-(\d+)$/)?.[1] || 2) : Math.max(2, suffixes.length ? Math.max(...suffixes) + 1 : 2);
    const invoiceNumber = openFinal?.invoice_number || `INV-${shortCode(requestId)}-${String(nextNumber).padStart(2, "0")}`;

    const total = items.reduce((sum: number, item: any) => {
      const quantity = Number(item.quantity || 1);
      const unit = Number(item.unit_price || 0);
      return sum + Number(item.line_total || quantity * unit || 0);
    }, 0);
    if (total <= 0) throw new Error("Final balance invoice total must be greater than zero.");

    let invoice: any = null;
    if (openFinal?.id) {
      const invoiceRes = await supabaseFetch(`invoices?id=eq.${openFinal.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "final_balance_due",
          payment_status: "unpaid",
          amount_due: total,
          balance_due: total,
          note,
        }),
      });
      if (!invoiceRes.ok) throw new Error(await invoiceRes.text());
      invoice = (await invoiceRes.json())?.[0];
      await supabaseFetch(`invoice_items?invoice_id=eq.${openFinal.id}`, { method: "DELETE" });
    } else {
      const invoiceRes = await supabaseFetch("invoices", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          invoice_number: invoiceNumber,
          invoice_type: "final_balance",
          status: "final_balance_due",
          payment_status: "unpaid",
          amount_due: total,
          balance_due: total,
          amount_paid: 0,
          paid_amount: 0,
          note,
        }),
      });
      if (!invoiceRes.ok) throw new Error(await invoiceRes.text());
      invoice = (await invoiceRes.json())?.[0];
    }

    const itemRows = items.map((item: any, index: number) => {
      const quantity = Number(item.quantity || 1);
      const unit = Number(item.unit_price || 0);
      const lineTotal = Number(item.line_total || quantity * unit || 0);
      return {
        service_request_id: requestId,
        invoice_id: invoice.id,
        item_type: item.item_type || "final_balance",
        description: item.description || "Final balance service",
        quantity,
        unit_price: unit,
        line_total: lineTotal,
        taxable: false,
        sort_order: index,
      };
    });

    const itemsRes = await supabaseFetch("invoice_items", { method: "POST", body: JSON.stringify(itemRows) });
    if (!itemsRes.ok) throw new Error(await itemsRes.text());

    await supabaseFetch(`service_requests?id=eq.${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "final_balance_due",
        workflow_status: "final_balance_due",
        payment_state: "final_invoice_due",
        balance_due: total,
        balance_due_at_appointment: total,
      }),
    });

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status: "final_balance_due",
        message: `Final balance invoice ${invoiceNumber} issued for $${total.toFixed(2)}.`,
        sent_email: false,
        sent_sms: false,
      }),
    });

    // Send the customer a branded Final Balance Due email.
    await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, status: "final_balance_due", invoice_id: invoice.id, note }),
    });

    return json({ ok: true, invoice, total, reference_number: refFromId(requestId) });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
