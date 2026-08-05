import { ProofError } from "./errors.ts";

export interface ProofAdminIdentity {
  id: string;
  email: string;
}

export interface ProofAdminAuthOptions {
  supabaseUrl?: string;
  anonKey?: string;
  fetcher?: typeof fetch;
}

export async function requireProofAdmin(
  request: Request,
  options: ProofAdminAuthOptions = {},
): Promise<ProofAdminIdentity> {
  const supabaseUrl = options.supabaseUrl ??
    Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = options.anonKey ?? Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const fetcher = options.fetcher ?? fetch;
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !anonKey) {
    throw new ProofError(
      "PROOF_CONFIGURATION_ERROR",
      "Supabase administrator authentication is not configured.",
      503,
    );
  }
  if (!token || authorization === token) {
    throw new ProofError(
      "PROOF_UNAUTHORIZED",
      "A valid administrator session is required.",
      401,
    );
  }

  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${token}` };
  const userResponse = await fetcher(`${supabaseUrl}/auth/v1/user`, {
    headers: authHeaders,
  });
  if (!userResponse.ok) {
    throw new ProofError(
      "PROOF_UNAUTHORIZED",
      "The administrator session is invalid or expired.",
      401,
    );
  }
  const user = await userResponse.json() as { id?: string; email?: string };
  if (!user.id || !user.email) {
    throw new ProofError(
      "PROOF_UNAUTHORIZED",
      "The administrator session has no usable identity.",
      401,
    );
  }

  const adminResponse = await fetcher(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: "{}",
  });
  const isAdmin = adminResponse.ok && await adminResponse.json() === true;
  if (!isAdmin) {
    throw new ProofError(
      "PROOF_FORBIDDEN",
      "Administrator access is required.",
      403,
    );
  }

  return { id: user.id, email: user.email };
}
