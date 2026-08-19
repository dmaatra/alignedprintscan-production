import {
  dueDate,
  financialStatus,
  type PaymentTerms,
  reminderMilestones,
} from "../_shared/business-financials.ts";
import { requireRelease2Staff, serviceRows } from "../_shared/release2-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const STRIPE = Deno.env.get("STRIPE_SECRET_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("FROM_EMAIL") ||
  "Aligned Print & Scan <hello@alignedprintscan.com>";
const uuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v || "")) ? String(v) : "";
const clean = (v: unknown, n = 500) => String(v || "").trim().slice(0, n);
const terms = (v: unknown): PaymentTerms =>
  ["prepaid", "due_on_receipt", "net_15", "net_30"].includes(String(v))
    ? String(v) as PaymentTerms
    : "prepaid";

async function stripe(
  path: string,
  method = "POST",
  values: Record<string, string> = {},
  key?: string,
) {
  if (!STRIPE) throw new Error("Stripe business invoicing is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-07-29.dahlia",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: method === "GET" ? undefined : new URLSearchParams(values),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Stripe invoice operation failed.");
  }
  return data;
}
function requireBilling(staff: any) {
  if (
    !["owner", "administrator", "billing"].includes(String(staff.profile?.role))
  ) throw new Error("Authorized APS billing staff are required.");
}
async function audit(
  org: string,
  staff: any,
  type: string,
  key: string,
  invoice?: string,
  detail?: string,
  amount?: number,
) {
  await serviceRows("business_financial_events", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      organization_id: org,
      invoice_id: invoice || null,
      event_type: type,
      amount: amount ?? null,
      actor_type: "aps_staff",
      actor_user_id: staff.id,
      idempotency_key: key,
      customer_safe_detail: detail || null,
    }),
  });
}

const reminderCopy: Record<string, { subject: string; message: string }> = {
  due_on_receipt_day_3: {
    subject: "Friendly payment reminder",
    message: "This invoice remains due. Please review the current balance.",
  },
  due_on_receipt_day_7: {
    subject: "Second payment reminder",
    message: "This invoice remains unpaid and needs attention.",
  },
  due_soon: {
    subject: "Payment due soon",
    message: "This invoice is due in five days.",
  },
  due_today: {
    subject: "Payment due today",
    message: "This invoice is due today.",
  },
  past_due: {
    subject: "Payment past due",
    message: "This invoice has an outstanding past-due balance.",
  },
};

