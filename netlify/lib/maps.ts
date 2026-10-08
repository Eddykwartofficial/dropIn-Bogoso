import { haversineKm } from '../../shared/pricing.js';
import { fail } from './http.js';

type LatLng = { lat: number; lng: number };
const key = () => process.env.GOOGLE_MAPS_API_KEY || '';

// Ghana bounding box, used to keep pins and searches inside the service country.
export function inGhana(p: LatLng) {
  return p.lat >= 4.5 && p.lat <= 11.3 && p.lng >= -3.4 && p.lng <= 1.3;
}

export async function autocomplete(input: string, sessionToken: string, near?: LatLng) {
  if (!key()) fail(503, 'Address search is not configured yet. Drop a pin on the map instead.');
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key() },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ['gh'],
      ...(near && {
        locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } },
      }),
    }),
  });
  if (!res.ok) fail(502, 'Address search is unavailable right now.');
  const data: any = await res.json();
  return (data.suggestions || [])
    .filter((s: any) => s.placePrediction)
    .slice(0, 6)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      main: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text,
      secondary: s.placePrediction.structuredFormat?.secondaryText?.text || '',
    }));
}

export async function placeDetails(placeId: string, sessionToken: string) {
  if (!key()) fail(503, 'Address search is not configured yet.');
  if (!/^[\w-]+$/.test(placeId)) fail(400, 'Invalid place.');
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`,
    { headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'displayName,formattedAddress,location' } }
  );
  if (!res.ok) fail(502, 'Could not load that place.');
  const p: any = await res.json();
  const name = p.displayName?.text;
  const address = p.formattedAddress || name;
  return {
    address: name && !address.startsWith(name) ? `${name}, ${address}` : address,
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
}

export async function reverseGeocode(p: LatLng) {
  const fallback = `Pinned location (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
  if (!key()) return fallback;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&key=${key()}`
    );
    const data: any = await res.json();
    return data.results?.[0]?.formatted_address || fallback;
  } catch {
    return fallback;
  }
}

export async function route(a: LatLng, b: LatLng) {
  const estimate = () => {
    const km = Math.round(haversineKm(a, b) * 1.35 * 10) / 10;
    return { km, minutes: Math.max(5, Math.round(km * 2.5)), estimated: true };
  };
  if (!key()) return estimate();
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key(),
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
        destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });
    const data: any = await res.json();
    const r = data.routes?.[0];
    if (!res.ok || !r?.distanceMeters) return estimate();
    return {
      km: Math.round((r.distanceMeters / 1000) * 10) / 10,
      minutes: Math.max(1, Math.round(parseInt(r.duration, 10) / 60)),
      estimated: false,
    };
  } catch {
    return estimate();
  }
}
