# Proof Integration Architecture

## Scope

**CONFIRMED IN CODE:** Phase 4.2 Increment 3 adds an administrator-only source-document lifecycle on top of the unapplied Increment 1 and 2 foundations. It selects and validates APS PDFs, retrieves private source bytes server-side, computes SHA-256, atomically claims uploads, uploads through the shared Proof transport, stores the APS-to-Proof mapping, refreshes processing metadata, and preserves ambiguous/manual-review states. It does not activate or invite signers, retrieve completed files, process webhooks, or alter APS payment/workflow state.

**CONFIRMED IN DOCUMENTATION:** APS remains the system of record for customers, orders, invoices/payments, scheduling, workflow, communications, the customer portal, and the admin dashboard. Proof is the RON integration engine and signer experience.

## Runtime boundary

The browser never receives Proof credentials and never calls Proof. The two admin functions accept a signed-in administrator's Supabase JWT, validate it through Supabase Auth, and authorize the user through `public.is_admin()`. They never accept a browser-supplied service-role credential. Both delegate to `ProofService`, and only the shared `ProofClient` may make authenticated provider HTTP requests.

The Proof configuration names are `PROOF_API_KEY`, `PROOF_API_BASE_URL`, and `PROOF_ENVIRONMENT`. They are Supabase Edge Function secrets/configuration read through `Deno.env` and provisioned outside Git. `production` is restricted to `https://api.proof.com/`; `fairfax` is restricted to `https://api.fairfax.proof.com/`. Other hosts, embedded credentials, ports, paths, query strings, fragments, and redirects are rejected. Configuration values are never logged.

The only Proof Edge Function directories are:

- `proof-admin-transaction`: approved draft lifecycle commands; all provider calls remain owner-gated until controlled testing is separately approved.
- `proof-admin-document`: approved source-document preparation, upload, processing refresh, and manual-review commands. Completed-document retrieval remains unavailable.
- `proof-webhook`: future provider HMAC entrypoint.

## Shared service layer

- `config.ts` loads and validates `PROOF_API_KEY`, `PROOF_API_BASE_URL`, and `PROOF_ENVIRONMENT`.
- `client.ts` is the only provider HTTP transport. It supports JSON and multipart bodies, Proof's `ApiKey` header, timeouts, safe read retries, and normalized failures.
- `service.ts` is the business-facing integration boundary for the four Increment 2 endpoints. Create and delete explicitly disable transport retries.
- `transaction-lifecycle.ts` owns readiness, database idempotency, reconciliation, status synchronization, deletion, and manual-review decisions.
- `status-map.ts` maps provider vocabulary to APS-owned status values and customer-safe labels. Raw provider values are internal only.
- `logger.ts` emits structured API request, response, retry, error, and idempotency events with sensitive fields redacted.
- `errors.ts` maps network failures, timeouts, HTTP 401/403/404/409/422/429, and provider 5xx responses to stable APS error codes.

## Database flow

`service_requests` remains the APS order root. A `proof_transactions` row links a future provider transaction to one APS request. Its signers and assets are children. `proof_webhook_events` is an idempotent intake/processing ledger and may link to the transaction after correlation.

Provider IDs and raw statuses are retained for reconciliation but are not customer-facing state. APS statuses are stored separately. Unique idempotency keys protect transaction, signer, and asset commands; the provider event ID protects webhook ingestion from duplicate delivery.

All four tables have RLS enabled, no anon/authenticated policies, explicit privilege revocation from `anon` and `authenticated`, and service-role privileges only.

## Planned transaction lifecycle

1. APS validates order/payment/scheduling readiness under existing APS rules.
2. APS creates a local idempotency command and calls the internal create function.
3. The service layer creates the provider transaction and stores linkage without transferring workflow ownership.
4. APS uploads approved documents through the service layer.
5. APS activates the transaction only after its own readiness checks.
6. Webhook and retrieval reconciliation update raw Proof data and mapped APS state.
7. APS retrieves completed documents/audit artifacts, stores controlled asset metadata, and drives APS communications and completion rules.

Increment 2 implements only the draft portion of steps 2–3. Increment 3 implements approved source-document handling in step 4, without activation. Activation, webhook, completed artifact, communication, and portal work remain future increments.

## Increment 3 document lifecycle

**CONFIRMED IN CODE:** `proof-admin-document` accepts only `list_eligible_source_documents`, `prepare_upload`, `upload_source_document`, `refresh_document`, `refresh_all_documents`, and `mark_document_manual_review`. The same Supabase JWT plus `public.is_admin()` authorization boundary used by transaction commands applies. The response is an APS-owned projection without storage paths, signed URLs, document bytes, provider credentials, or unrestricted provider URLs.

Source files must belong to the integration's Remote Online Notary request, remain active in the private `service-request-files` bucket, be recorded as `application/pdf`, have a `.pdf` name, pass a PDF magic-byte check, and remain within the existing APS 10 MB limit and Proof's documented 30 MB per-PDF limit. Identity/completed categories and unverified paths are blocked. The server re-downloads and re-hashes exact bytes immediately before upload.

The upload uses Proof's documented `POST /v1/transactions/{id}/documents` endpoint with multipart/direct PDF bytes. This avoids exposing a Supabase signed URL and avoids base64's approximately 33% expansion. The Edge Function temporarily holds the source byte array, the digest input, and multipart encoding; the stricter APS 10 MB limit bounds that memory cost. Larger documents require a separately reviewed streaming or ephemeral-storage design.

