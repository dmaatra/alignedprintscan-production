-- Adds columns required by the customer status/success page and embedded payment flow.
alter table service_requests
add column if not exists invoice_status text default 'draft',
add column if not exists invoice_due_at timestamptz,
add column if not exists stripe_checkout_session_id text,
add column if not exists stripe_payment_intent_id text,
add column if not exists stripe_client_secret text,
add column if not exists payment_link_url text,
add column if not exists invoice_pdf_url text,
add column if not exists receipt_pdf_url text,
add column if not exists paid_amount numeric;
