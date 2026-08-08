import type { GoongPrediction } from "@/src/lib/types/address";

const GOONG_BASE = "https://rsapi.goong.io";

interface GoongAutocompleteResponse {
  status: string;
  predictions: GoongPrediction[];
}

function getApiKey(): string {
  const key = process.env.GOONG_API_KEY;
  if (!key) throw new Error("GOONG_API_KEY is missing");
  return key;
}

export function getStoreLocation(): { lat: number; lng: number } {
  const latStr = process.env.STORE_LAT;
  const lngStr = process.env.STORE_LNG;
  if (!latStr || !lngStr) throw new Error("STORE_LAT or STORE_LNG is missing");
  return { lat: parseFloat(latStr), lng: parseFloat(lngStr) };
}

/**
 * Autocomplete — forward user query, biased to store location.
 * Uses location=lat,lng & radius=15000 to bias results to within 15km of the store.
 */
export async function goongAutocomplete(
  query: string,
  sessionToken?: string
): Promise<GoongPrediction[]> {
  const apiKey = getApiKey();
  const store = getStoreLocation();
  const url = new URL(`${GOONG_BASE}/Place/AutoComplete`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("input", query);
  url.searchParams.set("location", `${store.lat},${store.lng}`);
  url.searchParams.set("radius", "15000"); // 15km bias
  if (sessionToken) {
    url.searchParams.set("sessiontoken", sessionToken);
  }

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`Goong API error: ${res.status}`);
  }

  const data = (await res.json()) as GoongAutocompleteResponse;
  if (data.status !== "OK") {
    // If no results, Goong might return ZERO_RESULTS
    if (data.status === "ZERO_RESULTS") return [];
    throw new Error(`Goong API returned status: ${data.status}`);
  }

  return data.predictions.map((p) => ({
    place_id: p.place_id,
    description: p.description,
    structured_formatting: {
      main_text: p.structured_formatting.main_text,
      secondary_text: p.structured_formatting.secondary_text,
    },
  }));
}

/**
 * Geocode — convert full address text to lat/lng.
 */
export async function goongGeocode(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = getApiKey();
  const url = new URL(`${GOONG_BASE}/geocode`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("address", address);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`Goong API error: ${res.status}`);
  }

  const data = await res.json();
  if (data.status === "ZERO_RESULTS" || !data.results || data.results.length === 0) {
    return null;
  }
  if (data.status !== "OK") {
    throw new Error(`Goong API returned status: ${data.status}`);
  }

  const location = data.results[0].geometry.location;
  return { lat: location.lat, lng: location.lng };
}

/**
 * Distance Matrix — calculate road distance between two points.
 */
export async function goongDistanceMatrix(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  const apiKey = getApiKey();
  const url = new URL(`${GOONG_BASE}/DistanceMatrix`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("origins", `${originLat},${originLng}`);
  url.searchParams.set("destinations", `${destLat},${destLng}`);
  url.searchParams.set("vehicle", "bike"); // Use bike routing for better ETA

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`Goong API error: ${res.status}`);
  }

  const data = await res.json();
  if (data.rows && data.rows[0]?.elements && data.rows[0].elements[0]?.status === "OK") {
    const element = data.rows[0].elements[0];
    const distanceMeters = element.distance.value;
    const durationSeconds = element.duration.value;
    return {
      distanceKm: distanceMeters / 1000,
      durationMinutes: Math.round(durationSeconds / 60),
    };
  }

  return null;
}

/**
 * Reverse Geocode — convert lat/lng to a human-readable address.
 */
export async function goongReverseGeocode(
  lat: number,
  lng: number
): Promise<{ address: string } | null> {
  const apiKey = getApiKey();
  const url = new URL(`${GOONG_BASE}/Geocode`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("latlng", `${lat},${lng}`);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`Goong API error: ${res.status}`);
  }

  const data = await res.json();
  if (data.status === "ZERO_RESULTS" || !data.results || data.results.length === 0) {
    return null;
  }
  if (data.status !== "OK") {
    throw new Error(`Goong API returned status: ${data.status}`);
  }

  return { address: data.results[0].formatted_address };
}
