import { useEffect, useState } from 'react';
import { MOROCCO_TZ } from '../shared/dates.ts';
import { CrossLogo, GearIcon, GpsIcon, SpinnerIcon } from './icons.tsx';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Header(props: { onLocate: () => void; locating: boolean; onOpenSettings: () => void }) {
  const now = useClock();
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: MOROCCO_TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(now);
  return (
    <header className="bg-brand-700 text-white pt-[max(env(safe-area-inset-top),12px)]">
      <div className="mx-auto flex items-center gap-3 px-4 py-3 lg:px-6">
        <CrossLogo size={32} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-extrabold leading-tight sm:text-[17px]">Pharmacies de Garde Maroc</h1>
          <p className="text-xs font-medium text-white/85">
            <time dateTime={now.toISOString()}>{label}</time> · heure du Maroc
          </p>
        </div>
        <button
          type="button"
          onClick={props.onLocate}
          className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25"
          aria-label="Détecter ma position"
        >
          {props.locating ? <SpinnerIcon /> : <GpsIcon size={18} />}
          <span className="hidden sm:inline">Ma position</span>
        </button>
        <button
          type="button"
          onClick={props.onOpenSettings}
          className="rounded-xl bg-white/15 p-2 hover:bg-white/25"
          aria-label="Paramètres et méthode de recherche"
        >
          <GearIcon size={20} />
        </button>
      </div>
    </header>
  );
}
