export const METERS_PER_MILE = 1609.344;

export function normalizeAddress(value = {}) {
  return {
    street_address: String(value.street_address || value.street || "").trim(),
    city: String(value.city || "").trim(),
    state: String(value.state || "").trim().toUpperCase(),
    zip: String(value.zip || "").trim(),
  };
}

export function completeAddress(value = {}) {
  const address = normalizeAddress(value);
  return Object.values(address).every(Boolean) ? address : null;
}

export function addressText(value = {}) {
  const address = normalizeAddress(value);
  return `${address.street_address}, ${address.city}, ${address.state} ${address.zip}`.trim();
}

export function routeMetrics(distanceMeters, durationSeconds) {
  const oneWayMiles = Number(distanceMeters) / METERS_PER_MILE;
  return {
    distance_meters: Number(distanceMeters),
    duration_seconds: Number(durationSeconds),
    one_way_miles: oneWayMiles,
    round_trip_miles: oneWayMiles * 2,
    display_one_way_miles: Math.round(oneWayMiles * 10) / 10,
    display_round_trip_miles: Math.round(oneWayMiles * 20) / 10,
    display_duration_minutes: Math.max(1, Math.round(Number(durationSeconds) / 60)),
  };
}

// Tier assignment uses the unrounded route result. Display rounding never changes a tier.
export function selectTravelTier(roundTripMiles, tiers = []) {
  const miles = Number(roundTripMiles);
  return [...tiers].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).find((tier) => {
    const minimum = Number(tier.minimum_round_trip_miles || 0);
    const maximum = tier.maximum_round_trip_miles == null ? null : Number(tier.maximum_round_trip_miles);
    return miles >= 0 && (minimum === 0 ? miles >= minimum : miles > minimum) && (maximum == null || miles <= maximum);
  }) || null;
}

export async function routeCacheKey(origin, destination, profile = "driving-car", version = "ors-v2") {
  const input = `${addressText(origin).toLowerCase()}|${addressText(destination).toLowerCase()}|${profile}|${version}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** @typedef {{ apiKey?: string, fetchImpl?: typeof fetch, baseUrl?: string, signal?: AbortSignal }} RouteRequestOptions */

/** @param {Record<string, unknown>} address @param {RouteRequestOptions} [options] */
export async function geocodeAddress(address, { apiKey, fetchImpl = fetch, baseUrl = "https://api.openrouteservice.org", signal } = {}) {
  if (!apiKey) throw new Error("Automatic travel calculation is not configured. Enter the mileage/travel charge manually or try again later.");
  const url = new URL(`${baseUrl}/geocode/search`);
  url.searchParams.set("text", addressText(address));
  url.searchParams.set("size", "1");
  url.searchParams.set("boundary.country", "US");
  const response = await fetchImpl(url, { headers: { Authorization: apiKey }, signal });
  if (response.status === 429) throw new Error("Automatic travel calculation is temporarily rate limited. Enter the mileage/travel charge manually or try again later.");
  if (!response.ok) throw new Error("Automatic travel calculation is unavailable. Enter the mileage/travel charge manually or try again.");
  const payload = await response.json();
  const coordinates = payload?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) {
    throw new Error("The route address could not be located. Verify the address or enter the mileage/travel charge manually.");
  }
  return coordinates;
}

/** @param {number[]} start @param {number[]} end @param {RouteRequestOptions} [options] */
export async function drivingRoute(start, end, { apiKey, fetchImpl = fetch, baseUrl = "https://api.openrouteservice.org", signal } = {}) {
  const response = await fetchImpl(`${baseUrl}/v2/directions/driving-car`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: [start, end] }),
    signal,
  });
  if (response.status === 429) throw new Error("Automatic travel calculation is temporarily rate limited. Enter the mileage/travel charge manually or try again later.");
  if (!response.ok) throw new Error("Automatic travel calculation is unavailable. Enter the mileage/travel charge manually or try again.");
  const payload = await response.json();
  const summary = payload?.routes?.[0]?.summary;
  if (!Number.isFinite(summary?.distance) || !Number.isFinite(summary?.duration)) {
    throw new Error("No driving route was found. Verify the addresses or enter the mileage/travel charge manually.");
  }
  return routeMetrics(summary.distance, summary.duration);
}
