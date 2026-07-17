# Official Pass 3 — Deployment Guide

## 1. Work from the cloned Git repository

```bash
cd ~/Downloads/alignedprintscan-production
git status
git checkout main
git pull origin main
git checkout -b feature/official-pass-3
```

## 2. Back up the current working folder

```bash
cd ~/Downloads
cp -R alignedprintscan-production alignedprintscan-production-before-pass-3
cd alignedprintscan-production
```

## 3. Copy Pass 3 files into the repository

After extracting the Pass 3 ZIP, copy its project contents into the cloned repository. Replace the source path below with the actual extracted path.

```bash
rsync -av --exclude='.git' \
  ~/Downloads/alignedprintscan-official-pass-3/alignedprintscan-production-main/ \
  ~/Downloads/alignedprintscan-production/
```

## 4. Review the exact changes

```bash
cd ~/Downloads/alignedprintscan-production
git status
git diff --stat
git diff -- admin-dashboard.html
git diff -- assets/js/admin.js
git diff -- supabase/functions/record-admin-payment/index.ts
```

## 5. Deploy the corrected payment function

Pass 3 does not add a new database migration. It updates the existing payment Edge Function.

```bash
supabase link --project-ref sfsdniavqldgbiretply
supabase functions deploy record-admin-payment
```

The existing `update-request-status` function does not need to be redeployed unless it has local uncommitted changes from a prior pass.

## 6. Run locally

```bash
python3 -m http.server 8000
```

Open these URLs in the browser:

- `http://localhost:8000/admin-dashboard.html`
- `http://localhost:8000/pricing.html`
- A valid customer status URL for embedded checkout spacing review.

Press `Control + C` in Terminal when testing is finished.

## 7. Required admin portal tests

1. Sign in and confirm the request queue loads.
2. Select a request and confirm the right workspace opens.
3. Confirm the header shows reference, client, service, and status.
4. Open each workspace tab.
5. Confirm existing invoice, appointment, document, and status controls still work.
6. Confirm button text remains visible.
7. Confirm request search filters the queue.
8. Confirm the sidebar collapses at tablet width.
9. Confirm selecting a request opens the workspace on mobile.

## 8. Required payment regression tests

### Invoice #1

1. Open a request with an unpaid initial invoice.
2. Click `Payment Received`.
3. Enter the exact remaining invoice amount.
4. Enter payment method `test`.
5. Confirm Invoice #1 displays Paid.
6. Confirm no Stripe transaction is created.

### Invoice #2

1. Issue a final balance invoice.
2. Confirm the invoice displays Final Balance Due.
3. Click `Final Payment Received`.
4. Enter the exact final invoice balance.
5. Enter payment method `test`.
6. Confirm Invoice #2 displays Paid.
7. Confirm its remaining balance is zero.
8. Confirm the request-level balance is zero.
9. Confirm the request may then be marked Completed.

### Completion protection

1. Open a request with an unpaid invoice.
2. Click Completed.
3. Confirm the system blocks completion and opens the Payments tab.

## 9. Required pricing tests

- Public pricing displays Color Letter, Double-Sided at `$0.60/page`.
- Guided estimate uses `$0.60/page`.
- No remaining functional `$0.65/page` value appears.

Search the code:

```bash
grep -R "0.65/page\|rate = 0.65" -n pricing.html assets/js
```

The command should return no results.

## 10. Commit and push

```bash
git add \
  admin-dashboard.html \
  pricing.html \
  assets/css/admin-v3.css \
  assets/css/styles.css \
  assets/js/admin.js \
  assets/js/admin-v3.js \
  assets/js/script.js \
  supabase/functions/record-admin-payment/index.ts \
  OFFICIAL_PASS_3_SCOPE_AND_CHANGELOG.md \
  OFFICIAL_PASS_3_DEPLOYMENT_GUIDE.md

git commit -m "Official Pass 3: rebuild admin workspace and synchronize invoice payments"
git push -u origin feature/official-pass-3
```

## 11. Preview before production

Use the Vercel preview deployment created from the feature branch. Repeat all tests in sections 7–9 before merging.

## 12. Merge after approval

```bash
git checkout main
git pull origin main
git merge --no-ff feature/official-pass-3
git push origin main
```

## Rollback

If the production interface has a blocking issue:

```bash
git revert <PASS_3_MERGE_COMMIT_HASH>
git push origin main
```

The Supabase function can be restored by checking out the previous function file and redeploying `record-admin-payment`.
