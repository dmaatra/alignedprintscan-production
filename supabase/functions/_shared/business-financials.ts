export type PaymentTerms = "prepaid" | "due_on_receipt" | "net_15" | "net_30";

export function dueDate(issueDate: string | Date, terms: PaymentTerms) {
  const date = new Date(issueDate);
  const days = terms === "net_15" ? 15 : terms === "net_30" ? 30 : 0;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function financialStatus(
  invoice: Record<string, unknown>,
  now = new Date(),
) {
  const status = String(invoice.status || "").toLowerCase();
  const terms = String(invoice.payment_terms || "prepaid") as PaymentTerms;
  const amount = Number(invoice.amount_due || 0);
  const paid = Number(invoice.amount_paid ?? invoice.paid_amount ?? 0);
  const refunded = Number(invoice.refunded_amount || 0);
  const balance = Math.max(0, amount - paid);
  if (["void", "voided", "cancelled"].includes(status)) return "voided";
  if (refunded > 0 && refunded + 0.009 >= paid) return "refunded";
  if (refunded > 0) return "partially_refunded";
  if (balance <= 0.009 && amount > 0) return "paid";
  if (paid > 0) return "partially_paid";
  if (String(invoice.stripe_status || "") === "uncollectible") {
    return "payment_failed";
  }
  if (["draft", "pending"].includes(status)) {
    return "authorized_pending_finalization";
  }
  if (terms === "prepaid") return "prepayment_required";
  const due = invoice.due_at ? new Date(String(invoice.due_at)) : null;
  if (due) {
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const dueDay = Date.UTC(
      due.getUTCFullYear(),
      due.getUTCMonth(),
      due.getUTCDate(),
    );
    const days = Math.round((dueDay - today) / 86400000);
    if (days < 0) return "past_due";
    if (days === 0) return "due_today";
    if (days <= 5) return "due_soon";
  }
  return terms === "due_on_receipt"
    ? "open_due_on_receipt"
    : terms === "net_15"
    ? "open_net_15"
    : "open_net_30";
}

export function servicePaymentGate(terms: PaymentTerms, balance: number) {
  return terms === "prepaid" && balance > 0.009;
}

export function reminderMilestones(
  issue: string,
  due: string,
  terms: PaymentTerms,
) {
  const issueDate = new Date(issue), dueDateValue = new Date(due);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (terms === "due_on_receipt") {
    return [
      [
        "due_on_receipt_day_3",
        iso(new Date(issueDate.getTime() + 3 * 86400000)),
      ],
      [
        "due_on_receipt_day_7",
        iso(new Date(issueDate.getTime() + 7 * 86400000)),
      ],
    ];
  }
  return [
    ["due_soon", iso(new Date(dueDateValue.getTime() - 5 * 86400000))],
    ["due_today", iso(dueDateValue)],
    ["past_due", iso(new Date(dueDateValue.getTime() + 86400000))],
  ];
}
