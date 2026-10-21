// Établissements de santé (cliniques et hôpitaux) — modèle partagé collecteur / application.
// Règle identique à celle des pharmacies : une information inconnue reste `null`, rien n'est inventé.

import type { CityId } from '../types.ts';

export type EstablishmentType =
  | 'public_hospital' // hôpital public (liste du ministère, CHU, opérateur public déclaré)
  | 'military_hospital' // hôpital militaire
  | 'private_hospital' // hôpital privé (opérateur privé déclaré, y compris à but non lucratif)
  | 'private_clinic' // clinique / polyclinique privée
  | 'hospital' // hôpital dont le statut public/privé n'est pas publié
  | 'other'; // autre établissement de soins pertinent

/** D'où vient une information. */
export type InfoSource = 'ministere' | 'osm' | 'nom' | 'manuel';

export type ServiceId =
  | 'emergency' | 'maternity' | 'gynaecology' | 'paediatrics' | 'cardiology' | 'surgery' | 'orthopaedics'
  | 'trauma' | 'oncology' | 'neurology' | 'ophthalmology' | 'nephrology' | 'general' | 'internal'
  | 'pulmonology' | 'gastroenterology' | 'endocrinology' | 'infectious' | 'psychiatry' | 'radiology'
  | 'nuclear' | 'dentistry' | 'biology' | 'rheumatology' | 'rehabilitation';

export interface ServiceInfo {
  id: ServiceId;
  source: InfoSource;
}

export interface EstablishmentSource {
  id: 'ministere-sante' | 'osm' | 'manuel';
  name: string;
  url: string; // fiche ou jeu de données
  license: string | null;
  /** Date de référence de la source (mise à jour du jeu de données, base OSM, vérification manuelle). */
  dataDate: string | null;
}

/** Niveau d'information atteint — distingués explicitement (cahier des charges §5). */
export interface EstablishmentLevels {
  listed: true; // 1. établissement répertorié (par au moins une source identifiable)
  emergencyDeclared: boolean; // 2. service d'urgences déclaré par une source
  hoursVerified: boolean; // 3. horaires vérifiés (source officielle / vérification datée)
  officialOnDuty: boolean; // 4. désigné de garde par une source officielle (pour la date consultée)
}

export interface DutyDesignation {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (inclus)
  sourceName: string;
  sourceUrl: string;
}

export interface Establishment {
  id: string;
  name: string;
  nameAr: string | null;
  type: EstablishmentType;
  typeSource: InfoSource | null;
  /** Catégorie officielle du ministère (ex. « Hôpital Provincial/Préfectoral »). */
  officialCategory: string | null;
  address: string | null;
  city: CityId | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null; // E.164 (+212…)
  website: string | null;
  services: ServiceInfo[];
  /** Urgences : 'yes' = déclarées, 'no' = la source indique l'absence, null = non publié. */
  emergency: 'yes' | 'no' | null;
  emergencySource: InfoSource | null;
  /** Horaires publiés. `verified` n'est vrai que pour une vérification datée avec source. */
  hours: { text: string; source: InfoSource; verified: boolean; verifiedAt: string | null; sourceUrl: string | null } | null;
  /** Désignations officielles de garde (uniquement avec une source officielle). */
  duty: DutyDesignation[];
  sources: EstablishmentSource[];
  osmIds: string[];
  notes: string[];
}

export interface HealthDataset {
  generatedAt: string; // ISO UTC
  osmBase: string | null; // horodatage de la base OSM interrogée
  ministryDataDate: string | null;
  lastError: string | null; // dernière erreur de collecte (données précédentes conservées)
  establishments: Establishment[];
}

/** Établissement + calculs liés à la recherche (distance, rang). */
export interface EstablishmentResult extends Establishment {
  distanceStraightLineKm: number | null;
  distanceRoadKm: number | null;
  estimatedTravelMinutes: number | null;
  rank: number | null;
  levels: EstablishmentLevels;
}
