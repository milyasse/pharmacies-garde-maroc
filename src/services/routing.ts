// Itinéraires routiers réels via OSRM. Jamais de ligne droite présentée comme une route.

import { CONFIG } from '../config.ts';
import type { LatLng } from '../shared/distance.ts';

export type TravelMode = 'car' | 'foot';

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][]; // [lat, lng]
  mode: TravelMode;
  provider: string;
}

export class RoutingError extends Error {}

const cache = new Map<string, RouteResult>();

function key(a: LatLng, b: LatLng, mode: TravelMode) {
  return [a.lat.toFixed(5), a.lng.toFixed(5), b.lat.toFixed(5), b.lng.toFixed(5), mode].join('|');
}

async function osrm(base: string, a: LatLng, b: LatLng, mode: TravelMode, signal?: AbortSignal): Promise<RouteResult> {
  const url = `${base.replace(/\/$/, '')}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new RoutingError('Moteur d’itinéraire saturé (trop de requêtes).');
  if (!res.ok) throw new RoutingError(`Moteur d’itinéraire indisponible (HTTP ${res.status}).`);
  const json = (await res.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (json.code !== 'Ok' || !json.routes?.length) throw new RoutingError('Aucun itinéraire routier trouvé.');
  const r = json.routes[0];
  return {
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    mode,
    provider: new URL(base).host,
  };
}

export async function getRoute(a: LatLng, b: LatLng, mode: TravelMode, signal?: AbortSignal): Promise<RouteResult> {
  const k = key(a, b, mode);
  const hit = cache.get(k);
  if (hit) return hit;
  const bases = mode === 'car' ? [CONFIG.osrmCarUrl, CONFIG.osrmCarFallbackUrl] : [CONFIG.osrmFootUrl];
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const r = await osrm(base, a, b, mode, signal);
      cache.set(k, r);
      return r;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  if (lastErr instanceof RoutingError) throw lastErr;
  throw new RoutingError('Moteur d’itinéraire injoignable. Utilisez le lien Google Maps.');
}

export function googleMapsDirectionsUrl(a: LatLng | null, b: LatLng, mode: TravelMode): string {
  const p = new URLSearchParams({ api: '1', destination: `${b.lat},${b.lng}`, travelmode: mode === 'car' ? 'driving' : 'walking' });
  if (a) p.set('origin', `${a.lat},${a.lng}`);
  return `https://www.google.com/maps/dir/?${p}`;
}

/** Lien universel « geo: » (ouvre l'application de navigation par défaut sur mobile). */
export function geoUri(b: LatLng, name: string): string {
  return `geo:${b.lat},${b.lng}?q=${b.lat},${b.lng}(${encodeURIComponent(name)})`;
}
