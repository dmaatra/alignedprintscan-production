/**
 * Aligned Print & Scan — Stripe webhook.
 *
 * Stripe and manual/test payments now update the same invoice and request
 * records. The invoice is the source of truth; the request aggregates totals.
 */

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

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

async function stripeGet(path: string) {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json().catch(() => null);
}

async function receiptUrlForSession(session: any) {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    return null;
  }

  const paymentIntent = await stripeGet(
    `payment_intents/${paymentIntentId}?expand[]=latest_charge`,
  );

  return paymentIntent?.latest_charge?.receipt_url || null;
}

function isFinalInvoice(invoice: Record<string, unknown>) {
  return (
    String(invoice.invoice_type || "").includes("final") ||
    String(invoice.invoice_number || "").endsWith("-02")
  );
}

async function recalculateRequest(requestId: string) {
  const invoicesResponse = await supabaseFetch(
    `invoices?select=*&service_request_id=eq.${requestId}`,
  );
  const invoices = (await readJson(invoicesResponse)) as Array<
    Record<string, unknown>
  >;

  const paymentsResponse = await supabaseFetch(
    `request_payments?select=amount&service_request_id=eq.${requestId}`,
  );
  const payments = (await readJson(paymentsResponse)) as Array<{
    amount?: number;
  }>;

  const totalInvoiced = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_due || 0),
    0,
  );
  const totalPaid = payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );
  const balanceDue = Math.max(0, totalInvoiced - totalPaid);

  return {
    totalPaid,
    balanceDue,
    paidInFull: totalInvoiced > 0 && balanceDue <= 0,
  };
}

Deno.serve(async (request) => {
  try {
    const event = await request.json();

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = event.data.object;
    const requestId = String(session.metadata?.request_id || "").trim();
    const invoiceId = String(session.metadata?.invoice_id || "").trim();

    if (!requestId || !invoiceId) {
      throw new Error("Stripe checkout metadata is missing request or invoice ID.");
    }

    const invoiceResponse = await supabaseFetch(
      `invoices?select=*&id=eq.${invoiceId}&service_request_id=eq.${requestId}&limit=1`,
    );
    const invoiceRows = await readJson(invoiceResponse);
    const invoice = invoiceRows?.[0];

    if (!invoice) {
      throw new Error("Stripe payment invoice was not found.");
    }

    const amount = Number(session.amount_total || 0) / 100;
    const receiptUrl = await receiptUrlForSession(session);
    const finalInvoice = isFinalInvoice(invoice);
    const invoiceStatus = finalInvoice
      ? "final_payment_received"
      : "payment_received";

    // Avoid duplicate payment records when Stripe retries the webhook.
    const existingPaymentResponse = await supabaseFetch(
      `request_payments?select=id&external_reference=eq.${encodeURIComponent(session.id)}&limit=1`,
    );
    const existingPaymentRows = await readJson(existingPaymentResponse);

    if (!existingPaymentRows?.length) {
      await supabaseFetch("request_payments", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          invoice_id: invoiceId,
          payment_stage: finalInvoice ? "final" : "initial",
          amount,
          payment_method: "stripe",
          external_reference: session.id,
          note: "Stripe Checkout payment.",
          is_test: Boolean(session.livemode === false),
        }),
      });
    }

    await supabaseFetch(`invoices?id=eq.${invoiceId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: invoiceStatus,
        payment_status: "paid",
        amount_paid: amount,
        paid_amount: amount,
        balance_due: 0,
        paid_at: new Date().toISOString(),
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        receipt_url: receiptUrl,
      }),
    });

    const financials = await recalculateRequest(requestId);
    const requestStatus = finalInvoice
      ? "final_payment_received"
      : "payment_received";

    await supabaseFetch(`service_requests?id=eq.${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: requestStatus,
        workflow_status: requestStatus,
        payment_status: financials.paidInFull
          ? "paid_in_full"
          : "partially_paid",
        payment_state: financials.paidInFull
          ? "paid_in_full"
          : "partially_paid",
        paid_amount: financials.totalPaid,
        balance_due: financials.balanceDue,
        balance_due_at_appointment: financials.balanceDue,
        paid_at: financials.paidInFull ? new Date().toISOString() : null,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        receipt_url: receiptUrl,
      }),
    });

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status: requestStatus,
        message: `Stripe payment received for ${invoice.invoice_number}.`,
        sent_email: Boolean(RESEND_API_KEY),
        sent_sms: false,
      }),
    });

    await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: requestId,
        status: requestStatus,
        invoice_id: invoiceId,
      }),
    }).catch(() => null);

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