async function runReminders(staff: any) {
  if (!RESEND) throw new Error("Business reminder delivery is not configured.");
  const today = new Date().toISOString().slice(0, 10);
  const due = await serviceRows(
    `business_invoice_reminders?select=*&scheduled_for=lte.${today}&status=in.(pending,failed)&order=scheduled_for.asc&limit=100`,
  );
  let sent = 0, skipped = 0, failed = 0;
  for (const reminder of due) {
    const claimed = (await serviceRows(
      `business_invoice_reminders?id=eq.${reminder.id}&status=in.(pending,failed)`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "processing" }),
      },
    ))[0];
    if (!claimed) {
      skipped += 1;
      continue;
    }
    try {
      const invoice = (await serviceRows(
        `invoices?select=*&id=eq.${reminder.invoice_id}&limit=1`,
      ))[0];
      if (
        !invoice || Number(invoice.balance_due || 0) <= 0 ||
        ["paid", "void", "voided", "cancelled"].includes(
          String(invoice.status),
        )
      ) {
        await serviceRows(`business_invoice_reminders?id=eq.${reminder.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        });
        skipped += 1;
        continue;
      }
      const organization = (await serviceRows(
        `organizations?select=*&id=eq.${invoice.organization_id}&limit=1`,
      ))[0];
      const recipient = clean(
        organization?.billing_contact_email || organization?.primary_email,
        320,
      );
      if (!recipient) throw new Error("Organization billing email is missing.");
      const copy = reminderCopy[reminder.milestone];
      if (!copy) throw new Error("Unsupported reminder milestone.");
      const subject = `${copy.subject}: ${invoice.invoice_number}`;
      const message =
        `${copy.message} Invoice ${invoice.invoice_number} has a current balance of USD ${
          Number(invoice.balance_due).toFixed(2)
        }. Sign in to the APS Business Portal to review the authoritative ledger and payment options.`;
      const providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `business-reminder/${reminder.id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [recipient],
          subject,
          text: message,
        }),
      });
      const provider = await providerResponse.json().catch(() => ({}));
      if (!providerResponse.ok) {
        throw new Error(
          provider.message || "Reminder provider rejected delivery.",
        );
      }
      const communication = (await serviceRows("request_communications", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: invoice.service_request_id,
          direction: "outbound",
          channel: "email",
          subject,
          message,
          delivery_status: "sent",
          provider_message_id: provider.id || null,
          metadata: {
            business_invoice_id: invoice.id,
            reminder_id: reminder.id,
            milestone: reminder.milestone,
          },
        }),
      }))[0];
      await serviceRows("request_timeline_events", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: invoice.service_request_id,
          event_type: "business_payment_reminder_sent",
          title: copy.subject,
          detail: `${invoice.invoice_number} reminder logged by APS.`,
          actor_type: "admin",
          visibility: "internal",
          metadata: {
            reminder_id: reminder.id,
            communication_id: communication.id,
          },
        }),
      });
      await serviceRows(`business_invoice_reminders?id=eq.${reminder.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "sent",
          sent_at: new Date().toISOString(),
          communication_id: communication.id,
        }),
      });
      await audit(
        invoice.organization_id,
        staff,
        "payment_reminder_sent",
        `business-reminder:${reminder.id}`,
        invoice.id,
        `${copy.subject} sent for ${invoice.invoice_number}.`,
      );
      sent += 1;
    } catch (error) {
      await serviceRows(`business_invoice_reminders?id=eq.${reminder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed" }),
      }).catch(() => null);
      failed += 1;
    }
  }
  return { ok: true, evaluated: due.length, sent, skipped, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json() as Record<string, unknown>,
      command = clean(body.command, 60),
      staff = await requireRelease2Staff(req);
    requireBilling(staff);
    if (command === "run_reminders") return json(await runReminders(staff));
    if (command === "create") {
      const organizationId = uuid(body.organization_id),
        requestId = uuid(body.request_id),
        items = Array.isArray(body.items) ? body.items as any[] : [];
      if (!organizationId || !requestId || !items.length) {
        throw new Error("Organization, request, and line items are required.");
      }
      const organization = (await serviceRows(
        `organizations?select=*&id=eq.${organizationId}&status=eq.active&limit=1`,
      ))[0];
      const request = (await serviceRows(
        `service_requests?select=id,organization_id&id=eq.${requestId}&organization_id=eq.${organizationId}&limit=1`,
      ))[0];
      if (!organization || !request) {
        throw new Error("The active organization request was not found.");
      }
      const normalized = items.map((item: any, index) => ({
        description: clean(item.description, 300),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unit_price: Number(item.unit_price || 0),
        sort_order: index,
      }));
      if (
        normalized.some((i) =>
          !i.description || !Number.isFinite(i.unit_price) || i.unit_price < 0
        )
      ) throw new Error("Valid non-negative APS line items are required.");
      const total = Number(
        normalized.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
          .toFixed(2),
      );
      if (total <= 0) {
        throw new Error("Invoice total must be greater than zero.");
      }
      const snapshot = terms(organization.payment_terms),
        issued = new Date().toISOString(),
        due = dueDate(issued, snapshot),
        key = clean(body.idempotency_key, 180) ||
          `business-invoice:${organizationId}:${requestId}:${crypto.randomUUID()}`;
      const existing = (await serviceRows(
        `business_financial_events?select=invoice_id&idempotency_key=eq.${
          encodeURIComponent(key)
        }&limit=1`,
      ))[0];
      if (existing?.invoice_id) {
        return json({
          ok: true,
          duplicate: true,
          invoice_id: existing.invoice_id,
        });
      }
      const number = clean(body.invoice_number, 80) ||
        `APS-BIZ-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${
          requestId.slice(0, 8).toUpperCase()
        }`;
      const invoice = (await serviceRows("invoices", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          organization_id: organizationId,
          invoice_number: number,
          invoice_type: "business",
          status: "draft",
          amount_due: total,
          amount_paid: 0,
          paid_amount: 0,
          balance_due: total,
          payment_status: "unpaid",
          payment_terms: snapshot,
          issued_at: issued,
          due_at: due,
          financial_status: "authorized_pending_finalization",
          currency: "usd",
          note: clean(body.note, 2000) || null,
        }),
      }))[0];
      await serviceRows("invoice_items", {
        method: "POST",
        body: JSON.stringify(
          normalized.map((i) => ({
            ...i,
            invoice_id: invoice.id,
            service_request_id: requestId,
            line_total: Number((i.quantity * i.unit_price).toFixed(2)),
            taxable: false,
          })),
        ),
      });
      await audit(
        organizationId,
        staff,
        "invoice_created",
        key,
        invoice.id,
        `${number} created as an APS draft.`,
        total,
      );
      return json({
        ok: true,
        invoice: { ...invoice, payment_terms: snapshot, due_at: due },
      });
    }
    if (command === "finalize") {
      const invoiceId = uuid(body.invoice_id),
        invoice = (await serviceRows(
          `invoices?select=*&id=eq.${invoiceId}&invoice_type=eq.business&limit=1`,
        ))[0];
      if (!invoice) throw new Error("Business invoice not found.");
      if (invoice.stripe_invoice_id) {
        return json({ ok: true, duplicate: true, invoice });
      }
      const organization = (await serviceRows(
          `organizations?select=*&id=eq.${invoice.organization_id}&limit=1`,
        ))[0],
        items = await serviceRows(
          `invoice_items?select=*&invoice_id=eq.${invoice.id}&order=sort_order.asc`,
        );
      if (!organization || !items.length) {
        throw new Error(
          "Authoritative organization invoice data is incomplete.",
        );
      }
      let customerId = organization.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe("customers", "POST", {
          name: organization.organization_name,
          email: organization.billing_contact_email ||
            organization.primary_email || "",
          "metadata[aps_organization_id]": organization.id,
        }, `aps-org:${organization.id}`);
        customerId = customer.id;
        await serviceRows(`organizations?id=eq.${organization.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          }),
        });
      }
      for (const item of items) {
        await stripe("invoiceitems", "POST", {
          customer: customerId,
          currency: "usd",
          amount: String(Math.round(Number(item.line_total || 0) * 100)),
          description: item.description,
          "metadata[aps_invoice_id]": invoice.id,
        }, `aps-invoice-item:${item.id}`);
      }
      const dayCount = invoice.payment_terms === "net_15"
        ? "15"
        : invoice.payment_terms === "net_30"
        ? "30"
        : "0";
      const created = await stripe("invoices", "POST", {
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: dayCount,
        auto_advance: "false",
        description: invoice.note || "APS Business Invoice",
        "metadata[aps_invoice_id]": invoice.id,
        "metadata[aps_invoice_number]": invoice.invoice_number,
        "metadata[aps_organization_id]": organization.id,
        "metadata[aps_request_id]": invoice.service_request_id,
      }, `aps-invoice:${invoice.id}`);
      const finalized = await stripe(
        `invoices/${created.id}/finalize`,
        "POST",
        { auto_advance: "false" },
        `aps-invoice-finalize:${invoice.id}`,
      );
      const update = {
        status: "open",
        stripe_invoice_id: finalized.id,
        stripe_customer_id: customerId,
        stripe_hosted_invoice_url: finalized.hosted_invoice_url || null,
        stripe_invoice_pdf_url: finalized.invoice_pdf || null,
        stripe_status: finalized.status,
        provider_updated_at: new Date().toISOString(),
      };
      update["financial_status" as keyof typeof update] = financialStatus({
        ...invoice,
        ...update,
      });
      const saved = (await serviceRows(`invoices?id=eq.${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      }))[0];
      for (
        const [milestone, scheduled] of reminderMilestones(
          invoice.issued_at,
          invoice.due_at,
          invoice.payment_terms,
        )
      ) {
        await serviceRows("business_invoice_reminders", {
          method: "POST",
          headers: {
            Prefer: "resolution=ignore-duplicates,return=representation",
          },
          body: JSON.stringify({
            invoice_id: invoice.id,
            milestone,
            scheduled_for: scheduled,
          }),
        });
      }
      await audit(
        organization.id,
        staff,
        "invoice_finalized",
        `invoice:${invoice.id}:finalized`,
        invoice.id,
        `${invoice.invoice_number} finalized and hosted by Stripe.`,
        Number(invoice.amount_due),
      );
      return json({ ok: true, invoice: saved });
    }
    throw new Error("Supported business invoice command is required.");
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
