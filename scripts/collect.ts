// Collecteur des pharmacies de garde — exécuté par GitHub Actions toutes les ~2 h.
// Node ≥ 22 : `node --experimental-strip-types scripts/collect.ts [--dry-run] [--verbose] [--strict] [--fixtures <dossier>]`
//
// Il lit les sources actives, normalise, déduplique, calcule les statuts de fiabilité
// et écrit des fichiers JSON statiques dans public/data/ servis par GitHub Pages.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CityId, CollectorStatus, DutyRecord, DutySnapshot, SourceRef, SourceRunStatus } from '../src/shared/types.ts';
import { addDays, isIsoDate, moroccoDate } from '../src/shared/dates.ts';
import { classifyDutyLabel } from '../src/shared/duty.ts';
import { dedupe, recordId } from '../src/shared/merge.ts';
import { isInMorocco, isValidLatLng } from '../src/shared/distance.ts';
import { normalizeMoroccanPhone, titleCase } from '../src/shared/text.ts';
import { CITIES, CITY_NAME, CONNECTORS } from '../src/shared/connectors/registry.ts';
import {
  ANNUAIRE_ID, ANNUAIRE_NAME, listingUrl, parseDetail, parseListing,
  type DetailPage, type HistoryRow,
} from '../src/shared/connectors/annuaireGratuit.ts';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const STRICT = args.includes('--strict');
const fixturesIdx = args.indexOf('--fixtures');
const FIXTURES = fixturesIdx >= 0 ? args[fixturesIdx + 1] : null;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'public', 'data');
const manualIdx = args.indexOf('--manual');
const MANUAL_DIR = manualIdx >= 0 ? path.resolve(args[manualIdx + 1]) : path.join(ROOT, 'manual');
const REQUEST_GAP_MS = 1500;
const MAX_DETAIL_FETCHES = 45;
const MAX_GEOCODES = 8;
const RETENTION_DAYS = 60;

const repo = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'local';
const USER_AGENT = `PharmaciesGardeMaroc/1.0 (+${repo}; collecte espacée de gardes publiques)`;

const log = (...a: unknown[]) => console.log('[collect]', ...a);
const debug = (...a: unknown[]) => VERBOSE && console.log('[debug]', ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function politeFetch(url: string, accept = 'text/html'): Promise<string> {
  if (FIXTURES) {
    const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '_');
    const file = path.join(FIXTURES, name);
    if (!existsSync(file)) throw new Error(`fixture absente : ${name}`);
    return readFile(file, 'utf8');
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'fr-MA,fr;q=0.9' },
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  if (DRY) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 1) + '\n', 'utf8');
}

interface DetailCacheEntry { detail: DetailPage; fetchedAt: string }
interface GeoCacheEntry { lat: number | null; lng: number | null; at: string }

function historyFor(rows: HistoryRow[], date: string): HistoryRow | null {
  const covering = rows.filter((r) => r.start <= date && date <= r.end);
  if (!covering.length) return null;
  return covering.find((r) => r.start === date) ?? covering.sort((a, b) => (a.start < b.start ? 1 : -1))[0];
}

