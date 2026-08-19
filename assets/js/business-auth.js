const BUSINESS_SUPABASE_URL = "https://sfsdniavqldgbiretply.supabase.co";
const BUSINESS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco";
const businessClient = window.supabase?.createClient(BUSINESS_SUPABASE_URL, BUSINESS_SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);
const escapeBusinessHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

async function portal(command, details = {}) {
  const { data, error } = await businessClient.functions.invoke("business-portal", { body: { command, ...details } });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

async function acceptBusinessInvitation() {
  const { data, error } = await businessClient.functions.invoke("accept-release2-invitation", { body: {} });
  if (error || !data?.ok || data.access_domain !== "organization_member") throw new Error(data?.error || error?.message || "Business invitation could not be activated.");
}

async function initBusinessLogin() {
  const login = byId("businessLoginForm"); if (!login || !businessClient) return;
  const status = byId("businessAuthStatus"), recovery = byId("businessRecoveryForm"), password = byId("businessPasswordForm");
  const params = new URLSearchParams(location.search);
  const isInvitation = location.hash.includes("type=invite");
  if (params.get("mode") === "recovery" || location.hash.includes("type=recovery") || isInvitation) {
    login.hidden = true; password.hidden = false; byId("showRecovery").hidden = true;
    byId("authTitle").textContent = location.hash.includes("type=invite") ? "Finish your invitation" : "Choose a new password";
  }
  login.addEventListener("submit", async (event) => { event.preventDefault(); status.textContent = "Signing in…"; const { error } = await businessClient.auth.signInWithPassword({ email: login.email.value.trim(), password: login.password.value }); if (error) return status.textContent = error.message; try { await portal("session"); location.href = "business.html"; } catch (failure) { await businessClient.auth.signOut(); status.textContent = failure.message; } });
  byId("showRecovery").addEventListener("click", () => { login.hidden = true; recovery.hidden = false; byId("showRecovery").hidden = true; byId("authTitle").textContent = "Reset your password"; });
  recovery.addEventListener("submit", async (event) => { event.preventDefault(); status.textContent = "Sending reset link…"; const { error } = await businessClient.auth.resetPasswordForEmail(recovery.email.value.trim(), { redirectTo: `${location.origin}/business-login.html?mode=recovery` }); status.textContent = error ? error.message : "If an eligible account exists, a reset link has been sent."; });
  password.addEventListener("submit", async (event) => { event.preventDefault(); status.textContent = "Saving password…"; const { error } = await businessClient.auth.updateUser({ password: password.password.value }); if (error) return status.textContent = error.message; try { if (isInvitation) await acceptBusinessInvitation(); await portal("session"); location.href = "business.html"; } catch (failure) { await businessClient.auth.signOut(); status.textContent = failure.message; } });
}

async function initBusinessPortal() {
  const status = byId("businessPortalStatus"); if (!status || !businessClient) return;
  byId("businessSignOut").addEventListener("click", async () => { await businessClient.auth.signOut(); location.href = "business-login.html"; });
  const { data: { session } } = await businessClient.auth.getSession(); if (!session) return location.replace("business-login.html");
  try {
    const context = await portal("session");
    const choose = () => { byId("organizationWorkspace").hidden = true; byId("organizationChooser").hidden = false; byId("organizationChoices").innerHTML = context.memberships.map((membership) => `<button class="organization-choice" data-organization="${escapeBusinessHtml(membership.organization_id)}"><strong>${escapeBusinessHtml(membership.organization_name)}</strong><span>${escapeBusinessHtml(membership.role.replaceAll("_", " "))}</span></button>`).join(""); document.querySelectorAll("[data-organization]").forEach((button) => button.addEventListener("click", () => loadOrganization(button.dataset.organization))); };
    const loadOrganization = async (organizationId) => { status.textContent = "Loading authorized organization data…"; const data = await portal("snapshot", { organization_id: organizationId }); byId("organizationChooser").hidden = true; byId("organizationWorkspace").hidden = false; byId("organizationName").textContent = data.organization.organization_name; byId("businessIdentity").textContent = `${data.membership.full_name} · ${data.membership.role.replaceAll("_", " ")}`; byId("organizationSummary").textContent = `${data.organization.payment_terms.replaceAll("_", " ")} terms · ${data.organization.credit_hold ? "account review required" : "account active"}`; byId("businessRequests").innerHTML = data.requests.length ? data.requests.map((request) => `<article class="business-request"><strong>${escapeBusinessHtml(request.service_type || "Service")} · ${escapeBusinessHtml(String(request.id).slice(0, 8).toUpperCase())}</strong><span>${escapeBusinessHtml(request.request_status || request.status || "Under review")}</span></article>`).join("") : "<p>No organization requests are currently available.</p>"; byId("switchOrganization").hidden = context.memberships.length < 2; status.textContent = "Access verified against your active membership."; };
    byId("switchOrganization").addEventListener("click", choose);
    if (context.memberships.length === 1) await loadOrganization(context.memberships[0].organization_id); else choose();
  } catch (failure) { await businessClient.auth.signOut(); status.textContent = failure.message; setTimeout(() => location.replace("business-login.html"), 1200); }
}
initBusinessLogin(); initBusinessPortal();
