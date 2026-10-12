import type { DutyType } from './types.ts';
import { parseHours } from './dates.ts';
import { stripAccents } from './text.ts';

/**
 * Classe un libellé de garde publié. Retourne null si le libellé n'est pas reconnu
 * (on n'invente pas de type de garde).
 */
export function classifyDutyLabel(label: string | null): DutyType | null {
  if (!label) return null;
  const t = stripAccents(label.toLowerCase());
  if (/24\s*h\s*\/\s*24|24\s*heures|24\/7|toute la journee|jour et nuit|continue/.test(t)) return 'continuous';
  if (/\bnuit\b/.test(t)) return 'night';
  if (/\bjour\b|journee/.test(t)) return 'day';
  return null;
}

export const DUTY_TYPE_LABEL: Record<DutyType, string> = {
  day: 'Garde de jour',
  night: 'Garde de nuit',
  continuous: 'Garde 24h/24',
};

/** Extrait un libellé de garde d'un bloc de texte (premier trouvé). */
export function findDutyLabel(text: string): string | null {
  const patterns = [
    /Garde\s+24\s*h\s*\/\s*24/i,
    /Garde\s+Jour\s+et\s+Nuit/i,
    /Garde\s+(?:de\s+)?Jour(?:\s*\([^)]{0,40}\))?/i,
    /Garde\s+(?:de\s+)?Nuit(?:\s*\([^)]{0,40}\))?/i,
    /Ouvert[e]?\s+toute\s+la\s+journ[ée]e(?:\s*\(24\s*heures\))?/i,
    /Ouvert[e]?\s+24\s*h\s*\/\s*24/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

export function findHoursText(text: string): string | null {
  return parseHours(text)?.text ?? null;
}
