import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const edge = read("supabase/functions/business-portal/index.ts");
const auth = read("supabase/functions/_shared/business-authorization.ts");
const migration = read("supabase/migrations/20260819081357_release_3_business_auth_authorization.sql");
const browser = read("assets/js/business-auth.js");

test("business authorization revalidates live membership and active organization", () => {
  assert.match(auth, /user_id=eq\.\$\{user\.id\}&status=eq\.active/);
  assert.match(auth, /organizations\?select=id,organization_name,status/);
  assert.match(edge, /requireBusinessContext\(req, organizationId\)/);
});

test("operational tenant records are not directly browser-readable", () => {
  for (const policy of ["organizations_member_read", "organization_members_tenant_read", "organization_locations_tenant_read", "organization_activity_tenant_read"]) assert.match(migration, new RegExp(`drop policy if exists ${policy}`));
  assert.doesNotMatch(migration, /create policy .*tenant.*read/i);
});

test("document access accepts an id, derives its path, and uses a short-lived URL", () => {
  assert.match(edge, /document_id/);
  assert.doesNotMatch(edge, /body\.file_path|body\.storage_path/);
  assert.match(edge, /customer_visible=eq\.true&eligible_for_delivery=eq\.true/);
  assert.match(edge, /expiresIn: 60/);
});

test("browser bundle contains no service-role credential", () => {
  assert.doesNotMatch(browser, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(browser, /functions\.invoke\("business-portal"/);
});

test("business and APS staff entry points are independently authorized", () => {
  assert.match(read("assets/js/admin.js"), /command: "staff_access"/);
  assert.match(read("supabase/functions/admin-business-foundation/index.ts"), /requireRelease2Staff/);
  assert.match(read("business-login.html"), /approved Business Account/);
  assert.match(read("business-login.html"), /business-forgot-password\.html/);
});

test("business invitation continuation activates membership before opening a session", () => {
  assert.match(browser, /functions\.invoke\("accept-release2-invitation"/);
  assert.match(browser, /if\(invite\)await acceptBusinessInvitation\(\);await portal\("session"\)/);
});
