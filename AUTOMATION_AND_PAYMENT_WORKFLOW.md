# Aligned Print & Scan — Automation, Email, Text & Payment Workflow

## Recommended Stack
- Supabase: request database + file storage
- Resend: branded email confirmations and internal alerts
- Stripe: deposits, print payments, RON payments, and remaining balances
- Twilio or Clerk/Resend SMS add-on: text updates
- RON platform: BlueNotary, Proof, OneNotary, or chosen provider booking/session link

## What Happens After a Request Is Sent
1. Client submits the guided request form.
2. Request is stored in Supabase with service type, estimate, uploaded file references, and client contact details.
3. Client is redirected to the branded success page.
4. Resend sends the client a “Request Received / Under Review” email.
5. Resend sends Aligned Print & Scan an internal request alert.
6. Optional Twilio SMS sends the client a short text confirmation.
7. Admin reviews the request.
8. Admin sends either a Stripe payment link, RON setup link, quote approval link, or follow-up questions.

## Mobile Notary Payment Rule
Mobile/travel fee is required before dispatch. Approved print preparation fees are also required before printing or before leaving. Remaining balance is collected on arrival only after the notary determines the notarial act can proceed.

## Print & Scan Payment Rule
Approved print fees are collected before printing, delivery, shipping/courier coordination, or mobile handoff begins. Pickup by appointment is not offered.

## RON Setup Flow
After request review, client receives:
- payment link if required
- RON platform link/instructions
- identity verification reminder
- camera/microphone/internet checklist
- document upload confirmation

## Client Email 1: Request Received / Under Review
Subject: We’ve received your Aligned Print & Scan request

Hello {{first_name}},

Thank you for submitting your request with Aligned Print & Scan. Your request has been received and is currently under review.

Request ID: {{request_id}}
Service Type: {{service_type}}
Estimated Total: {{estimate_total}}

We will review the details, uploaded files, appointment needs, and any requested add-ons before confirming next steps.

If your request includes mobile service, the mobile/travel fee may be required before dispatch. If your request includes print preparation, approved print fees are required before printing or delivery begins.

Thank you,
Aligned Print & Scan
Secure Document & Notary Solutions

## Client Email 2: RON Setup Instructions
Subject: Your Remote Online Notary next steps

Hello {{first_name}},

Your Remote Online Notary request has been reviewed. To prepare for your online notarization, please review the steps below:

1. Confirm your appointment time.
2. Have a valid government-issued photo ID ready.
3. Use a camera-enabled device with microphone access.
4. Join from a quiet, well-lit space with stable internet.
5. Use the secure RON platform link provided below.

RON Platform Link: {{ron_link}}

Please note that identity verification and session recording may be required under Texas Remote Online Notary rules.

Thank you,
Aligned Print & Scan

## SMS Confirmation Example
Aligned Print & Scan: We received your {{service_type}} request. Request ID {{request_id}} is under review. We’ll follow up with next steps shortly.

## Suggested Supabase Tables
- service_requests
- request_files
- customers
- payments
- message_logs

## Suggested Request Statuses
- received
- under_review
- awaiting_deposit
- awaiting_print_payment
- awaiting_ron_setup
- confirmed
- in_progress
- completed
- cancelled
