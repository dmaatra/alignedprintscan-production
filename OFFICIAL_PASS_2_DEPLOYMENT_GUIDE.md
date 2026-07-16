# Official Pass 2 Deployment Guide

## 1. Create a branch

```bash
cd /path/to/alignedprintscan-production
git checkout main
git pull origin main
git checkout -b feature/official-pass-2
```

## 2. Copy the Pass 2 files

Extract the package and copy the project contents into the repository. Review the
Git diff before continuing.

```bash
git status
git diff --stat
```

## 3. Run the SQL migration

```bash
supabase link --project-ref sfsdniavqldgbiretply
supabase db push
```

The new migration is:

```text
supabase/migrations/20260716_official_pass_2_payment_testing.sql
```

## 4. Deploy the new payment test function

Run this command from the project root—the directory containing `supabase/`:

```bash
supabase functions deploy record-admin-payment
```

Do not run the command from your home directory.

## 5. Local test

```bash
python3 -m http.server 8000
```

Open these URLs in your browser:

- `http://localhost:8000/admin-dashboard.html`
- `http://localhost:8000/pricing.html#request`

## 6. Required acceptance tests

1. Add Online Notarization Service Fee + Acknowledgment; total is $35.
2. Add Jurat; total increases by $10.
3. Add Remote Witness; total increases by $25.
4. Confirm there are no duplicate generic “Notarial Act” entries.
5. Confirm Color Legal is $0.60.
6. Confirm every invoice row shows Qty, Rate, and Amount.
7. Click Payment Received and record a `test` payment.
8. Confirm no Stripe charge is created.
9. Confirm paid amount, balance due, request badge, metrics, and timeline refresh.
10. Click Final Payment Received and record the remaining test balance.
11. Confirm payment state becomes `paid_in_full` and balance becomes $0.
12. Confirm public navigation says Print & Scan and does not stack on desktop.

## 7. Commit and push

```bash
git add .
git commit -m "Official Pass 2: invoice presets payment testing and navigation consistency"
git push -u origin feature/official-pass-2
```

Test the Vercel preview deployment before merging to `main`.
