-- LOCAL fixture execution is authorized. PRODUCTION execution requires separate
-- approval of this exact script/hash, target, lock budget and maintenance window.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
DO $$ BEGIN
 IF to_regclass('public.promotion_programs') IS NOT NULL THEN
   RAISE EXCEPTION 'Neighborhood objects already exist; inspect migration state, do not replay';
 END IF;
END $$;
\ir ../supabase/migrations/20261016032854_neighborhood_pricing_program.sql
\ir ../supabase/migrations/20261016045905_neighborhood_review_hardening.sql
\ir ../supabase/migrations/20261016092536_neighborhood_atomic_conversion.sql
\ir ../supabase/migrations/20261016101212_neighborhood_financial_history_integrity.sql
\ir ../supabase/migrations/20261016124235_neighborhood_reconciliation_retry_safety.sql
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('guard_neighborhood_quote','guard_neighborhood_quote_status','sync_promotion_review_queue','guard_issued_promotion_items','guard_promotion_primary_invoice','snapshot_review_payments') AND NOT tgisinternal)<>6 THEN
   RAISE EXCEPTION 'Expected six neighborhood triggers';
 END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgname='aa_serialize_neighborhood_finance' AND NOT tgisinternal)<>5 THEN RAISE EXCEPTION 'Financial serialization triggers missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.promotion_programs'::regclass,'public.request_promotion_applications'::regclass,'public.request_pricing_reviews'::regclass) AND NOT relrowsecurity) THEN
   RAISE EXCEPTION 'Neighborhood RLS missing';
 END IF;
 IF has_function_privilege('anon','public.aps_resolve_pricing_adjustment(uuid,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous resolver access'; END IF;
 IF has_function_privilege('anon','public.aps_convert_neighborhood_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous conversion access'; END IF;
 IF NOT has_function_privilege('authenticated','public.aps_resolve_pricing_adjustment(uuid,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Authenticated resolver missing'; END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
 IF to_regclass('public.promotion_programs') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='snapshot_review_payments') THEN
   RAISE EXCEPTION 'Rollback did not remove neighborhood objects';
 END IF;
END $$;
