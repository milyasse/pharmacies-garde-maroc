// Tests sans dépendance : `node --experimental-strip-types --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { haversineKm, filterAndRank, formatKm, isValidLatLng } from '../src/shared/distance.ts';
import { addDays, moroccoDate, parseFrenchDate, parseHours, isIsoDate } from '../src/shared/dates.ts';
import { classifyDutyLabel } from '../src/shared/duty.ts';
import { normalizeMoroccanPhone, similarity } from '../src/shared/text.ts';
import { parseDetail, parseHistory, parseListing } from '../src/shared/connectors/annuaireGratuit.ts';
import { computeBaseStatus, applyTimeStatus, selectForDate } from '../src/shared/status.ts';
import { dedupe, isSamePharmacy, recordId } from '../src/shared/merge.ts';
import type { DutyRecord, SourceRef } from '../src/shared/types.ts';
import { rankColor } from '../src/utils/colors.ts';

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const fx = (n: string) => readFileSync(path.join(FIX, n), 'utf8');

// ---------- Distance / Haversine
test('Haversine : Rabat (gare Agdal) → Témara centre ≈ 9 km', () => {
  const d = haversineKm({ lat: 33.9993, lng: -6.8541 }, { lat: 33.9287, lng: -6.9063 });
  assert.ok(d > 8.5 && d < 9.5, `distance obtenue ${d}`);
});
test('Haversine : distance nulle et symétrie', () => {
  const a = { lat: 34.02, lng: -6.84 }, b = { lat: 34.05, lng: -6.8 };
  assert.equal(haversineKm(a, a), 0);
  assert.ok(Math.abs(haversineKm(a, b) - haversineKm(b, a)) < 1e-12);
});
test('Haversine : 1° de latitude ≈ 111,2 km', () => {
  const d = haversineKm({ lat: 33, lng: -7 }, { lat: 34, lng: -7 });
  assert.ok(Math.abs(d - 111.2) < 0.2, String(d));
});

// ---------- Filtrage par rayon et classement
const mk = (id: string, lat: number | null, lng: number | null) => ({ id, latitude: lat, longitude: lng, distanceStraightLineKm: null, rank: null });
test('filtrage par rayon + classement croissant + rangs 1..n', () => {
  const origin = { lat: 33.9287, lng: -6.9063 };
  const items = [mk('loin', 34.0209, -6.8416), mk('proche', 33.93, -6.905), mk('moyen', 33.94, -6.9), mk('sans-gps', null, null)];
  const { ranked, unlocated, outside } = filterAndRank(items, origin, 5);
  assert.deepEqual(ranked.map((r) => r.id), ['proche', 'moyen']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2]);
  assert.equal(outside, 1);
  assert.equal(unlocated.length, 1);
  assert.equal(unlocated[0].rank, null);
});
test('coordonnées (0,0) ou hors bornes rejetées', () => {
  assert.equal(isValidLatLng(0, 0), false);
  assert.equal(isValidLatLng(95, 0), false);
  assert.equal(isValidLatLng(33.9, -6.9), true);
});
test('format des distances', () => {
  assert.equal(formatKm(0.45), '450 m');
  assert.equal(formatKm(2.34), '2,3 km');
  assert.equal(formatKm(null), '—');
});

// ---------- Dates / fuseau
test('parseFrenchDate', () => {
  assert.equal(parseFrenchDate('mise à jour le Mardi 13 Octobre 2026'), '2026-10-13');
  assert.equal(parseFrenchDate('Aujourd’hui Lundi 1er Février 2027'), '2027-02-01');
  assert.equal(parseFrenchDate('31 février 2026'), null);
  assert.equal(parseFrenchDate('rien'), null);
});
test('date du Maroc calculée par fuseau (pas de décalage en dur)', () => {
  const d = moroccoDate(new Date('2026-10-12T23:30:00Z'));
  assert.ok(d === '2026-10-12' || d === '2026-10-13');
  assert.ok(isIsoDate(d));
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});
test('plages horaires publiées', () => {
  assert.deepEqual(parseHours('Garde Jour (Ouvert entre 9h et 23h)'), { startMin: 540, endMin: 1380, text: '9h-23h' });
  assert.equal(parseHours('08h30 - 20h00')?.startMin, 510);
  assert.equal(parseHours('Ouvert 24h/24'), null);
});
test('classification du type de garde', () => {
  assert.equal(classifyDutyLabel('Garde 24h/24'), 'continuous');
  assert.equal(classifyDutyLabel('Ouvert toute la journée (24 heures)'), 'continuous');
  assert.equal(classifyDutyLabel('Garde Jour et Nuit'), 'continuous');
  assert.equal(classifyDutyLabel('Garde Jour (Ouvert entre 9h et 23h)'), 'day');
  assert.equal(classifyDutyLabel('Garde de nuit'), 'night');
  assert.equal(classifyDutyLabel('Ouverte'), null);
});
test('téléphones marocains : normalisation, masqués refusés', () => {
  assert.equal(normalizeMoroccanPhone('0537 64 29 50'), '+212537642950');
  assert.equal(normalizeMoroccanPhone('+212 5 37 60 20 82'), '+212537602082');
  assert.equal(normalizeMoroccanPhone('05 37 64 •• ••'), null);
  assert.equal(normalizeMoroccanPhone('123'), null);
});

