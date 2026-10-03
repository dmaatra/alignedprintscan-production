/** Read-only customer projection for a verified administrator; never used by customer mutations. */
export async function authorizeAdminPreview(req: Request, url: string, key: string): Promise<boolean> {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const headers = {apikey:key, Authorization:authorization, 'Content-Type':'application/json'};
  const identity = await fetch(`${url}/auth/v1/user`, {headers});
  if (!identity.ok || !(await identity.json()).id) return false;
  const admin = await fetch(`${url}/rest/v1/rpc/is_admin`, {method:'POST',headers,body:'{}'});
  return admin.ok && await admin.json() === true;
}

/** Request identifiers are public. Only verified ownership or a scoped token authorizes access. */
export async function authorizePortal(req: Request, requestId: string, token: unknown, url: string, key: string): Promise<boolean> {
  const headers = {apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json'};
  const value = String(token || '');
  if (/^[0-9a-f]{64}$/.test(value)) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const hash = Array.from(new Uint8Array(digest), x=>x.toString(16).padStart(2,'0')).join('');
    const response = await fetch(`${url}/rest/v1/customer_portal_access_tokens?select=service_request_id&service_request_id=eq.${encodeURIComponent(requestId)}&token_hash=eq.${hash}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`, {headers});
    if (response.ok && (await response.json()).length === 1) return true;
  }
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const identity = await fetch(`${url}/auth/v1/user`, {headers:{apikey:key, Authorization:authorization}});
  if (!identity.ok) return false;
  const user = await identity.json();
  if (!user.id || !user.email_confirmed_at || !user.email) return false;
  const response = await fetch(`${url}/rest/v1/service_requests?select=customers(email)&id=eq.${encodeURIComponent(requestId)}&limit=1`, {headers});
  if (!response.ok) return false;
  const rows = await response.json();
  const customer = Array.isArray(rows[0]?.customers) ? rows[0].customers[0] : rows[0]?.customers;
  return !!customer?.email && String(customer.email).trim().toLowerCase() === String(user.email).trim().toLowerCase();
}

export async function issuePortalToken(requestId: string, url: string, key: string): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), x=>x.toString(16).padStart(2,'0')).join('');
  const response = await fetch(`${url}/rest/v1/customer_portal_access_tokens`, {method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({service_request_id:requestId,token_hash:hash,expires_at:new Date(Date.now()+14*86400000).toISOString()})});
  if (!response.ok) throw new Error('Secure customer access could not be prepared.');
  return token;
}
