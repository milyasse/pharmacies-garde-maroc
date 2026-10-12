// Distance à vol d'oiseau (Haversine). Elle sert UNIQUEMENT au filtrage par rayon
// et au classement initial ; elle n'est jamais présentée comme une distance routière.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Le Maroc (approx., Sahara inclus) : garde-fou contre des coordonnées aberrantes. */
export function isInMorocco(lat: number, lng: number): boolean {
  return lat > 20.5 && lat < 36.1 && lng > -17.3 && lng < -0.9;
}

export interface Rankable {
  latitude: number | null;
  longitude: number | null;
  distanceStraightLineKm: number | null;
  rank: number | null;
}

/**
 * Calcule la distance à vol d'oiseau, écarte ce qui est hors rayon,
 * classe du plus proche au plus éloigné et numérote les rangs (1..n).
 * Les éléments sans coordonnées sont renvoyés à part (`unlocated`), jamais classés.
 */
export function filterAndRank<T extends Rankable>(
  items: T[],
  origin: LatLng,
  radiusKm: number,
): { ranked: T[]; unlocated: T[]; outside: number } {
  const ranked: T[] = [];
  const unlocated: T[] = [];
  let outside = 0;
  for (const it of items) {
    if (!isValidLatLng(it.latitude, it.longitude)) {
      unlocated.push({ ...it, distanceStraightLineKm: null, rank: null });
      continue;
    }
    const d = haversineKm(origin, { lat: it.latitude as number, lng: it.longitude as number });
    if (d <= radiusKm) ranked.push({ ...it, distanceStraightLineKm: d });
    else outside++;
  }
  ranked.sort((a, b) => (a.distanceStraightLineKm as number) - (b.distanceStraightLineKm as number));
  return { ranked: ranked.map((it, i) => ({ ...it, rank: i + 1 })), unlocated, outside };
}

export function formatKm(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

export function formatMinutes(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return '—';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}
