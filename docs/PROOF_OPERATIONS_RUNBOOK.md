# APS ↔ Proof RON Operations Runbook

APS owns intake, readiness, billing, appointment coordination, customer communication, document custody, review, release, and completion. Proof owns identity verification, compliance controls, document execution, the live session, notarization mechanics, and its audit record.

## Operator path

1. Complete APS business readiness: approved customer and signer information, eligible source documents, resolved document requirements, approved quote, paid primary invoice, confirmed appointment, and any supported witness requirement.
2. Create one Proof draft from the request Fulfillment workspace. APS uses its request reference as the external correlation identifier and prevents duplicate active mappings.
3. Map approved APS signers and select only the source PDFs intended for Proof.
4. Confirm Proof processing and requirement states. Use **Open Proof Dashboard** and the displayed Proof transaction reference for Proof-native preparation. Proof does not document a stable transaction-specific administrator URL.
5. Finish coordinate-based fields/designations in Proof when required, review readiness in APS, then use **Activate & Send to Signer**. Activation is the safety-sensitive boundary: Proof sends its signer communication under the current unsuppressed-email configuration.
6. Conduct identity verification, the live meeting, signing, certificate, seal, and completion work in Proof.
7. Allow the Proof webhook lifecycle to synchronize back to APS. Retrieve completed files into the private APS review path.
8. Review the completed notarized document, resolve any legitimate supplemental balance, and release it through APS Documents. Release is never automatic.
9. Complete the APS request only after the service-aware completion gate is satisfied.

## Official capability boundary

- Proof supports API-created draft transactions, signer configuration, document upload, activation, signer-specific access links, lifecycle retrieval, and documented communications behavior.
- API document designations use page coordinates. APS does not invent anchor-text placement or undocumented field controls.
- APS found no official public mechanism for embedding the Proof administrator/notary console or live meeting, and no documented stable administrator transaction deep link. The administrator handoff therefore uses the official Proof dashboard and transaction reference.
- Signer access remains signer-specific. It must never appear in an administrator link, another signer’s portal, logs, or notification payloads.
- Proof credentials, webhook secrets, and service-role credentials remain server-side only.

## Controlled Fairfax validation

Use only a designated Proof Fairfax account and synthetic participants/documents approved for testing. Before any test, confirm expected Proof charges, legal/compliance ownership, invitation recipients, and suppression settings. Validate draft creation, multiple signers where applicable, document processing, coordinate designations, activation, signer access, webhook states, completion, completed-document retrieval, audit-trail retrieval, APS review, and release gating. Do not treat Fairfax behavior as production evidence without reconfirming the production account configuration.

## Production safety

Never create or activate a live Proof transaction merely for smoke testing. Never send a signer invitation, join a live session, release a document, alter a payment, or change a legitimate request without explicit authorization. Use the notification center’s **Test alert** for UI/audio checks; it creates no database record.
