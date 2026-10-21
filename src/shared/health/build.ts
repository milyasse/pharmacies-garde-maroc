// Construction de la liste des établissements à partir de sources identifiables :
//  1. OpenStreetMap (Overpass) : position, téléphone, adresse, spécialités, urgences déclarées ;
//  2. liste officielle des hôpitaux du ministère de la Santé (data.gov.ma) ;
//  3. saisies manuelles vérifiées (manual/sante.json) : horaires vérifiés, garde officielle…
// Aucune valeur n'est inventée : ce qui n'est publié par aucune source reste null.

import type { CityId } from '../types.ts';
import { isInMorocco, isValidLatLng, haversineKm } from '../distance.ts';
import { normalizeMoroccanPhone, stripAccents } from '../text.ts';
import { OSM_SPECIALITY } from './labels.ts';
import type {
  DutyDesignation, Establishment, EstablishmentSource, EstablishmentType, InfoSource, ServiceId, ServiceInfo,
} from './types.ts';

// ---------- Entrées ----------

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements: OverpassElement[];
}

export interface MinistryFile {
  source: string;
  jeuDeDonnees: string;
  licence: string;
  donneesMisesAJourLe: string;
  hopitaux: { nom: string; categorie: string; categorieLibelle: string | null; delegation: string; commune: string; ville: CityId }[];
}

export interface CorrespondenceFile {
  correspondances: { ministere: string; osm: string[]; nomUsuel?: string }[];
}

/** Fichier manual/sante.json : informations vérifiées à la main, toujours avec leur source. */
export interface ManualHealthFile {
  etablissements: {
    /** Identifiant OSM (« way/123 ») ou nom exact d'un établissement déjà connu. */
    osm?: string;
    nom?: string;
    telephone?: string;
    urgences?: { statut: 'oui' | 'non'; source: string; url: string; verifieLe: string };
    horaires?: { texte: string; source: string; url: string; verifieLe: string };
    garde?: { du: string; au: string; source: string; url: string }[];
  }[];
}

// ---------- Filtrage des objets OSM ----------

/** Noms qui ne désignent pas une clinique ou un hôpital (cabinet, laboratoire, magasin, dialyse…). */
// (testé sur le nom sans accents : `\b` ne reconnaît pas les lettres accentuées)
const EXCLUDE_NAME = /\b(cabinet|docteur|dr|dc|materiel|labo(ratoire)?|radiolog\w*|anatomie|patholog\w*|hemodialyse|dialyse|nephrolog\w*|sos medecins?|centre de sante|croix[- ]rouge|red med|top medical|actilab)\b|المركز الصحي|مستوصف/i;
/** Noms trop génériques pour identifier un établissement. */
const GENERIC_NAME = /^(polyclinique|clinique|h[ôo]pital|hospital|centre de sant[ée]|المستعجلات|rhumatologie|urgences?)$/i;
/** Pour amenity=clinic : on ne garde que ce qui se présente comme clinique / hôpital. */
const CLINIC_WORD = /(poly)?clinique|h[ôo]pital|hospital|مصحة|مستشفى|مستشفي/i;

export function osmKey(e: Pick<OverpassElement, 'type' | 'id'>): string {
  return `${e.type}/${e.id}`;
}

function osmName(t: Record<string, string>): { name: string | null; nameAr: string | null } {
  const ar = t['name:ar'] ?? (/[؀-ۿ]/.test(t.name ?? '') && !/[a-z]/i.test(t.name ?? '') ? t.name : null) ?? null;
  const latin = t['name:fr'] ?? (t.name && /[a-z]/i.test(t.name) ? t.name : null) ?? t['name:en'] ?? null;
  // « Nom latin - اسم عربي » : on garde la partie latine pour le titre
  const clean = latin?.split(/\s+[-–]\s+(?=[؀-ۿ])/)[0].trim() ?? null;
  return { name: clean ?? ar, nameAr: ar && ar !== clean ? ar : null };
}

export function isRelevantOsm(e: OverpassElement): boolean {
  const t = e.tags ?? {};
  const kind = t.amenity ?? t.healthcare;
  if (kind !== 'hospital' && kind !== 'clinic') return false;
  const { name } = osmName(t);
  if (!name) return false;
  if (EXCLUDE_NAME.test(stripAccents(name)) || EXCLUDE_NAME.test(stripAccents(t.name ?? ''))) return false;
  if (GENERIC_NAME.test(name.trim())) return false;
  if (kind === 'clinic' && !CLINIC_WORD.test(`${name} ${t.name ?? ''}`)) return false;
  return true;
}

// ---------- Classification ----------

