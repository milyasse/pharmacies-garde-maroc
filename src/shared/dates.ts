// Dates : tout est raisonné dans le fuseau officiel du Maroc (Africa/Casablanca).
// On ne code jamais de décalage horaire en dur (le Maroc change d'heure pendant le Ramadan).

export const MOROCCO_TZ = 'Africa/Casablanca';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Date du jour (YYYY-MM-DD) au Maroc pour l'instant `now`. */
export function moroccoDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOROCCO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Heure locale du Maroc en minutes depuis minuit. */
export function moroccoMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MOROCCO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Extrait une date écrite en français, ex. "Mardi 13 Octobre 2026" ou "1er mars 2026".
 * Retourne null si aucune date valide n'est trouvée.
 */
export function parseFrenchDate(text: string): string | null {
  const t = stripAccents(text.toLowerCase());
  const m = t.match(/(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2]];
  const year = Number(m[3]);
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** "2026-10-13" -> "mardi 13 octobre 2026" */
export function formatFrDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

/** "2026-10-13" -> "13/10/2026" */
export function formatShortDate(iso: string | null): string {
  if (!iso || !isIsoDate(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatMoroccoDateTime(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: MOROCCO_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/**
 * Plage horaire publiée -> minutes depuis minuit. Accepte "9h-23h", "entre 9h et 23h",
 * "08h30 - 20h00". Retourne null si rien d'exploitable.
 */
export function parseHours(text: string | null): { startMin: number; endMin: number; text: string } | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const m =
    t.match(/entre\s+(\d{1,2})\s*h\s*(\d{2})?\s+et\s+(\d{1,2})\s*h\s*(\d{2})?/) ||
    t.match(/(\d{1,2})\s*h\s*(\d{2})?\s*(?:-|–|à|a)\s*(\d{1,2})\s*h\s*(\d{2})?/);
  if (!m) return null;
  const sh = Number(m[1]), sm = Number(m[2] ?? 0), eh = Number(m[3]), em = Number(m[4] ?? 0);
  if (sh > 24 || eh > 24 || sm > 59 || em > 59) return null;
  const fmt = (h: number, mi: number) => `${h}h${mi ? String(mi).padStart(2, '0') : ''}`;
  const midnight = eh === 0 && em === 0 && sh > 0; // « 9h à 00h00 » = jusqu'à minuit
  const endMin = midnight ? 24 * 60 : eh * 60 + em;
  return { startMin: sh * 60 + sm, endMin, text: `${fmt(sh, sm)}-${midnight ? '24h' : fmt(eh, em)}` };
}
