import {
  assertResourceOrganization,
  documentMayBeReleased,
  requireBusinessContext,
  requireCapability,
  roleAllows,
  safePick,
} from "../_shared/business-authorization.ts";
import {
  inviteAuthUser,
  requireRelease2Staff,
  resendAuthInvite,
  serviceRows,
} from "../_shared/release2-auth.ts";
import { customerSafeLoanSigningProgress } from "../_shared/loan-signing-fulfillment.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const uuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value || "")) ? String(value) : "";
const text = (value: unknown, max = 100) =>
  String(value || "").trim().slice(0, max);

const ORG_SAFE = [
  "id",
  "organization_name",
  "business_type",
  "website",
  "primary_email",
  "primary_phone",
  "business_address_line1",
  "business_address_line2",
  "business_city",
  "business_state",
  "business_zip",
  "billing_contact_name",
  "billing_contact_email",
  "operational_contact_name",
  "operational_contact_email",
  "status",
  "payment_terms",
  "credit_hold",
  "service_ron_enabled",
  "service_mobile_enabled",
  "service_print_enabled",
  "service_loan_signing_enabled",
];
const REQUEST_SAFE = [
  "id",
  "service_type",
  "request_status",
  "status",
  "created_at",
  "updated_at",
  "preferred_date",
  "preferred_time",
  "appointment_date",
  "appointment_time",
  "appointment_status",
  "city",
  "state",
  "zip",
  "customer_notes",
  "quoted_total",
  "final_total",
  "payment_status",
  "workflow_status",
  "payment_state",
  "appointment_state",
  "balance_due",
  "appointment_platform",
  "preferred_time_window",
  "business_created_by_member_id",
];
const PARTICIPANT_SAFE = [
  "id",
  "participant_type",
  "witness_source",
  "full_legal_name",
  "first_name",
  "middle_name",
  "last_name",
  "quantity",
  "sort_order",
];
const FILE_SAFE = [
  "id",
  "file_name",
  "file_type",
  "file_size",
  "document_classification",
  "created_at",
];
const MESSAGE_SAFE = [
  "id",
  "direction",
  "channel",
  "subject",
  "message",
  "created_at",
];
const INVOICE_SAFE = [
  "id",
  "invoice_number",
  "status",
  "subtotal",
  "tax_amount",
  "total_amount",
  "amount_paid",
  "amount_due",
  "due_date",
  "organization_id",
  "payment_terms",
  "issued_at",
  "due_at",
  "financial_status",
  "currency",
  "stripe_hosted_invoice_url",
  "stripe_invoice_pdf_url",
  "receipt_url",
  "refunded_amount",
  "net_paid_amount",
  "created_at",
];
const PAYMENT_SAFE = [
  "id",
  "invoice_id",
  "amount",
  "status",
  "payment_state",
  "payment_method",
  "received_at",
  "receipt_url",
  "created_at",
];
const REFUND_SAFE = [
  "id",
  "invoice_id",
  "payment_id",
  "amount",
  "refund_method",
  "status",
  "issued_at",
  "created_at",
];
const ACTIVITY_SAFE = ["id", "event_type", "title", "detail", "created_at"];
const LOAN_SIGNING_SAFE = [
  "id",
  "service_request_id",
  "ordering_party_type",
  "ordering_party_name",
  "company_file_number",
  "escrow_transaction_number",
  "signing_type",
  "signing_method",
  "property_address_line1",
  "property_address_line2",
  "property_city",
  "property_state",
  "property_zip",
  "signing_address_line1",
  "signing_address_line2",
  "signing_city",
  "signing_state",
  "signing_zip",
  "signing_location_notes",
  "signer_confirmation_required",
  "package_status",
  "package_received_at",
  "package_page_count",
  "borrower_copy_required",
  "scanbacks_required",
  "approval_before_return_required",
  "physical_return_required",
  "return_method",
  "prepaid_label_provided",
  "stipulations",
  "lsa_stage",
  "pricing_source",
  "base_assignment_fee",
  "offered_fee",
  "aps_counter",
  "agreed_fee",
  "pricing_status",
  "payment_terms",
  "appointment_instructions",
];
const origin = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";

async function activity(
  organizationId: string,
  actorId: string,
  eventType: string,
  title: string,
  detail = "",
) {
  await serviceRows("organization_activity", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      event_type: eventType,
      title,
      detail,
      actor_user_id: actorId,
      actor_type: "organization_member",
    }),
  });
}
async function assertNotLastAdmin(
  organizationId: string,
  member: Record<string, unknown>,
  nextRole?: string,
  nextStatus?: string,
) {
  if (
    member.role !== "organization_admin" ||
    (nextRole === undefined && nextStatus === undefined) ||
    (nextRole === "organization_admin" &&
      (!nextStatus || nextStatus === "active"))
  ) return;
  const admins = await serviceRows(
    `organization_members?select=id&organization_id=eq.${organizationId}&role=eq.organization_admin&status=eq.active`,
  );
  if (admins.length <= 1) {
    throw new Error(
      "You are the only active Organization Administrator. Assign another active Organization Administrator or request account closure before removing your administrator access.",
    );
  }
}

