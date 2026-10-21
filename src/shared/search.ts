// Logique de recherche pure (testable) : sélection par date, filtre par type,
// filtrage par rayon et classement par distance à vol d'oiseau.

import type { CityId, DutyRecord, DutyType, Pharmacy } from './types.ts';
import { filterAndRank, type LatLng } from './distance.ts';
import { selectForDate, STATUS_ORDER } from './status.ts';

export type DutyFilter = 'all' | DutyType;

export function toPharmacy(r: DutyRecord): Pharmacy {
  const main = [...r.sources].sort((a, b) => (a.historyMatch ? -1 : 0) - (b.historyMatch ? -1 : 0) || (a.lastCheckedAt < b.lastCheckedAt ? 1 : -1))[0];
  const lastCheckedAt = r.sources.reduce((m, s) => (s.lastCheckedAt > m ? s.lastCheckedAt : m), '');
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    city: r.city,
    district: r.district,
    latitude: r.latitude,
    longitude: r.longitude,
    coordinatesSource: r.coordinatesSource ?? null,
    phone: r.phone,
    dutyStart: r.dutyStartDate,
    dutyEnd: r.dutyEndDate,
    dutyType: r.dutyType,
    dutyDate: r.dutyDate,
    hoursText: r.hoursText,
    dutyLabel: r.dutyLabel,
    sourceName: main?.sourceName ?? '—',
    sourceUrl: main?.sourceUrl ?? '',
    sourcePublishedAt: main?.sourcePublishedAt ?? null,
    lastCheckedAt,
    sources: r.sources,
    verificationStatus: r.verificationStatus,
    confidenceLevel: r.confidenceLevel,
    notes: r.notes,
    distanceStraightLineKm: null,
    distanceRoadKm: null,
    estimatedTravelMinutes: null,
    rank: null,
  };
}

export interface SearchOutcome {
  ranked: Pharmacy[]; // dans le rayon, non expirées, classées 1..n
  expired: Pharmacy[]; // dans le rayon mais expirées (non classées)
  unlocated: Pharmacy[]; // sans coordonnées : impossibles à placer, non classées
  outside: number; // nombre hors rayon
  totalForDate: number; // toutes villes confondues, avant filtres
  filteredOutByType: number;
}

export function buildResults(params: {
  dayRecords: DutyRecord[];
  previousDayRecords: DutyRecord[];
  date: string;
  origin: LatLng;
  radiusKm: number;
  dutyFilter: DutyFilter;
  now?: Date;
}): SearchOutcome {
  const { dayRecords, previousDayRecords, date, origin, radiusKm, dutyFilter, now = new Date() } = params;
  const selected = selectPharmacies(dayRecords, previousDayRecords, date, now);
  const byType = dutyFilter === 'all' ? selected : selected.filter((p) => p.dutyType === dutyFilter);
  const active = byType.filter((p) => p.verificationStatus !== 'expired');
  const expiredAll = byType.filter((p) => p.verificationStatus === 'expired');
  const r = filterAndRank(active, origin, radiusKm);
  const e = filterAndRank(expiredAll, origin, radiusKm);
  return {
    ranked: r.ranked,
    expired: e.ranked.map((p) => ({ ...p, rank: null })),
    unlocated: [...r.unlocated].sort((a, b) => STATUS_ORDER[a.verificationStatus] - STATUS_ORDER[b.verificationStatus]),
    outside: r.outside,
    totalForDate: selected.length,
    filteredOutByType: selected.length - byType.length,
  };
}

/** Re-classe selon la durée de trajet (les pharmacies sans durée calculée passent après). */
export function sortByDuration<T extends { estimatedTravelMinutes: number | null; distanceStraightLineKm: number | null }>(list: T[]): T[] {
  return [...list]
    .sort((a, b) => {
      const da = a.estimatedTravelMinutes, db = b.estimatedTravelMinutes;
      if (da === null && db === null) return (a.distanceStraightLineKm ?? 0) - (b.distanceStraightLineKm ?? 0);
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
}

/** Pharmacies de garde rattachées à la date (toutes villes, avant filtres). */
export function selectPharmacies(dayRecords: DutyRecord[], previousDayRecords: DutyRecord[], date: string, now: Date = new Date()): Pharmacy[] {
  return selectForDate(dayRecords, previousDayRecords, date, now).map(toPharmacy);
}

export interface CityCount {
  city: CityId;
  active: number; // non expirées
  continuous: number;
  day: number;
  night: number;
  unknownType: number;
  confirmed: number;
  expired: number;
}

/** Nombre de pharmacies de garde disponibles par ville (expirées comptées à part). */
export function countByCity(list: Pharmacy[], cities: CityId[]): CityCount[] {
  return cities.map((city) => {
    const inCity = list.filter((p) => p.city === city);
    const active = inCity.filter((p) => p.verificationStatus !== 'expired');
    return {
      city,
      active: active.length,
      continuous: active.filter((p) => p.dutyType === 'continuous').length,
      day: active.filter((p) => p.dutyType === 'day').length,
      night: active.filter((p) => p.dutyType === 'night').length,
      unknownType: active.filter((p) => p.dutyType === null).length,
      confirmed: active.filter((p) => p.verificationStatus === 'confirmed').length,
      expired: inCity.length - active.length,
    };
  });
}
