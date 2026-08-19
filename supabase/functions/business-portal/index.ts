import {
  assertResourceOrganization,
  documentMayBeReleased,
  requireBusinessContext,
  requireCapability,
  roleAllows,
  safePick,
} from "../_shared/business-authorization.ts";
import { serviceRows } from "../_shared/release2-auth.ts";

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
  "communication_type",
  "direction",
  "subject",
  "message_body",
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
  "created_at",
];
const PAYMENT_SAFE = ["id", "amount", "status", "payment_method", "created_at"];

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
    if (!organizationId) throw new Error("Organization is required.");
    const context = await requireBusinessContext(req, organizationId);
    const membership = context.membership as Record<string, unknown>;

    if (command === "snapshot") {
      requireCapability(membership, "view_requests");
      const [organization, requests] = await Promise.all([
        serviceRows(`organizations?select=*&id=eq.${organizationId}&limit=1`),
        serviceRows(
          `service_requests?select=*&organization_id=eq.${organizationId}&order=created_at.desc&limit=100`,
        ),
      ]);
      return json({
        ok: true,
        organization: safePick(organization[0], ORG_SAFE),
        membership: safePick(membership, ["id", "full_name", "email", "role"]),
        requests: requests.map((row: Record<string, unknown>) =>
          safePick(row, REQUEST_SAFE)
        ),
      });
    }

    if (command === "request") {
      requireCapability(membership, "view_requests");
      const requestId = uuid(body.request_id);
      if (!requestId) throw new Error("Request is required.");
      const request = await requestForOrganization(requestId, organizationId);
      const [participants, files, communications, invoices, payments] =
        await Promise.all([
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
      });
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
      if (target.user_id === context.user.id) {
        throw new Error("You cannot change your own organization access.");
      }
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
