// Connecteur annuaire-gratuit.ma — parseurs purs (aucun accès réseau ici).
//
// Pages exploitées (robots.txt du site ne les interdit pas, vérifié le 13/10/2026) :
//   - liste du jour par ville : https://www.annuaire-gratuit.ma/pharmacie-garde-<ville>.html
//   - fiche pharmacie         : https://www.annuaire-gratuit.ma/<slug>-s<id>.html
//     (adresse, téléphone, coordonnées et surtout « Historique de garde » daté début/fin)
//
// Le parseur s'appuie sur des motifs stables (liens de fiche « -s<id>.html », liens
// Google Maps « destination=lat,lng », dates ISO de l'historique) plutôt que sur des
// classes CSS, afin de résister aux changements de mise en page. Si la structure change
// au point que rien n'est extrait, le collecteur signale la source « en erreur ».

import type { CityId } from '../types.ts';
import { parseFrenchDate, isIsoDate } from '../dates.ts';
import { cleanSpaces, decodeEntities, htmlToText, normalizeMoroccanPhone, titleCase } from '../text.ts';
import { findDutyLabel, findHoursText } from '../duty.ts';
import { isInMorocco, isValidLatLng } from '../distance.ts';

export const ANNUAIRE_ID = 'annuaire-gratuit';
export const ANNUAIRE_NAME = 'annuaire-gratuit.ma';
export const ANNUAIRE_BASE = 'https://www.annuaire-gratuit.ma';

export const ANNUAIRE_CITY_SLUGS: Record<CityId, string> = {
  rabat: 'rabat',
  sale: 'sale',
  temara: 'temara',
};

export function listingUrl(city: CityId): string {
  return `${ANNUAIRE_BASE}/pharmacie-garde-${ANNUAIRE_CITY_SLUGS[city]}.html`;
}

