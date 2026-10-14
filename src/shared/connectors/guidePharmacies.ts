// Connecteur guidepharmacies.ma — parseurs purs (aucun accès réseau ici).
//
// Pages exploitées (robots.txt n'interdit que /api/, /administrator/… ; vérifié le 14/10/2026) :
//   - planning hebdomadaire par ville : /pharmacies-de-garde/<ville>.html            (semaine en cours)
//                                       /pharmacies-de-garde/<ville>.html?date=AAAA-MM-JJ (semaine du lundi donné)
//     → une section par jour (« Mercredi 14 Octobre 2026 »), une ligne par garde :
//       quartier + horaires (« Agdal 24h/24h », « Centre Ville (9h à 00h00) »), nom et téléphone, lien de fiche.
//   - fiche pharmacie : adresse.
//
// ATTENTION : les attributs data-lat / data-lng de chaque ligne sont ceux du CENTRE DU QUARTIER
// (identiques pour toutes les pharmacies d'un même quartier). Ils ne sont jamais présentés comme
// la position de la pharmacie : ils servent seulement de position approximative signalée comme telle.

import type { CityId, DutyType } from '../types.ts';
import { addDays, isIsoDate, parseFrenchDate, parseHours } from '../dates.ts';
import { cleanSpaces, decodeEntities, htmlToText, normalizeMoroccanPhone, titleCase } from '../text.ts';
import { isInMorocco, isValidLatLng } from '../distance.ts';

export const GUIDE_ID = 'guidepharmacies';
export const GUIDE_NAME = 'guidepharmacies.ma';
export const GUIDE_BASE = 'https://www.guidepharmacies.ma';

export const GUIDE_CITY_SLUGS: Record<CityId, string> = { rabat: 'rabat', sale: 'sale', temara: 'temara' };

export function guideWeekUrl(city: CityId, monday?: string): string {
  const u = `${GUIDE_BASE}/pharmacies-de-garde/${GUIDE_CITY_SLUGS[city]}.html`;
  return monday ? `${u}?date=${monday}` : u;
}

/** Lundi de la semaine suivant `isoDate`. */
export function nextMonday(isoDate: string): string {
  const dow = new Date(isoDate + 'T12:00:00Z').getUTCDay(); // 0 = dimanche
  return addDays(isoDate, ((8 - dow) % 7) || 7);
}

export interface GuideEntry {
  date: string; // jour de la garde (AAAA-MM-JJ)
  name: string;
  phone: string | null;
  district: string | null;
  label: string; // libellé brut « quartier + horaires »
  dutyType: DutyType | null;
  hoursText: string | null;
  start: string;
  end: string;
  detailUrl: string | null;
  districtLat: number | null; // centre du quartier (approximatif)
  districtLng: number | null;
}

export interface GuideWeek {
  weekStart: string | null;
  weekEnd: string | null;
  days: string[];
  entries: GuideEntry[];
  nextWeekUrl: string | null;
}

