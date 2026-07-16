# Official Pass 1 — Deployment and Testing Steps

## 1. Create a protected branch

```bash
cd /path/to/alignedprintscan-production
git checkout main
git pull origin main
git checkout -b feature/official-pass-1-revised
```

## 2. Back up environment and database

Do not commit `.env` files or Supabase service-role keys. Create a Supabase database backup from the project dashboard before applying migrations.

## 3. Extract and copy the package

```bash
mkdir -p ~/Desktop/aligned-pass-1
unzip ~/Downloads/alignedprintscan-official-pass-1-revised.zip   -d ~/Desktop/aligned-pass-1

rsync -av --exclude='.git'   ~/Desktop/aligned-pass-1/alignedprintscan-production-main/   /path/to/alignedprintscan-production/
```

## 4. Review the diff before running SQL

```bash
cd /path/to/alignedprintscan-production
git status
git diff --stat
git diff -- faq.html terms.html pricing.html
git diff -- assets/js/pricing-config.js assets/js/script.js assets/js/admin.js
git diff -- supabase/migrations/
```

Large diffs in touched HTML/JS files are expected because those files were reformatted for readability.

## 5. Apply the Supabase migrations

### CLI option

```bash
supabase link --project-ref sfsdniavqldgbiretply
supabase db push
```

### SQL Editor option

Run these files in order:

1. `supabase/migrations/20260715_witness_intake_and_pricing.sql`
2. `supabase/migrations/20260716_official_pass_1_invoice_safeguards.sql`

Both migrations use `IF NOT EXISTS` where applicable.

## 6. Deploy updated Edge Function

```bash
supabase functions deploy create-additional-invoice
```

If other function files differ from production, deploy only after reviewing their diffs.

## 7. Local or preview testing

```bash
python3 -m http.server 8000
```

Open:

- `http://localhost:8000/pricing.html#request`
- `http://localhost:8000/faq.html`
- `http://localhost:8000/terms.html`
- `http://localhost:8000/admin-dashboard.html`

## 8. Required request-form tests

1. RON with one notarial act and no witness → $35 estimate.
2. RON with two notarial acts → $45 estimate.
3. RON with one Aligned Print & Scan witness → add $25.
4. RON witness “Not sure” → no fee, manual-review flag.
5. Mobile with customer-provided witness → no witness fee.
6. Mobile with one Aligned Print & Scan witness → add $50.
7. Shared witness responsibility → correct provided counts.
8. Confirm new witness fields are saved in Supabase.

## 9. Required invoice regression test

Use a non-production test request.

1. Create and save Invoice #1.
2. Record or simulate initial payment activity.
3. Confirm the initial invoice builder is locked.
4. Issue Invoice #2 through “Issue Final Balance Invoice.”
5. Confirm Invoice #1 amount and line items are unchanged.
6. Confirm Invoice #2 has its own `invoices` row and `invoice_items` rows.
7. Confirm total paid and remaining balance display correctly.

Useful SQL verification:

```sql
SELECT
  sr.id,
  sr.quote_amount,
  sr.full_quote_amount,
  sr.initial_payment_amount,
  sr.paid_amount,
  i.id AS invoice_id,
  i.invoice_number,
  i.invoice_type,
  i.status,
  i.amount_due,
  i.amount_paid
FROM service_requests sr
LEFT JOIN invoices i
  ON i.service_request_id = sr.id
WHERE sr.id = 'REPLACE_WITH_TEST_REQUEST_ID'
ORDER BY i.created_at;
```

```sql
SELECT
  invoice_id,
  description,
  quantity,
  unit_price,
  line_total
FROM invoice_items
WHERE service_request_id = 'REPLACE_WITH_TEST_REQUEST_ID'
ORDER BY invoice_id NULLS FIRST, sort_order, created_at;
```

## 10. Commit and push

```bash
git add .
git commit -m "Official Pass 1: pricing witnesses invoice safeguards policies and formatting"
git push -u origin feature/official-pass-1-revised
```

## 11. Vercel preview review

Test the branch preview before merging. Submit test requests only with clearly marked test customer information.

## 12. Merge after approval

```bash
git checkout main
git pull origin main
git merge --no-ff feature/official-pass-1-revised
git push origin main
```

## Rollback

If the preview or production checks fail:

```bash
git revert <merge_commit_sha>
git push origin main
```

The migrations are additive. Do not drop columns during rollback; revert application code first, then assess database cleanup separately.
