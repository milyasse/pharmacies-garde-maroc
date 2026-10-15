// Vérification de l'interface construite (exécuté dans GitHub Actions) : écran de lancement + recherche sur demande.
import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, rename } from 'node:fs/promises';

const URL = process.env.APP_URL || 'http://localhost:4173/pharmacies-garde-maroc/';
const OUT = 'marketing/verif';
await mkdir(`${OUT}/raw`, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (m) => { console.log(m); log.push(m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Africa/Casablanca',
  geolocation: { latitude: 33.9985, longitude: -6.8520, accuracy: 25 }, permissions: ['geolocation'],
  recordVideo: { dir: `${OUT}/raw`, size: { width: 390, height: 844 } },
});
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && note('console: ' + m.text()));
page.on('pageerror', (e) => note('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
for (const t of [600, 1800, 3500, 5500]) {
  await wait(t - (Date.now() - t0));
  await page.screenshot({ path: `${OUT}/splash-${t}.png` });
}
note('GSAP actif : ' + (await page.evaluate(() => document.getElementById('splash')?.classList.contains('gsap') ?? 'écran déjà retiré')));
await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 }).then(() => note(`écran retiré après ${((Date.now() - t0) / 1000).toFixed(1)} s`)).catch(() => note('ÉCHEC : écran de lancement toujours présent après 20 s'));
await wait(800);
await page.screenshot({ path: `${OUT}/app-accueil.png` });

// Recherche sur demande uniquement
let searches = 0;
page.on('request', (r) => { if (/\/data\/duty\/.+\.json/.test(r.url())) searches++; });
await page.getByRole('button', { name: /Ma position/ }).last().click().catch(() => {});
await wait(1500);
const before = searches;
const r10 = page.getByRole('button', { name: /^10 ?km$/ }).first();
if (await r10.count()) { await r10.click(); await wait(1200); }
const afterRadius = searches;
const bodyTxt = await page.locator('body').innerText();
note(`requêtes de données après « Ma position » (formulaire) : ${before} ; après changement de rayon : ${afterRadius - before} (attendu 0)`);
note('message « critères modifiés » visible : ' + /Critères modifiés/.test(bodyTxt));
await page.screenshot({ path: `${OUT}/app-criteres.png` });
await page.getByRole('button', { name: /Rechercher les pharmacies de garde/ }).click();
await page.getByText(/pharmacies? de garde$/).first().waitFor({ timeout: 20000 }).catch(() => {});
await wait(2500);
note(`requêtes après clic sur « Rechercher » : ${searches - afterRadius} (attendu ≥ 0, résultats affichés)`);
note('résultats affichés : ' + /pharmacies? de garde/.test(await page.locator('body').innerText()));
await page.screenshot({ path: `${OUT}/app-resultats.png` });

await ctx.close();
await browser.close();
const vids = await readdir(`${OUT}/raw`);
if (vids[0]) await rename(`${OUT}/raw/${vids[0]}`, `${OUT}/parcours.webm`);
await writeFile(`${OUT}/rapport.txt`, log.join('\n') + '\n');
