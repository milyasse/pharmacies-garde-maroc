// Test de bout en bout du collecteur sur des pages modèles (aucun accès réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CollectorStatus, DutySnapshot } from '../src/shared/types.ts';
import { buildResults } from '../src/shared/search.ts';
import { moroccoDate } from '../src/shared/dates.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function runCollector(out: string, manual: string) {
  const r = spawnSync(process.execPath, [
    '--experimental-strip-types', '--no-warnings', path.join(ROOT, 'scripts/collect.ts'),
    '--fixtures', path.join(ROOT, 'tests/fixtures'), '--out', out, '--manual', manual,
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return r.stdout;
}

test('collecteur : fichiers produits, statuts, aucune donnée inventée', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'pgm-'));
  const manual = mkdtempSync(path.join(tmpdir(), 'pgm-manual-'));
  runCollector(out, manual);
  const status = JSON.parse(readFileSync(path.join(out, 'status.json'), 'utf8')) as CollectorStatus;
  assert.equal(status.runs.filter((r) => r.sourceId === 'annuaire-gratuit').length, 3);
  assert.ok(status.connectors.some((c) => c.id === 'wadifapublic' && !c.enabled));
  const tem = status.runs.find((r) => r.city === 'temara' && r.sourceId === 'annuaire-gratuit')!;
  assert.equal(tem.pageDate, '2026-10-13');
  assert.equal(tem.count, 3);

  const snap = JSON.parse(readFileSync(path.join(out, 'duty', '2026-10-13.json'), 'utf8')) as DutySnapshot;
  const labchir = snap.records.find((r) => r.name === 'Pharmacie Labchir')!;
  assert.equal(labchir.phone, '+212537642950');
  assert.equal(labchir.dutyStartDate, '2026-10-13');
  assert.equal(labchir.dutyType, 'continuous');
  const anouar = snap.records.find((r) => r.name === 'Pharmacie Al Anouar')!;
  assert.equal(anouar.latitude, null, 'pas de coordonnées sans source (géocodage désactivé en test)');
  assert.equal(anouar.phone, null);
  assert.equal(anouar.dutyType, 'day');
  // La liste n'est un signal de confirmation que si la collecte a lieu le jour annoncé par la page
  const expected = moroccoDate() === '2026-10-13' ? 'confirmed' : 'to_confirm';
  assert.equal(anouar.verificationStatus, expected);
  // Labchir : historique daté de la fiche → confirmée quel que soit le jour de collecte
  assert.equal(labchir.verificationStatus, 'confirmed');

  // Page Rabat périmée : rattachée au 28/09, pas au jour de collecte
  const rabat = JSON.parse(readFileSync(path.join(out, 'duty', '2026-09-28.json'), 'utf8')) as DutySnapshot;
  assert.equal(rabat.records[0].name, 'Pharmacie Des Facultes');
});

test('collecteur : deuxième passage idempotent (pas de doublons)', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'pgm-'));
  const manual = mkdtempSync(path.join(tmpdir(), 'pgm-manual-'));
  runCollector(out, manual);
  runCollector(out, manual);
  const snap = JSON.parse(readFileSync(path.join(out, 'duty', '2026-10-13.json'), 'utf8')) as DutySnapshot;
  assert.equal(snap.records.length, 3);
  assert.ok(snap.records.every((r) => r.sources.length === 1));
});

test('collecteur : saisie manuelle fusionnée, contradiction détectée', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'pgm-'));
  const manual = mkdtempSync(path.join(tmpdir(), 'pgm-manual-'));
  mkdirSync(manual, { recursive: true });
  writeFileSync(path.join(manual, '2026-10-13.json'), JSON.stringify({
    date: '2026-10-13', sourceName: 'Tableau officiel (test)', sourceUrl: 'https://exemple.invalid/tableau',
    records: [
      { name: 'PHARMACIE LABCHIR', city: 'temara', dutyType: 'continuous', dutyStartDate: '2026-10-13', dutyEndDate: '2026-10-14' },
      { name: 'Pharmacie Bouarous', city: 'temara', dutyType: 'day' },
    ],
  }));
  writeFileSync(path.join(manual, 'invalide.json'), '{}');
  runCollector(out, manual);
  const snap = JSON.parse(readFileSync(path.join(out, 'duty', '2026-10-13.json'), 'utf8')) as DutySnapshot;
  assert.equal(snap.records.length, 3, 'fusion par nom/ville, pas de doublon');
  const labchir = snap.records.find((r) => /labchir/i.test(r.name))!;
  assert.equal(labchir.sources.length, 2);
  assert.equal(labchir.verificationStatus, 'confirmed');
  assert.equal(labchir.confidenceLevel, 'high');
  const bouarous = snap.records.find((r) => /bouarous/i.test(r.name))!;
  assert.equal(bouarous.verificationStatus, 'conflicting', '24h/24 chez une source, jour chez l’autre');
});