function absolutize(href: string): string {
  const h = decodeEntities(href);
  if (/^https?:\/\//i.test(h)) return h.replace(/^http:/i, 'https:');
  return GUIDE_BASE + (h.startsWith('/') ? h : '/' + h);
}

/** « Centre Ville (9h à 00h00) » → { district: 'Centre Ville', hours… } */
export function parseGuideLabel(label: string): { district: string | null; dutyType: DutyType | null; hoursText: string | null } {
  const l = cleanSpaces(label);
  const continuous = /24\s*h\s*\/\s*24\s*h?/i.test(l);
  const h = continuous ? null : parseHours(l);
  const district = l
    .replace(/\(?\s*24\s*h\s*\/\s*24\s*h?\s*\)?/i, '')
    .replace(/\(?\s*\d{1,2}\s*h\s*\d{0,2}\s*(?:à|a|-|–)\s*\d{1,2}\s*h\s*\d{0,2}\s*\)?/i, '')
    .replace(/\(\s*\)\s*$/, '')
    .trim();
  let dutyType: DutyType | null = null;
  if (continuous) dutyType = 'continuous';
  else if (h) dutyType = h.startMin < 12 * 60 ? 'day' : 'night';
  return { district: district || null, dutyType, hoursText: continuous ? '24h/24' : h?.text ?? null };
}

export function parseGuideWeek(html: string): GuideWeek {
  const text = htmlToText(html);
  const wk = text.match(/(\d{1,2}\s+\S+\s+\d{4})\s*-\s*(?:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+(\d{1,2}\s+\S+\s+\d{4})/i);
  const weekStart = wk ? parseFrenchDate(wk[1]) : null;
  const weekEnd = wk ? parseFrenchDate(wk[2]) : null;

  const entries: GuideEntry[] = [];
  const days: string[] = [];
  const groups = html.split(/<tbody\b[^>]*class=["'][^"']*\beb-day-group\b[^"']*["'][^>]*>/i).slice(1);
  for (const g of groups) {
    const head = g.match(/eb-day-header[\s\S]*?<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/i);
    const date = head ? parseFrenchDate(cleanSpaces(head[1])) : null;
    if (!date) continue;
    days.push(date);
    const rows = g.split(/<tr\b(?=[^>]*\beb-event-row\b)/i).slice(1);
    for (const raw of rows) {
      const row = raw.split(/<\/tr>/i)[0];
      const open = row.slice(0, row.indexOf('>') + 1);
      const attr = (n: string) => {
        const m = open.match(new RegExp(`${n}\\s*=\\s*["']([^"']*)["']`, 'i'));
        return m ? decodeEntities(m[1]).trim() : null;
      };
      const loc = row.match(/class=["'][^"']*\blocation-name\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      const label = cleanSpaces(loc?.[1] ?? attr('data-address') ?? '');
      const link = row.match(/<h4\b[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const linkText = cleanSpaces(link[2]);
      const [rawName, ...rest] = linkText.split(/\s+-\s+/);
      const bare = rawName.replace(/^pharmacie\s*/i, '').trim();
      if (!bare) continue; // « Pharmacie » sans nom : inexploitable, ignorée
      const name = 'Pharmacie ' + titleCase(bare);
      const phone = normalizeMoroccanPhone(rest.join(' '));
      const p = parseGuideLabel(label);
      const lat = Number(attr('data-lat'));
      const lng = Number(attr('data-lng'));
      const okLL = isValidLatLng(lat, lng) && isInMorocco(lat, lng);
      entries.push({
        date,
        name,
        phone,
        district: p.district,
        label,
        dutyType: p.dutyType,
        hoursText: p.hoursText,
        start: date,
        // garde 24h/24 ou de nuit : se termine le lendemain matin ; garde de jour : le jour même
        end: p.dutyType === 'continuous' || p.dutyType === 'night' ? addDays(date, 1) : date,
        detailUrl: link[1] && link[1] !== '#' ? absolutize(link[1]) : null,
        districtLat: okLL ? lat : null,
        districtLng: okLL ? lng : null,
      });
    }
  }
  const nav = [...html.matchAll(/href=["']([^"']*\?date=(\d{4}-\d{2}-\d{2}))["']/gi)]
    .filter((m) => isIsoDate(m[2]) && (!weekStart || m[2] > weekStart))
    .map((m) => absolutize(m[1]));
  return { weekStart, weekEnd, days, entries, nextWeekUrl: nav[0] ?? null };
}

/** Adresse et téléphone publiés sur la fiche (bloc « eb-description-details », sinon méta og:description). */
export function parseGuideDetail(html: string): { address: string | null; phone: string | null } {
  let address: string | null = null;
  let phone: string | null = null;
  const block = html.match(/class=["'][^"']*\beb-description-details\b[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|<div\b[^>]*class=["'][^"']*eb-(?:location|taskbar|social))/i);
  if (block) {
    const parts: string[] = [];
    for (const m of block[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = cleanSpaces(m[1]);
      if (!t) continue;
      if (/^t[ée]l\s*:/i.test(t)) {
        phone = normalizeMoroccanPhone(t.replace(/^t[ée]l\s*:/i, ''));
        break;
      }
      parts.push(t.replace(/^\((.*)\)$/, '$1'));
      if (parts.length >= 3) break;
    }
    if (parts.length) address = cleanSpaces(parts.join(', '));
  }
  if (!address) {
    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (og) address = cleanSpaces(og[1]).replace(/\s*\((.*)\)\s*$/, ', $1') || null;
  }
  if (!phone) {
    const t = html.match(/<h1\b[^>]*>[\s\S]*?-\s*(0[\d\s]{9,13})\s*<\/h1>/i);
    if (t) phone = normalizeMoroccanPhone(t[1]);
  }
  if (address && /^(pharmacie|garde)/i.test(address)) address = null;
  return { address, phone };
}
