# Aligned Print & Scan — Official Pass 2

## Scope

- Removed duplicate generic notarial-act quick items.
- Added named Texas notarial acts: Acknowledgment, Jurat, Oath or Affirmation,
  Certified Copy (when authorized), and Additional Notarial Act.
- Grouped invoice quick items by Remote Online Notary, Texas Notarial Acts,
  Mobile Notary, Print & Scan, Courier, and Other.
- Corrected Color Legal pricing to $0.60.
- Added line totals and readable labels to each invoice row.
- Fixed unreadable admin button text with explicit button hierarchy styles.
- Added offline and simulated test-payment recording without charging Stripe.
- Added separate workflow, payment, and appointment state columns.
- Added immediate request/list/metric refresh after payment actions.
- Standardized customer-facing navigation terminology to “Print & Scan.”
- Added non-stacking desktop navigation rules and responsive behavior.
- Reformatted and commented every file functionally changed in this pass.

## Deferred to Official Pass 3

- Complete Admin Portal v2 split-view visual rebuild.
- Full customer status portal redesign.
- Live Proof API integration.
- Reports, analytics, and staff-role administration.

## Recommended Git commit

```bash
git commit -m "Official Pass 2: invoice presets payment testing and navigation consistency"
```

## Suggested pull-request summary

Official Pass 2 cleans the invoice item library, introduces named notarial acts,
adds safe simulated/offline payment testing, separates payment state from workflow
state, corrects public navigation consistency, and improves code readability.