export interface ListingEntry {
  sourceKey: string; // "s238109"
  name: string;
  detailUrl: string;
  dutyLabel: string | null;
  hoursText: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ListingPage {
  pageDate: string | null; // date annoncée par la page (« mise à jour le … » ou « Aujourd'hui … »)
  pageDateKind: 'updated' | 'today-heading' | null;
  entries: ListingEntry[];
  emptyNotice: boolean; // la page dit explicitement ne rien avoir trouvé
}

export interface HistoryRow {
  start: string;
  end: string;
  label: string | null;
}

export interface DetailPage {
  name: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  history: HistoryRow[];
}

const DETAIL_HREF = /href\s*=\s*["']([^"']*?-s(\d+)\.html)(?:#[^"']*)?["']/i;

function absolutize(href: string): string {
  const h = decodeEntities(href);
  if (/^https?:\/\//i.test(h)) return h.replace(/^http:/i, 'https:');
  if (h.startsWith('//')) return 'https:' + h;
  return ANNUAIRE_BASE + (h.startsWith('/') ? h : '/' + h);
}

function coordsFrom(html: string): { lat: number; lng: number } | null {
  const pats = [
    /destination=(-?\d{1,2}\.\d+)\s*(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
    /[?&](?:q|ll|query|daddr)=(-?\d{1,2}\.\d+)\s*(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
    /"latitude"\s*:\s*"?(-?\d{1,2}\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d{1,3}\.\d+)"?/i,
    /L\.marker\(\s*\[\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\]/i,
    /setView\(\s*\[\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\]/i,
    /data-lat(?:itude)?\s*=\s*["'](-?\d{1,2}\.\d+)["'][^>]*data-(?:lng|lon|longitude)\s*=\s*["'](-?\d{1,3}\.\d+)["']/i,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValidLatLng(lat, lng) && isInMorocco(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/** Date de la page : « mise à jour le … » prioritaire, sinon le titre « Aujourd'hui … ». */
export function parsePageDate(html: string): { date: string | null; kind: ListingPage['pageDateKind'] } {
  const t = html.match(/mise\s+(?:&agrave;|à)\s+jour\s+le\s*<time[^>]*datetime=["'](\d{4}-\d{2}-\d{2})/i);
  if (t && isIsoDate(t[1])) return { date: t[1], kind: 'updated' };
  const text = htmlToText(html);
  const upd = text.match(/mis[e]?\s+à\s+jour\s+le\s+([^\n]{0,60})/i);
  if (upd) {
    const d = parseFrenchDate(upd[1]);
    if (d) return { date: d, kind: 'updated' };
  }
  const today = text.match(/aujourd['’]hui\s*,?\s+([^\n]{0,60})/i);
  if (today) {
    const d = parseFrenchDate(today[1]);
    if (d) return { date: d, kind: 'today-heading' };
  }
  return { date: null, kind: null };
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(decodeEntities(m[2] ?? m[3] ?? '')).trim() || null : null; // certains attributs sont doublement échappés
}

/** Valeur d'une ligne « <span>Libellé</span><strong>valeur</strong> » d'une carte. */
function infoItem(block: string, label: string): string | null {
  const re = new RegExp(`<span[^>]*>\\s*${label}\\s*</span>\\s*<strong[^>]*>([\\s\\S]*?)</strong>`, 'i');
  const m = block.match(re);
  return m ? cleanSpaces(m[1]) || null : null;
}

/**
 * Stratégie 1 (structure observée le 13/10/2026) : une carte par pharmacie
 * <li class="ag_pharmacy_card" data-name data-url data-lat data-lng> … </li>
 */
function parseCards(body: string): ListingEntry[] {
  const starts: { index: number; tag: string }[] = [];
  const re = /<li\b[^>]*class\s*=\s*["'][^"']*\bag_pharmacy_card\b(?!_)[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) starts.push({ index: m.index, tag: m[0] });
  const out: ListingEntry[] = [];
  starts.forEach((s, i) => {
    const block = body.slice(s.index + s.tag.length, i + 1 < starts.length ? starts[i + 1].index : Math.min(body.length, s.index + 8000));
    const url = attr(s.tag, 'data-url') ?? block.match(DETAIL_HREF)?.[1] ?? null;
    const key = url?.match(/-s(\d+)\.html/)?.[1];
    const nameRaw = attr(s.tag, 'data-name') ?? cleanSpaces(block.match(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/i)?.[1] ?? '');
    if (!url || !key || !nameRaw) return;
    const lat = Number(attr(s.tag, 'data-lat'));
    const lng = Number(attr(s.tag, 'data-lng') ?? attr(s.tag, 'data-lon'));
    const located = isValidLatLng(lat, lng) && isInMorocco(lat, lng);
    const c = located ? { lat, lng } : coordsFrom(block);
    const statusText = cleanSpaces(block.match(/class=["'][^"']*\bag_ph_status\b[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] ?? '');
    const gardeInfo = infoItem(block, 'Garde');
    const dutyLabel = findDutyLabel(statusText) ?? (gardeInfo ? findDutyLabel('Garde ' + gardeInfo) ?? `Garde ${gardeInfo}` : null);
    const street = block.match(/itemprop=["']streetAddress["'][^>]*>([\s\S]*?)<\//i);
    const address = street ? cleanSpaces(street[1]).replace(/\s*-\s*$/, '') || null : null;
    out.push({
      sourceKey: 's' + key,
      // La source contient parfois l'apostrophe abîmée en « 039 » (code HTML &#039; tronqué)
      name: titleCase((nameRaw.replace(/\s*صيدلية.*$/, '').trim() || nameRaw).replace(/\b([LD])\s+0?39\s+/gi, "$1'")),
      detailUrl: absolutize(url),
      dutyLabel,
      hoursText: findHoursText(statusText) ?? findHoursText(gardeInfo ?? ''),
      district: infoItem(block, 'Quartier'),
      address,
      latitude: c?.lat ?? null,
      longitude: c?.lng ?? null,
    });
  });
  return out;
}

/** Découpe la page liste en entrées : cartes structurées, sinon blocs « titre + lien de fiche ». */
export function parseListing(html: string): ListingPage {
  const { date, kind } = parsePageDate(html);
  const body = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ');
  const emptyNotice = /aucune pharmacie(?: de garde)? trouv[ée]e/i.test(htmlToText(body));
  const cards = parseCards(body);
  if (cards.length) {
    const seen = new Set<string>();
    return { pageDate: date, pageDateKind: kind, entries: cards.filter((e) => !seen.has(e.sourceKey) && !!seen.add(e.sourceKey)), emptyNotice };
  }
  // Stratégie 2 (secours) : titre <h2>-<h4> avec le lien de fiche dedans, ou juste avant (<a href><h3>…</h3></a>)
  const headingRe = /(<a\b[^>]*>\s*)?<h([2-4])\b[^>]*>([\s\S]*?)<\/h\2>/gi;
  const heads: { index: number; end: number; href: string; key: string; name: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(body))) {
    const inner = (m[1] ?? '') + m[3];
    const link = inner.match(DETAIL_HREF);
    if (!link) continue;
    const name = cleanSpaces(m[3]);
    if (!/pharmac|صيدلية/i.test(name)) continue;
    heads.push({ index: m.index, end: m.index + m[0].length, href: absolutize(link[1]), key: 's' + link[2], name });
  }
  const entries: ListingEntry[] = [];
  const seen = new Set<string>();
  heads.forEach((h, i) => {
    if (seen.has(h.key)) return;
    seen.add(h.key);
    // Le bloc d'une pharmacie s'arrête au titre suivant (borné à ~6 ko par sécurité).
    const stop = i + 1 < heads.length ? heads[i + 1].index : Math.min(body.length, h.end + 6000);
    const block = body.slice(h.end, stop);
    const text = htmlToText(block);
    const dutyLabel = findDutyLabel(text);
    const hoursText = findHoursText(text);
    // Quartier : lien vers /pharmacie-garde-<ville>/quartier-<nom>.html, sinon ligne « Quartier X ».
    let district: string | null = null;
    const q = block.match(/<a[^>]+href=["'][^"']*\/quartier-[^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
    if (q) district = cleanSpaces(q[1]) || null;
    if (!district) {
      const ql = text.match(/^Quartier\s*:?\s*(.+)$/im);
      if (ql) district = ql[1].trim() || null;
    }
    // Adresse : ligne qui précède « Téléphone/Tél » et qui n'est ni un statut ni un libellé.
    let address: string | null = null;
    const lines = text.split('\n');
    const telIdx = lines.findIndex((l) => /^(t[ée]l[ée]phone|t[ée]l\.?)\b/i.test(l));
    for (let j = (telIdx >= 0 ? telIdx : lines.length) - 1; j >= 0; j--) {
      const l = lines[j];
      if (/^(ouvert|ferm|garde|de garde|quartier|appeler|itin|carte|voir)/i.test(l)) continue;
      if (/\d|rue|av|bd|boulevard|lot|hay|r[ée]sidence|secteur|imm|angle|n°|place|route/i.test(l) && l.length >= 6) {
        address = l.replace(/\s*-\s*$/, '').trim();
        break;
      }
      if (telIdx < 0) break;
    }
    const c = coordsFrom(block);
    entries.push({
      sourceKey: h.key,
      name: titleCase(h.name.replace(/\s*صيدلية.*$/, '').trim() || h.name),
      detailUrl: h.href,
      dutyLabel,
      hoursText,
      district,
      address,
      latitude: c?.lat ?? null,
      longitude: c?.lng ?? null,
    });
  });
  return { pageDate: date, pageDateKind: kind, entries, emptyNotice };
}

/** Historique de garde : lignes « AAAA-MM-JJ AAAA-MM-JJ Garde … ». */
export function parseHistory(html: string): HistoryRow[] {
  const text = htmlToText(html).replace(/\n/g, ' ');
  const re = /(\d{4}-\d{2}-\d{2})\s+(?:au\s+|→\s+|-\s+)?(\d{4}-\d{2}-\d{2})\s*(Garde[^0-9]{0,40})?/g;
  const rows: HistoryRow[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, start, end] = m;
    if (!isIsoDate(start) || !isIsoDate(end) || end < start) continue;
    const k = start + end;
    if (seen.has(k)) continue;
    seen.add(k);
    const label = m[3] ? m[3].replace(/\s+/g, ' ').trim() : null;
    rows.push({ start, end, label });
  }
  return rows.sort((a, b) => (a.start < b.start ? 1 : -1));
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const v = JSON.parse(m[1].trim());
      const push = (o: unknown) => {
        if (o && typeof o === 'object') {
          if (Array.isArray(o)) o.forEach(push);
          else {
            out.push(o as Record<string, unknown>);
            const g = (o as Record<string, unknown>)['@graph'];
            if (g) push(g);
          }
        }
      };
      push(v);
    } catch {
      /* JSON-LD invalide : ignoré */
    }
  }
  return out;
}

export function parseDetail(html: string): DetailPage {
  let name: string | null = null;
  let address: string | null = null;
  let phone: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;

  // 1) Données structurées schema.org si présentes
  for (const o of jsonLdObjects(html)) {
    const t = String(o['@type'] ?? '');
    if (!/pharmacy|localbusiness|medical|store|organization|place/i.test(t)) continue;
    if (!name && typeof o.name === 'string') name = cleanSpaces(o.name);
    if (!phone && typeof o.telephone === 'string') phone = normalizeMoroccanPhone(o.telephone);
    const a = o.address as Record<string, unknown> | string | undefined;
    if (!address && a) {
      if (typeof a === 'string') address = cleanSpaces(a);
      else if (typeof a.streetAddress === 'string') address = cleanSpaces(a.streetAddress);
    }
    const g = o.geo as Record<string, unknown> | undefined;
    if (lat === null && g && g.latitude !== undefined && g.longitude !== undefined) {
      const la = Number(g.latitude), lo = Number(g.longitude);
      if (isValidLatLng(la, lo) && isInMorocco(la, lo)) { lat = la; lng = lo; }
    }
  }
  // 2) Microdonnées
  if (!address) {
    const m = html.match(/itemprop=["']streetAddress["'][^>]*>([\s\S]*?)<\//i);
    if (m) address = cleanSpaces(m[1]) || null;
  }
  if (!phone) {
    const m = html.match(/itemprop=["']telephone["'][^>]*>([\s\S]*?)<\//i) || html.match(/itemprop=["']telephone["'][^>]*content=["']([^"']+)["']/i);
    if (m) phone = normalizeMoroccanPhone(cleanSpaces(m[1]));
  }
  // 3) Lien tel:
  if (!phone) {
    const re = /href=["']tel:([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while (!phone && (m = re.exec(html))) phone = normalizeMoroccanPhone(decodeURIComponent(m[1]));
  }
  // 4) Coordonnées dans les liens / scripts de carte
  if (lat === null) {
    const c = coordsFrom(html);
    if (c) { lat = c.lat; lng = c.lng; }
  }
  // 5) Adresse en texte « Adresse : … »
  if (!address) {
    const text = htmlToText(html);
    const m = text.match(/^Adresse\s*:?\s*\n?(.{6,160})$/im);
    if (m && !/^(\/|t[ée]l)/i.test(m[1])) address = m[1].trim();
  }
  if (!name) {
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) name = cleanSpaces(h1[1]) || null;
  }
  return {
    name,
    address: address ? address.replace(/\s*-\s*$/, '') : null,
    phone,
    latitude: lat,
    longitude: lng,
    history: parseHistory(html),
  };
}
