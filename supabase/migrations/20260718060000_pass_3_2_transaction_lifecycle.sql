-- Aligned Print & Scan — Official Pass 3.2 transaction lifecycle stabilization.
--
-- Adds the invoice/request balance fields used by both Stripe and manually
-- recorded payments. The migration is additive and safe to run more than once.

alter table if exists public.invoices
  add column if not exists payment_status text default 'unpaid',
  add column if not exists balance_due numeric default 0;

alter table if exists public.service_requests
  add column if not exists balance_due numeric default 0;

-- Backfill invoice balances from the original amount and any recorded payment.
update public.invoices
set balance_due = greatest(
  0,
  coalesce(amount_due, 0) - coalesce(amount_paid, paid_amount, 0)
)
where balance_due is null
   or balance_due = 0;

-- Keep request balances usable for existing requests. The application performs
-- the authoritative recalculation whenever a payment is recorded.
update public.service_requests
set balance_due = greatest(
  0,
  coalesce(full_quote_amount, quote_amount, estimated_total, 0)
  - coalesce(paid_amount, 0)
)
where balance_due is null;

create index if not exists invoices_request_type_status_idx
  on public.invoices(service_request_id, invoice_type, status);

create index if not exists request_payments_invoice_id_idx
  on public.request_payments(invoice_id);
