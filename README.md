# Aligned Print & Scan Premium Site v3

This version includes a premium, guided intake experience for:

- Remote Online Notary (RON)
- Mobile Notary
- Print & Scan / Document Support

## Key updates

- Wizard-style request flow with progress bar
- Service tabs for RON, Mobile Notary, and Print & Scan
- Conditional sections so only relevant fields appear
- Separate first and last name fields
- Service address only appears when mobile service or delivery applies
- Print/scan pricing retained and framed as starting rates
- Medical handling language removed
- Rush/same-day language removed and replaced with priority/standard scheduling language
- Preferred time window dropdown from 8–9 AM through 10–11 PM
- Branded success page after submission
- Front-end estimate logic by service path

## Important integration note

The request flow is front-end ready. To make it live, connect the submit event in `assets/js/script.js` to your backend workflow, such as:

- Supabase for request storage and file metadata
- Supabase Storage for uploads
- Resend for confirmation emails and internal notifications
- Stripe for payment links or checkout
- Google Maps API for delivery/service distance estimates


V5 updates:
- Added mobile/travel fee and print preparation payment language.
- Added deposit/dispatch policy language to Terms and Pricing.
- Removed pickup by appointment fulfillment option.
- Changed “Colored Paper” to “Color Paper”.
- Added AUTOMATION_AND_PAYMENT_WORKFLOW.md with Resend, Supabase, Stripe, Twilio, and RON setup guidance.


## Private Admin Dashboard

This build includes a private admin area:

- `admin-login.html`
- `admin-dashboard.html`
- `ADMIN_DASHBOARD_SETUP.md`

Use the setup guide before logging in. The dashboard uses Supabase Auth, Row Level Security policies, Supabase Storage signed links, and Supabase Realtime alerts.
