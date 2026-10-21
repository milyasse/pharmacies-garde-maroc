// Collecteur des cliniques et hôpitaux — exécuté par GitHub Actions avec la collecte des pharmacies.
// Node ≥ 22 : `node --experimental-strip-types scripts/collect-health.ts [--force] [--dry-run] [--osm-fixture <fichier.json>]`
//
// Sources : OpenStreetMap (Overpass, au plus une requête par jour), liste officielle des hôpitaux du
// ministère de la Santé (data.gov.ma, extraite dans data-sources/sante/), saisies vérifiées (manual/sante.json).
// Écrit public/data/sante/etablissements.json (+ la réponse OSM brute, pour reconstruire sans re-télécharger).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildEstablishments, type CorrespondenceFile, type ManualHealthFile, type MinistryFile, type OverpassResponse } from '../src/shared/health/build.ts';
import type { HealthDataset } from '../src/shared/health/types.ts';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const fixIdx = args.indexOf('--osm-fixture');
const OSM_FIXTURE = fixIdx >= 0 ? path.resolve(args[fixIdx + 1]) : null;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'public', 'data', 'sante');
const RAW = path.join(OUT, 'osm-brut.json');
const DATASET = path.join(OUT, 'etablissements.json');
const MAX_AGE_H = 20; // OSM interrogé au plus une fois par ~jour (usage raisonnable d'Overpass)

// Rabat, Salé, Témara (avec Harhoura et Tamesna) : sud, ouest, nord, est
const BBOX = '33.85,-6.98,34.12,-6.70';
const QUERY = `[out:json][timeout:90];(nwr["amenity"~"^(hospital|clinic)$"](${BBOX});nwr["healthcare"~"^(hospital|clinic)$"](${BBOX}););out center tags;`;
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const repo = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'local';
const USER_AGENT = `PharmaciesGardeMaroc/1.0 (+${repo}; établissements de santé, 1 requête/jour)`;

const log = (...a: unknown[]) => console.log('[sante]', ...a);
const readJson = async <T>(f: string): Promise<T | null> => (existsSync(f) ? (JSON.parse(await readFile(f, 'utf8')) as T) : null);

async function fetchOverpass(): Promise<OverpassResponse> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`${host} : HTTP ${res.status}`);
      const json = (await res.json()) as OverpassResponse;
      if (!Array.isArray(json.elements)) throw new Error(`${host} : réponse inattendue`);
      return json;
    } catch (e) {
      lastErr = e;
      log('échec', (e as Error).message);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
  throw lastErr;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const prevRaw = await readJson<OverpassResponse & { fetchedAt?: string }>(RAW);
  const prev = await readJson<HealthDataset>(DATASET);
  let raw = prevRaw;
  let lastError: string | null = null;

  if (OSM_FIXTURE) {
    raw = { ...(JSON.parse(await readFile(OSM_FIXTURE, 'utf8')) as OverpassResponse), fetchedAt: new Date().toISOString() };
  } else {
    const ageH = prevRaw?.fetchedAt ? (Date.now() - Date.parse(prevRaw.fetchedAt)) / 3.6e6 : Infinity;
    if (FORCE || ageH > MAX_AGE_H) {
      try {
        raw = { ...(await fetchOverpass()), fetchedAt: new Date().toISOString() };
        log(`OpenStreetMap : ${raw.elements.length} objets (base du ${raw.osm3s?.timestamp_osm_base ?? '?'})`);
        if (!DRY) await writeFile(RAW, JSON.stringify(raw) + '\n');
      } catch (e) {
        lastError = `OpenStreetMap indisponible (${(e as Error).message}) : données précédentes conservées.`;
        log(lastError);
      }
    } else {
      log(`OpenStreetMap : données de moins de ${MAX_AGE_H} h réutilisées (${prevRaw?.fetchedAt}).`);
    }
  }

  const ministry = await readJson<MinistryFile>(path.join(ROOT, 'data-sources', 'sante', 'ministere-hopitaux-2022.json'));
  const correspondences = await readJson<CorrespondenceFile>(path.join(ROOT, 'data-sources', 'sante', 'correspondances-osm.json'));
  const manual = await readJson<ManualHealthFile>(path.join(ROOT, 'manual', 'sante.json'));
  const establishments = buildEstablishments({ overpass: raw, ministry, correspondences, manual, log });

  const dataset: HealthDataset = {
    generatedAt: new Date().toISOString(),
    osmBase: raw?.osm3s?.timestamp_osm_base ?? null,
    ministryDataDate: ministry?.donneesMisesAJourLe ?? null,
    lastError,
    establishments,
  };
  const located = establishments.filter((e) => e.latitude !== null).length;
  log(`${establishments.length} établissements (${located} positionnés, ${establishments.filter((e) => e.emergency === 'yes').length} avec urgences déclarées).`);

  // N'écrire que si le contenu a changé (évite un commit toutes les 2 h pour rien)
  const same = prev && JSON.stringify(prev.establishments) === JSON.stringify(establishments) && prev.lastError === lastError && prev.osmBase === dataset.osmBase;
  if (DRY) log('simulation : rien n’est écrit.');
  else if (same) log('aucun changement.');
  else await writeFile(DATASET, JSON.stringify(dataset, null, 1) + '\n');
  if (!raw) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
