-- Aligned Print & Scan — Official Pass 1 invoice separation safeguards
-- This migration is additive and idempotent. It preserves Invoice #1 values
-- while allowing Invoice #2 and later invoices to remain separate records.

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS full_quote_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_payment_amount numeric DEFAULT 0;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type text DEFAULT 'initial';

CREATE INDEX IF NOT EXISTS invoices_service_request_id_idx
  ON invoices (service_request_id);

CREATE INDEX IF NOT EXISTS invoice_items_service_request_invoice_idx
  ON invoice_items (service_request_id, invoice_id);

-- Existing paid invoice rows are retained. No destructive update is performed.
-- The application now limits initial-quote edits to invoice_items where
-- invoice_id IS NULL, so final-balance line items are not deleted or replaced.
