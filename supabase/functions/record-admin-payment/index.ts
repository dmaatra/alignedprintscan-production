/**
 * Aligned Print & Scan — Admin payment recorder.
 *
 * Records offline or simulated test payments without charging a card. Financial
 * totals are derived from payment records; a status button never invents money.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const requestId = String(body.request_id || "").trim();
    const amount = Number(body.amount || 0);
    const paymentStage = String(body.payment_stage || "initial").trim();
    const paymentMethod = String(body.method || "other").trim();
    const note = String(body.note || "").trim();
    const isTest = Boolean(body.is_test);

    if (!requestId) throw new Error("Missing request_id.");
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    const paymentResponse = await supabaseFetch("request_payments", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        payment_stage: paymentStage,
        amount,
        payment_method: paymentMethod,
        note,
        is_test: isTest,
      }),
    });

    if (!paymentResponse.ok) {
      throw new Error(await paymentResponse.text());
    }

    const totalsResponse = await supabaseFetch(
      `request_payments?select=amount&service_request_id=eq.${requestId}`,
    );
    const paymentRows = totalsResponse.ok ? await totalsResponse.json() : [];
    const paidAmount = paymentRows.reduce(
      (sum: number, row: { amount?: number }) => sum + Number(row.amount || 0),
      0,
    );

    const requestResponse = await supabaseFetch(
      `service_requests?select=quote_amount,full_quote_amount,estimated_total&id=eq.${requestId}&limit=1`,
    );
    const requestRows = requestResponse.ok ? await requestResponse.json() : [];
    const serviceRequest = requestRows[0] || {};
    const totalValue = Number(
      serviceRequest.full_quote_amount ||
        serviceRequest.quote_amount ||
        serviceRequest.estimated_total ||
        0,
    );
    const balanceDue = Math.max(0, totalValue - paidAmount);
    const paymentState = balanceDue <= 0 ? "paid_in_full" : "partially_paid";
    const workflowStatus =
      paymentStage === "final" && balanceDue <= 0
        ? "final_payment_received"
        : "payment_received";

    const updateResponse = await supabaseFetch(
      `service_requests?id=eq.${requestId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: workflowStatus,
          workflow_status: workflowStatus,
          payment_status: paymentState,
          payment_state: paymentState,
          paid_amount: paidAmount,
          balance_due_at_appointment: balanceDue,
          paid_at: balanceDue <= 0 ? new Date().toISOString() : null,
        }),
      },
    );

    if (!updateResponse.ok) {
      throw new Error(await updateResponse.text());
    }

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status: workflowStatus,
        message: isTest
          ? `Simulated test payment recorded for $${amount.toFixed(2)}.`
          : `Offline payment recorded for $${amount.toFixed(2)}.`,
        sent_email: false,
        sent_sms: false,
      }),
    });

    return json({
      ok: true,
      is_test: isTest,
      paid_amount: paidAmount,
      balance_due: balanceDue,
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
