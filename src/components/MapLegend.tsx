import { rankColor } from '../utils/colors.ts';

export function MapLegend({ count, approx = true }: { count: number; approx?: boolean }) {
  const n = Math.max(1, Math.min(count || 5, 8));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted" aria-label="Légende des rangs">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-[#1d6fd8] shadow" aria-hidden="true" /> Départ
      </span>
      {Array.from({ length: n }, (_, i) => {
        const c = rankColor(i + 1);
        return (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold" style={{ background: c.bg, color: c.fg }} aria-hidden="true">{i + 1}</span>
            {i === 0 ? 'le plus proche' : null}
          </span>
        );
      })}
      <span>· cercle pointillé : rayon{approx ? ' · marqueur pointillé : position approximative (quartier)' : ''} · trait coloré : itinéraire routier</span>
    </div>
  );
}
