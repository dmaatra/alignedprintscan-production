import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORS_API_KEY = Deno.env.get("ORS_API_KEY") || "";

async function geocode(address: string) {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", ORS_API_KEY);
  url.searchParams.set("text", address);
  url.searchParams.set("boundary.country", "US");
  url.searchParams.set("size", "1");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!coords) throw new Error(`Address not found: ${address}`);
  return coords; // [lng, lat]
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!ORS_API_KEY) throw new Error("ORS_API_KEY is not configured in Supabase secrets.");
    const { start, end } = await req.json();
    if (!start || !end) throw new Error("Start and end addresses are required.");

    const startCoords = await geocode(String(start));
    const endCoords = await geocode(String(end));

    const routeRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
      method: "POST",
      headers: {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [startCoords, endCoords, startCoords],
        units: "mi",
      }),
    });

    if (!routeRes.ok) {
      const text = await routeRes.text();
      throw new Error(`Route failed: ${routeRes.status} ${text}`);
    }

    const route = await routeRes.json();
    const summary = route?.routes?.[0]?.summary;
    const distanceMiles = Number(summary?.distance || 0);
    const durationMinutes = Number(summary?.duration || 0) / 60;

    return new Response(JSON.stringify({
      ok: true,
      roundtrip_miles: distanceMiles,
      roundtrip_minutes: durationMinutes,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
