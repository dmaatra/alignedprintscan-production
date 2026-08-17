// Aligned Print & Scan — Final Balance Invoice Creator
// Creates Invoice #2 or later for final balance/on-site add-ons without editing paid invoices.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Administrator authentication is required.");
  }
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: authorization },
  });
  if (!userResponse.ok) throw new Error("Administrator authentication is required.");
  const adminResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!adminResponse.ok || await adminResponse.json() !== true) {
    throw new Error("Administrator access is required.");
  }
}

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
  try {
    return await req.json();
  } catch (_) {
    return {};
  }
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
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function logTimeline(requestId: string, invoice: any, total: number) {
  const response = await supabaseFetch("request_timeline_events", {
    method: "POST",
    body: JSON.stringify({
      service_request_id: requestId,
      event_type: "final_invoice_created",
      title: "Final balance invoice created",
      detail: `${invoice.invoice_number} was issued for $${total.toFixed(2)}.`,
      actor_type: "admin",
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: total,
      },
    }),
  });
  if (!response.ok) {
    console.warn("Timeline logging failed:", await response.text());
  }
}

async function notifyFinalInvoice(requestId: string, invoice: any, note: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request_id: requestId,
      status: "final_balance_due",
      invoice_id: invoice.id,
      note,
      source_type: "workflow",
      source_event: "supplemental_invoice_created",
      idempotency_key: `invoice:${invoice.id}:final_balance_due`,
    }),
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireAdmin(req);
    const body = await readBody(req);
    const requestId = String(body.request_id || "").trim();
    const note = String(
      body.note ||
        "Final balance invoice for additional on-site or fulfillment services.",
    ).trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const notificationOnly = body.notification_only === true;
    const requestedInvoiceId = String(body.invoice_id || "").trim();

    if (!requestId) throw new Error("Missing request_id.");
    if (!notificationOnly && !items.length) {
      throw new Error("At least one final balance line item is required.");
    }

    const requestRes = await supabaseFetch(
      `service_requests?select=id,customer_id,status&id=eq.${requestId}&limit=1`,
    );
    const requestRows = await readJsonOrEmpty(requestRes);
    if (!requestRows?.[0]) throw new Error("Request not found.");

    const invoiceRowsRes = await supabaseFetch(
      `invoices?select=id,invoice_number,invoice_type,status,amount_due,amount_paid,paid_amount,balance_due&service_request_id=eq.${requestId}&order=created_at.asc`,
    );
    const existing = (await readJsonOrEmpty(invoiceRowsRes)) || [];
    if (notificationOnly) {
      const invoice = existing.find((row: any) => row.id === requestedInvoiceId);
      if (!invoice) throw new Error("Supplemental invoice not found for this request.");
      const status = String(invoice.status || "").toLowerCase();
      const supplemental = ["supplemental", "final", "final_balance", "additional"].some((kind) =>
        String(invoice.invoice_type || "").includes(kind)
      ) || /-0*[2-9]\d*$/.test(String(invoice.invoice_number || ""));
      const balance = Number(invoice.balance_due ?? (Number(invoice.amount_due || 0) - Number(invoice.amount_paid || invoice.paid_amount || 0)));
      if (!supplemental || balance <= 0 || ["void", "cancelled", "paid", "payment_received", "final_payment_received"].includes(status)) {
        throw new Error("Only an unpaid active supplemental or final invoice notification can be retried.");
      }
      const notification = await notifyFinalInvoice(requestId, invoice, note || String(invoice.note || ""));
      if (!notification.response.ok || notification.result?.ok === false) {
        return json({ ok: false, retryable: true, error: String(notification.result?.error || "Customer notification failed.") }, 400);
      }
      return json({ ok: true, notification_only: true, duplicate: Boolean(notification.result?.duplicate), invoice });
    }
    const openFinal = existing.find((row: any) => {
      const status = String(row.status || "").toLowerCase();
      const supplemental = ["supplemental", "final", "final_balance", "additional"].some((kind) =>
        String(row.invoice_type || "").includes(kind)
      ) || /-0*[2-9]\d*$/.test(String(row.invoice_number || ""));
      const paidAmount = Number(row.amount_paid || row.paid_amount || 0);
      return supplemental && paidAmount <= 0 &&
        ![
          "paid",
          "payment_received",
          "final_payment_received",
          "void",
          "cancelled",
        ].includes(status);
    });
    const suffixes = existing
      .map((row: any) => String(row.invoice_number || "").match(/-(\d+)$/)?.[1])
      .filter(Boolean)
      .map((n: string) => Number(n));
    const nextNumber = openFinal
      ? Number(
        String(openFinal.invoice_number || "").match(/-(\d+)$/)?.[1] || 2,
      )
      : Math.max(2, suffixes.length ? Math.max(...suffixes) + 1 : 2);
    const invoiceNumber = openFinal?.invoice_number ||
      `INV-${shortCode(requestId)}-${String(nextNumber).padStart(2, "0")}`;

    const total = items.reduce((sum: number, item: any) => {
      const quantity = Number(item.quantity || 1);
      const unit = Number(item.unit_price || 0);
      return sum + Number(item.line_total || quantity * unit || 0);
    }, 0);
    if (total <= 0) {
      throw new Error("Final balance invoice total must be greater than zero.");
    }

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
      await supabaseFetch(`invoice_items?invoice_id=eq.${openFinal.id}`, {
        method: "DELETE",
      });
    } else {
      const invoiceRes = await supabaseFetch("invoices", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          invoice_number: invoiceNumber,
          invoice_type: "supplemental",
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

    const itemsRes = await supabaseFetch("invoice_items", {
      method: "POST",
      body: JSON.stringify(itemRows),
    });
    if (!itemsRes.ok) throw new Error(await itemsRes.text());

    const activeInvoices = openFinal?.id
      ? existing.map((row: any) => row.id === invoice.id ? invoice : row)
      : [...existing, invoice];
    const requestBalance = activeInvoices.reduce((sum: number, row: any) => {
      if (["void", "cancelled"].includes(String(row.status || "").toLowerCase())) return sum;
      const due = Number(row.amount_due || 0);
      const paid = Number(row.amount_paid || row.paid_amount || 0);
      return sum + Math.max(0, Number(row.balance_due ?? (due - paid)));
    }, 0);

    await supabaseFetch(`service_requests?id=eq.${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "final_balance_due",
        workflow_status: "final_balance_due",
        payment_state: "final_invoice_due",
        balance_due: requestBalance,
        balance_due_at_appointment: requestBalance,
      }),
    });

    await supabaseFetch("request_status_updates", {
      method: "POST",
      body: JSON.stringify({
        service_request_id: requestId,
        status: "final_balance_due",
        message: `Final balance invoice ${invoiceNumber} issued for $${
          total.toFixed(2)
        }.`,
        sent_email: false,
        sent_sms: false,
      }),
    });

    await logTimeline(requestId, invoice, total);

    // Send the customer a branded Final Balance Due email.
    const notificationAttempt = await notifyFinalInvoice(requestId, invoice, note);
    const notificationResponse = notificationAttempt.response;
    const notification = notificationAttempt.result;
    if (!notificationResponse.ok || notification?.ok === false) {
      console.warn("Final invoice notification failed", {
        request_id: requestId,
        invoice_id: invoice.id,
        status: notificationResponse.status,
        error: String(notification?.error || "Unknown notification failure").slice(0, 300),
      });
    }

    return json({
      ok: true,
      invoice,
      total,
      reference_number: refFromId(requestId),
      notification: notificationResponse.ok && notification?.ok !== false
        ? { ok: true, duplicate: Boolean(notification?.duplicate) }
        : {
          ok: false,
          retryable: true,
          error: String(notification?.error || "Customer notification failed."),
        },
    });
  } catch (err) {
    return json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 400);
  }
});