Each upload requires an explicit documented requirement: `notarization`, `esign`, `identity_confirmation`, `readonly`, or `non_essential`. The corresponding boolean flags must agree with that requirement. `witness_required` is always false and any true request is blocked because Proof defines it as a person physically located with the signer, which is not an approved automatic mapping from APS's witness model. Bundle position must be an explicit non-negative integer when supplied.

APS claims `(proof_transaction_record_id, source_request_file_id)` before dispatch and stores the exact checksum, byte count, stable tracking ID, transaction ID, and approved flags. Mutating uploads set `retry: false`. Confirmed provider rejection may be deliberately reconsidered; timeout/network/ambiguous results retain the claim, prohibit blind re-upload, and reconcile only through transaction document metadata by stored Proof document ID or stable tracking ID. Local asset rows are never deleted on provider failure.

Processing refresh reads `GET /v1/transactions/{id}`, extracts only document ID, tracking ID, processing state, and safe timestamps, and updates only Proof-owned synchronization fields. It never overwrites APS source metadata, request/payment/workflow/scheduling data, customer updates, or notes.

## Increment 2 idempotency and ambiguity

**CONFIRMED IN CODE:** APS claims one active `aps_originated` integration per service request and Proof environment before dispatch. The stable provider correlation value is `aps:service_request:<request UUID>`, and every deliberate attempt has a unique local idempotency key. Duplicate and concurrent commands return the stored integration. Confirmed provider rejections may be deliberately retried; successful or ambiguous creates may not.

**CONFIRMED IN DOCUMENTATION:** Proof's documented transaction list filters do not include `external_id`, and the reviewed create contract does not document an HTTP idempotency guarantee. If a create response is ambiguous and no provider transaction ID was captured, APS preserves the active claim, prohibits blind retry, and requires manual review. Retrieval and refresh use only a stored provider transaction ID.

APS-originated and `proof_odn` records are separate. APS blocks create and delete for `proof_odn`; a legitimate stored ODN provider ID may be retrieved without assuming payer, invitation, or signer-link ownership.

## Planned webhook lifecycle

1. Proof sends an event to the dedicated webhook function.
2. The function verifies the provider signature against the exact raw request body before parsing.
3. It inserts `proof_webhook_events` using the provider event ID; duplicates return safely without reprocessing.
4. A worker/service method correlates the APS transaction, applies event-order safeguards, maps status, and updates APS-owned records in one reviewed operation.
5. Processing timestamps, attempts, and normalized errors are retained for replay and support.

Increment 1 does not use Supabase JWT or service-role authentication for the provider webhook. The handler fails closed with HTTP 501. A future increment must verify Proof's HMAC over the exact raw request body before parsing, and must define the official signature header, algorithm, timestamp tolerance, replay rules, secret name, payload contract, and failure/replay policy.

## Security and operations

- Never place Proof secrets in HTML, browser JavaScript, logs, database rows, or committed environment files.
- Do not add direct `fetch` calls to Proof outside `ProofClient` or call `ProofClient` outside `ProofService`.
- Mutating operations require an APS idempotency key. Automatic retries are limited to safe/idempotent operations and retryable provider failures.
- Logging records method, path, status, duration, attempt, normalized code, and correlation metadata; bodies, documents, credentials, and sensitive headers are excluded/redacted.
- No migration or function deployment is implied by repository presence. Production secret inventory, migration state, and deployed function settings require separate verification and owner approval.

## Connected-project rollback validation

**CONFIRMED IN DOCUMENTATION:** On 2026-08-05, the exact local migration was executed inside an explicit transaction against connected project `sfsdniavqldgbiretply`. Assertions verified all four tables, four foreign keys, 20 indexes, RLS on all tables, zero policies/triggers/functions, no `anon`/`authenticated` table privileges, service-role table coverage, and unchanged row counts across every pre-existing public table. The transaction was rolled back. A separate post-rollback catalog query confirmed zero Proof tables, indexes, policies, grants, triggers, functions, and no migration-ledger entry for version `20260805180105`.

## Future increments

1. Confirm Proof API contract, environments, authentication, status/event vocabulary, rate limits, multipart rules, and webhook signature requirements against official provider documentation.
2. Implement create/retrieve with database-backed idempotency and reconciliation tests.
3. Implement secure document upload with file-size/type/hash controls and no payload logging.
4. Implement activation with APS payment/scheduling/readiness gates.
5. Implement signed webhook ingestion, replay protection, out-of-order handling, and reprocessing operations.
6. Implement completed-document/audit retrieval, private storage, retention controls, and administrator access.
7. Add APS communications and customer-safe portal/admin presentation only after backend lifecycle acceptance.

## Increment 4 signer and activation lifecycle

**CONFIRMED IN CODE:** Signer and activation commands route from `proof-admin-transaction` through `ProofActivationLifecycle`, `ProofService`, and the sole Proof transport. Draft signer updates and activation disable retries. Proof owns Version 1 invitation email; `suppress_email` is always false. Phone numbers and access links are not accepted or exposed.

The readiness evaluator fails closed on ownership, draft state, ambiguity/manual review, signer count/configuration, processed documents, witness mapping, outstanding non-void/non-cancelled invoice balances, confirmed appointment fields, IANA timezone, prior activation, and administrator confirmation. It never modifies APS financial, scheduling, or workflow state.

**UNKNOWN / OWNER CONFIRMATION REQUIRED:** APS has signer count but no structured request-scoped signer identity table. Signer identities therefore require explicit administrator approval and the customer is never inferred as signer. Witness-bearing requests return `WITNESS_MAPPING_REQUIRED`. Alternative non-payment resolution states remain undefined.
