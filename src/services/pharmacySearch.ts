// Chargement des données de garde publiées par le collecteur (public/data/*.json),
// avec un cache mémoire court pour ne pas re-télécharger à chaque changement de rayon ou de filtre.

import { CONFIG } from '../config.ts';
import type { CollectorStatus, DutySnapshot } from '../shared/types.ts';
import { addDays } from '../shared/dates.ts';

export class DataError extends Error {}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: 'no-cache' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new DataError('Impossible de charger les données de garde (réseau indisponible).');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new DataError(`Données de garde indisponibles (HTTP ${res.status}).`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new DataError('Données de garde illisibles.');
  }
}

/** Requête mise en cache 5 min (les requêtes identiques en cours sont partagées). Réutilisée par l'espace Cliniques & hôpitaux. */
export function cachedJson<T>(url: string, force = false): Promise<T | null> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T | null>;
  const value = getJson<T>(url).catch((e) => {
    cache.delete(url); // ne pas garder une erreur en cache
    throw e;
  });
  cache.set(url, { at: Date.now(), value });
  return value;
}

export function loadStatus(force = false) {
  return cachedJson<CollectorStatus>(`${CONFIG.dataUrl}/status.json`, force);
}

export async function loadSnapshots(date: string, force = false) {
  const [day, prev] = await Promise.all([
    cachedJson<DutySnapshot>(`${CONFIG.dataUrl}/duty/${date}.json`, force),
    cachedJson<DutySnapshot>(`${CONFIG.dataUrl}/duty/${addDays(date, -1)}.json`, force),
  ]);
  return { day, prev };
}
