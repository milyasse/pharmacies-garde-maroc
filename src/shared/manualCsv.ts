// Import d'un tableau de garde officiel saisi dans un tableur (CSV), pour les jours à venir.
// Colonnes (ordre libre, en-tête obligatoire, séparateur « ; » ou « , ») :
//   date ; ville ; nom ; adresse ; quartier ; telephone ; type ; debut ; fin ; horaires ; latitude ; longitude ; source ; source_url
// - date / debut / fin : AAAA-MM-JJ ou JJ/MM/AAAA (debut = date par défaut, fin = lendemain pour une garde de nuit/24h, sinon = date)
// - ville : Rabat, Salé, Témara   - type : jour, nuit, 24h (ou vide)
// - source_url est obligatoire : chaque ligne doit être vérifiable.

import type { CityId, DutyType } from './types.ts';
import { addDays, isIsoDate } from './dates.ts';
import { stripAccents } from './text.ts';

export interface ManualRow {
  date: string;
  city: CityId;
  name: string;
  address: string | null;
  district: string | null;
  phone: string | null;
  dutyType: DutyType | null;
  dutyStartDate: string;
  dutyEndDate: string;
  hoursText: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceName: string;
  sourceUrl: string;
}

export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toIso(s: string): string | null {
  const t = s.trim();
  if (isIsoDate(t)) return t;
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

function toCity(s: string): CityId | null {
  const t = stripAccents(s.toLowerCase()).trim();
  if (t.startsWith('rabat')) return 'rabat';
  if (t.startsWith('sale')) return 'sale';
  if (t.startsWith('temara')) return 'temara';
  return null;
}

function toType(s: string): DutyType | null {
  const t = stripAccents(s.toLowerCase()).trim();
  if (!t) return null;
  if (/24|continu|jour et nuit/.test(t)) return 'continuous';
  if (/nuit/.test(t)) return 'night';
  if (/jour/.test(t)) return 'day';
  return null;
}

export function parseManualCsv(text: string, fallbackSourceName = 'Tableau de garde officiel'): { rows: ManualRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ['fichier vide'] };
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = splitCsvLine(lines[0], sep).map((h) => stripAccents(h.toLowerCase()).replace(/[^a-z_]/g, ''));
  const col = (row: string[], ...names: string[]) => {
    for (const n of names) {
      const i = head.indexOf(n);
      if (i >= 0 && row[i] !== undefined) return row[i];
    }
    return '';
  };
  const rows: ManualRow[] = [];
  lines.slice(1).forEach((line, k) => {
    const n = k + 2;
    const r = splitCsvLine(line, sep);
    const date = toIso(col(r, 'date'));
    const city = toCity(col(r, 'ville', 'city'));
    const name = col(r, 'nom', 'pharmacie', 'name');
    const sourceUrl = col(r, 'source_url', 'sourceurl', 'url', 'lien');
    if (!date) return void errors.push(`ligne ${n} : date invalide`);
    if (!city) return void errors.push(`ligne ${n} : ville inconnue (Rabat, Salé ou Témara)`);
    if (!name) return void errors.push(`ligne ${n} : nom manquant`);
    if (!sourceUrl) return void errors.push(`ligne ${n} : source_url obligatoire`);
    const dutyType = toType(col(r, 'type', 'garde'));
    const start = toIso(col(r, 'debut', 'start')) ?? date;
    const end = toIso(col(r, 'fin', 'end')) ?? (dutyType === 'day' ? start : addDays(start, 1));
    if (end < start) return void errors.push(`ligne ${n} : fin avant le début`);
    const lat = Number(col(r, 'latitude', 'lat').replace(',', '.'));
    const lng = Number(col(r, 'longitude', 'lng', 'lon').replace(',', '.'));
    const located = col(r, 'latitude', 'lat') !== '' && Number.isFinite(lat) && Number.isFinite(lng);
    rows.push({
      date: start, city, name,
      address: col(r, 'adresse', 'address') || null,
      district: col(r, 'quartier', 'district') || null,
      phone: col(r, 'telephone', 'tel', 'phone') || null,
      dutyType,
      dutyStartDate: start,
      dutyEndDate: end,
      hoursText: col(r, 'horaires', 'heures', 'hours') || null,
      latitude: located ? lat : null,
      longitude: located ? lng : null,
      sourceName: col(r, 'source') || fallbackSourceName,
      sourceUrl,
    });
  });
  return { rows, errors };
}
