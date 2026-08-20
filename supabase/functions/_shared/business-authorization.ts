import { authenticatedUser, serviceRows } from "./release2-auth.ts";

export const BUSINESS_ROLES = [
  "organization_admin",
  "order_creator",
  "billing",
  "viewer",
] as const;
export type BusinessRole = typeof BUSINESS_ROLES[number];

export const CAPABILITIES: Record<string, readonly BusinessRole[]> = {
  view_requests: BUSINESS_ROLES,
  create_request: ["organization_admin", "order_creator"],
  mutate_request: ["organization_admin", "order_creator"],
  view_documents: ["organization_admin", "order_creator", "viewer"],
  view_billing: ["organization_admin", "billing"],
  manage_members: ["organization_admin"],
};

export function roleAllows(
  role: string,
  capability: keyof typeof CAPABILITIES,
) {
  return CAPABILITIES[capability].includes(role as BusinessRole);
}

export function safePick(
  row: Record<string, unknown>,
  keys: readonly string[],
) {
  return Object.fromEntries(
    keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  );
}

export function assertResourceOrganization(
  resource: Record<string, unknown> | undefined,
  organizationId: string,
) {
  if (!resource || resource.organization_id !== organizationId) {
    throw new Error("Resource access denied.");
  }
  return resource;
}

export function documentMayBeReleased(document: Record<string, unknown>) {
  const classification = String(document.document_classification || "")
    .toLowerCase();
  const internal = [
    "internal",
    "internal_qc",
    "proof_admin",
    "provider_payload",
    "stipulation",
  ].includes(classification) || classification.endsWith("_private") || classification.startsWith("lsa_stipulation_proof") || classification.startsWith("lsa_dropoff_proof");
  return document.is_active === true && document.customer_visible === true &&
    document.eligible_for_delivery === true && !internal;
}

export async function requireBusinessContext(
  req: Request,
  organizationId?: string,
) {
  const user = await authenticatedUser(req);
  const memberships = await serviceRows(
    `organization_members?select=id,organization_id,full_name,email,role,status,accepted_at&user_id=eq.${user.id}&status=eq.active`,
  );
  const organizationIds = memberships.map((row: Record<string, unknown>) =>
    row.organization_id
  ).filter(Boolean);
  const organizations = organizationIds.length
    ? await serviceRows(
      `organizations?select=id,organization_name,status&id=in.(${
        organizationIds.join(",")
      })&status=eq.active`,
    )
    : [];
  const activeIds = new Set(
    organizations.map((row: Record<string, unknown>) => row.id),
  );
  const activeMemberships = memberships.filter((row: Record<string, unknown>) =>
    activeIds.has(row.organization_id)
  );
  if (!activeMemberships.length) {
    throw new Error("Active business membership is required.");
  }
  if (!organizationId) {
    return { user, memberships: activeMemberships, organizations };
  }
  const membership = activeMemberships.find((row: Record<string, unknown>) =>
    row.organization_id === organizationId
  );
  if (!membership) {
    throw new Error("Active membership in this organization is required.");
  }
  return { user, membership, memberships: activeMemberships, organizations };
}

export function requireCapability(
  membership: Record<string, unknown>,
  capability: keyof typeof CAPABILITIES,
) {
  if (!roleAllows(String(membership.role || ""), capability)) {
    throw new Error(
      "This organization role is not permitted to perform that action.",
    );
  }
}
