const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const U = Deno.env.get("SUPABASE_URL") || "";
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown, max = 500) => String(value || "").trim().slice(0, max);
const types = new Set(["title_escrow", "signing_service", "lender", "law_office", "real_estate", "property_management", "corporate_business", "other"]);
const terms = new Set(["prepaid", "due_on_receipt", "net_15", "net_30"]);
const services = new Set(["ron", "mobile", "print", "loan_signing"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  try {
    const body = await req.json();
    const organizationName = clean(body.organization_name, 180);
    const email = clean(body.business_email, 254).toLowerCase();
    const businessType = clean(body.business_type, 40);
    const requestedTerms = clean(body.requested_payment_terms, 30) || "prepaid";
    if (organizationName.length < 2 || !email.includes("@") || !types.has(businessType) || !terms.has(requestedTerms)) throw new Error("Complete the required business account fields.");
    for (const field of ["primary_contact_name", "phone", "address_line1", "city", "state", "zip"]) if (!clean(body[field])) throw new Error("Complete the required contact and address fields.");
    const requestedServices = Array.isArray(body.services_interested) ? body.services_interested.map((v: unknown) => clean(v, 30)).filter((v: string) => services.has(v)) : [];
    if (!requestedServices.length) throw new Error("Select at least one service interest.");
    const normalized = organizationName.toLowerCase().replace(/\s+/g, " ");
    const domain = email.split("@")[1] || "";
    const website = clean(body.website, 300);
    const duplicateResponse = await fetch(`${U}/rest/v1/organizations?select=id,organization_name,primary_email,website,business_address_line1&or=(normalized_name.eq.${encodeURIComponent(normalized)},primary_email.ilike.*${encodeURIComponent(domain)},website.ilike.*${encodeURIComponent(domain)})&limit=10`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
    const duplicates = duplicateResponse.ok ? await duplicateResponse.json() : [];
    const payload = {
      organization_name: organizationName, business_type: businessType, website: website || null,
      primary_contact_name: clean(body.primary_contact_name, 180), business_email: email, phone: clean(body.phone, 40),
      address_line1: clean(body.address_line1, 220), address_line2: clean(body.address_line2, 220) || null,
      city: clean(body.city, 120), state: clean(body.state, 40), zip: clean(body.zip, 20),
      billing_contact_name: clean(body.billing_contact_name, 180) || null, billing_contact_email: clean(body.billing_contact_email, 254).toLowerCase() || null,
      services_interested: requestedServices, estimated_monthly_volume: clean(body.estimated_monthly_volume, 100) || null,
      requested_payment_terms: requestedTerms, applicant_notes: clean(body.notes, 4000) || null,
      duplicate_signals: { candidate_ids: duplicates.map((item: { id: string }) => item.id), review_required: duplicates.length > 0 }, status: "submitted",
    };
    const response = await fetch(`${U}/rest/v1/business_account_applications`, { method: "POST", headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(await response.text());
    const application = (await response.json())[0];
    return json({ ok: true, application_id: application.id, status: application.status });
  } catch (error) {
    console.error("business_account_application_failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Application could not be submitted." }, 400);
  }
});
