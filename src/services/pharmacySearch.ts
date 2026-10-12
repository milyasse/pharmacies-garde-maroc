// Chargement des données de garde publiées par le collecteur (public/data/*.json).

import { CONFIG } from '../config.ts';
import type { CollectorStatus, DutySnapshot } from '../shared/types.ts';
import { addDays } from '../shared/dates.ts';

export class DataError extends Error {}

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

export function loadStatus(signal?: AbortSignal) {
  return getJson<CollectorStatus>(`${CONFIG.dataUrl}/status.json`, signal);
}

export async function loadSnapshots(date: string, signal?: AbortSignal) {
  const [day, prev] = await Promise.all([
    getJson<DutySnapshot>(`${CONFIG.dataUrl}/duty/${date}.json`, signal),
    getJson<DutySnapshot>(`${CONFIG.dataUrl}/duty/${addDays(date, -1)}.json`, signal),
  ]);
  return { day, prev };
}