// ---------- Parseurs annuaire-gratuit.ma (fixtures modelées sur les pages observées)
test('liste Témara : date « mise à jour le », 3 entrées, quartiers, coordonnées', () => {
  const p = parseListing(fx('www.annuaire-gratuit.ma_pharmacie-garde-temara.html'));
  assert.equal(p.pageDate, '2026-10-13');
  assert.equal(p.pageDateKind, 'updated');
  assert.equal(p.entries.length, 3);
  const [a, b, c] = p.entries;
  assert.equal(a.name, 'Pharmacie Labchir');
  assert.equal(a.sourceKey, 's238109');
  assert.equal(a.district, 'Centre');
  assert.equal(a.latitude, 33.9156077);
  assert.equal(a.address, 'n° 1 nemssia, av. abdelkrim khattabi');
  assert.equal(classifyDutyLabel(a.dutyLabel), 'continuous');
  assert.equal(b.detailUrl, 'https://www.annuaire-gratuit.ma/pharmacie-bouarous-s240001.html');
  assert.equal(c.name, 'Pharmacie Al Anouar');
  assert.equal(c.hoursText, '9h-23h');
  assert.equal(classifyDutyLabel(c.dutyLabel), 'day');
  assert.equal(c.latitude, null, 'pas de coordonnées inventées');
});
test('liste Rabat : date tirée du titre « Aujourd’hui … »', () => {
  const p = parseListing(fx('www.annuaire-gratuit.ma_pharmacie-garde-rabat.html'));
  assert.equal(p.pageDate, '2026-09-28');
  assert.equal(p.pageDateKind, 'today-heading');
  assert.equal(p.entries.length, 1);
});
test('liste Salé vide signalée comme vide (pas une erreur de parseur)', () => {
  const p = parseListing(fx('www.annuaire-gratuit.ma_pharmacie-garde-sale.html'));
  assert.equal(p.entries.length, 0);
  assert.equal(p.emptyNotice, true);
});
test('fiche : téléphone (1er lien tel:), coordonnées, historique trié', () => {
  const d = parseDetail(fx('www.annuaire-gratuit.ma_pharmacie-labchir-s238109.html'));
  assert.equal(d.phone, '+212537642950');
  assert.equal(d.latitude, 33.9156077);
  assert.equal(d.history.length, 2);
  assert.deepEqual(d.history[0], { start: '2026-10-13', end: '2026-10-14', label: 'Garde Jour et Nuit' });
  assert.equal(d.address, 'n° 1 nemssia, av. abdelkrim khattabi - Temara');
});
test('fiche JSON-LD prioritaire', () => {
  const d = parseDetail(fx('www.annuaire-gratuit.ma_pharmacie-bouarous-s240001.html'));
  assert.equal(d.phone, '+212537602082');
  assert.equal(d.latitude, 33.93119);
  assert.equal(d.address, '187, Rue Laayoune, Elmassira I');
});
test('fiche sans téléphone ni coordonnées : null, rien d’inventé', () => {
  const d = parseDetail(fx('www.annuaire-gratuit.ma_pharmacie-al-anouar-s240002.html'));
  assert.equal(d.phone, null);
  assert.equal(d.latitude, null);
  assert.deepEqual(d.history, []);
});
test('historique : lignes invalides ignorées', () => {
  assert.deepEqual(parseHistory('<td>2026-10-14</td><td>2026-10-13</td>'), []);
  assert.equal(parseHistory('<td>2026-02-30</td><td>2026-03-01</td>').length, 0);
});