export function classifyOsm(t: Record<string, string>, name: string): { type: EstablishmentType; source: InfoSource } {
  const n = stripAccents(`${name} ${t.name ?? ''}`.toLowerCase());
  const op = (t['operator:type'] ?? '').toLowerCase();
  const kind = t.amenity ?? t.healthcare;
  if (/militaire|military|العسكري/.test(n)) return { type: 'military_hospital', source: 'nom' };
  if (/^(public|government|public_administration)$/.test(op)) return { type: 'public_hospital', source: 'osm' };
  if (/\bchu\b|\bhcu\b|centre hospitalier universitaire|hopital public/.test(n)) return { type: 'public_hospital', source: 'nom' };
  if (/^private/.test(op)) {
    return { type: kind === 'clinic' || /clinique|مصحة/.test(n) ? 'private_clinic' : 'private_hospital', source: 'osm' };
  }
  if (/(^|\s)(poly)?clinique|مصحة/.test(n)) return { type: 'private_clinic', source: 'nom' };
  if (/hopital prive|hospital prive/.test(n)) return { type: 'private_hospital', source: 'nom' };
  if (kind === 'hospital') return { type: 'hospital', source: 'osm' };
  return { type: 'other', source: 'osm' };
}

/** Services déduits uniquement de données explicites (clés OSM) ou du nom officiel (ex. « Maternité … »). */
export function servicesFrom(t: Record<string, string>, name: string): ServiceInfo[] {
  const out = new Map<ServiceId, InfoSource>();
  for (const raw of (t['healthcare:speciality'] ?? '').split(/[;,]/)) {
    const id = OSM_SPECIALITY[raw.trim().toLowerCase()];
    if (id) out.set(id, 'osm');
  }
  if (t.emergency === 'yes') out.set('emergency', 'osm');
  addNameServices(name, out);
  return [...out].map(([id, source]) => ({ id, source }));
}

function addNameServices(name: string, out: Map<ServiceId, InfoSource>) {
  const n = stripAccents(name.toLowerCase());
  const add = (id: ServiceId) => { if (!out.has(id)) out.set(id, 'nom'); };
  if (/maternit/.test(n)) add('maternity');
  if (/enfant|pediatr/.test(n)) add('paediatrics');
  if (/oncolog|انكولوجيا|الأنكولوجيا/.test(n)) add('oncology');
  if (/cardiolog/.test(n)) add('cardiology');
  if (/ophtalm|ophthalm|vision|العيون|الأعين/.test(n)) add('ophthalmology');
  if (/psychiatr/.test(n)) add('psychiatry');
}

export function cityFromOsm(t: Record<string, string>): CityId | null {
  const c = stripAccents((t['addr:city'] ?? '').toLowerCase());
  if (/rabat|الرباط/.test(c)) return 'rabat';
  if (/\bsale\b|سلا/.test(c)) return 'sale';
  if (/temara|تمارة/.test(c)) return 'temara';
  return null;
}

function addressFromOsm(t: Record<string, string>): string | null {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ').trim();
  const parts = [t['addr:housename'], street || null, t['addr:postcode']].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// ---------- Construction ----------

const OSM_LICENSE = 'ODbL — © contributeurs OpenStreetMap';

function osmSource(key: string, base: string | null): EstablishmentSource {
  return { id: 'osm', name: 'OpenStreetMap', url: `https://www.openstreetmap.org/${key}`, license: OSM_LICENSE, dataDate: base ? base.slice(0, 10) : null };
}

export function establishmentFromOsm(e: OverpassElement, base: string | null): Establishment | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat ?? null;
  const lng = e.lon ?? e.center?.lon ?? null;
  const { name, nameAr } = osmName(t);
  if (!name) return null;
  const located = lat !== null && lng !== null && isValidLatLng(lat, lng) && isInMorocco(lat, lng);
  const { type, source } = classifyOsm(t, name);
  const key = osmKey(e);
  const emergency = t.emergency === 'yes' ? 'yes' : t.emergency === 'no' ? 'no' : null;
  return {
    id: `osm-${e.type[0]}${e.id}`,
    name,
    nameAr,
    type,
    typeSource: source,
    officialCategory: null,
    address: addressFromOsm(t),
    city: cityFromOsm(t),
    district: t['addr:suburb'] ?? t['addr:district'] ?? null,
    latitude: located ? lat : null,
    longitude: located ? lng : null,
    phone: normalizeMoroccanPhone(t.phone ?? t['contact:phone'] ?? null),
    website: (t.website ?? t['contact:website'] ?? null) || null,
    services: servicesFrom(t, `${name} ${nameAr ?? ''}`),
    emergency,
    emergencySource: emergency ? 'osm' : null,
    hours: t.opening_hours ? { text: t.opening_hours, source: 'osm', verified: false, verifiedAt: null, sourceUrl: `https://www.openstreetmap.org/${key}` } : null,
    duty: [],
    sources: [osmSource(key, base)],
    osmIds: [key],
    notes: [],
  };
}