test('recherche : rayon, rang, filtre par type, expirées séparées', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'pgm-'));
  const manual = mkdtempSync(path.join(tmpdir(), 'pgm-manual-'));
  runCollector(out, manual);
  const snap = JSON.parse(readFileSync(path.join(out, 'duty', '2026-10-13.json'), 'utf8')) as DutySnapshot;
  const origin = { lat: 33.9160, lng: -6.9115 }; // à ~70 m de Labchir
  const now = new Date('2026-10-13T11:00:00Z');
  const all = buildResults({ dayRecords: snap.records, previousDayRecords: [], date: '2026-10-13', origin, radiusKm: 5, dutyFilter: 'all', now });
  assert.equal(all.ranked[0].name, 'Pharmacie Labchir');
  assert.equal(all.ranked[0].rank, 1);
  assert.equal(all.ranked.length, 2); // Al Anouar n'a pas de position → non classée
  assert.equal(all.unlocated.length, 1);
  assert.ok(all.ranked[0].distanceStraightLineKm! < 0.1);
  assert.equal(all.ranked[0].distanceRoadKm, null, 'la distance routière n’est jamais déduite du vol d’oiseau');
  const day = buildResults({ dayRecords: snap.records, previousDayRecords: [], date: '2026-10-13', origin, radiusKm: 5, dutyFilter: 'day', now });
  assert.equal(day.ranked.length, 0);
  assert.equal(day.filteredOutByType, 2);
  const tiny = buildResults({ dayRecords: snap.records, previousDayRecords: [], date: '2026-10-13', origin, radiusKm: 0.5, dutyFilter: 'all', now });
  assert.equal(tiny.ranked.length, 1);
  assert.equal(tiny.outside, 1);
  const late = buildResults({ dayRecords: snap.records, previousDayRecords: [], date: '2026-10-13', origin, radiusKm: 5, dutyFilter: 'all', now: new Date('2026-10-14T12:00:00Z') });
  assert.ok(late.expired.length >= 1, 'garde terminée → classée à part comme expirée');
});

test('compteurs par ville : actives et répartition par type', async () => {
  const { countByCity, selectPharmacies } = await import('../src/shared/search.ts');
  const out = mkdtempSync(path.join(tmpdir(), 'pgm-'));
  const manual = mkdtempSync(path.join(tmpdir(), 'pgm-manual-'));
  runCollector(out, manual);
  const snap = JSON.parse(readFileSync(path.join(out, 'duty', '2026-10-13.json'), 'utf8')) as DutySnapshot;
  const list = selectPharmacies(snap.records, [], '2026-10-13', new Date('2026-10-13T11:00:00Z'));
  const [rabat, sale, temara] = countByCity(list, ['rabat', 'sale', 'temara']);
  assert.equal(rabat.active, 0);
  assert.equal(sale.active, 0);
  assert.deepEqual({ a: temara.active, c: temara.continuous, d: temara.day }, { a: 3, c: 2, d: 1 });
  const late = countByCity(selectPharmacies(snap.records, [], '2026-10-13', new Date('2026-10-13T23:59:00Z')), ['temara'])[0];
  assert.equal(late.day, 0, 'garde de jour 9h-23h terminée');
  assert.equal(late.expired, 1);
});

test('collecteur : tableau CSV à venir enrichi par les pharmacies connues', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'pgm-'));
  const manual = mkdtempSync(path.join(tmpdir(), 'pgm-manual-'));
  runCollector(out, manual); // apprend Labchir (position, téléphone)
  writeFileSync(path.join(manual, 'octobre.csv'), 'date;ville;nom;type;source_url\n2026-10-20;Témara;PHARMACIE LABCHIR;24h;https://exemple.invalid/t.pdf\n2026-10-20;Témara;Pharmacie Inconnue;nuit;https://exemple.invalid/t.pdf\n');
  runCollector(out, manual);
  const snap = JSON.parse(readFileSync(path.join(out, 'duty', '2026-10-20.json'), 'utf8')) as DutySnapshot;
  const l = snap.records.find((r) => /labchir/i.test(r.name))!;
  assert.equal(l.latitude, 33.9156077, 'position reprise de la source, pas inventée');
  assert.equal(l.phone, '+212537642950');
  assert.equal(l.verificationStatus, 'confirmed');
  const u = snap.records.find((r) => /inconnue/i.test(r.name))!;
  assert.equal(u.latitude, null);
  const st = JSON.parse(readFileSync(path.join(out, 'status.json'), 'utf8')) as CollectorStatus;
  assert.ok(st.dates.includes('2026-10-20'));
});