// ---------- Statuts de fiabilité
const src = (o: Partial<SourceRef> = {}): SourceRef => ({
  sourceId: 'annuaire-gratuit', sourceName: 'annuaire-gratuit.ma', sourceUrl: 'https://x/s1.html', listingUrl: 'https://x/l.html',
  sourcePublishedAt: '2026-10-13', lastCheckedAt: '2026-10-13T10:00:00Z', historyMatch: null, dutyType: 'continuous', dutyLabel: 'Garde 24h/24', ...o,
});
const rec = (o: Partial<DutyRecord> = {}): DutyRecord => ({
  id: 'temara-labchir', name: 'Pharmacie Labchir', address: null, city: 'temara', district: null, latitude: 33.9156, longitude: -6.9121,
  coordinatesSource: 'source', phone: null, dutyDate: '2026-10-13', dutyType: 'continuous', dutyLabel: null, hoursText: null,
  dutyStartDate: null, dutyEndDate: null, sources: [src()], verificationStatus: 'to_confirm', confidenceLevel: 'low', notes: [], ...o,
});
test('statut : liste datée du jour + historique → Confirmée (confiance moyenne)', () => {
  const s = computeBaseStatus(rec({ sources: [src({ historyMatch: { start: '2026-10-13', end: '2026-10-14', label: null } })] }));
  assert.equal(s.status, 'confirmed');
  assert.equal(s.confidence, 'medium');
});
test('statut : page périmée et pas d’historique → À confirmer', () => {
  const s = computeBaseStatus(rec({ dutyDate: '2026-10-13', sources: [src({ sourcePublishedAt: '2026-09-28' })] }));
  assert.equal(s.status, 'to_confirm');
});
test('statut : page datée mais collectée un autre jour → pas de confirmation par la liste', () => {
  const s = computeBaseStatus(rec({ sources: [src({ lastCheckedAt: '2026-10-20T10:00:00Z' })] }));
  assert.equal(s.status, 'to_confirm');
});
test('statut : deux sources en désaccord → Sources contradictoires', () => {
  const s = computeBaseStatus(rec({ sources: [src(), src({ sourceId: 'manual', sourceUrl: 'https://ordre/x', dutyType: 'day' })] }));
  assert.equal(s.status, 'conflicting');
});
test('statut : deux sources datées concordantes → confiance élevée', () => {
  const s = computeBaseStatus(rec({ sources: [src(), src({ sourceId: 'manual', sourceUrl: 'https://ordre/x', historyMatch: { start: '2026-10-13', end: '2026-10-14', label: null } })] }));
  assert.equal(s.status, 'confirmed');
  assert.equal(s.confidence, 'high');
});
test('expiration : fin publiée passée → Expirée', () => {
  const r = applyTimeStatus(rec({ verificationStatus: 'confirmed', dutyStartDate: '2026-10-10', dutyEndDate: '2026-10-11' }), '2026-10-13', new Date('2026-10-13T12:00:00Z'));
  assert.equal(r.verificationStatus, 'expired');
});
test('expiration : garde de jour 9h-23h après 23h → Expirée', () => {
  const r = applyTimeStatus(rec({ verificationStatus: 'confirmed', dutyType: 'day', hoursText: '9h-23h' }), '2026-10-13', new Date('2026-10-13T23:59:00Z'));
  assert.equal(r.verificationStatus, 'expired');
});
test('sélection : garde de nuit de la veille incluse le matin, exclue des gardes de jour', () => {
  const prev = [
    rec({ id: 'nuit', dutyDate: '2026-10-12', dutyStartDate: '2026-10-12', dutyEndDate: '2026-10-13', verificationStatus: 'confirmed' }),
    rec({ id: 'jour', dutyDate: '2026-10-12', dutyType: 'day', verificationStatus: 'confirmed' }),
  ];
  const morning = selectForDate([], prev, '2026-10-13', new Date('2026-10-13T06:00:00Z'));
  assert.deepEqual(morning.map((r) => r.id), ['nuit']);
  assert.notEqual(morning[0].verificationStatus, 'expired');
  const afternoon = selectForDate([], prev, '2026-10-13', new Date('2026-10-13T15:00:00Z'));
  assert.equal(afternoon[0].verificationStatus, 'expired');
});
test('sélection : fenêtre publiée qui ne couvre pas la date → exclue', () => {
  const r = selectForDate([rec({ dutyStartDate: '2026-10-01', dutyEndDate: '2026-10-02' })], [], '2026-10-13', new Date('2026-10-13T10:00:00Z'));
  assert.equal(r.length, 0);
});