/** Nom « cœur » pour repérer les doublons OSM (même établissement saisi deux fois). */
export function coreName(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/\bmy\b/g, 'moulay')
    .replace(/\b(hopital|hospital|nouveau|ancien|chu|hcu|clinique|polyclinique|centre|de|du|des|la|le|les|d|l|el|al)\b/g, ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();
}

/** Fusionne deux fiches du même établissement : on garde l'information publiée, jamais de valeur inventée. */
export function mergeEstablishments(a: Establishment, b: Establishment): Establishment {
  const services = new Map<ServiceId, InfoSource>();
  for (const s of [...a.services, ...b.services]) if (!services.has(s.id) || s.source === 'osm') services.set(s.id, s.source);
  const emergency = a.emergency === 'yes' || b.emergency === 'yes' ? 'yes' : a.emergency ?? b.emergency;
  // nom le plus descriptif : « Moulay Abdellah » + « Nouveau Hôpital My Abdellah » → le second
  const hosp = /h[ôo]pital|hospital|clinique|maternit|institut|centre/i;
  const name = !hosp.test(a.name) && hosp.test(b.name) ? b.name : a.name;
  return {
    ...a,
    name,
    nameAr: a.nameAr ?? b.nameAr,
    address: a.address ?? b.address,
    city: a.city ?? b.city,
    district: a.district ?? b.district,
    latitude: a.latitude ?? b.latitude,
    longitude: a.longitude ?? b.longitude,
    phone: a.phone ?? b.phone,
    website: a.website ?? b.website,
    services: [...services].map(([id, source]) => ({ id, source })),
    emergency,
    emergencySource: emergency === a.emergency ? a.emergencySource : b.emergencySource,
    hours: a.hours ?? b.hours,
    sources: [...a.sources, ...b.sources.filter((s) => !a.sources.some((x) => x.url === s.url))],
    osmIds: [...new Set([...a.osmIds, ...b.osmIds])],
    type: a.type === 'hospital' || a.type === 'other' ? b.type : a.type,
    typeSource: a.type === 'hospital' || a.type === 'other' ? b.typeSource : a.typeSource,
  };
}

/** Doublons OSM : même nom cœur et à moins de 300 m. */
export function dedupeOsm(list: Establishment[]): Establishment[] {
  const out: Establishment[] = [];
  for (const e of list) {
    const i = out.findIndex((o) =>
      coreName(o.name) === coreName(e.name) && coreName(e.name).length >= 3 &&
      o.latitude !== null && e.latitude !== null &&
      haversineKm({ lat: o.latitude, lng: o.longitude! }, { lat: e.latitude, lng: e.longitude! }) < 0.3);
    if (i >= 0) out[i] = mergeEstablishments(out[i], e);
    else out.push(e);
  }
  return out;
}

