import { authenticatedUser, serviceRows } from "../_shared/release2-auth.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const user = await authenticatedUser(request);
    const email = String(user.email).trim().toLowerCase();
    const now = new Date().toISOString();
    const staff = await serviceRows(`aps_staff_profiles?select=*&or=(user_id.eq.${user.id},email.eq.${encodeURIComponent(email)})&limit=1`);
    if (staff[0]) {
      const rows = await serviceRows(`aps_staff_profiles?id=eq.${staff[0].id}&status=eq.invited`, { method: "PATCH", body: JSON.stringify({ user_id: user.id, status: "active", accepted_at: now, updated_at: now }) });
      return json({ ok: true, access_domain: "aps_staff", profile: rows[0] || staff[0] });
    }
    const members = await serviceRows(`organization_members?select=*&or=(user_id.eq.${user.id},email.eq.${encodeURIComponent(email)})&status=eq.invited`);
    if (members.length) {
      const accepted = [];
      for (const member of members) {
        const rows = await serviceRows(`organization_members?id=eq.${member.id}&status=eq.invited`, { method: "PATCH", body: JSON.stringify({ user_id: user.id, status: "active", accepted_at: now, updated_at: now }) });
        if (rows[0]) accepted.push(rows[0]);
      }
      return json({ ok: true, access_domain: "organization_member", memberships: accepted });
    }
    throw new Error("No pending APS invitation matches this authenticated account.");
  } catch (error) {
    console.error("release2_invitation_acceptance_failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Invitation acceptance failed." }, 400);
  }
});
