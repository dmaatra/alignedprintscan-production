/**
 * Pass 3.2.1 — normalize existing witness allocations.
 */
update public.ron_requests
set client_witness_count = 0,
    provided_witness_count = case
      when witness_count::text ~ '^[0-9]+$' then witness_count::text::integer
      else coalesce(provided_witness_count, 0)
    end
where witness_provider = 'aligned';

update public.ron_requests
set client_witness_count = case
      when witness_count::text ~ '^[0-9]+$' then witness_count::text::integer
      else coalesce(client_witness_count, 0)
    end,
    provided_witness_count = 0
where witness_provider = 'client';

update public.mobile_notary_requests
set client_witness_count = 0,
    provided_witness_count = case
      when witness_count::text ~ '^[0-9]+$' then witness_count::text::integer
      else coalesce(provided_witness_count, 0)
    end
where witness_provider = 'aligned';

update public.mobile_notary_requests
set client_witness_count = case
      when witness_count::text ~ '^[0-9]+$' then witness_count::text::integer
      else coalesce(client_witness_count, 0)
    end,
    provided_witness_count = 0
where witness_provider = 'client';