/** « My Youssef » → « Hôpital Moulay Youssef » ; « Moulay Abdellah (Hôp.préféctoral) » → « Hôpital Moulay Abdellah ». */
export function officialDisplayName(nom: string): string {
  const n = nom.replace(/\s*\(h[ôo]p\.?\s*pr[ée]f[ée]ctoral\)\s*/i, '').replace(/\bMy\b/g, 'Moulay').replace(/\s*\(Ancien\s+/i, ' (ancien ').trim();
  return /^(h[ôo]pital|maternit|centre|c\.|institut)/i.test(n) ? n.replace(/^H[ôo]pital D'e/i, 'Hôpital d’E').replace(/^H[ôo]pital Des /i, 'Hôpital des ') : `Hôpital ${n}`;
}

export function ministryEstablishment(h: MinistryFile['hopitaux'][number], file: MinistryFile): Establishment {
  const services = new Map<ServiceId, InfoSource>();
  addNameServices(h.nom, services);
  if (/^(CPU|HPsy)/.test(h.categorie)) services.set('psychiatry', 'ministere');
  if (/^CRO$/.test(h.categorie)) services.set('oncology', 'ministere');
  return {
    id: `ms-${stripAccents(h.nom.toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name: officialDisplayName(h.nom),
    nameAr: null,
    type: 'public_hospital',
    typeSource: 'ministere',
    officialCategory: h.categorieLibelle,
    address: null,
    city: h.ville,
    district: h.commune.replace(/\s*\((Arrond|Mun)\.\)\s*$/, '') || null,
    latitude: null,
    longitude: null,
    phone: null,
    website: null,
    services: [...services].map(([id, source]) => ({ id, source })),
    emergency: null,
    emergencySource: null,
    hours: null,
    duty: [],
    sources: [{ id: 'ministere-sante', name: 'Ministère de la Santé — liste des hôpitaux (data.gov.ma)', url: file.jeuDeDonnees, license: file.licence, dataDate: file.donneesMisesAJourLe }],
    osmIds: [],
    notes: [],
  };
}

/** Rattache une fiche officielle à ses objets OSM (correspondances vérifiées à la main). */
export function attachMinistry(official: Establishment, osm: Establishment[]): Establishment {
  if (!osm.length) return { ...official, notes: [...official.notes, 'Position non publiée par les sources consultées.'] };
  const merged = osm.reduce((acc, o) => mergeEstablishments(acc, o), { ...official });
  // la catégorie et le statut public viennent du ministère, le nom affiché reste celui du ministère
  return { ...merged, type: 'public_hospital', typeSource: 'ministere', officialCategory: official.officialCategory, name: official.name, nameAr: merged.nameAr };
}

export function applyManual(list: Establishment[], manual: ManualHealthFile | null, log: (m: string) => void = () => {}): Establishment[] {
  if (!manual?.etablissements?.length) return list;
  const out = list.map((e) => ({ ...e }));
  for (const m of manual.etablissements) {
    const target = out.find((e) => (m.osm && e.osmIds.includes(m.osm)) || (m.nom && e.name.toLowerCase() === m.nom.toLowerCase()));
    if (!target) { log(`saisie manuelle ignorée : établissement introuvable (${m.osm ?? m.nom})`); continue; }
    const src = (name: string, url: string, date: string | null): EstablishmentSource => ({ id: 'manuel', name, url, license: null, dataDate: date });
    if (m.telephone) {
      const p = normalizeMoroccanPhone(m.telephone);
      if (p) target.phone = p; else log(`téléphone manuel invalide pour ${target.name}`);
    }
    if (m.urgences?.url && m.urgences.source) {
      target.emergency = m.urgences.statut === 'oui' ? 'yes' : 'no';
      target.emergencySource = 'manuel';
      if (target.emergency === 'yes' && !target.services.some((s) => s.id === 'emergency')) target.services = [...target.services, { id: 'emergency', source: 'manuel' }];
      target.sources = [...target.sources, src(m.urgences.source, m.urgences.url, m.urgences.verifieLe)];
    }
    if (m.horaires?.url && m.horaires.source && m.horaires.verifieLe) {
      target.hours = { text: m.horaires.texte, source: 'manuel', verified: true, verifiedAt: m.horaires.verifieLe, sourceUrl: m.horaires.url };
      target.sources = [...target.sources, src(m.horaires.source, m.horaires.url, m.horaires.verifieLe)];
    }
    for (const g of m.garde ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(g.du) || !/^\d{4}-\d{2}-\d{2}$/.test(g.au) || !g.url || !g.source) { log(`garde manuelle ignorée (date ou source manquante) pour ${target.name}`); continue; }
      const d: DutyDesignation = { from: g.du, to: g.au, sourceName: g.source, sourceUrl: g.url };
      target.duty = [...target.duty, d];
    }
  }
  return out;
}

/** Assemble toutes les sources en une liste unique, triée par nom. */
export function buildEstablishments(input: {
  overpass: OverpassResponse | null;
  ministry: MinistryFile | null;
  correspondences: CorrespondenceFile | null;
  manual: ManualHealthFile | null;
  log?: (m: string) => void;
}): Establishment[] {
  const log = input.log ?? (() => {});
  const base = input.overpass?.osm3s?.timestamp_osm_base ?? null;
  const osmAll = (input.overpass?.elements ?? []).filter(isRelevantOsm).map((e) => establishmentFromOsm(e, base)).filter((e): e is Establishment => !!e);
  let osm = dedupeOsm(osmAll);
  const result: Establishment[] = [];
  for (const h of input.ministry?.hopitaux ?? []) {
    const official = ministryEstablishment(h, input.ministry!);
    const corr = input.correspondences?.correspondances.find((c) => c.ministere === h.nom);
    const keys = corr?.osm ?? [];
    if (corr?.nomUsuel) official.name = corr.nomUsuel;
    const matched = osm.filter((o) => o.osmIds.some((k) => keys.includes(k)));
    if (keys.length && !matched.length) log(`correspondance OSM introuvable pour « ${h.nom} » (${keys.join(', ')})`);
    osm = osm.filter((o) => !matched.includes(o));
    result.push(attachMinistry(official, matched));
  }
  result.push(...osm);
  return applyManual(result, input.manual, log).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
