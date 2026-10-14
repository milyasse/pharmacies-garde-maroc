// Détection des doublons et fusion multi-sources.

import type { DutyRecord, SourceRef } from './types.ts';
import { haversineKm, isValidLatLng } from './distance.ts';
import { normalizeName, similarity } from './text.ts';
import { computeBaseStatus } from './status.ts';

export function recordId(city: string, name: string): string {
  return `${city}-${normalizeName(name).replace(/ /g, '-') || 'sans-nom'}`;
}

/** Deux fiches désignent-elles la même pharmacie ? */
export function isSamePharmacy(a: Pick<DutyRecord, 'id' | 'name' | 'city' | 'latitude' | 'longitude' | 'phone'> & { coordinatesSource?: DutyRecord['coordinatesSource'] }, b: typeof a): boolean {
  if (a.id === b.id) return true;
  if (a.city !== b.city) return false;
  if (a.phone && b.phone && a.phone === b.phone) return true;
  const sim = similarity(a.name, b.name);
  const bothLocated = isValidLatLng(a.latitude, a.longitude) && isValidLatLng(b.latitude, b.longitude) &&
    a.coordinatesSource !== 'district' && b.coordinatesSource !== 'district';
  if (bothLocated) {
    const d = haversineKm({ lat: a.latitude!, lng: a.longitude! }, { lat: b.latitude!, lng: b.longitude! });
    if (d <= 0.15 && sim >= 0.6) return true;
    if (d > 1.5) return false; // même nom mais très éloignées : deux officines différentes
  }
  return sim >= 0.9;
}

function pick<T>(a: T | null, b: T | null): T | null {
  return a ?? b ?? null;
}

function mergeSources(a: SourceRef[], b: SourceRef[]): SourceRef[] {
  const map = new Map<string, SourceRef>();
  for (const s of [...a, ...b]) {
    const k = s.sourceId + '|' + s.sourceUrl;
    const prev = map.get(k);
    if (!prev || prev.lastCheckedAt <= s.lastCheckedAt) {
      // Conserve un historique confirmé déjà observé si la nouvelle collecte n'en a pas
      map.set(k, prev && !s.historyMatch && prev.historyMatch ? { ...s, historyMatch: prev.historyMatch } : s);
    }
  }
  return [...map.values()];
}

/** Recalcule les champs dérivés (dates de garde, statut) à partir des sources. */
export function finalize(rec: DutyRecord): DutyRecord {
  const withHistory = rec.sources.find((s) => s.historyMatch);
  const base = computeBaseStatus(rec);
  const types = rec.sources.map((s) => s.dutyType).filter(Boolean);
  return {
    ...rec,
    dutyStartDate: withHistory?.historyMatch?.start ?? null,
    dutyEndDate: withHistory?.historyMatch?.end ?? null,
    dutyType: rec.dutyType ?? (types[0] ?? null),
    verificationStatus: base.status,
    confidenceLevel: base.confidence,
    notes: Array.from(new Set([...base.notes])),
  };
}

const COORD_RANK = { source: 3, geocoded: 2, district: 1 } as const;
function bestCoords(a: DutyRecord, b: DutyRecord) {
  const score = (r: DutyRecord) => (isValidLatLng(r.latitude, r.longitude) && r.coordinatesSource ? COORD_RANK[r.coordinatesSource] : 0);
  const w = score(b) > score(a) ? b : a;
  return { latitude: w.latitude, longitude: w.longitude, coordinatesSource: score(w) ? w.coordinatesSource : null };
}

export function mergeTwo(a: DutyRecord, b: DutyRecord): DutyRecord {
  const conflictCoords =
    a.coordinatesSource !== 'district' && b.coordinatesSource !== 'district' &&
    isValidLatLng(a.latitude, a.longitude) && isValidLatLng(b.latitude, b.longitude) &&
    haversineKm({ lat: a.latitude!, lng: a.longitude! }, { lat: b.latitude!, lng: b.longitude! }) > 0.3;
  const merged: DutyRecord = {
    ...a,
    address: pick(a.address, b.address),
    district: pick(a.district, b.district),
    // Position la plus précise : publiée par une source > géocodée > centre du quartier
    ...bestCoords(a, b),
    phone: pick(a.phone, b.phone),
    dutyType: b.dutyType ?? a.dutyType,
    dutyLabel: b.dutyLabel ?? a.dutyLabel,
    hoursText: b.hoursText ?? a.hoursText,
    sources: mergeSources(a.sources, b.sources),
  };
  const out = finalize(merged);
  if (a.phone && b.phone && a.phone !== b.phone) out.notes.push('Numéros de téléphone différents selon les sources.');
  if (conflictCoords) out.notes.push('Positions différentes selon les sources (écart > 300 m).');
  return out;
}

/** Fusionne une liste en éliminant les doublons. */
export function dedupe(records: DutyRecord[]): DutyRecord[] {
  const out: DutyRecord[] = [];
  for (const r of records) {
    const i = out.findIndex((o) => isSamePharmacy(o, r));
    if (i >= 0) out[i] = mergeTwo(out[i], r);
    else out.push(finalize(r));
  }
  return out;
}
