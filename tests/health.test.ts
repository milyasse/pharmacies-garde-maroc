// Cliniques et hôpitaux : filtrage OSM, classification, fusion, liste officielle, saisies manuelles, recherche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applyManual, buildEstablishments, classifyOsm, dedupeOsm, establishmentFromOsm, isRelevantOsm, officialDisplayName,
  type CorrespondenceFile, type MinistryFile, type OverpassElement, type OverpassResponse,
} from '../src/shared/health/build.ts';
import { availableServices, levelsOf, searchEstablishments } from '../src/shared/health/search.ts';
import type { Establishment } from '../src/shared/health/types.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = <T>(p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')) as T;
const OSM = read<OverpassResponse>('tests/fixtures/osm-sante-2026-10-21.json');
const MINISTRY = read<MinistryFile>('data-sources/sante/ministere-hopitaux-2022.json');
const CORR = read<CorrespondenceFile>('data-sources/sante/correspondances-osm.json');
const el = (tags: Record<string, string>, id = 1, lat = 34.0, lon = -6.84): OverpassElement => ({ type: 'node', id, lat, lon, tags });

test('OSM : on écarte cabinets, laboratoires, centres de santé, noms génériques et objets sans nom', () => {
  assert.equal(isRelevantOsm(el({ amenity: 'clinic', name: 'Cabinet Medical' })), false);
  assert.equal(isRelevantOsm(el({ amenity: 'hospital', name: 'Centre de santé Bouhlal' })), false);
  assert.equal(isRelevantOsm(el({ amenity: 'clinic', name: 'Actilab Matériel Médical' })), false);
  assert.equal(isRelevantOsm(el({ amenity: 'hospital', name: 'Polyclinique' })), false);
  assert.equal(isRelevantOsm(el({ amenity: 'hospital' })), false);
  assert.equal(isRelevantOsm(el({ amenity: 'clinic', name: 'SOS Medecin Rabat' })), false);
  assert.equal(isRelevantOsm(el({ amenity: 'clinic', name: 'Clinique Agdal' })), true);
  assert.equal(isRelevantOsm(el({ amenity: 'hospital', name: 'Hôpital Cheikh Zaid' })), true);
  // une « clinic » OSM qui ne se présente pas comme clinique ou hôpital est écartée (prudence)
  assert.equal(isRelevantOsm(el({ amenity: 'clinic', name: 'Ibn Rochd' })), false);
});

test('OSM : type déduit de l’opérateur déclaré, sinon du nom, sinon « statut non publié »', () => {
  assert.equal(classifyOsm({ amenity: 'hospital', 'operator:type': 'private_non_profit' }, 'Hôpital Cheikh Zaid').type, 'private_hospital');
  assert.equal(classifyOsm({ amenity: 'clinic', 'operator:type': 'private_for_profit' }, 'Clinique 16 Novembre').type, 'private_clinic');
  assert.equal(classifyOsm({ amenity: 'hospital' }, 'Hôpital Militaire Mohammed V').type, 'military_hospital');
  assert.equal(classifyOsm({ amenity: 'hospital' }, 'Hopital Des Spécialités / HCU Ibn Sina').type, 'public_hospital');
  assert.equal(classifyOsm({ amenity: 'hospital' }, 'Clinique Agdal').type, 'private_clinic');
  assert.equal(classifyOsm({ amenity: 'hospital' }, 'La Capitale').type, 'hospital');
});

test('OSM : téléphone normalisé, urgences et spécialités seulement si déclarées', () => {
  const e = establishmentFromOsm(el({ amenity: 'hospital', name: 'Hôpital X', phone: '+212 5 37 68 38 48', emergency: 'yes', 'healthcare:speciality': 'cardiology;unknown_value' }), null)!;
  assert.equal(e.phone, '+212537683848');
  assert.equal(e.emergency, 'yes');
  assert.deepEqual(e.services.map((s) => s.id).sort(), ['cardiology', 'emergency']);
  const f = establishmentFromOsm(el({ amenity: 'hospital', name: 'Hôpital Y' }), null)!;
  assert.equal(f.emergency, null);
  assert.equal(f.phone, null);
  assert.equal(f.hours, null);
});

