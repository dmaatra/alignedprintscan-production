const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
}

Deno.serve(async (req) => {
  try {
    const event = await req.json();
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const requestId = session.metadata?.request_id;
      if (requestId) {
        await supabaseFetch(`service_requests?id=eq.${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "payment_received",
            payment_status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent || null,
            paid_amount: Number(session.amount_total || 0) / 100
          })
        });
        await supabaseFetch(`request_status_updates`, { method: "POST", body: JSON.stringify({ service_request_id: requestId, status: "payment_received", message: "Stripe payment received.", sent_email: false, sent_sms: false }) });
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
});
