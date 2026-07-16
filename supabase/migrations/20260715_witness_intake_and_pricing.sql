-- Aligned Print & Scan — witness intake support and pricing-ready fields.
-- Run once in Supabase SQL Editor before deploying the updated intake form.

ALTER TABLE ron_requests ADD COLUMN IF NOT EXISTS witness_need text DEFAULT 'no';
ALTER TABLE ron_requests ADD COLUMN IF NOT EXISTS witness_count text;
ALTER TABLE ron_requests ADD COLUMN IF NOT EXISTS witness_provider text;
ALTER TABLE ron_requests ADD COLUMN IF NOT EXISTS client_witness_count integer DEFAULT 0;
ALTER TABLE ron_requests ADD COLUMN IF NOT EXISTS provided_witness_count integer DEFAULT 0;
ALTER TABLE ron_requests ADD COLUMN IF NOT EXISTS witness_review_required boolean DEFAULT false;

ALTER TABLE mobile_notary_requests ADD COLUMN IF NOT EXISTS witness_need text DEFAULT 'no';
ALTER TABLE mobile_notary_requests ADD COLUMN IF NOT EXISTS witness_count text;
ALTER TABLE mobile_notary_requests ADD COLUMN IF NOT EXISTS witness_provider text;
ALTER TABLE mobile_notary_requests ADD COLUMN IF NOT EXISTS client_witness_count integer DEFAULT 0;
ALTER TABLE mobile_notary_requests ADD COLUMN IF NOT EXISTS provided_witness_count integer DEFAULT 0;
ALTER TABLE mobile_notary_requests ADD COLUMN IF NOT EXISTS witness_review_required boolean DEFAULT false;

COMMENT ON COLUMN ron_requests.provided_witness_count IS 'Remote witnesses Aligned Print & Scan is expected to provide; pricing currently $25 each.';
COMMENT ON COLUMN mobile_notary_requests.provided_witness_count IS 'Mobile witnesses Aligned Print & Scan is expected to provide; pricing currently $50 each.';
