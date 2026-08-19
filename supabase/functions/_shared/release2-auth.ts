const U = Deno.env.get("SUPABASE_URL") || "";
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const A = Deno.env.get("SUPABASE_ANON_KEY") || "";

export async function serviceRows(path: string, init: RequestInit = {}) {
  const response = await fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

export async function requireRelease2Staff(request: Request, permission?: string) {
  const user = await authenticatedUser(request);
  const profiles = await serviceRows(`aps_staff_profiles?select=*&user_id=eq.${user.id}&limit=1`);
  let profile = profiles[0];
  if (profile?.status === "invited") {
    const activated = await serviceRows(`aps_staff_profiles?id=eq.${profile.id}&status=eq.invited`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active", accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    profile = activated[0] || profile;
  }
  if (!profile) throw new Error("Active APS staff access is required.");
  if (profile.status !== "active") throw new Error("Active APS staff access is required.");
  if (permission && profile.role !== "owner" && profile.permissions?.[permission] !== true) throw new Error("This staff permission is required.");
  return { ...user, profile };
}

export async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) throw new Error("Authentication is required.");
  const response = await fetch(`${U}/auth/v1/user`, { headers: { apikey: A, Authorization: authorization } });
  if (!response.ok) throw new Error("Authentication is required.");
  const user = await response.json();
  if (!user?.id || !user?.email) throw new Error("Authentication is required.");
  return user;
}

export async function inviteAuthUser(email: string, redirectTo: string, metadata: Record<string, unknown>) {
  const response = await fetch(`${U}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirect_to: redirectTo, data: metadata }),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

export async function resendAuthInvite(email: string, redirectTo: string) {
  const response = await fetch(`${U}/auth/v1/resend`, {
    method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "invite", email, options: { emailRedirectTo: redirectTo } }),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}
