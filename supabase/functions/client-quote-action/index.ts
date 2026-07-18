/**
 * Aligned Print & Scan — Customer quote actions.
 *
 * Quote approval creates the real initial invoice before exposing payment.
 * This prevents the customer portal from displaying a synthetic invoice number
 * that cannot be found by Stripe or the manual payment recorder.
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
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";
const FROM_EMAIL =
  Deno.env.get("FROM_EMAIL") ||
  "Aligned Print & Scan <hello@alignedprintscan.com>";
const SUPPORT_EMAIL =
  Deno.env.get("SUPPORT_EMAIL") || "hello@alignedprintscan.com";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || SUPPORT_EMAIL;
const LOGO_URL =
  Deno.env.get("EMAIL_LOGO_URL") ||
  `${SITE_URL}/assets/images/logo-full.webp`;

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

function invoiceNumberFromId(id: string) {
  return `INV-${id.slice(0, 8).toUpperCase()}-01`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };

    return replacements[character] || character;
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

function emailShell(body: string, preheader: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:28px 12px">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e7dcc5">
            <tr>
              <td style="background:#fff;padding:30px 34px 20px;text-align:center;border-bottom:4px solid #c8a96b">
                <img src="${LOGO_URL}" alt="Aligned Print & Scan" style="max-width:210px;margin:0 auto 14px;display:block">
              </td>
            </tr>
            <tr><td style="padding:34px">${body}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendAdminEmail(subject: string, html: string) {
  if (!RESEND_API_KEY) {
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject,
      html,
    }),
  });
}

async function findRequestId(
  requestId: unknown,
  referenceNumber: unknown,
) {
  let id = String(requestId || "").trim();

  if (!id && referenceNumber) {
    const prefix = String(referenceNumber)
      .replace(/^APS-/i, "")
      .toLowerCase();
    const response = await supabaseFetch(
      `service_requests?select=id&id=ilike.${encodeURIComponent(prefix)}*&limit=1`,
    );
    const rows = await readJson(response);
    id = rows?.[0]?.id || "";
  }

  return id;
}

async function materializeInitialInvoice(requestId: string) {
  const requestResponse = await supabaseFetch(
    `service_requests?select=id,quote_amount,initial_payment_amount,estimated_total,invoice_number&id=eq.${requestId}&limit=1`,
  );
  const requestRows = await readJson(requestResponse);
  const request = requestRows?.[0];

  if (!request) {
    throw new Error("Request not found.");
  }

  const amountDue = Number(
    request.initial_payment_amount ||
      request.quote_amount ||
      request.estimated_total ||
      0,
  );

  if (!Number.isFinite(amountDue) || amountDue <= 0) {
    throw new Error("The approved quote does not have a payable amount.");
  }

  const invoiceLookupResponse = await supabaseFetch(
    `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
  );
  const existingRows = await readJson(invoiceLookupResponse);
  const existingInvoice = (existingRows || []).find((row: any) => {
    return (
      String(row.invoice_type || "").includes("initial") ||
      String(row.invoice_number || "").endsWith("-01")
    );
  }) || null;
  const invoiceNumber =
    existingInvoice?.invoice_number || invoiceNumberFromId(requestId);

  let invoice;

  if (existingInvoice) {
    const updateResponse = await supabaseFetch(
      `invoices?id=eq.${existingInvoice.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          invoice_type: "initial",
          status: "awaiting_payment",
          payment_status: "unpaid",
          amount_due: amountDue,
          balance_due: amountDue,
          amount_paid: 0,
          paid_amount: 0,
        }),
      },
    );
    const updatedRows = await readJson(updateResponse);
    invoice = updatedRows?.[0];
  } else {
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
        note: "Approved initial service invoice.",
      }),
    });
    const insertedRows = await readJson(insertResponse);
    invoice = insertedRows?.[0];
  }

  if (!invoice?.id) {
    throw new Error("The initial invoice could not be created.");
  }

  // Quote rows begin with invoice_id = null while the quote is editable. Once
  // approved, attach them to Invoice #1 so all payment methods share one record.
  await supabaseFetch(
    `invoice_items?service_request_id=eq.${requestId}&invoice_id=is.null`,
    {
      method: "PATCH",
      body: JSON.stringify({ invoice_id: invoice.id }),
    },
  );

  await supabaseFetch(`service_requests?id=eq.${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "awaiting_payment",
      workflow_status: "awaiting_payment",
      invoice_status: "approved",
      payment_status: "awaiting_payment",
      payment_state: "invoice_1_due",
      invoice_number: invoiceNumber,
      initial_payment_amount: amountDue,
      balance_due: amountDue,
    }),
  });

  return invoice;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const requestId = await findRequestId(
      body.request_id,
      body.reference_number,
    );
    const action = String(body.action || "").trim();

    if (!requestId) {
      return json({ ok: false, error: "Request reference not found." }, 404);
    }

    const reference = refFromId(requestId);

    if (action === "approve") {
      const invoice = await materializeInitialInvoice(requestId);

      await supabaseFetch("request_status_updates", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          status: "awaiting_payment",
          message:
            "Client approved the quote. Invoice #1 was created and is awaiting secure payment.",
          sent_email: Boolean(RESEND_API_KEY),
          sent_sms: false,
        }),
      });

      await sendAdminEmail(
        `Quote approved / awaiting payment: ${reference}`,
        emailShell(
          `<p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-weight:800;margin:0 0 10px">Admin Alert</p>
           <h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 12px;font-size:32px">Quote Approved</h1>
           <p>The client approved the quote for <strong>${escapeHtml(reference)}</strong>.</p>
           <p>Invoice <strong>${escapeHtml(invoice.invoice_number)}</strong> is now awaiting payment.</p>`,
          `Quote approved: ${reference}`,
        ),
      );

      return json({
        ok: true,
        status: "awaiting_payment",
        reference_number: reference,
        invoice,
      });
    }

    if (action === "changes_requested") {
      const note = String(
        body.message || "Client requested changes to quote.",
      );

      await supabaseFetch(`service_requests?id=eq.${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "changes_requested",
          workflow_status: "changes_requested",
          invoice_status: "changes_requested",
        }),
      });

      await supabaseFetch("request_status_updates", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          status: "changes_requested",
          message: note,
          sent_email: Boolean(RESEND_API_KEY),
          sent_sms: false,
        }),
      });

      return json({
        ok: true,
        status: "changes_requested",
        reference_number: reference,
      });
    }

    return json({ ok: false, error: "Unsupported action." }, 400);
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
