// Diagnostic temporaire : copie brute de pages sources (exécuté dans GitHub Actions).
import { mkdir, writeFile } from 'node:fs/promises';
const urls = process.argv.slice(2);
await mkdir('debug-raw', { recursive: true });
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'PharmaciesGardeMaroc/1.0 (+https://github.com/milyasse/pharmacies-garde-maroc)', 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    await writeFile('debug-raw/' + u.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '_') + '.html', `<!-- HTTP ${r.status} ${r.url} -->\n` + t);
    console.log(r.status, u, t.length);
  } catch (e) { console.log('ERR', u, (e as Error).message); }
  await new Promise((r) => setTimeout(r, 1500));
}
