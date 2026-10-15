// Liaison avec l'écran de lancement défini dans index.html (window.__splash).
type SplashApi = { step: (pct: number, label?: string) => void; done: () => void };

function api(): SplashApi | undefined {
  return (window as unknown as { __splash?: SplashApi }).__splash;
}

export function splashStep(pct: number, label?: string): void {
  api()?.step(pct, label);
}

export function splashDone(): void {
  api()?.done();
}

export function splashVersion(version: string): void {
  const el = document.getElementById('splash-ver');
  if (el) el.textContent = `Version ${version}`;
}
