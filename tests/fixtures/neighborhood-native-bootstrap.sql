\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'aps_pr159_revision_fixture' THEN RAISE EXCEPTION 'Synthetic fixture database required'; END IF; END $$;
create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$; create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;
\ir neighborhood-schema.sql
create table ron_requests(id uuid primary key default gen_random_uuid(),service_request_id uuid,number_of_signers integer,number_of_notarizations integer,witness_review_required boolean,witness_count text);create table proof_transactions(id uuid primary key default gen_random_uuid(),service_request_id uuid,aps_status text);
\ir ../../supabase/migrations/20261016032854_neighborhood_pricing_program.sql
\ir ../../supabase/migrations/20261016045905_neighborhood_review_hardening.sql
\ir ../../supabase/migrations/20261016092536_neighborhood_atomic_conversion.sql
\ir ../../supabase/migrations/20261016101212_neighborhood_financial_history_integrity.sql
\ir ../../supabase/migrations/20261016124235_neighborhood_reconciliation_retry_safety.sql
\ir ../../supabase/migrations/20261016152822_neighborhood_paid_conversion.sql
\ir neighborhood-native-financial.sql