test('OSM : doublons (même nom, < 300 m) fusionnés, nom le plus descriptif conservé', () => {
  const a = establishmentFromOsm(el({ amenity: 'hospital', name: 'Moulay Abdellah' }, 1, 34.0263, -6.75359), null)!;
  const b = establishmentFromOsm({ type: 'way', id: 2, center: { lat: 34.02629, lon: -6.7536 }, tags: { amenity: 'hospital', name: 'Nouveau Hopital My Abdellah' } }, null)!;
  const far = establishmentFromOsm(el({ amenity: 'hospital', name: 'Hopital Moulay Abdallah' }, 3, 34.03747, -6.8126), null)!;
  const out = dedupeOsm([a, b, far]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Nouveau Hopital My Abdellah');
  assert.deepEqual(out[0].osmIds, ['node/1', 'way/2']);
});

test('Liste officielle : noms lisibles', () => {
  assert.equal(officialDisplayName('My Youssef'), 'Hôpital Moulay Youssef');
  assert.equal(officialDisplayName('Moulay Abdellah (Hôp.préféctoral)'), 'Hôpital Moulay Abdellah');
  assert.equal(officialDisplayName('Maternité Souissi'), 'Maternité Souissi');
  assert.equal(officialDisplayName("Hôpital D'enfants"), 'Hôpital d’Enfants');
});

test('Données réelles (OSM 21/10/2026 + ministère) : fusion, aucune garde sans source officielle', () => {
  const list = buildEstablishments({ overpass: OSM, ministry: MINISTRY, correspondences: CORR, manual: null });
  // les 12 hôpitaux publics du ministère sont présents, positionnés seulement quand la correspondance existe
  const official = list.filter((e) => e.sources.some((s) => s.id === 'ministere-sante'));
  assert.equal(official.length, 12);
  assert.ok(official.every((e) => e.type === 'public_hospital' && e.officialCategory));
  const ino = list.find((e) => e.name.startsWith('Institut national d'))!;
  assert.ok(ino.latitude && ino.services.some((s) => s.id === 'oncology'));
  assert.equal(ino.osmIds[0], 'way/1037424831');
  const orangers = list.find((e) => e.name === 'Maternité Orangers')!;
  assert.equal(orangers.latitude, null); // pas de position inventée
  assert.ok(orangers.notes.some((n) => /Position non publiée/.test(n)));
  // les objets OSM rapprochés ne sont pas listés une deuxième fois
  assert.equal(list.filter((e) => e.osmIds.includes('way/738368993')).length, 1);
  // exclusions
  assert.ok(!list.some((e) => /Cabinet|Centre de santé|Actilab|SOS Medecin/i.test(e.name)));
  // aucun établissement n'est « de garde » sans désignation officielle
  assert.ok(list.every((e) => e.duty.length === 0 && !levelsOf(e, '2026-10-21').officialOnDuty));
  assert.ok(list.every((e) => !e.hours?.verified));
});

test('Saisie manuelle : garde et horaires vérifiés uniquement avec source et date', () => {
  const base = buildEstablishments({ overpass: OSM, ministry: MINISTRY, correspondences: CORR, manual: null });
  const logs: string[] = [];
  const out = applyManual(base, {
    etablissements: [
      { osm: 'way/738368993', horaires: { texte: 'Urgences 24h/24', source: 'Site officiel', url: 'https://exemple.ma', verifieLe: '2026-10-21' }, garde: [{ du: '2026-10-25', au: '2026-10-26', source: 'Délégation', url: 'https://exemple.ma/garde' }] },
      { nom: 'Clinique Agdal', garde: [{ du: '2026-10-25', au: '2026-10-26', source: '', url: '' }] },
      { osm: 'way/0', telephone: '0537000000' },
    ],
  }, (m) => logs.push(m));
  const lalla = out.find((e) => e.osmIds.includes('way/738368993'))!;
  assert.equal(lalla.hours?.verified, true);
  assert.equal(levelsOf(lalla, '2026-10-25').officialOnDuty, true);
  assert.equal(levelsOf(lalla, '2026-10-27').officialOnDuty, false);
  assert.equal(out.find((e) => e.name === 'Clinique Agdal')!.duty.length, 0);
  assert.equal(logs.length, 2);
});

test('Recherche : filtres, rayon, tri croissant/décroissant, sans position à part', () => {
  const list = buildEstablishments({ overpass: OSM, ministry: MINISTRY, correspondences: CORR, manual: null });
  const origin = { lat: 33.98, lng: -6.855 }; // Souissi
  const q = { origin, radiusKm: 5, types: [], service: null, emergencyOnly: false, date: '2026-10-21', sort: 'asc' as const };
  const asc = searchEstablishments(list, q);
  assert.ok(asc.ranked.length > 5);
  const d = asc.ranked.map((e) => e.distanceStraightLineKm!);
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
  assert.ok(asc.ranked.every((e) => e.distanceStraightLineKm! <= 5));
  const desc = searchEstablishments(list, { ...q, sort: 'desc' });
  assert.equal(desc.ranked[0].id, asc.ranked.at(-1)!.id);
  assert.equal(desc.ranked[0].rank, asc.ranked.length); // le rang suit toujours la proximité
  const urg = searchEstablishments(list, { ...q, radiusKm: 30, emergencyOnly: true });
  assert.ok(urg.ranked.length >= 5 && urg.ranked.every((e) => e.emergency === 'yes'));
  const pub = searchEstablishments(list, { ...q, radiusKm: 30, types: ['public_hospital'] });
  assert.ok(pub.unlocated.length >= 1 && pub.unlocated.every((e) => e.latitude === null));
  const none = searchEstablishments(list, { ...q, origin: { lat: 31.63, lng: -8.0 }, radiusKm: 5 }); // Marrakech
  assert.equal(none.ranked.length, 0);
  assert.equal(availableServices(list)[0], 'emergency');
});

test('Un établissement sans information reste sans information', () => {
  const e: Establishment = establishmentFromOsm(el({ amenity: 'hospital', name: 'Hôpital Z' }), null)!;
  const l = levelsOf(e, '2026-10-21');
  assert.deepEqual(l, { listed: true, emergencyDeclared: false, hoursVerified: false, officialOnDuty: false });
});
