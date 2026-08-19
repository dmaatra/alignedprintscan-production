import { assertEquals } from "jsr:@std/assert@1";
import {
  dueDate,
  financialStatus,
  reminderMilestones,
  servicePaymentGate,
} from "./business-financials.ts";

Deno.test("business due dates snapshot calendar terms", () => {
  assertEquals(
    dueDate("2026-08-20T12:00:00Z", "due_on_receipt"),
    "2026-08-20T12:00:00.000Z",
  );
  assertEquals(
    dueDate("2026-08-20T12:00:00Z", "net_15"),
    "2026-09-04T12:00:00.000Z",
  );
  assertEquals(
    dueDate("2026-08-20T12:00:00Z", "net_30"),
    "2026-09-19T12:00:00.000Z",
  );
});
Deno.test("financial states derive from authoritative amounts and dates", () => {
  const now = new Date("2026-09-04T15:00:00Z"),
    base = {
      status: "open",
      amount_due: 1000,
      amount_paid: 0,
      payment_terms: "net_15",
      due_at: "2026-09-04T12:00:00Z",
    };
  assertEquals(financialStatus(base, now), "due_today");
  assertEquals(
    financialStatus({ ...base, due_at: "2026-09-03T12:00:00Z" }, now),
    "past_due",
  );
  assertEquals(
    financialStatus({ ...base, due_at: "2026-09-08T12:00:00Z" }, now),
    "due_soon",
  );
  assertEquals(
    financialStatus({ ...base, amount_paid: 400 }, now),
    "partially_paid",
  );
  assertEquals(financialStatus({ ...base, amount_paid: 1000 }, now), "paid");
  assertEquals(
    financialStatus({ ...base, amount_paid: 1000, refunded_amount: 300 }, now),
    "partially_refunded",
  );
  assertEquals(
    financialStatus({ ...base, amount_paid: 1000, refunded_amount: 1000 }, now),
    "refunded",
  );
});
Deno.test("only prepaid balances gate service completion", () => {
  assertEquals(servicePaymentGate("prepaid", 100), true);
  for (const term of ["due_on_receipt", "net_15", "net_30"] as const) {
    assertEquals(servicePaymentGate(term, 100), false);
  }
});
Deno.test("reminder milestones are deterministic and duplicate-safe", () => {
  assertEquals(
    reminderMilestones(
      "2026-08-20T00:00:00Z",
      "2026-09-04T00:00:00Z",
      "net_15",
    ),
    [["due_soon", "2026-08-30"], ["due_today", "2026-09-04"], [
      "past_due",
      "2026-09-05",
    ]],
  );
  assertEquals(
    reminderMilestones(
      "2026-08-20T00:00:00Z",
      "2026-08-20T00:00:00Z",
      "due_on_receipt",
    ),
    [["due_on_receipt_day_3", "2026-08-23"], [
      "due_on_receipt_day_7",
      "2026-08-27",
    ]],
  );
});