// ---------- Doublons
test('doublons : même pharmacie, noms écrits différemment → fusion des sources', () => {
  const a = rec({ id: recordId('temara', 'Pharmacie Labchir'), name: 'Pharmacie Labchir' });
  const b = rec({ id: recordId('temara', 'PHARMACIE LABCHIR (Témara)'), name: 'PHARMACIE LABCHIR', latitude: 33.91565, longitude: -6.91218, sources: [src({ sourceId: 'manual', sourceUrl: 'https://ordre/x' })] });
  assert.ok(isSamePharmacy(a, b));
  const out = dedupe([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sources.length, 2);
});
test('doublons : homonymes éloignés de plusieurs km → non fusionnés', () => {
  const a = rec({ id: 'x1', name: 'Pharmacie Annour', latitude: 33.93, longitude: -6.90 });
  const b = rec({ id: 'x2', name: 'Pharmacie Annour', latitude: 33.99, longitude: -6.85 });
  assert.equal(dedupe([a, b]).length, 2);
});
test('similarité de noms', () => {
  assert.ok(similarity('Pharmacie El Wahda', 'PHARMACIE AL WAHDA') > 0.6);
  assert.ok(similarity('Pharmacie Mecca', 'Pharmacie Chems') < 0.4);
});

// ---------- Couleurs de rang
test('couleurs de rang : 1 vert foncé, 2 vert clair, 3 bleu, 4 orange, 5 violet, 6+ distinctes', () => {
  assert.equal(rankColor(1).bg, '#0B6E3F');
  assert.equal(rankColor(2).bg, '#5DBB63');
  assert.equal(rankColor(3).bg, '#1D6FD8');
  assert.equal(rankColor(4).bg, '#E8760A');
  assert.equal(rankColor(5).bg, '#7B3FC4');
  const six = new Set(Array.from({ length: 10 }, (_, i) => rankColor(i + 6).bg));
  assert.equal(six.size, 10);
});

test('structure réelle observée (cartes ag_pharmacy_card, 13/10/2026)', () => {
  const p = parseListing(fx('structure-cartes-2026-10.html'));
  assert.equal(p.pageDate, '2026-10-13');
  assert.equal(p.pageDateKind, 'updated');
  assert.equal(p.entries.length, 3);
  const [a, , b] = p.entries;
  assert.equal(a.name, 'Pharmacie Labchir');
  assert.equal(a.sourceKey, 's238109');
  assert.equal(a.detailUrl, 'https://www.annuaire-gratuit.ma/pharmacie-labchir-s238109.html');
  assert.equal(a.latitude, 33.9156077);
  assert.equal(a.longitude, -6.9121605);
  assert.equal(a.district, 'Centre');
  assert.equal(a.address, 'n° 1 nemssia, av. abdelkrim khattabi');
  assert.equal(classifyDutyLabel(a.dutyLabel), 'continuous');
  assert.equal(b.name, "Pharmacie De L'Exemple", 'apostrophe abîmée « 039 » réparée');
  assert.equal(b.latitude, null, 'data-lat vide : pas de coordonnées inventées');
  assert.equal(classifyDutyLabel(b.dutyLabel), 'day');
  assert.equal(b.hoursText, '9h-23h');
  assert.equal(b.district, 'Agdal');
});

test('import CSV d’un tableau de garde officiel (jours à venir)', async () => {
  const { parseManualCsv } = await import('../src/shared/manualCsv.ts');
  const csv = [
    'date;ville;nom;adresse;telephone;type;source;source_url',
    '20/10/2026;Témara;Pharmacie Labchir;;0537 64 29 50;24h;Tableau officiel;https://exemple.invalid/t.pdf',
    '2026-10-20;Rabat;"Pharmacie ""Test""";1 rue X;;jour;;https://exemple.invalid/t.pdf',
    '2026-10-20;Fès;Pharmacie Y;;;nuit;;https://exemple.invalid/t.pdf',
    '2026-10-20;Salé;Pharmacie Z;;;nuit;;',
  ].join('\n');
  const { rows, errors } = parseManualCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(errors.length, 2);
  assert.deepEqual([rows[0].city, rows[0].date, rows[0].dutyEndDate, rows[0].dutyType], ['temara', '2026-10-20', '2026-10-21', 'continuous']);
  assert.equal(rows[1].name, 'Pharmacie "Test"');
  assert.equal(rows[1].dutyEndDate, '2026-10-20', 'garde de jour : même jour');
  assert.equal(rows[1].sourceName, 'Tableau de garde officiel');
});

// ---------- guidepharmacies.ma (page réelle de Témara, semaine du 12/10/2026)
test('guidepharmacies : planning hebdomadaire, jours, types, centre de quartier', async () => {
  const { parseGuideWeek, parseGuideLabel, nextMonday } = await import('../src/shared/connectors/guidePharmacies.ts');
  const w = parseGuideWeek(fx('guide-temara-semaine-2026-10-12.html'));
  assert.equal(w.weekStart, '2026-10-12');
  assert.equal(w.weekEnd, '2026-10-18');
  assert.deepEqual(w.days, ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.ok(w.entries.length >= 25);
  assert.ok(w.entries.every((e) => e.name !== 'Pharmacie'), 'entrée sans nom ignorée');
  const anouar = w.entries.find((e) => e.name === 'Pharmacie Al Anouar' && e.date === '2026-10-14')!;
  assert.equal(anouar.phone, '+212537603990');
  assert.equal(anouar.district, 'Oulad Mtaâ');
  assert.deepEqual([anouar.dutyType, anouar.hoursText, anouar.start, anouar.end], ['day', '9h-24h', '2026-10-14', '2026-10-14']);
  const atl = w.entries.find((e) => e.name === 'Pharmacie Atlantique')!;
  assert.deepEqual([atl.dutyType, atl.end], ['continuous', '2026-10-16']);
  assert.equal(w.nextWeekUrl, 'https://www.guidepharmacies.ma/pharmacies-de-garde/temara.html?date=2026-10-19');
  assert.deepEqual(parseGuideLabel('Centre (Al Wifak)'), { district: 'Centre (Al Wifak)', dutyType: null, hoursText: null });
  assert.deepEqual(parseGuideLabel('Medina (9h à 22h30)'), { district: 'Medina', dutyType: 'day', hoursText: '9h-22h30' });
  assert.equal(nextMonday('2026-10-14'), '2026-10-19');
  assert.equal(nextMonday('2026-10-18'), '2026-10-19');
  assert.equal(nextMonday('2026-10-19'), '2026-10-26');
});

test('guidepharmacies : fiche (adresse + téléphone)', async () => {
  const { parseGuideDetail } = await import('../src/shared/connectors/guidePharmacies.ts');
  assert.deepEqual(parseGuideDetail(fx('guide-fiche-anzi.html')), {
    address: "N°4 Angle Av Hassan II et rue Abbas Ibn Farnas, En Face De La Gare Rabat AGDAL Sur L'avenue Hassan II.",
    phone: '+212537691313',
  });
});

test('fusion : position exacte prioritaire sur le centre de quartier, pas de faux conflit de fin de garde', async () => {
  const a = rec({ id: 'temara-al-anouar', name: 'Pharmacie Al Anouar', latitude: 33.9398, longitude: -6.9146, coordinatesSource: 'district', dutyType: 'day',
    sources: [src({ sourceId: 'guidepharmacies', sourceUrl: 'g', dutyType: 'day', historyMatch: { start: '2026-10-13', end: '2026-10-13', label: null } })] });
  const b = rec({ id: 'temara-al-anouar', name: 'Pharmacie Al Anouar', latitude: 33.93902, longitude: -6.8911516, coordinatesSource: 'source', dutyType: 'day',
    sources: [src({ sourceUrl: 'a', dutyType: 'day', historyMatch: { start: '2026-10-13', end: '2026-10-14', label: null } })] });
  const out = dedupe([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].coordinatesSource, 'source');
  assert.equal(out[0].latitude, 33.93902);
  assert.equal(out[0].verificationStatus, 'confirmed');
  assert.equal(out[0].confidenceLevel, 'high');
});
