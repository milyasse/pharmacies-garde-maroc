// Vérification de l'interface construite (exécuté dans GitHub Actions) :
// écran de lancement, espace Pharmacies (recherche sur demande), espace Cliniques & hôpitaux
// (ville, filtres, tri, fiches, itinéraire, aucun résultat, géolocalisation refusée).
import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, rename } from 'node:fs/promises';

const URL = process.env.APP_URL || 'http://localhost:4173/pharmacies-garde-maroc/';
const OUT = 'marketing/verif';
await mkdir(`${OUT}/raw`, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
let failures = 0;
const note = (m) => { console.log(m); log.push(m); };
const check = (ok, m) => { note(`${ok ? 'OK ' : 'ÉCHEC'} — ${m}`); if (!ok) failures++; };

const browser = await chromium.launch();
const base = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Africa/Casablanca',
};

// ---------- 1. Écran de lancement + Pharmacies ----------
const section = async (name, fn) => { try { await fn(); } catch (e) { check(false, `${name} : ${String(e?.message || e).split('\n')[0]}`); } };
await section('Parcours mobile', async () => {
  const ctx = await browser.newContext({ ...base, geolocation: { latitude: 33.9985, longitude: -6.8520, accuracy: 25 }, permissions: ['geolocation'], recordVideo: { dir: `${OUT}/raw`, size: { width: 390, height: 844 } } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => { note('pageerror: ' + e.message); failures++; });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  for (const t of [600, 1800, 3500]) { await wait(t - (Date.now() - t0)); await page.screenshot({ path: `${OUT}/splash-${t}.png` }); }
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 }).then(() => note(`écran de lancement retiré après ${((Date.now() - t0) / 1000).toFixed(1)} s`)).catch(() => check(false, 'écran de lancement toujours présent après 20 s'));
  await wait(600);
  check(await page.getByRole('tab', { name: /Pharmacies de garde/ }).getAttribute('aria-selected') === 'true', 'onglet « Pharmacies de garde » actif par défaut (URL inchangée)');
  await page.screenshot({ path: `${OUT}/app-accueil.png` });
  let dataReq = 0;
  page.on('request', (r) => { if (/\/data\/duty\/.+\.json/.test(r.url())) dataReq++; });
  await page.locator('#espace-pharmacies').getByRole('button', { name: /^Ma position$/ }).click();
  await wait(1200);
  await page.getByRole('button', { name: /^10 ?km$/ }).first().click();
  await wait(800);
  check(!/pharmacies? de garde\s*$/m.test(await page.locator('section[aria-label="Résultats"]').innerText().catch(() => '')), 'pharmacies : pas de recherche automatique après changement de rayon');
  await page.getByRole('button', { name: /Rechercher les pharmacies de garde/ }).click();
  await page.locator('section[aria-label="Résultats"] h2').first().waitFor({ timeout: 20000 }).catch(() => {});
  await wait(2000);
  const ph = await page.locator('section[aria-label="Résultats"] h2').first().innerText().catch(() => '');
  check(/pharmacie|Aucune/.test(ph), `pharmacies : résultats affichés (« ${ph} »)`);
  await page.screenshot({ path: `${OUT}/app-resultats.png` });

  // ---------- 2. Cliniques et hôpitaux ----------
  await page.getByRole('tab', { name: /Cliniques et hôpitaux/ }).click();
  await wait(800);
  check(page.url().includes('#/cliniques'), 'espace Cliniques : URL #/cliniques');
  await page.locator('#espace-sante').waitFor();
  await page.getByRole('button', { name: /^Rabat/ }).first().click();
  await page.locator('#espace-sante section[aria-label="Résultats"] h2').first().waitFor({ timeout: 15000 }).catch(() => {});
  await wait(2500);
  const head = await page.locator('#espace-sante section[aria-label="Résultats"] h2').first().innerText().catch(() => '');
  const n = Number((head.match(/^(\d+)/) || [])[1] || 0);
  check(n > 0, `cliniques : recherche par ville (Rabat) → « ${head} »`);
  const cards = page.locator('#espace-sante article');
  const first = await cards.first().innerText().catch(() => '');
  check(/Répertorié/.test(first) && /Garde :/.test(first) && /Urgences :/.test(first) && /sources/i.test(first), 'cliniques : fiche avec statuts, urgences, garde et sources');
  check(/Modifier/.test(await page.locator('#espace-sante').innerText()), 'cliniques : formulaire replié en résumé après la recherche (bouton « Modifier »)');
  check(!/De garde \(désignation officielle\)/.test(await page.locator('#espace-sante').innerText()), 'cliniques : aucun établissement « de garde » sans source officielle');
  await page.screenshot({ path: `${OUT}/sante-rabat.png` });
  // marqueurs sur la carte = nombre de fiches classées
  const markers = await page.locator('#espace-sante .rank-marker').count();
  check(markers === n, `cliniques : ${markers} marqueurs pour ${n} fiches`);
  // tri décroissant
  const dist = async () => (await page.locator('#espace-sante article').evaluateAll((els) => els.slice(0, 50).map((e) => e.querySelector('p.text-\\[15px\\]')?.textContent ?? '')));
  const asc = await dist();
  await page.getByRole('button', { name: /^Plus éloignés$/ }).click();
  await wait(500);
  const desc = await dist();
  const km = (t) => { const m = (t || '').match(/([\d,]+)\s*(km|m)/); return m ? Number(m[1].replace(',', '.')) / (m[2] === 'm' ? 1000 : 1) : NaN; };
  check(n < 2 || km(desc[0]) > km(asc[0]), `cliniques : tri décroissant (premier : ${desc[0]} contre ${asc[0]})`);
  await page.getByRole('button', { name: /^Plus proches$/ }).click();
  // filtre urgences
  const modifier = () => page.locator('#espace-sante').getByRole('button', { name: 'Modifier' }).click();
  await modifier();
  await page.getByText('Urgences déclarées uniquement').click();
  await page.getByRole('button', { name: /Rechercher les établissements/ }).click();
  await wait(1500);
  const urgText = await page.locator('#espace-sante section[aria-label="Résultats"]').first().innerText();
  const nu = Number((urgText.match(/^(\d+) établissement/m) || [])[1] || 0);
  check(nu > 0 && nu <= n, `cliniques : filtre « urgences déclarées » → ${nu} établissement(s)`);
  await page.screenshot({ path: `${OUT}/sante-urgences.png` });
  // « Calculer les trajets » + tri par durée + tous les itinéraires
  await page.locator('#espace-sante').getByRole('button', { name: /Calculer les trajets/ }).click();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('#espace-sante button')].find((x) => /Calculer les trajets/.test(x.textContent || '')); return b && !b.disabled; }, null, { timeout: 60000 }).catch(() => {});
  await wait(800);
  const roads = await page.locator('#espace-sante article:visible').evaluateAll((els) => els.filter((e) => /\d+(,\d)? (km|m)\s*par la route/.test(e.innerText)).length);
  check(roads >= Math.min(nu, 2), `cliniques : « Calculer les trajets » → ${roads}/${nu} distance(s) routière(s)`);
  await page.locator('#espace-sante').getByRole('button', { name: /^Durée$/ }).click();
  await wait(400);
  check(/triés par durée de trajet/.test(await page.locator('#espace-sante section[aria-label="Résultats"]').first().innerText()), 'cliniques : tri par durée de trajet');
  await page.locator('#espace-sante').getByText('Tous les itinéraires').click();
  await wait(800);
  const lines = await page.locator('#espace-sante .leaflet-overlay-pane path').count();
  check(lines >= 4, `cliniques : « Tous les itinéraires » → ${lines} tracés sur la carte`);
  await page.screenshot({ path: `${OUT}/sante-trajets.png` });
  await page.locator('#espace-sante').getByText('Tous les itinéraires').click();
  await page.locator('#espace-sante').getByRole('button', { name: /^Plus proches$/ }).click();
  // itinéraire vers le premier
  const routeBtn = page.locator('#espace-sante article:visible').first().getByRole('button', { name: /Itinéraire/ });
  if (await routeBtn.isEnabled()) {
    await routeBtn.click();
    await wait(6000);
    const card = await page.locator('#espace-sante article:visible').first().innerText();
    check(/\d+(,\d)? km\s*\n?par la route/.test(card) || /Moteur d’itinéraire|Aucun itinéraire/.test(card), 'cliniques : itinéraire calculé (ou erreur explicite)');
    await page.screenshot({ path: `${OUT}/sante-itineraire.png` });
  }
  // aucun résultat : service rare + rayon 2 km au centre de Témara
  await modifier();
  await page.getByText('Urgences déclarées uniquement').click();
  await page.getByRole('button', { name: /^Témara/ }).first().click();
  await wait(1200);
  await modifier();
  await page.getByRole('button', { name: /^2 ?km$/ }).last().click();
  const opts = await page.locator('#sante-service option').evaluateAll((o) => o.map((x) => x.value));
  if (opts.includes('nuclear')) await page.locator('#sante-service').selectOption('nuclear');
  await page.getByRole('button', { name: /Rechercher les établissements/ }).click();
  await wait(1200);
  const empty = await page.locator('#espace-sante section[aria-label="Résultats"]').first().innerText();
  check(/Aucun établissement/.test(empty) && /Élargir le rayon/.test(empty), 'cliniques : cas « aucun établissement trouvé » avec actions proposées');
  await page.screenshot({ path: `${OUT}/sante-aucun.png` });
  // retour à l'espace Pharmacies : résultats conservés
  await page.getByRole('tab', { name: /Pharmacies de garde/ }).click();
  await wait(1000);
  check(await page.locator('#espace-pharmacies').count() === 1 && !page.url().includes('#/cliniques'), 'retour à l’espace Pharmacies (URL d’origine)');
  await ctx.close();
});

