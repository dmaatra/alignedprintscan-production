/**
 * Aligned Print & Scan — Admin payment recorder.
 *
 * Records cash, check, Zelle, external, or simulated test payments without
 * charging Stripe. Every payment is linked to the applicable invoice, and the
 * invoice/request financial state is recalculated from stored records.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const paidInvoiceStatuses = new Set([
  "paid",
  "payment_received",
  "final_payment_received",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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

function isFinalInvoice(invoice: Record<string, unknown>) {
  return (
    String(invoice.invoice_type || "").includes("final") ||
    String(invoice.invoice_number || "").endsWith("-02")
  );
}

function invoiceRemainingBalance(invoice: Record<string, unknown>) {
  const amountDue = Number(invoice.amount_due || 0);
  const amountPaid = Number(invoice.amount_paid || invoice.paid_amount || 0);

  return Math.max(0, amountDue - amountPaid);
}

function findTargetInvoice(
  invoices: Array<Record<string, unknown>>,
  paymentStage: string,
) {
  const candidates = invoices.filter((invoice) => {
    const status = String(invoice.status || "").toLowerCase();

    return (
      !paidInvoiceStatuses.has(status) &&
      invoiceRemainingBalance(invoice) > 0
    );
  });

  if (paymentStage === "final") {
    return candidates.find(isFinalInvoice) || null;
  }

  return candidates.find((invoice) => !isFinalInvoice(invoice)) || null;
}

function invoiceNumberFromId(requestId: string) {
  return `INV-${requestId.slice(0, 8).toUpperCase()}-01`;
}

async function createMissingInitialInvoice(requestId: string) {
  const requestResponse = await supabaseFetch(
    `service_requests?select=id,status,quote_amount,initial_payment_amount,estimated_total,invoice_number&id=eq.${requestId}&limit=1`,
  );
  const requestRows = await readJson(requestResponse);
  const request = requestRows?.[0];

  if (!request) {
    throw new Error("Request not found.");
  }

  const allowedStatuses = new Set([
    "awaiting_payment",
    "payment_pending",
    "payment_submitted",
  ]);

  if (!allowedStatuses.has(String(request.status || "").toLowerCase())) {
    throw new Error(
      "The quote must be approved before an initial payment can be recorded.",
    );
  }

  const amountDue = Number(
    request.initial_payment_amount ||
      request.quote_amount ||
      request.estimated_total ||
      0,
  );

  if (!Number.isFinite(amountDue) || amountDue <= 0) {
    throw new Error("The request does not have a payable initial amount.");
  }

  const invoiceNumber =
    String(request.invoice_number || "").endsWith("-01")
      ? String(request.invoice_number)
      : invoiceNumberFromId(requestId);

  const insertResponse = await supabaseFetch("invoices", {
    method: "POST",
    body: JSON.stringify({
      service_request_id: requestId,
      invoice_number: invoiceNumber,
      invoice_type: "initial",
      status: "awaiting_payment",
      payment_status: "unpaid",
      amount_due: amountDue,
      balance_due: amountDue,
      amount_paid: 0,
      paid_amount: 0,
      note: "Initial invoice materialized for administrative payment entry.",
    }),
  });
  const insertedRows = await readJson(insertResponse);
  const invoice = insertedRows?.[0];

  if (!invoice?.id) {
    throw new Error("The initial invoice could not be created.");
  }

  await supabaseFetch(
    `invoice_items?service_request_id=eq.${requestId}&invoice_id=is.null`,
    {
      method: "PATCH",
      body: JSON.stringify({ invoice_id: invoice.id }),
    },
  );

  return invoice;
}

async function recalculateRequestFinancials(requestId: string) {
  const invoicesResponse = await supabaseFetch(
    `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
  );
  const invoices = (await readJson(invoicesResponse)) as Array<
    Record<string, unknown>
  >;

  const paymentsResponse = await supabaseFetch(
    `request_payments?select=amount,is_test&service_request_id=eq.${requestId}`,
  );
  const payments = (await readJson(paymentsResponse)) as Array<{
    amount?: number;
    is_test?: boolean;
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
  const paidInFull = totalInvoiced > 0 && balanceDue <= 0;

  return {
    invoices,
    totalInvoiced,
    totalPaid,
    balanceDue,
    paidInFull,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const requestId = String(body.request_id || "").trim();
    const requestedAmount = Number(body.amount || 0);
    const paymentStage = String(body.payment_stage || "initial").trim();
    const paymentMethod = String(body.method || "other").trim();
    const note = String(body.note || "").trim();
    const isTest = Boolean(body.is_test);

    if (!requestId) {
      throw new Error("Missing request_id.");
    }

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    const invoiceResponse = await supabaseFetch(
      `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
    );
    let invoices = (await readJson(invoiceResponse)) as Array<
      Record<string, unknown>
    >;
    let targetInvoice = findTargetInvoice(invoices, paymentStage);

    // Existing requests created before Pass 3.2 may show a quote but have no
    // physical Invoice #1 row. Materialize it once, then continue normally.
    if (!targetInvoice && paymentStage !== "final") {
      targetInvoice = await createMissingInitialInvoice(requestId);
      invoices = [...invoices, targetInvoice];
    }

    if (!targetInvoice) {
      throw new Error(
        paymentStage === "final"
          ? "No unpaid final-balance invoice was found for this request."
          : "No unpaid initial invoice was found for this request.",
      );
    }

    const invoiceBalance = invoiceRemainingBalance(targetInvoice);

    if (requestedAmount > invoiceBalance + 0.009) {
      throw new Error(
        `The payment exceeds the invoice balance of $${invoiceBalance.toFixed(2)}.`,
      );
    }

    const paymentAmount = requestedAmount;
    const currentPaidAmount = Number(
      targetInvoice.amount_paid || targetInvoice.paid_amount || 0,
    );
    const newInvoicePaidAmount = currentPaidAmount + paymentAmount;
    const newInvoiceBalance = Math.max(
      0,
      Number(targetInvoice.amount_due || 0) - newInvoicePaidAmount,
    );
    const invoicePaidInFull = newInvoiceBalance <= 0;
    const paidAt = invoicePaidInFull ? new Date().toISOString() : null;
    const invoiceStatus = invoicePaidInFull
      ? paymentStage === "final"
        ? "final_payment_received"
        : "payment_received"
      : "partially_paid";

    const paymentResponse = await supabaseFetch("request_payments", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        invoice_id: targetInvoice.id,
        payment_stage: paymentStage,
        amount: paymentAmount,
        payment_method: paymentMethod,
        external_reference: body.reference || null,
        note,
        is_test: isTest,
      }),
    });
    await readJson(paymentResponse);

    const invoiceUpdateResponse = await supabaseFetch(
      `invoices?id=eq.${targetInvoice.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: invoiceStatus,
          payment_status: invoicePaidInFull ? "paid" : "partially_paid",
          amount_paid: newInvoicePaidAmount,
          paid_amount: newInvoicePaidAmount,
          balance_due: newInvoiceBalance,
          paid_at: paidAt,
        }),
      },
    );
    await readJson(invoiceUpdateResponse);

    const financials = await recalculateRequestFinancials(requestId);
    const paymentState = financials.paidInFull
      ? "paid_in_full"
      : financials.totalPaid > 0
        ? "partially_paid"
        : "unpaid";
    const workflowStatus =
      paymentStage === "final" && financials.paidInFull
        ? "final_payment_received"
        : paymentStage === "initial" && invoicePaidInFull
          ? "payment_received"
          : "awaiting_payment";

    const requestUpdateResponse = await supabaseFetch(
      `service_requests?id=eq.${requestId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: workflowStatus,
          workflow_status: workflowStatus,
          payment_status: paymentState,
          payment_state: paymentState,
          paid_amount: financials.totalPaid,
          balance_due: financials.balanceDue,
          balance_due_at_appointment: financials.balanceDue,
          paid_at: financials.paidInFull ? paidAt : null,
        }),
      },
    );
    await readJson(requestUpdateResponse);

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status: workflowStatus,
        message: isTest
          ? `Simulated ${paymentStage} payment recorded for $${paymentAmount.toFixed(2)} on ${targetInvoice.invoice_number}.`
          : `${paymentStage} payment recorded for $${paymentAmount.toFixed(2)} on ${targetInvoice.invoice_number}.`,
        sent_email: false,
        sent_sms: false,
      }),
    });

    return json({
      ok: true,
      is_test: isTest,
      invoice_id: targetInvoice.id,
      invoice_number: targetInvoice.invoice_number,
      invoice_status: invoiceStatus,
      invoice_paid_amount: newInvoicePaidAmount,
      invoice_balance_due: newInvoiceBalance,
      paid_amount: financials.totalPaid,
      balance_due: financials.balanceDue,
      payment_state: paymentState,
      workflow_status: workflowStatus,
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
