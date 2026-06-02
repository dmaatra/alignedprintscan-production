-- Aligned Print & Scan v18.4 — Workflow v2 financial fields
-- Adds separate full-service quote and initial-payment amount fields so
-- Invoice #1 can be upfront/dispatch only while the quote can reflect the full service value.

ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS full_quote_amount numeric DEFAULT 0;

ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS initial_payment_amount numeric DEFAULT 0;

-- Backfill from existing quote data where needed.
UPDATE service_requests
SET full_quote_amount = COALESCE(NULLIF(full_quote_amount, 0), quote_amount, estimated_total, 0)
WHERE COALESCE(full_quote_amount, 0) = 0;

UPDATE service_requests
SET initial_payment_amount = COALESCE(NULLIF(initial_payment_amount, 0), quote_amount, estimated_total, 0)
WHERE COALESCE(initial_payment_amount, 0) = 0;