async function requestForOrganization(
  requestId: string,
  organizationId: string,
) {
  const row = (await serviceRows(
    `service_requests?select=*&id=eq.${requestId}&organization_id=eq.${organizationId}&limit=1`,
  ))[0];
  return assertResourceOrganization(row, organizationId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }
    const body = await req.json() as Record<string, unknown>;
    const command = text(body.command, 40);
    const organizationId = uuid(body.organization_id);

    if (command === "session") {
      const context = await requireBusinessContext(req);
      const organizationMap = new Map<unknown, Record<string, unknown>>(
        context.organizations.map((
          row: Record<string, unknown>,
        ) => [row.id, row]),
      );
      return json({
        ok: true,
        user: { id: context.user.id, email: context.user.email },
        memberships: context.memberships.map((
          membership: Record<string, unknown>,
        ) => ({
          ...safePick(membership, [
            "id",
            "organization_id",
            "full_name",
            "email",
            "role",
          ]),
          organization_name: organizationMap.get(membership.organization_id)
            ?.organization_name,
        })),
      });
    }
    if (command === "admin_preview") {
      const staff = await requireRelease2Staff(req);
      const previewOrganizationId = uuid(body.organization_id),
        previewRole = text(body.role, 40);
      if (
        !previewOrganizationId ||
        !["organization_admin", "order_creator", "billing", "viewer"].includes(
          previewRole,
        )
      ) throw new Error("Valid preview organization and role are required.");
      const organization = (await serviceRows(
        `organizations?select=*&id=eq.${previewOrganizationId}&limit=1`,
      ))[0];
      if (!organization) throw new Error("Organization not found.");
      const requests = await serviceRows(
        `service_requests?select=*&organization_id=eq.${previewOrganizationId}&order=created_at.desc&limit=100`,
      );
      const requestIds = requests.map((r: Record<string, unknown>) => r.id)
          .filter(Boolean),
        filter = requestIds.length
          ? `service_request_id=in.(${requestIds.join(",")})`
          : "service_request_id=eq.00000000-0000-0000-0000-000000000000";
      const [files, invoices, payments, messages, locations, activityRows] =
        await Promise.all([
          roleAllows(previewRole, "view_documents")
            ? serviceRows(
              `request_files?select=*&${filter}&is_active=eq.true&customer_visible=eq.true&eligible_for_delivery=eq.true`,
            )
            : [],
          roleAllows(previewRole, "view_billing")
            ? serviceRows(`invoices?select=*&${filter}`)
            : [],
          roleAllows(previewRole, "view_billing")
            ? serviceRows(`request_payments?select=*&${filter}`)
            : [],
          serviceRows(`request_communications?select=*&${filter}`),
          serviceRows(
            `organization_locations?select=id,location_name,address_line1,address_line2,city,state,zip,phone,is_active,is_default&organization_id=eq.${previewOrganizationId}&order=is_default.desc,location_name.asc`,
          ),
          serviceRows(
            `organization_activity?select=id,event_type,title,detail,created_at&organization_id=eq.${previewOrganizationId}&order=created_at.desc&limit=50`,
          ),
        ]);
      return json({
        ok: true,
        preview: true,
        preview_role: previewRole,
        staff: { email: staff.email },
        organization: safePick(organization, ORG_SAFE),
        membership: {
          full_name: "APS Admin Preview",
          email: staff.email,
          role: previewRole,
        },
        requests: requests.map((row: Record<string, unknown>) =>
          safePick(row, REQUEST_SAFE)
        ),
        locations,
        activity: activityRows.map((row: Record<string, unknown>) =>
          safePick(row, ACTIVITY_SAFE)
        ),
        closures: [],
        privacy_requests: [],
        preview_details: {
          documents: files.filter(documentMayBeReleased).map((
            r: Record<string, unknown>,
          ) => safePick(r, [...FILE_SAFE, "service_request_id"])),
          invoices: invoices.map((r: Record<string, unknown>) =>
            safePick(r, [...INVOICE_SAFE, "service_request_id"])
          ),
          payments: payments.map((r: Record<string, unknown>) =>
            safePick(r, [...PAYMENT_SAFE, "service_request_id"])
          ),
          messages: messages.filter((r: Record<string, unknown>) =>
            (r.metadata as Record<string, unknown>)?.customer_visible === true
          ).map((r: Record<string, unknown>) =>
            safePick(r, [...MESSAGE_SAFE, "message", "service_request_id"])
          ),
        },
        capabilities: {
          view_requests: true,
          create_request: ["organization_admin", "order_creator"].includes(
            previewRole,
          ),
          mutate_request: ["organization_admin", "order_creator"].includes(
            previewRole,
          ),
          view_documents: ["organization_admin", "order_creator", "viewer"]
            .includes(previewRole),
          view_billing: ["organization_admin", "billing"].includes(previewRole),
          manage_members: previewRole === "organization_admin",
        },
      });
    }
    if (!organizationId) throw new Error("Organization is required.");
    const context = await requireBusinessContext(req, organizationId);
    const membership = context.membership as Record<string, unknown>;

    if (command === "snapshot") {
      requireCapability(membership, "view_requests");
      const [
        organization,
        requests,
        locations,
        closures,
        privacy,
        activityRows,
      ] = await Promise.all([
        serviceRows(`organizations?select=*&id=eq.${organizationId}&limit=1`),
        serviceRows(
          `service_requests?select=*&organization_id=eq.${organizationId}&order=created_at.desc&limit=100`,
        ),
        serviceRows(
          `organization_locations?select=id,location_name,address_line1,address_line2,city,state,zip,phone,is_active,is_default&organization_id=eq.${organizationId}&order=is_default.desc,location_name.asc`,
        ),
        serviceRows(
          `business_account_closure_requests?select=id,status,reason,resolution,created_at,updated_at&organization_id=eq.${organizationId}&order=created_at.desc`,
        ),
        serviceRows(
          `business_privacy_requests?select=id,request_type,status,requester_comments,resolution,created_at,updated_at&organization_id=eq.${organizationId}&order=created_at.desc`,
        ),
        serviceRows(
          `organization_activity?select=id,event_type,title,detail,created_at&organization_id=eq.${organizationId}&order=created_at.desc&limit=50`,
        ),
      ]);
      return json({
        ok: true,
        organization: safePick(organization[0], ORG_SAFE),
        membership: safePick(membership, ["id", "full_name", "email", "role"]),
        requests: requests.map((row: Record<string, unknown>) =>
          safePick(row, REQUEST_SAFE)
        ),
        locations,
        closures,
        privacy_requests: privacy,
        activity: activityRows.map((row: Record<string, unknown>) =>
          safePick(row, ACTIVITY_SAFE)
        ),
        capabilities: {
          view_requests: true,
          create_request: roleAllows(String(membership.role), "create_request"),
          mutate_request: roleAllows(String(membership.role), "mutate_request"),
          view_documents: roleAllows(String(membership.role), "view_documents"),
          view_billing: roleAllows(String(membership.role), "view_billing"),
          manage_members: roleAllows(String(membership.role), "manage_members"),
        },
      });
    }

    if (command === "create_request") {
      requireCapability(membership, "create_request");
      const service = text(body.service_type, 20);
      if (!["ron", "mobile", "print", "loan_signing"].includes(service)) {
        throw new Error("A launched APS service is required.");
      }
      const organization = (await serviceRows(
        `organizations?select=*&id=eq.${organizationId}&limit=1`,
      ))[0];
      if (!organization?.[`service_${service}_enabled`]) {
        throw new Error("This service is not enabled for the organization.");
      }
      if (
        organization.credit_hold === true &&
        organization.payment_terms !== "prepaid"
      ) {
        throw new Error(
          "This account requires payment review before new service can proceed.",
        );
      }
      if(service==="loan_signing"&&body.lsa_terms_acknowledged!==true&&body.lsa_terms_acknowledged!=="on")throw new Error("Acknowledge the Loan Signing Assignment Terms before submitting.");
      const names = String(membership.full_name || "Business Contact").trim()
        .split(/\s+/);
      const firstName = names.shift() || "Business",
        lastName = names.join(" ") || "Contact";
      const resolution = await serviceRows(
        "rpc/aps_create_request_with_customer",
        {
          method: "POST",
          body: JSON.stringify({
            p_customer: {
              first_name: firstName,
              last_name: lastName,
              email: membership.email,
              phone: body.phone || organization.primary_phone || null,
              preferred_contact: "email",
            },
            p_request: {
              service_type: service,
              status: "under_review",
              workflow_status: "under_review",
              preferred_date: body.preferred_date || null,
              preferred_time_window: text(body.preferred_time_window, 120) ||
                null,
              appointment_date: body.signing_date || null,
              appointment_time: body.signing_time || null,
              appointment_timezone: body.signing_date || body.signing_time
                ? text(body.appointment_timezone, 80) || "America/Chicago"
                : null,
              appointment_location: service === "loan_signing" &&
                  body.signing_method !== "ron"
                ? [
                  body.signing_address_line1,
                  body.signing_city,
                  body.signing_state,
                  body.signing_zip,
                ]
                  .filter(Boolean).join(", ")
                : null,
              notes: text(body.notes, 4000) || null,
              request_source: "business_portal",
              document_upload_exception_reason: "business_portal_follow_up",
              request_completeness: "needs_review",
              document_state: "awaiting_documents",
              participant_state: service === "print"
                ? "not_applicable"
                : "needs_review",
              fulfillment_state: "pending",
            },
          }),
        },
      );
      const created = Array.isArray(resolution) ? resolution[0] : resolution,
        requestId = String(created?.request_id || "");
      if (!requestId) throw new Error("Request could not be created.");
      await serviceRows(`service_requests?id=eq.${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({
          organization_id: organizationId,
          business_created_by_member_id: membership.id,
        }),
      });
      if (service !== "print") {
        const submittedSigners = Array.isArray(body.signers)
          ? body.signers
          : [{ name: body.signer_name, email: body.signer_email }];
        const signers = submittedSigners.slice(0, 10).map((signer) => ({
          name: text(signer?.name, 180),
          email: text(signer?.email, 254).toLowerCase(),
        }));
        if (
          signers.length === 0 ||
          signers.some((signer) => !signer.name || !signer.email.includes("@"))
        ) {
          throw new Error(
            "Each signer requires a legal name and individual email address.",
          );
        }
        await serviceRows("request_participants", {
          method: "POST",
          body: JSON.stringify(signers.map((signer, index) => ({
            service_request_id: requestId,
            participant_type: "signer",
            full_legal_name: signer.name,
            email: signer.email,
            quantity: 1,
            sort_order: index,
          }))),
        });
      }
      if (service === "ron") {
        await serviceRows("ron_requests", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: requestId,
            document_type: text(body.document_type, 120) || "To be confirmed",
            number_of_signers: Number(body.number_of_signers || 1),
            number_of_notarizations: Number(body.number_of_notarizations || 1),
            ron_platform: "proof",
            tech_ready: body.tech_ready === true,
            valid_id_confirmed: body.valid_id_confirmed === true,
            consent_to_recording: body.consent_to_recording === true,
          }),
        });
      }
      if (service === "mobile") {
        await serviceRows("mobile_notary_requests", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: requestId,
            street_address: text(body.street_address, 220),
            unit: text(body.unit, 80) || null,
            city: text(body.city, 100),
            state: text(body.state, 2).toUpperCase(),
            zip: text(body.zip, 12),
            number_of_signers: Number(body.number_of_signers || 1),
            number_of_notarizations: Number(body.number_of_notarizations || 1),
            witnesses_needed: false,
            print_add_on: false,
            scan_back_needed: false,
          }),
        });
      }
      if (service === "print") {
        await serviceRows("print_scan_requests", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: requestId,
            fulfillment_type: text(body.fulfillment_type, 60) ||
              "digital_delivery",
            delivery_address: text(body.delivery_address, 300) || null,
            black_white_pages: Number(body.black_white_pages || 0),
            color_pages: Number(body.color_pages || 0),
            scan_pages: Number(body.scan_pages || 0),
            paper_size: "letter",
            print_sides: "single",
            paper_type: "standard",
            courier_requested: false,
            mobile_document_service_requested: false,
          }),
        });
      }
      if (service === "loan_signing") {
        const signingType = text(body.signing_type, 60),
          signingMethod = text(body.signing_method, 60);
        if (
          ![
            "buyer_purchase",
            "seller",
            "refinance",
            "heloc",
            "loan_modification",
            "reverse_mortgage",
            "commercial",
            "other_custom",
          ].includes(signingType) ||
          !["in_person_mobile", "ron", "either_tbd"].includes(signingMethod)
        ) throw new Error("Signing type and signing method are required.");
        const standard: Record<string, number> = {
          loan_modification: 100,
          seller: 125,
          heloc: 125,
          buyer_purchase: 150,
          refinance: 150,
          reverse_mortgage: 175,
          commercial: 200,
          other_custom: 200,
        };
        const supportedOrderingPartyTypes = [
          "title_escrow",
          "signing_service",
          "lender",
          "law_office",
        ];
        await serviceRows("loan_signing_assignments", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: requestId,
            organization_id: organizationId,
            ordering_party_type: supportedOrderingPartyTypes.includes(
                String(organization.business_type),
              )
              ? organization.business_type
              : "other_business",
            ordering_party_name: organization.organization_name,
            company_file_number: text(body.company_file_number, 160) || null,
            escrow_transaction_number:
              text(body.escrow_transaction_number, 160) || null,
            signing_type: signingType,
            signing_method: signingMethod,
            property_address_line1: text(body.property_address_line1, 220) ||
              null,
            property_address_line2: text(body.property_address_line2, 120) ||
              null,
            property_city: text(body.property_city, 100) || null,
            property_state: text(body.property_state, 2).toUpperCase() || null,
            property_zip: text(body.property_zip, 12) || null,
            signing_address_line1: text(body.signing_address_line1, 220) ||
              null,
            signing_address_line2: text(body.signing_address_line2, 120) ||
              null,
            signing_city: text(body.signing_city, 100) || null,
            signing_state: text(body.signing_state, 2).toUpperCase() || null,
            signing_zip: text(body.signing_zip, 12) || null,
            signing_location_notes: text(body.signing_location_notes, 1000) ||
              null,
            signer_confirmation_required:
              body.signer_confirmation_required === true ||
              body.signer_confirmation_required === "on",
            package_status: text(body.package_status, 40) || "not_provided",
            borrower_copy_required: text(body.borrower_copy_required, 20) ||
              "unknown",
            scanbacks_required: text(body.scanbacks_required, 20) || "unknown",
            approval_before_return_required:
              text(body.approval_before_return_required, 20) || "unknown",
            physical_return_required: text(body.physical_return_required, 20) ||
              "unknown",
            return_method: text(body.return_method, 60) || null,
            prepaid_label_provided: text(body.prepaid_label_provided, 20) ||
              "unknown",
            stipulations: text(body.stipulations, 4000) || null,
            lsa_stage: "assignment_received",
            pricing_source: "standard_aps",
            base_assignment_fee: standard[signingType],
            agreed_fee: standard[signingType],
            pricing_status: "draft",
            payment_terms: organization.payment_terms,
            appointment_instructions:
              text(body.appointment_instructions, 2000) || null,
            terms_policy_version: "lsa-policy-2026-08-v1",
            terms_acknowledged_at: new Date().toISOString(),
            terms_acknowledged_by_user_id: context.user.id,
          }),
        });
      }
      await serviceRows("request_status_updates", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          status: "under_review",
          message: "Business request submitted for APS review.",
        }),
      });
      await activity(
        organizationId,
        context.user.id,
        "request_submitted",
        "Request Submitted",
        `${service} · APS-${requestId.slice(0, 8).toUpperCase()}`,
      );
      return json({
        ok: true,
        request_id: requestId,
        reference: `APS-${requestId.slice(0, 8).toUpperCase()}`,
      });
    }

    if (command === "request") {
      requireCapability(membership, "view_requests");
      const requestId = uuid(body.request_id);
      if (!requestId) throw new Error("Request is required.");
      const request = await requestForOrganization(requestId, organizationId);
      const [
        participants,
        files,
        communications,
        invoices,
        payments,
        refunds,
        loanSigning,
        loanSigningScanbacks,
        loanSigningReturns,
        loanSigningExceptions,
        loanSigningResolutions,
      ] = await Promise.all([
        serviceRows(
          `request_participants?select=*&service_request_id=eq.${requestId}&order=sort_order.asc`,
        ),
        roleAllows(String(membership.role), "view_documents")
          ? serviceRows(
            `request_files?select=*&service_request_id=eq.${requestId}&is_active=eq.true&customer_visible=eq.true&eligible_for_delivery=eq.true`,
          )
          : Promise.resolve([]),
        serviceRows(
          `request_communications?select=*&service_request_id=eq.${requestId}&order=created_at.desc`,
        ),
        roleAllows(String(membership.role), "view_billing")
          ? serviceRows(
            `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.desc`,
          )
          : Promise.resolve([]),
        roleAllows(String(membership.role), "view_billing")
          ? serviceRows(
            `request_payments?select=*&service_request_id=eq.${requestId}&order=created_at.desc`,
          )
          : Promise.resolve([]),
        roleAllows(String(membership.role), "view_billing")
          ? serviceRows(
            `refunds?select=*&service_request_id=eq.${requestId}&status=in.(pending,processing,succeeded)&order=created_at.desc`,
          )
          : Promise.resolve([]),
        request.service_type === "loan_signing"
          ? serviceRows(
            `loan_signing_assignments?select=*&service_request_id=eq.${requestId}&organization_id=eq.${organizationId}&limit=1`,
          )
          : Promise.resolve([]),
        request.service_type === "loan_signing"
          ? serviceRows(`loan_signing_scanbacks?select=status,submitted_at,approved_at&service_request_id=eq.${requestId}&organization_id=eq.${organizationId}&order=created_at.desc&limit=1`)
          : Promise.resolve([]),
        request.service_type === "loan_signing"
          ? serviceRows(`loan_signing_returns?select=return_method,carrier,tracking_number,tracking_status,drop_off_at,completed_at&service_request_id=eq.${requestId}&organization_id=eq.${organizationId}&order=created_at.desc&limit=1`)
          : Promise.resolve([]),
        request.service_type === "loan_signing"
          ? serviceRows(`loan_signing_exceptions?select=id,outcome,status,customer_safe_status,customer_safe_explanation,requested_at,resolved_at&service_request_id=eq.${requestId}&organization_id=eq.${organizationId}&order=created_at.desc&limit=5`)
          : Promise.resolve([]),
        request.service_type === "loan_signing" && roleAllows(String(membership.role), "view_billing")
          ? serviceRows(`loan_signing_financial_resolutions?select=id,resolution_type,original_agreed_fee,authorized_charge,authorized_additional_charges,final_service_value,refund_due,additional_amount_due,net_retained,customer_safe_explanation,resolution_state,invoice_id,created_at&service_request_id=eq.${requestId}&order=created_at.desc&limit=5`)
          : Promise.resolve([]),
      ]);
      return json({
        ok: true,
        request: safePick(request, REQUEST_SAFE),
        participants: participants.map((row: Record<string, unknown>) =>
          safePick(row, PARTICIPANT_SAFE)
        ),
        documents: files.map((row: Record<string, unknown>) =>
          safePick(row, FILE_SAFE)
        ),
        messages: communications.filter((row: Record<string, unknown>) =>
          row.metadata &&
          (row.metadata as Record<string, unknown>).customer_visible === true
        ).map((row: Record<string, unknown>) => safePick(row, MESSAGE_SAFE)),
        invoices: invoices.map((row: Record<string, unknown>) =>
          safePick(row, INVOICE_SAFE)
        ),
        payments: payments.map((row: Record<string, unknown>) =>
          safePick(row, PAYMENT_SAFE)
        ),
        refunds: refunds.map((row: Record<string, unknown>) =>
          safePick(row, REFUND_SAFE)
        ),
        loan_signing: loanSigning[0]
          ? safePick(loanSigning[0], LOAN_SIGNING_SAFE)
          : null,
        loan_signing_progress: loanSigning[0]
          ? customerSafeLoanSigningProgress({ assignment: loanSigning[0], scanbacks: loanSigningScanbacks, returns: loanSigningReturns })
          : null,
        loan_signing_exceptions: loanSigningExceptions,
        loan_signing_financial_resolutions: loanSigningResolutions,
      });
    }

    if (command === "request_lsa_cancellation") {
      requireCapability(membership, "mutate_request");
      const requestId = uuid(body.request_id); if (!requestId) throw new Error("Request is required.");
      const request = await requestForOrganization(requestId, organizationId); if (request.service_type !== "loan_signing") throw new Error("Loan Signing request is required.");
      const assignment=(await serviceRows(`loan_signing_assignments?select=*&service_request_id=eq.${requestId}&organization_id=eq.${organizationId}&limit=1`))[0]; if(!assignment)throw new Error("Loan Signing assignment was not found.");
      const existing=await serviceRows(`loan_signing_exceptions?select=id&service_request_id=eq.${requestId}&outcome=eq.cancelled&status=in.(requested,review_required,financial_review,communication_needed)&limit=1`); if(existing.length)return json({ok:true,exception_id:existing[0].id,reused:true});
      const reason=text(body.reason,2000);if(!reason)throw new Error("A cancellation reason is required.");const requestedAt=new Date().toISOString(),created=await serviceRows("loan_signing_exceptions?select=id",{method:"POST",body:JSON.stringify({loan_signing_assignment_id:assignment.id,service_request_id:requestId,organization_id:organizationId,outcome:"cancelled",status:"requested",requested_by_type:"ordering_organization",requested_by_user_id:context.user.id,requested_at:requestedAt,reason_code:"organization_requested",neutral_internal_note:reason,lsa_stage_snapshot:assignment.lsa_stage,operational_facts:{appointment_state:request.appointment_status||request.workflow_status,package_state:assignment.package_status,print_status:assignment.print_status,travel_started_at:assignment.travel_started_at||null,arrival_at:assignment.arrival_at,signing_started_at:assignment.signing_started_at,signing_ended_at:assignment.signing_ended_at,departure_at:assignment.departure_at,return_state:assignment.return_status||null,payment_terms:assignment.payment_terms,agreed_fee:assignment.agreed_fee},policy_source:"default_aps_policy",policy_snapshot:{pending_admin_review:true},cause_category:"unknown_review",customer_safe_status:"Cancellation Requested",communication_state:"needed",idempotency_key:`business-cancellation:${assignment.id}`})});
      await serviceRows("review_queue_items",{method:"POST",body:JSON.stringify({service_request_id:requestId,blocker_key:"lsa_cancellation_review",title:"Loan Signing Cancellation Review",detail:"An authorized organization user requested cancellation. Financial and service consequences require APS review.",target_tab:"fulfillment",source_object_type:"loan_signing_exception",source_object_id:created[0].id})});await activity(organizationId,String(context.user.id),"loan_signing_cancellation_requested","Loan Signing Cancellation Requested",`Cancellation review requested for APS-${requestId.slice(0,8).toUpperCase()}.`);
      return json({ok:true,exception_id:created[0].id,reused:false});
    }

    if (command === "document_download") {
      requireCapability(membership, "view_documents");
      const documentId = uuid(body.document_id);
      if (!documentId) throw new Error("Document is required.");
      const document = (await serviceRows(
        `request_files?select=*&id=eq.${documentId}&is_active=eq.true&customer_visible=eq.true&eligible_for_delivery=eq.true&limit=1`,
      ))[0];
      if (!document || !documentMayBeReleased(document)) {
        throw new Error("Document access denied.");
      }
      await requestForOrganization(
        String(document.service_request_id),
        organizationId,
      );
      const signed = await fetch(
        `${
          Deno.env.get("SUPABASE_URL")
        }/storage/v1/object/sign/service-request-files/${
          encodeURI(String(document.file_path))
        }`,
        {
          method: "POST",
          headers: {
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
            Authorization: `Bearer ${
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
            }`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expiresIn: 60 }),
        },
      );
      if (!signed.ok) {
        throw new Error("Unable to create a secure document link.");
      }
      return json({ ok: true, ...(await signed.json()), expires_in: 60 });
    }

    if (command === "save_profile") {
      requireCapability(membership, "manage_members");
      const update = Object.fromEntries(
        [
          "primary_email",
          "primary_phone",
          "business_address_line1",
          "business_address_line2",
          "business_city",
          "business_state",
          "business_zip",
          "mailing_address_line1",
          "mailing_address_line2",
          "mailing_city",
          "mailing_state",
          "mailing_zip",
          "billing_contact_name",
          "billing_contact_email",
          "operational_contact_name",
          "operational_contact_email",
        ].filter((key) => body[key] !== undefined).map(
          (key) => [key, text(body[key], 254) || null],
        ),
      );
      if (!Object.keys(update).length) {
        throw new Error("No safe organization changes were supplied.");
      }
      update.updated_at = new Date().toISOString();
      await serviceRows(`organizations?id=eq.${organizationId}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      });
      await activity(
        organizationId,
        context.user.id,
        "profile_updated",
        "Organization Profile Updated",
      );
      return json({ ok: true });
    }
    if (command === "save_location") {
      requireCapability(membership, "manage_members");
      const locationId = uuid(body.location_id);
      const payload = {
        location_name: text(body.location_name, 180),
        address_line1: text(body.address_line1, 220),
        address_line2: text(body.address_line2, 120) || null,
        city: text(body.city, 100),
        state: text(body.state, 2).toUpperCase(),
        zip: text(body.zip, 12),
        phone: text(body.phone, 40) || null,
        is_default: body.is_default === true,
        is_active: body.is_active !== false,
        updated_at: new Date().toISOString(),
      };
      if (
        !payload.location_name || !payload.address_line1 || !payload.city ||
        !payload.state || !payload.zip
      ) throw new Error("Complete location details are required.");
      if (payload.is_default) {
        await serviceRows(
          `organization_locations?organization_id=eq.${organizationId}&is_default=eq.true`,
          {
            method: "PATCH",
            body: JSON.stringify({
              is_default: false,
              updated_at: new Date().toISOString(),
            }),
          },
        );
      }
      if (locationId) {
        await serviceRows(
          `organization_locations?id=eq.${locationId}&organization_id=eq.${organizationId}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
      } else {await serviceRows("organization_locations", {
          method: "POST",
          body: JSON.stringify({ ...payload, organization_id: organizationId }),
        });}
      await activity(
        organizationId,
        context.user.id,
        locationId ? "location_updated" : "location_added",
        locationId
          ? "Organization Location Updated"
          : "Organization Location Added",
        payload.location_name,
      );
      return json({ ok: true });
    }
    if (command === "invite_member") {
      requireCapability(membership, "manage_members");
      const email = text(body.email, 254).toLowerCase(),
        role = text(body.role, 40),
        fullName = text(body.full_name, 180);
      if (
        !email.includes("@") || !fullName ||
        !["organization_admin", "order_creator", "billing", "viewer"].includes(
          role,
        )
      ) {
        throw new Error(
          "Valid name, email, and organization role are required.",
        );
      }
      const auth = await inviteAuthUser(
        email,
        `${origin}/business-login.html`,
        {
          access_domain: "organization_member",
          organization_id: organizationId,
          organization_role: role,
        },
      );
      await serviceRows("organization_members", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          user_id: auth.id || null,
          full_name: fullName,
          email,
          role,
          status: "invited",
          invited_at: new Date().toISOString(),
          invited_by: context.user.id,
        }),
      });
      await activity(
        organizationId,
        context.user.id,
        "member_invited",
        "Business User Invited",
        `${email} · ${role}`,
      );
      return json({ ok: true });
    }
    if (command === "resend_invitation") {
      requireCapability(membership, "manage_members");
      const memberId = uuid(body.member_id);
      const target = (await serviceRows(
        `organization_members?select=*&id=eq.${memberId}&organization_id=eq.${organizationId}&status=eq.invited&limit=1`,
      ))[0];
      assertResourceOrganization(target, organizationId);
      await resendAuthInvite(target.email, `${origin}/business-login.html`);
      return json({ ok: true });
    }
    if (command === "leave_organization") {
      await assertNotLastAdmin(
        organizationId,
        membership,
        undefined,
        "removed",
      );
      await serviceRows(
        `organization_members?id=eq.${membership.id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "removed",
            removed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      );
      await activity(
        organizationId,
        context.user.id,
        "member_left",
        "User Left Organization",
        String(membership.email),
      );
      return json({ ok: true });
    }
    if (command === "request_closure") {
      requireCapability(membership, "manage_members");
      const reason = text(body.reason, 2000);
      await serviceRows("business_account_closure_requests", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          requested_by_member_id: membership.id,
          reason: reason || null,
        }),
      });
      await activity(
        organizationId,
        context.user.id,
        "closure_requested",
        "Business Account Closure Requested",
      );
      return json({ ok: true });
    }
    if (command === "cancel_closure") {
      requireCapability(membership, "manage_members");
      const closureId = uuid(body.closure_id);
      const rows = await serviceRows(
        `business_account_closure_requests?id=eq.${closureId}&organization_id=eq.${organizationId}&status=in.(requested,under_review,information_needed)`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (!rows[0]) throw new Error("Closure request cannot be cancelled.");
      await activity(
        organizationId,
        context.user.id,
        "closure_cancelled",
        "Business Account Closure Cancelled",
      );
      return json({ ok: true });
    }
    if (command === "privacy_request") {
      const requestType = text(body.request_type, 40);
      if (
        !["access", "correction", "deletion_closure_review"].includes(
          requestType,
        )
      ) throw new Error("Supported privacy request type is required.");
      await serviceRows("business_privacy_requests", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          requested_by_member_id: membership.id,
          request_type: requestType,
          requester_comments: text(body.comments, 2000) || null,
        }),
      });
      await activity(
        organizationId,
        context.user.id,
        "privacy_request_submitted",
        "Privacy/Data Request Submitted",
        requestType,
      );
      return json({ ok: true });
    }
    if (command === "send_message") {
      if (
        !["organization_admin", "order_creator", "billing"].includes(
          String(membership.role),
        )
      ) {
        throw new Error(
          "This organization role is not permitted to send messages.",
        );
      }
      const requestId = uuid(body.request_id);
      await requestForOrganization(requestId, organizationId);
      const message = text(body.message, 4000);
      if (!message) throw new Error("Message is required.");
      await serviceRows("request_communications", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          direction: "inbound",
          channel: "business_portal",
          subject: text(body.subject, 180) || "Business Portal Message",
          message,
          delivery_status: "received",
          metadata: {
            customer_visible: true,
            organization_id: organizationId,
            author_member_id: membership.id,
            author_name: membership.full_name,
          },
        }),
      });
      await activity(
        organizationId,
        context.user.id,
        "message_sent",
        "Business Message Sent",
      );
      return json({ ok: true });
    }

    if (command === "members") {
      requireCapability(membership, "manage_members");
      const members = await serviceRows(
        `organization_members?select=id,full_name,email,role,status,created_at&organization_id=eq.${organizationId}&order=created_at.asc`,
      );
      return json({ ok: true, members });
    }
    if (command === "update_member") {
      requireCapability(membership, "manage_members");
      const memberId = uuid(body.member_id);
      if (!memberId) throw new Error("Member is required.");
      const target = (await serviceRows(
        `organization_members?select=id,organization_id,user_id,role,status&id=eq.${memberId}&organization_id=eq.${organizationId}&limit=1`,
      ))[0];
      assertResourceOrganization(target, organizationId);
      const role = body.role === undefined ? undefined : text(body.role, 40);
      const status = body.status === undefined
        ? undefined
        : text(body.status, 40);
      if (
        role &&
        !["organization_admin", "order_creator", "billing", "viewer"].includes(
          role,
        )
      ) throw new Error("Unsupported organization role.");
      if (
        status &&
        !["active", "suspended", "removed", "revoked"].includes(status)
      ) throw new Error("Unsupported membership status.");
      if (!role && !status) {
        throw new Error("A role or status change is required.");
      }
      await assertNotLastAdmin(organizationId, target, role, status);
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (role) update.role = role;
      if (status) update.status = status;
      if (status === "suspended") {
        update.suspended_at = new Date().toISOString();
      }
      if (status === "removed" || status === "revoked") {
        update.removed_at = new Date().toISOString();
      }
      const rows = await serviceRows(
        `organization_members?id=eq.${memberId}&organization_id=eq.${organizationId}`,
        { method: "PATCH", body: JSON.stringify(update) },
      );
      return json({
        ok: true,
        member: safePick(rows[0], [
          "id",
          "full_name",
          "email",
          "role",
          "status",
        ]),
      });
    }
    throw new Error("Unsupported business portal command.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = /Authentication/.test(message)
      ? 401
      : /required|denied|permitted|membership/.test(message)
      ? 403
      : 400;
    return json({ error: message }, status);
  }
});