// ---------- 3. Géolocalisation refusée ----------
await section('Géolocalisation refusée', async () => {
  const ctx = await browser.newContext({ ...base, permissions: [] });
  const page = await ctx.newPage();
  await page.goto(URL + '#/cliniques', { waitUntil: 'domcontentloaded' });
  await page.locator('#splash').click().catch(() => {});
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 }).catch(() => {});
  check(await page.getByRole('tab', { name: /Cliniques et hôpitaux/ }).getAttribute('aria-selected') === 'true', 'lien direct #/cliniques ouvre l’espace Cliniques');
  await page.locator('#espace-sante').getByRole('button', { name: /^Ma position$/ }).click();
  await wait(3000);
  const alert = await page.locator('[role="alert"]').allInnerTexts();
  check(alert.some((t) => /position|localisation/i.test(t)), `géolocalisation refusée : message affiché (« ${alert.join(' | ').slice(0, 120)} »)`);
  await page.getByRole('button', { name: /Rechercher les établissements/ }).click();
  await wait(500);
  check((await page.locator('#espace-sante').innerText()).includes('Indiquez une position de départ'), 'sans position : la recherche demande une position de départ');
  await page.screenshot({ path: `${OUT}/sante-geoloc-refusee.png` });
  await ctx.close();
});

// ---------- 4. Ordinateur ----------
await section('Ordinateur', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'fr-FR', timezoneId: 'Africa/Casablanca' });
  const page = await ctx.newPage();
  await page.goto(URL + '#/cliniques', { waitUntil: 'domcontentloaded' });
  await page.locator('#splash').click().catch(() => {});
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.getByRole('button', { name: /^Salé/ }).first().click();
  await wait(3000);
  await page.screenshot({ path: `${OUT}/sante-ordinateur.png` });
  await ctx.close();
});

await browser.close();
const vids = await readdir(`${OUT}/raw`);
if (vids[0]) await rename(`${OUT}/raw/${vids[0]}`, `${OUT}/parcours.webm`);
note(failures ? `${failures} vérification(s) en échec` : 'toutes les vérifications sont passées');
await writeFile(`${OUT}/rapport.txt`, log.join('\n') + '\n');
