import {
  inviteAuthUser,
  requireRelease2Staff,
  resendAuthInvite,
  serviceRows,
} from "../_shared/release2-auth.ts";

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
const id = (value: unknown) =>
  /^[0-9a-f-]{36}$/i.test(String(value || "")) ? String(value) : "";
const text = (value: unknown, max = 500) =>
  String(value || "").trim().slice(0, max);
const allowed = (body: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    keys.filter((key) => body[key] !== undefined).map((
      key,
    ) => [key, body[key] === "" ? null : body[key]]),
  );
const origin = Deno.env.get("SITE_URL") || "https://alignedprintscan.com";

async function activity(
  organizationId: string,
  actorId: string,
  eventType: string,
  title: string,
  detail = "",
  applicationId?: string,
) {
  await serviceRows("organization_activity", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      application_id: applicationId || null,
      event_type: eventType,
      title,
      detail,
      actor_user_id: actorId,
      actor_type: "aps_staff",
    }),
  });
}
async function staffActivity(
  profileId: string,
  actorId: string,
  eventType: string,
  title: string,
  detail = "",
) {
  await serviceRows("aps_staff_activity", {
    method: "POST",
    body: JSON.stringify({
      staff_profile_id: profileId,
      event_type: eventType,
      title,
      detail,
      actor_user_id: actorId,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json() as Record<string, unknown>;
    const command = text(body.command, 80);
    const staff = await requireRelease2Staff(
      req,
      ["approve_application", "approve_business_application"].includes(command)
        ? "approve_business_accounts"
        : ["invite_staff", "update_staff"].includes(command)
        ? "manage_staff"
        : ["set_payment_terms", "set_credit_hold"].includes(command) ||
            command === "save_organization" && body.payment_terms !== undefined
        ? "change_organization_payment_terms"
        : undefined,
    );

    if (command === "staff_access") return json({ ok: true });

    if (command === "snapshot") {
      const [
        organizations,
        applications,
        members,
        locations,
        activities,
        staffProfiles,
        staffActivities,
        closureRequests,
        privacyRequests,
        invoices,
        payments,
        refunds,
        financialEvents,
      ] = await Promise.all([
        serviceRows("organizations?select=*&order=created_at.desc"),
        serviceRows(
          "business_account_applications?select=*&order=submitted_at.desc",
        ),
        serviceRows("organization_members?select=*&order=created_at.desc"),
        serviceRows("organization_locations?select=*&order=created_at.desc"),
        serviceRows(
          "organization_activity?select=*&order=created_at.desc&limit=500",
        ),
        serviceRows("aps_staff_profiles?select=*&order=created_at.asc"),
        serviceRows(
          "aps_staff_activity?select=*&order=created_at.desc&limit=500",
        ),
        serviceRows(
          "business_account_closure_requests?select=*&order=created_at.desc",
        ),
        serviceRows("business_privacy_requests?select=*&order=created_at.desc"),
        serviceRows(
          "invoices?select=*&organization_id=not.is.null&order=created_at.desc",
        ),
        serviceRows(
          "request_payments?select=*&organization_id=not.is.null&order=received_at.desc",
        ),
        serviceRows("refunds?select=*&order=created_at.desc"),
        serviceRows(
          "business_financial_events?select=*&order=created_at.desc&limit=500",
        ),
      ]);
      return json({
        ok: true,
        organizations,
        applications,
        members,
        locations,
        activities,
        staff: staffProfiles,
        staff_activity: staffActivities,
        closure_requests: closureRequests,
        privacy_requests: privacyRequests,
        invoices,
        payments,
        refunds,
        financial_events: financialEvents,
      });
    }

    if (command === "set_payment_terms") {
      const organizationId = id(body.organization_id),
        next = text(body.payment_terms);
      if (
        !organizationId ||
        !["prepaid", "due_on_receipt", "net_15", "net_30"].includes(next)
      ) throw new Error("Supported organization payment terms are required.");
      const current = (await serviceRows(
        `organizations?select=id,payment_terms&id=eq.${organizationId}&limit=1`,
      ))[0];
      if (!current) throw new Error("Organization not found.");
      await serviceRows(`organizations?id=eq.${organizationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          payment_terms: next,
          updated_at: new Date().toISOString(),
        }),
      });
      await activity(
        organizationId,
        staff.id,
        "payment_terms_changed",
        "Payment Terms Changed",
        `${current.payment_terms} → ${next}`,
      );
      await serviceRows("business_financial_events", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          event_type: "payment_terms_changed",
          actor_type: "aps_staff",
          actor_user_id: staff.id,
          idempotency_key:
            `terms:${organizationId}:${current.payment_terms}:${next}:${crypto.randomUUID()}`,
          internal_detail: `${current.payment_terms} → ${next}`,
        }),
      });
      return json({
        ok: true,
        old_terms: current.payment_terms,
        payment_terms: next,
      });
    }

    if (command === "set_credit_hold") {
      const organizationId = id(body.organization_id),
        hold = body.credit_hold === true;
      if (!organizationId) throw new Error("Organization is required.");
      const reason = text(body.reason, 2000);
      if (hold && !reason) {
        throw new Error("An internal Credit Hold reason is required.");
      }
      await serviceRows(`organizations?id=eq.${organizationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          credit_hold: hold,
          credit_hold_reason: hold ? reason : null,
          credit_hold_at: hold ? new Date().toISOString() : null,
          credit_hold_by: hold ? staff.id : null,
          credit_hold_removed_at: hold ? null : new Date().toISOString(),
          credit_hold_removed_by: hold ? null : staff.id,
          updated_at: new Date().toISOString(),
        }),
      });
      await activity(
        organizationId,
        staff.id,
        hold ? "credit_hold_applied" : "credit_hold_removed",
        hold ? "Credit Hold Applied" : "Credit Hold Removed",
      );
      await serviceRows("business_financial_events", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          event_type: hold ? "credit_hold_applied" : "credit_hold_removed",
          actor_type: "aps_staff",
          actor_user_id: staff.id,
          idempotency_key:
            `credit-hold:${organizationId}:${hold}:${crypto.randomUUID()}`,
          internal_detail: reason || null,
        }),
      });
      return json({ ok: true, credit_hold: hold });
    }

    if (command === "save_organization") {
      const organizationId = id(body.organization_id);
      const payload = allowed(body, [
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
        "service_ron_enabled",
        "service_mobile_enabled",
        "service_print_enabled",
        "service_loan_signing_enabled",
        "internal_admin_notes",
      ]);
      payload.updated_at = new Date().toISOString();
      if (!text(payload.organization_name, 180)) {
        throw new Error("Organization name is required.");
      }
      const rows = organizationId
        ? await serviceRows(`organizations?id=eq.${organizationId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        : await serviceRows("organizations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      const organization = rows[0];
      await activity(
        organization.id,
        staff.id,
        organizationId ? "organization_updated" : "organization_created",
        organizationId ? "Organization Updated" : "Organization Created",
      );
      return json({ ok: true, organization });
    }

    if (command === "save_location") {
      const organizationId = id(body.organization_id);
      if (!organizationId) throw new Error("Organization is required.");
      const locationId = id(body.location_id);
      const payload = {
        ...allowed(body, [
          "organization_id",
          "location_name",
          "address_line1",
          "address_line2",
          "city",
          "state",
          "zip",
          "phone",
          "notes",
          "is_active",
          "is_default",
        ]),
        updated_at: new Date().toISOString(),
      };
      if (body.is_default === true) {
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
      const rows = locationId
        ? await serviceRows(
          `organization_locations?id=eq.${locationId}&organization_id=eq.${organizationId}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        )
        : await serviceRows("organization_locations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      await activity(
        organizationId,
        staff.id,
        locationId ? "location_updated" : "location_added",
        locationId ? "Location Updated" : "Location Added",
        text(body.location_name),
      );
      return json({ ok: true, location: rows[0] });
    }

    if (command === "approve_application") {
      const applicationId = id(body.application_id);
      if (!applicationId) throw new Error("Application is required.");
      const application = (await serviceRows(
        `business_account_applications?id=eq.${applicationId}&limit=1`,
      ))[0];
      if (!application) throw new Error("Application not found.");
      let organizationId = id(body.organization_id);
      const selectedTerms =
        ["prepaid", "due_on_receipt", "net_15", "net_30"].includes(
            text(body.payment_terms),
          )
          ? text(body.payment_terms)
          : "prepaid";
      if (!organizationId) {
        const rows = await serviceRows("organizations", {
          method: "POST",
          body: JSON.stringify({
            organization_name: application.organization_name,
            business_type: application.business_type,
            website: application.website,
            primary_email: application.business_email,
            primary_phone: application.phone,
            business_address_line1: application.address_line1,
            business_address_line2: application.address_line2,
            business_city: application.city,
            business_state: application.state,
            business_zip: application.zip,
            billing_contact_name: application.billing_contact_name,
            billing_contact_email: application.billing_contact_email,
            status: "active",
            payment_terms: selectedTerms,
            approved_at: new Date().toISOString(),
            approved_by: staff.id,
            service_ron_enabled: application.services_interested?.includes(
              "ron",
            ),
            service_mobile_enabled: application.services_interested?.includes(
              "mobile",
            ),
            service_print_enabled: application.services_interested?.includes(
              "print",
            ),
            service_loan_signing_enabled: false,
          }),
        });
        organizationId = rows[0].id;
      }
      await serviceRows(
        `business_account_applications?id=eq.${applicationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            organization_id: organizationId,
            status: "approved",
            reviewed_at: new Date().toISOString(),
            reviewed_by: staff.id,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      await activity(
        organizationId,
        staff.id,
        "application_approved",
        "Business Application Approved",
        `APS selected ${selectedTerms.replaceAll("_", " ")} payment terms.`,
        applicationId,
      );
      return json({
        ok: true,
        organization_id: organizationId,
        payment_terms: selectedTerms,
      });
    }

    if (command === "update_application") {
      const applicationId = id(body.application_id);
      if (!applicationId) throw new Error("Application is required.");
      const status = text(body.status);
      if (
        !["under_review", "information_requested", "declined", "withdrawn"]
          .includes(status)
      ) throw new Error("Unsupported application status.");
      const rows = await serviceRows(
        `business_account_applications?id=eq.${applicationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            internal_admin_notes: text(body.internal_admin_notes, 4000) || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: staff.id,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      return json({ ok: true, application: rows[0] });
    }

    if (command === "invite_member") {
      const organizationId = id(body.organization_id),
        email = text(body.email, 254).toLowerCase();
      if (!organizationId || !email.includes("@")) {
        throw new Error("Organization and email are required.");
      }
      const role = text(body.role);
      if (
        !["organization_admin", "order_creator", "billing", "viewer"].includes(
          role,
        )
      ) throw new Error("Supported organization role required.");
      const auth = await inviteAuthUser(
        email,
        `${origin}/business-login.html`,
        {
          access_domain: "organization_member",
          organization_id: organizationId,
          organization_role: role,
        },
      );
      const rows = await serviceRows("organization_members", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          user_id: auth.id || null,
          full_name: text(body.full_name, 180),
          email,
          phone: text(body.phone, 40) || null,
          role,
          status: "invited",
          invited_at: new Date().toISOString(),
          invited_by: staff.id,
        }),
      });
      await activity(
        organizationId,
        staff.id,
        "member_invited",
        "Organization Member Invited",
        `${email} · ${role}`,
      );
      return json({ ok: true, member: rows[0] });
    }

    if (command === "update_member") {
      const memberId = id(body.member_id);
      if (!memberId) throw new Error("Member is required.");
      const current =
        (await serviceRows(`organization_members?id=eq.${memberId}&limit=1`))[
          0
        ];
      if (!current) throw new Error("Member not found.");
      const payload = {
        ...allowed(body, ["role", "status"]),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>;
      if (body.status === "suspended") {
        payload.suspended_at = new Date().toISOString();
      }
      if (["removed", "revoked"].includes(String(body.status))) {
        payload.removed_at = new Date().toISOString();
      }
      const rows = await serviceRows(`organization_members?id=eq.${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await activity(
        current.organization_id,
        staff.id,
        body.role ? "member_role_changed" : `member_${body.status}`,
        body.role ? "Member Role Changed" : `Member ${text(body.status)}`,
        current.email,
      );
      return json({ ok: true, member: rows[0] });
    }

    if (command === "review_closure") {
      const closureId = id(body.closure_id), next = text(body.status);
      if (
        !closureId ||
        ![
          "under_review",
          "information_needed",
          "approved",
          "declined",
          "completed",
        ].includes(next)
      ) throw new Error("Supported closure review status is required.");
      const closure = (await serviceRows(
        `business_account_closure_requests?id=eq.${closureId}&limit=1`,
      ))[0];
      if (!closure) throw new Error("Closure request not found.");
      if (next === "completed") {
        const activeRequests = await serviceRows(
          `service_requests?select=id&organization_id=eq.${closure.organization_id}&status=not.in.(completed,cancelled,declined)&limit=1`,
        );
        const balances = await serviceRows(
          `invoices?select=id&organization_id=eq.${closure.organization_id}&balance_due=gt.0&status=not.in.(void,voided,cancelled)&limit=1`,
        );
        const pendingRefunds = await serviceRows(
          `refunds?select=id,invoice_id&status=in.(pending,processing)&limit=100`,
        );
        const organizationInvoiceIds = new Set(
          (await serviceRows(
            `invoices?select=id&organization_id=eq.${closure.organization_id}`,
          )).map((row: Record<string, unknown>) => row.id),
        );
        if (
          activeRequests.length || balances.length ||
          pendingRefunds.some((row: Record<string, unknown>) =>
            organizationInvoiceIds.has(row.invoice_id)
          )
        ) {
          throw new Error(
            "Resolve active requests and outstanding balances, pending refunds, and unresolved financial items before closing this organization.",
          );
        }
        await serviceRows(`organizations?id=eq.${closure.organization_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "closed",
            updated_at: new Date().toISOString(),
          }),
        });
      }
      await serviceRows(
        `business_account_closure_requests?id=eq.${closureId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: next,
            admin_notes: text(body.admin_notes, 4000) || null,
            resolution: text(body.resolution, 4000) || null,
            reviewed_by: staff.id,
            reviewed_at: new Date().toISOString(),
            completed_at: next === "completed"
              ? new Date().toISOString()
              : null,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      await activity(
        closure.organization_id,
        staff.id,
        `closure_${next}`,
        `Closure ${next.replaceAll("_", " ")}`,
      );
      return json({ ok: true });
    }
    if (command === "review_privacy") {
      const requestId = id(body.privacy_request_id), next = text(body.status);
      if (
        !requestId ||
        !["under_review", "information_needed", "resolved", "declined"]
          .includes(next)
      ) throw new Error("Supported privacy review status is required.");
      const target = (await serviceRows(
        `business_privacy_requests?id=eq.${requestId}&limit=1`,
      ))[0];
      if (!target) throw new Error("Privacy request not found.");
      await serviceRows(`business_privacy_requests?id=eq.${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: next,
          admin_notes: text(body.admin_notes, 4000) || null,
          resolution: text(body.resolution, 4000) || null,
          reviewed_by: staff.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      await activity(
        target.organization_id,
        staff.id,
        `privacy_${next}`,
        `Privacy Request ${next.replaceAll("_", " ")}`,
      );
      return json({ ok: true });
    }

    if (command === "resend_member_invitation") {
      const memberId = id(body.member_id);
      const member = (await serviceRows(
        `organization_members?id=eq.${memberId}&status=eq.invited&limit=1`,
      ))[0];
      if (!member) {
        throw new Error("An invited organization member is required.");
      }
      await resendAuthInvite(member.email, `${origin}/business-login.html`);
      await serviceRows(`organization_members?id=eq.${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          invited_at: new Date().toISOString(),
          invited_by: staff.id,
          updated_at: new Date().toISOString(),
        }),
      });
      await activity(
        member.organization_id,
        staff.id,
        "member_invitation_resent",
        "Member Invitation Resent",
        member.email,
      );
      return json({ ok: true });
    }

    if (command === "invite_staff") {
      const email = text(body.email, 254).toLowerCase(), role = text(body.role);
      if (
        !email.includes("@") ||
        ![
          "owner",
          "administrator",
          "operations",
          "billing",
          "support_read_only",
        ].includes(role)
      ) throw new Error("Valid staff email and role are required.");
      if (role === "owner" && staff.profile.role !== "owner") {
        throw new Error("Only an Owner may invite another Owner.");
      }
      const auth = await inviteAuthUser(email, `${origin}/admin-login.html`, {
        access_domain: "aps_staff",
        aps_staff_role: role,
      });
      const rows = await serviceRows("aps_staff_profiles", {
        method: "POST",
        body: JSON.stringify({
          user_id: auth.id || null,
          full_name: text(body.full_name, 180),
          email,
          role,
          status: "invited",
          permissions: body.permissions || {},
          invited_at: new Date().toISOString(),
          invited_by: staff.id,
        }),
      });
      await staffActivity(
        rows[0].id,
        staff.id,
        "staff_invited",
        "Staff Invited",
        `${email} · ${role}`,
      );
      return json({ ok: true, staff: rows[0] });
    }

    if (command === "update_staff") {
      const profileId = id(body.staff_profile_id);
      if (!profileId) throw new Error("Staff profile is required.");
      const target =
        (await serviceRows(`aps_staff_profiles?id=eq.${profileId}&limit=1`))[0];
      if (!target) throw new Error("Staff profile not found.");
      if (
        target.role === "owner" &&
        (body.role && body.role !== "owner" ||
          ["suspended", "removed"].includes(String(body.status)))
      ) {
        throw new Error(
          "Owner accounts cannot be demoted, suspended, or removed through routine staff management.",
        );
      }
      if (
        target.user_id === staff.id &&
        ["suspended", "removed"].includes(String(body.status))
      ) throw new Error("You cannot lock out your own active staff account.");
      const payload = {
        ...allowed(body, ["role", "status", "permissions"]),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>;
      if (body.status === "suspended") {
        payload.suspended_at = new Date().toISOString();
      }
      if (body.status === "removed") {
        payload.removed_at = new Date().toISOString();
      }
      const rows = await serviceRows(`aps_staff_profiles?id=eq.${profileId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await staffActivity(
        profileId,
        staff.id,
        body.role ? "role_changed" : `staff_${body.status}`,
        body.role ? "Staff Role Changed" : `Staff ${text(body.status)}`,
        target.email,
      );
      return json({ ok: true, staff: rows[0] });
    }

    if (command === "link_request") {
      const requestId = id(body.request_id),
        organizationId = id(body.organization_id);
      if (!requestId) throw new Error("Request is required.");
      const rows = await serviceRows(`service_requests?id=eq.${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ organization_id: organizationId || null }),
      });
      if (organizationId) {
        await activity(
          organizationId,
          staff.id,
          "request_linked",
          "Request Linked",
          requestId,
        );
      }
      return json({ ok: true, request: rows[0] });
    }
    throw new Error("Unsupported command.");
  } catch (error) {
    console.error("admin_business_foundation_failed", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Operation failed.",
    }, 400);
  }
});
