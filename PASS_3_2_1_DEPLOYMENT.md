# Aligned Print & Scan — Pass 3.2.1

## Included
- Correct witness allocation by provider.
- Clear admin witness labels.
- Initial-payment button shown after approval for unpaid Invoice #1.
- `workflow_status` used before legacy `status` for payment visibility.
- Clear awaiting-payment wording.
- Payment action renamed **Continue to Secure Payment**.
- Existing witness allocations normalized.

## Files
- `assets/js/script.js`
- `assets/js/admin.js`
- `supabase/migrations/20260718073000_pass_3_2_1_witness_allocation.sql`

## Deploy
```bash
supabase link --project-ref sfsdniavqldgbiretply
supabase db push
```
No Edge Function deployment is required.
