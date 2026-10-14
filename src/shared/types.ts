// Types partagés entre le collecteur (GitHub Actions) et l'application web.
// Règle : une information inconnue reste `null`. Rien n'est complété artificiellement.

export type DutyType = 'day' | 'night' | 'continuous';

export type VerificationStatus =
  | 'confirmed' // garde correspondant à la date, vérifiée par une source datée
  | 'to_confirm' // trouvée, mais validité pour la date non établie
  | 'conflicting' // sources incompatibles
  | 'expired'; // période de garde passée

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type CityId = 'rabat' | 'sale' | 'temara';

export interface SourceRef {
  sourceId: string; // identifiant du connecteur (ex. "annuaire-gratuit")
  sourceName: string;
  sourceUrl: string; // fiche de la pharmacie chez la source
  listingUrl: string | null; // page liste consultée
  sourcePublishedAt: string | null; // date affichée par la page (YYYY-MM-DD), si présente
  lastCheckedAt: string; // ISO 8601 UTC de la dernière collecte
  /** Lignes d'historique de garde publiées par la source qui couvrent la date. */
  historyMatch: { start: string; end: string; label: string | null } | null;
  /** Ce que cette source dit de la garde (pour détecter les contradictions). */
  dutyType: DutyType | null;
  dutyLabel: string | null;
}

/** Enregistrement stocké dans public/data/duty/<date>.json */
export interface DutyRecord {
  id: string;
  name: string;
  address: string | null;
  city: CityId;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinatesSource: 'source' | 'geocoded' | 'district' | null; // 'district' = centre du quartier (approximatif)
  phone: string | null;
  dutyDate: string; // date (YYYY-MM-DD) à laquelle la source rattache la garde
  dutyType: DutyType | null;
  dutyLabel: string | null; // libellé brut publié
  hoursText: string | null; // plage horaire publiée (ex. "9h-23h"), sinon null
  dutyStartDate: string | null; // début de garde publié (historique), sinon null
  dutyEndDate: string | null; // fin de garde publiée (historique), sinon null
  sources: SourceRef[];
  verificationStatus: VerificationStatus;
  confidenceLevel: ConfidenceLevel;
  notes: string[];
}

export interface DutySnapshot {
  date: string;
  generatedAt: string;
  records: DutyRecord[];
}

export interface SourceRunStatus {
  sourceId: string;
  sourceName: string;
  city: CityId;
  url: string;
  ok: boolean;
  pageDate: string | null;
  count: number;
  error: string | null;
  checkedAt: string;
}

export interface CollectorStatus {
  generatedAt: string;
  todayMorocco: string;
  dates: string[]; // dates disponibles (fichiers duty/<date>.json)
  runs: SourceRunStatus[];
  connectors: ConnectorInfo[];
}

export interface ConnectorInfo {
  id: string;
  name: string;
  homepage: string;
  enabled: boolean;
  cities: CityId[];
  reason: string; // pourquoi activé / désactivé
}

/** Modèle normalisé exposé à l'interface (cf. cahier des charges §9). */
export interface Pharmacy {
  id: string;
  name: string;
  address: string | null;
  city: CityId;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinatesSource: 'source' | 'geocoded' | 'district' | null;
  phone: string | null;
  dutyStart: string | null;
  dutyEnd: string | null;
  dutyType: DutyType | null;
  dutyDate: string;
  hoursText: string | null;
  dutyLabel: string | null;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  lastCheckedAt: string;
  sources: SourceRef[];
  verificationStatus: VerificationStatus;
  confidenceLevel: ConfidenceLevel;
  notes: string[];
  distanceStraightLineKm: number | null;
  distanceRoadKm: number | null;
  estimatedTravelMinutes: number | null;
  rank: number | null;
}
