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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ADMIN_EMAILS = new Set(
  String(Deno.env.get("ADMIN_EMAILS") || Deno.env.get("ADMIN_EMAIL") || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

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

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token || !ANON_KEY) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: "Administrator authentication is required.",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const user = response.ok ? await response.json() : null;
  const email = String(user?.email || "").toLowerCase();

  if (!email || (ADMIN_EMAILS.size && !ADMIN_EMAILS.has(email))) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: "You are not authorized to record payments.",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return { id: user.id, email };
}

async function logTimeline(
  requestId: string,
  eventType: string,
  title: string,
  detail: string,
  metadata: Record<string, unknown> = {},
) {
  const response = await supabaseFetch("request_timeline_events", {
    method: "POST",
    body: JSON.stringify({
      service_request_id: requestId,
      event_type: eventType,
      title,
      detail,
      actor_type: "admin",
      metadata,
    }),
  });
  if (!response.ok) {
    console.warn("Timeline logging failed:", await response.text());
  }
}

function isFinalInvoice(invoice: Record<string, unknown>) {
  return (
    ["final", "final_balance", "supplemental", "additional"].some((kind) =>
      String(invoice.invoice_type || "").includes(kind)
    ) ||
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
    const admin = await requireAdmin(request);
    const body = await request.json();
    const requestId = String(body.request_id || "").trim();
    const requestedAmount = Number(body.amount || 0);
    const requestedInvoiceId = String(body.invoice_id || "").trim();
    const paymentStage = String(body.payment_stage || "initial").trim();
    const paymentMethod = String(body.method || "other").trim();
    const note = String(body.note || "").trim();
    const isTest = Boolean(body.is_test);
    const idempotencyKey = String(body.idempotency_key || "").trim();

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
    let targetInvoice = requestedInvoiceId
      ? invoices.find((invoice) =>
        String(invoice.id || "") === requestedInvoiceId
      ) || null
      : findTargetInvoice(invoices, paymentStage);

    if (targetInvoice) {
      const targetIsFinal = isFinalInvoice(targetInvoice);
      if ((paymentStage === "final") !== targetIsFinal) {
        throw new Error(
          "The selected invoice does not match the requested payment stage.",
        );
      }
      const targetStatus = String(targetInvoice.status || "").toLowerCase();
      if (
        paidInvoiceStatuses.has(targetStatus) ||
        invoiceRemainingBalance(targetInvoice) <= 0
      ) {
        throw new Error(
          "The selected invoice is already paid or has no remaining balance.",
        );
      }
    }

    if (!targetInvoice) {
      throw new Error(
        paymentStage === "final"
          ? "No unpaid final-balance invoice was found for this request."
          : "No unpaid initial invoice was found. Payment recording never creates an invoice; issue or repair the invoice first.",
      );
    }

    const invoiceBalance = invoiceRemainingBalance(targetInvoice);

    if (requestedAmount > invoiceBalance + 0.009) {
      throw new Error(
        `The payment exceeds the invoice balance of $${
          invoiceBalance.toFixed(2)
        }.`,
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
      ? paymentStage === "final" ? "final_payment_received" : "payment_received"
      : "partially_paid";

    const paymentResponse = await supabaseFetch("request_payments", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        invoice_id: targetInvoice.id,
        organization_id: targetInvoice.organization_id || null,
        payment_stage: paymentStage,
        amount: paymentAmount,
        payment_method: paymentMethod,
        payment_state: "succeeded",
        external_reference: body.reference || null,
        idempotency_key: idempotencyKey || null,
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
    const postpaid = ["due_on_receipt", "net_15", "net_30"].includes(
      String(targetInvoice.payment_terms || ""),
    );
    const workflowStatus = postpaid
      ? null
      : paymentStage === "final" && financials.paidInFull
      ? "final_payment_received"
      : paymentStage === "initial" && invoicePaidInFull
      ? "payment_received"
      : "awaiting_payment";

    const requestUpdateResponse = await supabaseFetch(
      `service_requests?id=eq.${requestId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...(workflowStatus
            ? { status: workflowStatus, workflow_status: workflowStatus }
            : {}),
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
        status: workflowStatus || "financial_update",
        message: isTest
          ? `Simulated ${paymentStage} payment recorded for $${
            paymentAmount.toFixed(2)
          } on ${targetInvoice.invoice_number}.`
          : `${paymentStage} payment recorded for $${
            paymentAmount.toFixed(2)
          } on ${targetInvoice.invoice_number}.`,
        sent_email: false,
        sent_sms: false,
      }),
    });

    await logTimeline(
      requestId,
      isTest ? "test_payment_recorded" : "payment_recorded",
      isTest ? "Test payment recorded" : "Payment recorded",
      `${paymentStage === "final" ? "Final" : "Initial"} payment of $${
        paymentAmount.toFixed(2)
      } was recorded on ${targetInvoice.invoice_number}.`,
      {
        invoice_id: targetInvoice.id,
        invoice_number: targetInvoice.invoice_number,
        payment_stage: paymentStage,
        amount: paymentAmount,
        method: paymentMethod,
        admin_email: admin.email,
      },
    );

    if (targetInvoice.organization_id) {
      await supabaseFetch("business_financial_events", {
        method: "POST",
        body: JSON.stringify({
          organization_id: targetInvoice.organization_id,
          service_request_id: requestId,
          invoice_id: targetInvoice.id,
          event_type: paymentMethod === "check"
            ? "offline_check_received"
            : "offline_payment_received",
          amount: paymentAmount,
          actor_type: "aps_staff",
          actor_user_id: admin.id,
          idempotency_key: idempotencyKey ||
            `offline-payment:${targetInvoice.id}:${
              body.reference || crypto.randomUUID()
            }`,
          customer_safe_detail: `${
            paymentMethod === "check" ? "Check" : "Offline payment"
          } received for ${targetInvoice.invoice_number}.`,
          metadata: { method: paymentMethod, test: isTest },
        }),
      });
    }

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
      workflow_status: workflowStatus || "unchanged_postpaid_service_status",
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});
