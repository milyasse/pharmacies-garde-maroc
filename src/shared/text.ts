// Outils texte sans dépendance (utilisables dans Node et le navigateur).

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è',
  ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î',
  iuml: 'ï', euml: 'ë', ugrave: 'ù', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', deg: '°', middot: '·', bull: '•',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** HTML -> texte, une ligne par bloc. Supprime scripts/styles. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|span|a|dt|dd|ul|ol|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function cleanSpaces(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Nom normalisé pour comparer des pharmacies entre sources. */
export function normalizeName(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/\bpharmacie\b|\bpharma\b|\bphcie\b|\bphie\b/g, ' ')
    .replace(/\b(de|du|des|la|le|les|l|d|el|al)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Similarité de Dice sur bigrammes (0..1). */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a).replace(/ /g, '');
  const y = normalizeName(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0);
  return (2 * inter) / (x.length - 1 + (y.length - 1));
}

/** Titre lisible : "PHARMACIE EL WAHDA" -> "Pharmacie El Wahda" */
export function titleCase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'’(-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** Normalise un numéro marocain : "0537 64 29 50" -> "+212537642950". null si invalide. */
export function normalizeMoroccanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/[•*x]/i.test(raw)) return null; // numéro masqué par la source
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+212')) d = '0' + d.slice(4);
  else if (d.startsWith('00212')) d = '0' + d.slice(5);
  else if (d.startsWith('212') && d.length === 12) d = '0' + d.slice(3);
  if (!/^0[5-7]\d{8}$/.test(d)) return null;
  return '+212' + d.slice(1);
}

export function formatPhone(e164: string | null): string {
  if (!e164) return '';
  const local = '0' + e164.replace('+212', '');
  return local.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
}
