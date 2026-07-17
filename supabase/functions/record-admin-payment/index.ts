/**
 * Aligned Print & Scan — Admin payment recorder.
 *
 * Records offline or simulated test payments without charging Stripe. A payment
 * is linked to the correct invoice so Invoice #1 and Invoice #2 remain separate
 * sources of truth. Request-level financial totals are then recalculated from
 * invoice and payment records.
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
    return !paidInvoiceStatuses.has(status) && invoiceRemainingBalance(invoice) > 0;
  });

  if (paymentStage === "final") {
    return candidates.find(isFinalInvoice) || null;
  }

  return candidates.find((invoice) => !isFinalInvoice(invoice)) || null;
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
    const invoices = (await readJson(invoiceResponse)) as Array<
      Record<string, unknown>
    >;
    const targetInvoice = findTargetInvoice(invoices, paymentStage);

    if (!targetInvoice) {
      throw new Error(
        paymentStage === "final"
          ? "No unpaid final-balance invoice was found for this request."
          : "No unpaid initial invoice was found for this request.",
      );
    }

    const invoiceBalance = invoiceRemainingBalance(targetInvoice);
    const paymentAmount = Math.min(requestedAmount, invoiceBalance);
    const newInvoicePaidAmount =
      Number(targetInvoice.amount_paid || targetInvoice.paid_amount || 0) +
      paymentAmount;
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

    const allPaymentsResponse = await supabaseFetch(
      `request_payments?select=amount&service_request_id=eq.${requestId}`,
    );
    const paymentRows = (await readJson(allPaymentsResponse)) as Array<{
      amount?: number;
    }>;
    const totalPaid = paymentRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );

    const updatedInvoices = invoices.map((invoice) =>
      invoice.id === targetInvoice.id
        ? {
            ...invoice,
            status: invoiceStatus,
            amount_paid: newInvoicePaidAmount,
            paid_amount: newInvoicePaidAmount,
            balance_due: newInvoiceBalance,
          }
        : invoice,
    );
    const totalInvoiced = updatedInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount_due || 0),
      0,
    );
    const requestBalance = Math.max(0, totalInvoiced - totalPaid);
    const requestPaidInFull = requestBalance <= 0 && totalInvoiced > 0;
    const paymentState = requestPaidInFull
      ? "paid_in_full"
      : totalPaid > 0
        ? "partially_paid"
        : "unpaid";
    const workflowStatus =
      paymentStage === "final" && requestPaidInFull
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
          paid_amount: totalPaid,
          balance_due: requestBalance,
          balance_due_at_appointment: requestBalance,
          paid_at: requestPaidInFull ? paidAt : null,
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
      paid_amount: totalPaid,
      balance_due: requestBalance,
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
