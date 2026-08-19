/**
 * Aligned Print & Scan — Stripe webhook.
 *
 * Stripe and manual/test payments now update the same invoice and request
 * records. The invoice is the source of truth; the request aggregates totals.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook secret is not configured.");
  }
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((
    part,
  ) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return signatures.some((signature) => secureEqual(signature, expected));
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
  const paymentIntentId = typeof session.payment_intent === "string"
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
    ["final", "final_balance", "supplemental", "additional"].some((kind) =>
      String(invoice.invoice_type || "").includes(kind)
    ) || /-0*[2-9]\d*$/.test(String(invoice.invoice_number || ""))
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
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") || "";
    if (!(await verifyStripeSignature(rawBody, signature))) {
      return new Response(
        JSON.stringify({ error: "Invalid Stripe signature." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const event = JSON.parse(rawBody);

    if (String(event.type || "").startsWith("invoice.")) {
      const providerInvoice = event.data?.object || {};
      const apsInvoiceId = String(
        providerInvoice.metadata?.aps_invoice_id || "",
      ).trim();
      const invoiceRows = await readJson(
        await supabaseFetch(
          apsInvoiceId
            ? `invoices?select=*&id=eq.${apsInvoiceId}&limit=1`
            : `invoices?select=*&stripe_invoice_id=eq.${
              encodeURIComponent(providerInvoice.id || "")
            }&limit=1`,
        ),
      );
      const apsInvoice = invoiceRows?.[0];
      if (!apsInvoice?.organization_id) {
        return new Response(JSON.stringify({ received: true, ignored: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const prior = await readJson(
        await supabaseFetch(
          `stripe_business_webhook_events?select=id,processing_status&stripe_event_id=eq.${
            encodeURIComponent(event.id)
          }&limit=1`,
        ),
      );
      if (prior?.[0]?.processing_status === "processed") {
        return new Response(
          JSON.stringify({ received: true, duplicate: true }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (!prior?.length) {
        await supabaseFetch("stripe_business_webhook_events", {
          method: "POST",
          body: JSON.stringify({
            stripe_event_id: event.id,
            event_type: event.type,
            object_id: providerInvoice.id || null,
            livemode: Boolean(event.livemode),
            processing_status: "received",
          }),
        });
      }
      const amountDue = Number(providerInvoice.amount_due || 0) / 100;
      const providerPaid = Number(providerInvoice.amount_paid || 0) / 100;
      const currentPaid = Number(
        apsInvoice.amount_paid || apsInvoice.paid_amount || 0,
      );
      const paidDelta = Math.max(0, providerPaid - currentPaid);
      let financialStatus = apsInvoice.financial_status;
      if (event.type === "invoice.paid") financialStatus = "paid";
      else if (
        ["invoice.payment_failed", "invoice.payment_action_required"].includes(
          event.type,
        )
      ) financialStatus = "payment_failed";
      else if (
        providerPaid > 0 && Number(providerInvoice.amount_remaining || 0) > 0
      ) financialStatus = "partially_paid";
      else if (event.type === "invoice.voided") financialStatus = "voided";
      else if (event.type === "invoice.finalized") {
        financialStatus = apsInvoice.payment_terms === "prepaid"
          ? "prepayment_required"
          : `open_${apsInvoice.payment_terms}`;
      }
      let paymentId = null;
      if (paidDelta > 0) {
        const paymentRows = await readJson(
          await supabaseFetch("request_payments", {
            method: "POST",
            body: JSON.stringify({
              service_request_id: apsInvoice.service_request_id,
              invoice_id: apsInvoice.id,
              organization_id: apsInvoice.organization_id,
              payment_stage: "business",
              amount: paidDelta,
              payment_method: "stripe",
              payment_state: event.type === "invoice.paid"
                ? "succeeded"
                : "processing",
              external_reference: providerInvoice.payment_intent || event.id,
              stripe_payment_intent_id: providerInvoice.payment_intent || null,
              provider_event_id: event.id,
              idempotency_key: `stripe-event:${event.id}`,
              receipt_url: providerInvoice.hosted_invoice_url || null,
              note: "Stripe business invoice reconciliation.",
              is_test: !event.livemode,
            }),
          }),
        );
        paymentId = paymentRows?.[0]?.id || null;
      }
      const balance = Math.max(0, amountDue - providerPaid);
      await supabaseFetch(`invoices?id=eq.${apsInvoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: event.type === "invoice.paid"
            ? "paid"
            : event.type === "invoice.voided"
            ? "void"
            : "open",
          payment_status: event.type === "invoice.paid"
            ? "paid"
            : providerPaid > 0
            ? "partially_paid"
            : "unpaid",
          financial_status: financialStatus,
          amount_paid: providerPaid,
          paid_amount: providerPaid,
          balance_due: balance,
          paid_at: event.type === "invoice.paid"
            ? new Date().toISOString()
            : null,
          stripe_invoice_id: providerInvoice.id,
          stripe_customer_id: providerInvoice.customer ||
            apsInvoice.stripe_customer_id,
          stripe_payment_intent_id: providerInvoice.payment_intent ||
            apsInvoice.stripe_payment_intent_id,
          stripe_hosted_invoice_url: providerInvoice.hosted_invoice_url ||
            apsInvoice.stripe_hosted_invoice_url,
          stripe_invoice_pdf_url: providerInvoice.invoice_pdf ||
            apsInvoice.stripe_invoice_pdf_url,
          stripe_status: providerInvoice.status || null,
          provider_updated_at: new Date().toISOString(),
        }),
      });
      await supabaseFetch(
        `service_requests?id=eq.${apsInvoice.service_request_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            payment_state: event.type === "invoice.paid"
              ? "paid_in_full"
              : providerPaid > 0
              ? "partially_paid"
              : "unpaid",
            payment_status: event.type === "invoice.paid"
              ? "paid_in_full"
              : providerPaid > 0
              ? "partially_paid"
              : "unpaid",
            paid_amount: providerPaid,
            balance_due: balance,
            ...(apsInvoice.payment_terms === "prepaid" &&
                event.type === "invoice.paid"
              ? {
                status: "payment_received",
                workflow_status: "payment_received",
              }
              : {}),
          }),
        },
      );
      await supabaseFetch("business_financial_events", {
        method: "POST",
        body: JSON.stringify({
          organization_id: apsInvoice.organization_id,
          service_request_id: apsInvoice.service_request_id,
          invoice_id: apsInvoice.id,
          payment_id: paymentId,
          event_type: event.type.replaceAll(".", "_"),
          amount: paidDelta || null,
          actor_type: "stripe",
          idempotency_key: `stripe-event:${event.id}:audit`,
          customer_safe_detail: event.type === "invoice.paid"
            ? `Payment received for ${apsInvoice.invoice_number}.`
            : null,
          metadata: {
            livemode: Boolean(event.livemode),
            provider_status: providerInvoice.status || null,
          },
        }),
      });
      await supabaseFetch(
        `stripe_business_webhook_events?stripe_event_id=eq.${
          encodeURIComponent(event.id)
        }`,
        {
          method: "PATCH",
          body: JSON.stringify({
            processing_status: "processed",
            processed_at: new Date().toISOString(),
          }),
        },
      );
      return new Response(
        JSON.stringify({ received: true, business_invoice: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = event.data.object;
    const requestId = String(session.metadata?.request_id || "").trim();
    const invoiceId = String(session.metadata?.invoice_id || "").trim();

    if (!requestId || !invoiceId) {
      throw new Error(
        "Stripe checkout metadata is missing request or invoice ID.",
      );
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
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Stripe reported an invalid payment amount.");
    }
    const receiptUrl = await receiptUrlForSession(session);
    const finalInvoice = isFinalInvoice(invoice);
    const invoiceStatus = finalInvoice
      ? "final_payment_received"
      : "payment_received";

    // Avoid duplicate payment records when Stripe retries the webhook.
    const existingPaymentResponse = await supabaseFetch(
      `request_payments?select=id&external_reference=eq.${
        encodeURIComponent(session.id)
      }&limit=1`,
    );
    const existingPaymentRows = await readJson(existingPaymentResponse);

    if (existingPaymentRows?.length) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const paymentResponse = await supabaseFetch("request_payments", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        invoice_id: invoiceId,
        payment_stage: finalInvoice ? "final" : "initial",
        amount,
        payment_method: "stripe",
        external_reference: session.id,
        note: `Stripe Checkout payment; event ${event.id || "unknown"}.`,
        is_test: Boolean(session.livemode === false),
      }),
    });
    if (!paymentResponse.ok) {
      // A concurrent retry may have won the uniqueness race.
      if (paymentResponse.status === 409) {
        return new Response(
          JSON.stringify({ received: true, duplicate: true }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(await paymentResponse.text());
    }

    const amountDue = Number(invoice.amount_due || 0);
    const currentPaid = Number(invoice.amount_paid || invoice.paid_amount || 0);
    const newPaid = currentPaid + amount;
    const remaining = Math.max(0, amountDue - newPaid);
    const paidInFull = amountDue > 0 && remaining <= 0.009;

    const invoiceUpdateResponse = await supabaseFetch(
      `invoices?id=eq.${invoiceId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: paidInFull ? invoiceStatus : "partially_paid",
          payment_status: paidInFull ? "paid" : "partially_paid",
          amount_paid: newPaid,
          paid_amount: newPaid,
          balance_due: remaining,
          paid_at: paidInFull ? new Date().toISOString() : null,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || null,
          receipt_url: receiptUrl,
        }),
      },
    );
    if (!invoiceUpdateResponse.ok) {
      throw new Error(await invoiceUpdateResponse.text());
    }

    const financials = await recalculateRequest(requestId);
    const requestStatus = paidInFull && financials.paidInFull
      ? finalInvoice ? "final_payment_received" : "payment_received"
      : "awaiting_payment";

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
        source_type: "automatic",
        source_event: "stripe_payment_completed",
        idempotency_key: `stripe:${session.id}:payment_confirmation`,
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
