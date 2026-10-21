// Bloc « Rayon de recherche » partagé par les deux espaces (valeurs prédéfinies + rayon personnalisé ≤ 100 km).
import { useRef, useState } from 'react';

export const DEFAULT_RADII = [1, 2, 5, 10, 15, 20, 30];

export function RadiusPicker(props: {
  idPrefix?: string;
  radiusKm: number;
  onRadius: (r: number) => void;
  /** Signale au formulaire si la saisie personnalisée est invalide (pour désactiver « Rechercher »). */
  onValidity?: (error: string | null) => void;
  radii?: number[];
}) {
  const radii = props.radii ?? DEFAULT_RADII;
  const [custom, setCustom] = useState(!radii.includes(props.radiusKm));
  const [radiusErr, setRadiusErrState] = useState<string | null>(null);
  const radiusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputId = `${props.idPrefix ?? ''}radius`;
  const setRadiusErr = (e: string | null) => { setRadiusErrState(e); props.onValidity?.(e); };

  function setCustomRadius(v: string) {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return setRadiusErr('Indiquez un rayon positif en kilomètres.');
    if (n > 100) return setRadiusErr('Rayon limité à 100 km.');
    setRadiusErr(null);
    // attend la fin de la saisie avant de modifier le rayon
    clearTimeout(radiusTimer.current);
    radiusTimer.current = setTimeout(() => props.onRadius(Math.round(n * 10) / 10), 450);
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-bold text-muted">Rayon de recherche</legend>
      <div className="flex flex-wrap gap-1.5">
        {radii.map((r) => {
          const on = !custom && props.radiusKm === r;
          return (
            <button key={r} type="button" aria-pressed={on} onClick={() => { setCustom(false); setRadiusErr(null); props.onRadius(r); }}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${on ? 'bg-brand-700 text-white' : 'bg-bg text-ink hover:bg-brand-50'}`}>
              {r} km
            </button>
          );
        })}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}
          className={`rounded-full px-3 py-1.5 text-sm font-bold ${custom ? 'bg-brand-700 text-white' : 'bg-bg text-ink hover:bg-brand-50'}`}>
          Autre
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">Rayon personnalisé en km</label>
          <input id={inputId} type="number" inputMode="decimal" min={0.1} max={100} step={0.5} defaultValue={props.radiusKm}
            onChange={(e) => setCustomRadius(e.target.value)} className="w-28 rounded-xl border-[1.5px] border-line px-3 py-2 text-sm font-semibold" />
          <span className="text-sm font-semibold text-muted">km</span>
        </div>
      )}
      {radiusErr && <p role="alert" className="text-sm font-semibold text-danger-600">{radiusErr}</p>}
    </fieldset>
  );
}
