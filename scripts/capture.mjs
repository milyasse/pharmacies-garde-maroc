// Captures d'écran et vidéo de démonstration de l'application (exécuté dans GitHub Actions).
// Données réelles du jour ; position simulée : Rabat-Agdal.
import { chromium } from 'playwright';
import { mkdir, readdir, rename } from 'node:fs/promises';

const URL = process.env.APP_URL || 'http://localhost:4173/pharmacies-garde-maroc/';
const OUT = 'marketing';
await mkdir(`${OUT}/video-raw`, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

// ---- Mobile + vidéo
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Africa/Casablanca',
  geolocation: { latitude: 33.9985, longitude: -6.8520, accuracy: 25 }, permissions: ['geolocation'],
  recordVideo: { dir: `${OUT}/video-raw`, size: { width: 780, height: 1688 } },
});
const page = await ctx.newPage();
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('📸', name); };
await page.goto(URL, { waitUntil: 'networkidle' });
await page.getByText('au total').first().waitFor({ timeout: 20000 });
await wait(1500);
await shot('01-accueil-villes');
await page.getByRole('button', { name: 'Détecter ma position' }).click();
await page.getByText(/pharmacies? de garde$/).first().waitFor({ timeout: 20000 }).catch(() => {});
await wait(3500);
await shot('02-resultats-carte');
await page.mouse.wheel(0, 500); await wait(1200);
await page.evaluate(() => document.querySelector('section[aria-label="Résultats"]')?.scrollIntoView({ behavior: 'smooth' }));
await wait(2000);
await shot('03-liste-pharmacies');
const route = page.getByRole('button', { name: /Itinéraire/ }).first();
if (await route.count()) { await route.click(); await wait(5000); await shot('04-itineraire'); }
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(1500);
const modify = page.getByRole('button', { name: 'Modifier' });
if (await modify.count()) { await modify.click(); await wait(800); }
const demain = page.getByRole('button', { name: /Demain/ }).first();
if (await demain.count()) { await demain.click(); await wait(3500); await shot('05-demain'); }
await page.getByRole('button', { name: 'Paramètres et méthode de recherche' }).click();
await wait(1500); await shot('06-sources-fiabilite');
await page.getByRole('button', { name: 'Fermer' }).first().click(); await wait(1000);
await ctx.close();
const vids = (await readdir(`${OUT}/video-raw`)).filter((f) => f.endsWith('.webm'));
if (vids[0]) await rename(`${OUT}/video-raw/${vids[0]}`, `${OUT}/demo-mobile.webm`);

// ---- Ordinateur
const d = await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Africa/Casablanca',
  geolocation: { latitude: 33.9985, longitude: -6.8520 }, permissions: ['geolocation'],
});
const dp = await d.newPage();
await dp.goto(URL, { waitUntil: 'networkidle' });
await dp.getByText('au total').first().waitFor({ timeout: 20000 });
await dp.getByRole('button', { name: 'Détecter ma position' }).click();
await wait(5000);
const r2 = dp.getByRole('button', { name: /Itinéraire/ }).first();
if (await r2.count()) { await r2.click(); await wait(4000); }
await dp.screenshot({ path: `${OUT}/07-ordinateur.png` });
await browser.close();
console.log('terminé');
