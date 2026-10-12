// Géocodage de l'adresse de départ saisie (Nominatim / OpenStreetMap).
// Politique d'usage Nominatim : pas d'autocomplétion à la frappe, ≤ 1 requête/s, attribution.
// On n'appelle donc ce service qu'à la validation du formulaire, avec un cache mémoire.

import { CONFIG } from '../config.ts';

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, Place[]>();
let last = 0;

export async function searchPlace(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) throw new Error('Adresse trop courte : précisez une rue, un quartier ou une ville.');
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'ma',
    'accept-language': 'fr',
    // Zone de démarrage Rabat–Salé–Témara privilégiée, sans exclure le reste du Maroc
    viewbox: '-7.10,34.15,-6.65,33.80',
    bounded: '0',
  });
  let res: Response;
  try {
    res = await fetch(`${CONFIG.nominatimUrl}/search?${params}`, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Service de recherche d’adresse injoignable. Vérifiez la connexion ou touchez la carte.');
  }
  if (res.status === 429) throw new Error('Trop de recherches d’adresse en peu de temps. Patientez quelques secondes.');
  if (!res.ok) throw new Error(`Recherche d’adresse indisponible (HTTP ${res.status}).`);
  const arr = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  const out = arr
    .map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  cache.set(key, out);
  return out;
}
