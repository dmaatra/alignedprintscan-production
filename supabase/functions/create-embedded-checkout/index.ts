/**
 * Aligned Print & Scan — Stripe Embedded Checkout.
 *
 * Creates an embedded Checkout Session for a real invoice record. Payment is
 * never exposed before quote approval creates Invoice #1.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_PUBLISHABLE_KEY =
  Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function refFromId(id: string) {
  return id ? `APS-${id.slice(0, 8).toUpperCase()}` : "APS-REQUEST";
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

async function readJson(response: Response) {
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function stripePost(path: string, params: URLSearchParams) {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
}

function isFinalInvoice(invoice: Record<string, unknown>) {
  return (
    String(invoice.invoice_type || "").includes("final") ||
    String(invoice.invoice_number || "").endsWith("-02")
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
      throw new Error("Stripe keys are not configured.");
    }

    const body = await request.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    let invoiceId = String(body.invoice_id || body.invoiceId || "").trim();

    if (!requestId) {
      throw new Error("Missing request_id.");
    }

    const requestResponse = await supabaseFetch(
      `service_requests?select=id,status,customers(email,first_name,last_name)&id=eq.${requestId}&limit=1`,
    );
    const requestRows = await readJson(requestResponse);
    const serviceRequest = requestRows?.[0];

    if (!serviceRequest) {
      return json({ ok: false, error: "Request not found." }, 404);
    }

    if (!invoiceId) {
      const initialInvoiceResponse = await supabaseFetch(
        `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
      );
      const initialInvoiceRows = await readJson(initialInvoiceResponse);
      const initialInvoice = (initialInvoiceRows || []).find((row: any) => {
        return (
          String(row.invoice_type || "").includes("initial") ||
          String(row.invoice_number || "").endsWith("-01")
        );
      });
      invoiceId = initialInvoice?.id || "";
    }

    if (!invoiceId) {
      throw new Error(
        "The quote must be approved before secure payment is available.",
      );
    }

    const invoiceResponse = await supabaseFetch(
      `invoices?select=*&id=eq.${invoiceId}&service_request_id=eq.${requestId}&limit=1`,
    );
    const invoiceRows = await readJson(invoiceResponse);
    const invoice = invoiceRows?.[0];

    if (!invoice) {
      throw new Error("Invoice not found.");
    }

    if (
      ["paid", "payment_received", "final_payment_received", "void"].includes(
        String(invoice.status || "").toLowerCase(),
      )
    ) {
      throw new Error("This invoice is not payable.");
    }

    const amountDue = Number(invoice.amount_due || 0);
    const amountPaid = Number(invoice.amount_paid || invoice.paid_amount || 0);
    const balanceDue = Math.max(0, amountDue - amountPaid);

    if (balanceDue <= 0) {
      throw new Error("This invoice has no remaining balance.");
    }

    const itemsResponse = await supabaseFetch(
      `invoice_items?select=description,quantity,unit_price,line_total&invoice_id=eq.${invoiceId}&order=created_at.asc`,
    );
    const items = (await readJson(itemsResponse)) || [];
    const reference = refFromId(requestId);
    const customer = Array.isArray(serviceRequest.customers)
      ? serviceRequest.customers[0]
      : serviceRequest.customers;
    const params = new URLSearchParams();

    params.set("mode", "payment");
    params.set("ui_mode", "embedded_page");
    params.set(
      "return_url",
      `${SITE_URL}/success.html?request_id=${requestId}&ref=${encodeURIComponent(reference)}&session_id={CHECKOUT_SESSION_ID}`,
    );
    params.set("metadata[request_id]", requestId);
    params.set("metadata[reference_number]", reference);
    params.set("metadata[invoice_id]", invoiceId);
    params.set(
      "metadata[payment_stage]",
      isFinalInvoice(invoice) ? "final" : "initial",
    );

    if (customer?.email) {
      params.set("customer_email", customer.email);
    }

    // Use line items only when their sum matches the unpaid balance. Otherwise,
    // use one balance line so partial payments remain accurate.
    const itemTotal = items.reduce((sum: number, item: any) => {
      return sum + Number(item.line_total || 0);
    }, 0);
    const useItemizedCheckout =
      items.length > 0 && Math.abs(itemTotal - balanceDue) < 0.01;

    if (useItemizedCheckout) {
      items.forEach((item: any, index: number) => {
        const quantity = Math.max(1, Math.round(Number(item.quantity || 1)));
        const unitAmount = Math.round(Number(item.unit_price || 0) * 100);

        params.set(`line_items[${index}][price_data][currency]`, "usd");
        params.set(
          `line_items[${index}][price_data][product_data][name]`,
          String(item.description || "Aligned Print & Scan Service"),
        );
        params.set(
          `line_items[${index}][price_data][unit_amount]`,
          String(unitAmount),
        );
        params.set(`line_items[${index}][quantity]`, String(quantity));
      });
    } else {
      params.set("line_items[0][price_data][currency]", "usd");
      params.set(
        "line_items[0][price_data][product_data][name]",
        `${isFinalInvoice(invoice) ? "Final Balance" : "Initial Payment"} — ${invoice.invoice_number}`,
      );
      params.set(
        "line_items[0][price_data][unit_amount]",
        String(Math.round(balanceDue * 100)),
      );
      params.set("line_items[0][quantity]", "1");
    }

    const stripeResponse = await stripePost("checkout/sessions", params);
    const session = await stripeResponse.json().catch(() => ({}));

    if (!stripeResponse.ok) {
      throw new Error(
        session?.error?.message || "Stripe session could not be created.",
      );
    }

    await supabaseFetch(`invoices?id=eq.${invoiceId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "awaiting_payment",
        payment_status: "unpaid",
        balance_due: balanceDue,
        stripe_checkout_session_id: session.id,
      }),
    });

    return json({
      ok: true,
      client_secret: session.client_secret,
      publishable_key: STRIPE_PUBLISHABLE_KEY,
      invoice_id: invoiceId,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});
