// Recherche d'établissements : filtres (type, service, urgences déclarées), rayon, classement par distance.
// Réutilise filterAndRank (Haversine) de l'espace Pharmacies.
import { filterAndRank, type LatLng } from '../distance.ts';
import type { Establishment, EstablishmentLevels, EstablishmentResult, EstablishmentType, ServiceId } from './types.ts';

export type SortOrder = 'asc' | 'desc';

export interface HealthQuery {
  origin: LatLng;
  radiusKm: number;
  types: EstablishmentType[]; // vide = tous
  service: ServiceId | null;
  emergencyOnly: boolean;
  date: string; // YYYY-MM-DD (heure du Maroc) pour évaluer une désignation officielle de garde
  sort: SortOrder;
}

export interface HealthOutcome {
  ranked: EstablishmentResult[];
  unlocated: EstablishmentResult[]; // correspondent aux filtres mais sans position publiée
  outside: number; // hors rayon
  filteredOut: number; // écartés par les filtres type / service / urgences
}

export function levelsOf(e: Establishment, date: string): EstablishmentLevels {
  return {
    listed: true,
    emergencyDeclared: e.emergency === 'yes',
    hoursVerified: !!e.hours?.verified,
    officialOnDuty: e.duty.some((d) => d.from <= date && date <= d.to),
  };
}

export function matchesFilters(e: Establishment, q: Pick<HealthQuery, 'types' | 'service' | 'emergencyOnly'>): boolean {
  if (q.types.length && !q.types.includes(e.type)) return false;
  if (q.service && !e.services.some((s) => s.id === q.service)) return false;
  if (q.emergencyOnly && e.emergency !== 'yes') return false;
  return true;
}

export function searchEstablishments(list: Establishment[], q: HealthQuery): HealthOutcome {
  const kept = list.filter((e) => matchesFilters(e, q));
  const items: EstablishmentResult[] = kept.map((e) => ({
    ...e, distanceStraightLineKm: null, distanceRoadKm: null, estimatedTravelMinutes: null, rank: null, levels: levelsOf(e, q.date),
  }));
  const { ranked, unlocated, outside } = filterAndRank(items, q.origin, q.radiusKm);
  // le rang (et la couleur du marqueur) suit toujours la proximité ; seul l'ordre d'affichage change
  const ordered = q.sort === 'desc' ? [...ranked].reverse() : ranked;
  return { ranked: ordered, unlocated, outside, filteredOut: list.length - kept.length };
}

/** Services réellement présents dans les données (pour ne proposer que des filtres utiles). */
export function availableServices(list: Establishment[]): ServiceId[] {
  const count = new Map<ServiceId, number>();
  for (const e of list) for (const s of e.services) count.set(s.id, (count.get(s.id) ?? 0) + 1);
  const order: ServiceId[] = ['emergency', 'maternity', 'paediatrics', 'gynaecology', 'cardiology', 'surgery', 'orthopaedics', 'trauma', 'oncology', 'ophthalmology', 'neurology', 'psychiatry'];
  return [...count.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (count.get(b)! - count.get(a)!);
  });
}