async function geocode(address: string, city: CityId, cache: Record<string, GeoCacheEntry>, budget: { left: number }) {
  const q = `${address}, ${CITY_NAME[city]}, Maroc`;
  if (cache[q]) return cache[q];
  if (budget.left <= 0 || FIXTURES) return null;
  budget.left--;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ma&q=${encodeURIComponent(q)}`;
  try {
    const txt = await politeFetch(url, 'application/json');
    const arr = JSON.parse(txt) as { lat: string; lon: string }[];
    const lat = arr[0] ? Number(arr[0].lat) : null;
    const lng = arr[0] ? Number(arr[0].lon) : null;
    const ok = lat !== null && lng !== null && isValidLatLng(lat, lng) && isInMorocco(lat, lng);
    cache[q] = { lat: ok ? lat : null, lng: ok ? lng : null, at: new Date().toISOString() };
    return cache[q];
  } catch (e) {
    debug('géocodage impossible', q, e);
    return null;
  }
}

interface ManualFile {
  date: string;
  sourceName: string;
  sourceUrl: string;
  records: {
    name: string; city: CityId; address?: string; district?: string; phone?: string;
    latitude?: number; longitude?: number; dutyType?: 'day' | 'night' | 'continuous';
    hoursText?: string; dutyStartDate?: string; dutyEndDate?: string;
  }[];
}

async function loadManual(nowIso: string): Promise<DutyRecord[]> {
  if (!existsSync(MANUAL_DIR)) return [];
  const out: DutyRecord[] = [];
  for (const f of await readdir(MANUAL_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
    const m = await readJson<ManualFile | null>(path.join(MANUAL_DIR, f), null);
    if (!m || !isIsoDate(m.date) || !m.sourceUrl || !Array.isArray(m.records)) {
      log(`⚠ fichier manuel ignoré (date, sourceUrl et records obligatoires) : ${f}`);
      continue;
    }
    for (const r of m.records) {
      if (!r.name || !CITY_NAME[r.city]) continue;
      const start = r.dutyStartDate && isIsoDate(r.dutyStartDate) ? r.dutyStartDate : m.date;
      const end = r.dutyEndDate && isIsoDate(r.dutyEndDate) ? r.dutyEndDate : m.date;
      const src: SourceRef = {
        sourceId: 'manual', sourceName: m.sourceName || 'Saisie manuelle', sourceUrl: m.sourceUrl, listingUrl: null,
        sourcePublishedAt: m.date, lastCheckedAt: nowIso,
        historyMatch: { start, end, label: 'Tableau de garde saisi manuellement' },
        dutyType: r.dutyType ?? null, dutyLabel: null,
      };
      const located = isValidLatLng(r.latitude, r.longitude);
      out.push({
        id: recordId(r.city, r.name), name: r.name, address: r.address ?? null, city: r.city, district: r.district ?? null,
        latitude: located ? r.latitude! : null, longitude: located ? r.longitude! : null, coordinatesSource: located ? 'source' : null,
        phone: normalizeMoroccanPhone(r.phone), dutyDate: m.date, dutyType: r.dutyType ?? null, dutyLabel: null,
        hoursText: r.hoursText ?? null, dutyStartDate: start, dutyEndDate: end, sources: [src],
        verificationStatus: 'to_confirm', confidenceLevel: 'low', notes: [],
      });
    }
  }
  return out;
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = moroccoDate(now);
  log(`date du jour (Maroc) : ${today}${DRY ? ' — simulation, rien n’est écrit' : ''}`);

  const detailCache = await readJson<Record<string, DetailCacheEntry>>(path.join(OUT, 'cache', 'details.json'), {});
  const geoCache = await readJson<Record<string, GeoCacheEntry>>(path.join(OUT, 'cache', 'geocode.json'), {});
  const geoBudget = { left: MAX_GEOCODES };
  let detailBudget = MAX_DETAIL_FETCHES;

  const runs: SourceRunStatus[] = [];
  const byDate = new Map<string, DutyRecord[]>();
  const push = (r: DutyRecord) => {
    const arr = byDate.get(r.dutyDate) ?? [];
    arr.push(r);
    byDate.set(r.dutyDate, arr);
  };

  // ---- Source : annuaire-gratuit.ma
  for (const city of CITIES) {
    const url = listingUrl(city.id);
    const run: SourceRunStatus = { sourceId: ANNUAIRE_ID, sourceName: ANNUAIRE_NAME, city: city.id, url, ok: false, pageDate: null, count: 0, error: null, checkedAt: new Date().toISOString() };
    runs.push(run);
    let page;
    try {
      page = parseListing(await politeFetch(url));
    } catch (e) {
      run.error = `Page inaccessible : ${(e as Error).message}`;
      log(`✗ ${city.name} : ${run.error}`);
      continue;
    }
    run.pageDate = page.pageDate;
    run.count = page.entries.length;
    if (page.entries.length === 0 && !page.emptyNotice) {
      run.error = 'Aucune pharmacie extraite : la structure de la page a peut-être changé.';
      log(`✗ ${city.name} : ${run.error}`);
      continue;
    }
    run.ok = true;
    const dutyDate = page.pageDate ?? today;
    if (!page.pageDate) log(`⚠ ${city.name} : la page n’affiche pas de date — gardes rattachées au ${today} en « À confirmer »`);
    else if (page.pageDate !== today) log(`⚠ ${city.name} : la page affiche le ${page.pageDate} (aujourd’hui : ${today}) — page périmée`);
    log(`✓ ${city.name} : ${page.entries.length} pharmacie(s), page datée ${page.pageDate ?? 'inconnue'}`);

    for (const e of page.entries) {
      const cached = detailCache[e.sourceKey];
      const ageH = cached ? (now.getTime() - new Date(cached.fetchedAt).getTime()) / 3.6e6 : Infinity;
      const covered = cached ? !!historyFor(cached.detail.history, dutyDate) : false;
      if ((!cached || ageH > 24 * 7 || (!covered && ageH > 1)) && detailBudget > 0) {
        detailBudget--;
        try {
          detailCache[e.sourceKey] = { detail: parseDetail(await politeFetch(e.detailUrl)), fetchedAt: new Date().toISOString() };
        } catch (err) {
          debug('fiche inaccessible', e.detailUrl, err);
        }
      }
      const d = detailCache[e.sourceKey]?.detail ?? null;
      const hist = d ? historyFor(d.history, dutyDate) : null;
      let lat = e.latitude ?? d?.latitude ?? null;
      let lng = e.longitude ?? d?.longitude ?? null;
      let coordinatesSource: DutyRecord['coordinatesSource'] = lat !== null ? 'source' : null;
      const address = d?.address ?? e.address;
      if (lat === null && address) {
        const g = await geocode(address, city.id, geoCache, geoBudget);
        if (g && g.lat !== null) { lat = g.lat; lng = g.lng; coordinatesSource = 'geocoded'; }
      }
      const name = titleCase(e.name);
      const src: SourceRef = {
        sourceId: ANNUAIRE_ID, sourceName: ANNUAIRE_NAME, sourceUrl: e.detailUrl, listingUrl: url,
        sourcePublishedAt: page.pageDate, lastCheckedAt: run.checkedAt,
        historyMatch: hist, dutyType: classifyDutyLabel(e.dutyLabel), dutyLabel: e.dutyLabel,
      };
      push({
        id: recordId(city.id, name), name, address: address ?? null, city: city.id, district: e.district,
        latitude: lat, longitude: lng, coordinatesSource, phone: d?.phone ?? null,
        dutyDate, dutyType: classifyDutyLabel(e.dutyLabel) ?? classifyDutyLabel(hist?.label ?? null),
        dutyLabel: e.dutyLabel, hoursText: e.hoursText, dutyStartDate: null, dutyEndDate: null,
        sources: [src], verificationStatus: 'to_confirm', confidenceLevel: 'low', notes: [],
      });
      debug(name, { dutyDate, hist, lat, lng, phone: d?.phone });
    }
  }

  // ---- Source : saisie manuelle
  for (const r of await loadManual(nowIso)) push(r);

  // ---- Fusion avec ce qui a déjà été collecté pour ces dates, puis écriture
  for (const [date, fresh] of byDate) {
    const file = path.join(OUT, 'duty', `${date}.json`);
    const prev = await readJson<DutySnapshot | null>(file, null);
    const records = dedupe([...(prev?.records ?? []), ...fresh]).sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    const snap: DutySnapshot = { date, generatedAt: nowIso, records };
    await writeJson(file, snap);
    const c = records.reduce<Record<string, number>>((acc, r) => ((acc[r.verificationStatus] = (acc[r.verificationStatus] ?? 0) + 1), acc), {});
    log(`→ duty/${date}.json : ${records.length} pharmacie(s)`, c);
  }

  // ---- Rétention et index
  const dutyDir = path.join(OUT, 'duty');
  let dates: string[] = [];
  if (existsSync(dutyDir)) {
    const limit = addDays(today, -RETENTION_DAYS);
    for (const f of await readdir(dutyDir)) {
      const d = f.replace(/\.json$/, '');
      if (!isIsoDate(d)) continue;
      if (d < limit && !DRY) await rm(path.join(dutyDir, f));
      else dates.push(d);
    }
  }
  dates = Array.from(new Set([...dates, ...byDate.keys()])).sort();
  const status: CollectorStatus = { generatedAt: nowIso, todayMorocco: today, dates, runs, connectors: CONNECTORS };
  await writeJson(path.join(OUT, 'status.json'), status);
  await writeJson(path.join(OUT, 'cache', 'details.json'), detailCache);
  await writeJson(path.join(OUT, 'cache', 'geocode.json'), geoCache);

  const okRuns = runs.filter((r) => r.ok).length;
  log(`terminé : ${okRuns}/${runs.length} page(s) source exploitée(s), ${MAX_DETAIL_FETCHES - detailBudget} fiche(s) téléchargée(s), ${MAX_GEOCODES - geoBudget.left} géocodage(s).`);
  if (STRICT && okRuns < runs.length) {
    console.error('[collect] mode strict : au moins une source est en erreur.');
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('[collect] échec', e);
  process.exitCode = 1;
});
