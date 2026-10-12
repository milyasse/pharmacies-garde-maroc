import { useEffect, useRef, useState } from 'react';
import type { Pharmacy } from '../shared/types.ts';
import type { LatLng } from '../shared/distance.ts';
import type { TravelMode } from '../services/routing.ts';
import { formatFrDate } from '../shared/dates.ts';
import { PharmacyCard, type RouteState } from './PharmacyCard.tsx';
import { RefreshIcon, SpinnerIcon, WarnIcon } from './icons.tsx';

export type SortBy = 'distance' | 'duration';

export function PharmacyList(props: {
  date: string;
  radiusKm: number;
  list: Pharmacy[];
  expired: Pharmacy[];
  unlocated: Pharmacy[];
  outside: number;
  filteredOutByType: number;
  dataNotice: string | null;
  sortBy: SortBy;
  onSort: (s: SortBy) => void;
  selectedId: string | null;
  origin: LatLng | null;
  mode: TravelMode;
  routeStates: Record<string, RouteState>;
  onSelect: (id: string) => void;
  onShowOnMap: (id: string) => void;
  onRoute: (id: string) => void;
  onComputeAll: () => void;
  computingAll: boolean;
  showAllRoutes: boolean;
  onShowAllRoutes: (v: boolean) => void;
  onRefresh: () => void;
  onEnlarge: () => void;
  sourceLinks: { name: string; url: string }[];
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    if (!props.selectedId) return;
    refs.current.get(props.selectedId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [props.selectedId]);

  const card = (p: Pharmacy) => (
    <PharmacyCard
      key={p.id}
      ref={(el) => { if (el) refs.current.set(p.id, el); else refs.current.delete(p.id); }}
      p={p}
      selected={p.id === props.selectedId}
      origin={props.origin}
      mode={props.mode}
      route={props.routeStates[p.id]}
      onSelect={() => props.onSelect(p.id)}
      onShowOnMap={() => props.onShowOnMap(p.id)}
      onRoute={() => props.onRoute(p.id)}
    />
  );

  const n = props.list.length;
  return (
    <section aria-label="Résultats" className="space-y-3 p-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold" aria-live="polite">
            {n === 0 ? 'Aucune pharmacie de garde' : `${n} pharmacie${n > 1 ? 's' : ''} de garde`}
          </h2>
          <p className="text-xs font-medium text-muted">
            {formatFrDate(props.date)} · dans {props.radiusKm} km · triées par {props.sortBy === 'distance' ? 'distance' : 'durée de trajet'}
          </p>
        </div>
        <button type="button" onClick={props.onRefresh} className="rounded-xl border-[1.5px] border-brand-700 p-2 text-brand-700" aria-label="Actualiser les résultats" title="Actualiser">
          <RefreshIcon size={18} />
        </button>
      </div>

      {props.dataNotice && (
        <div role="status" className="flex gap-2 rounded-xl bg-warn-50 p-3 text-sm font-semibold text-warn-600">
          <WarnIcon size={18} className="mt-0.5 shrink-0" />
          <div>
            <p>{props.dataNotice}</p>
            {props.sourceLinks.length > 0 && (
              <p className="mt-1 font-medium">
                Sources consultées :{' '}
                {props.sourceLinks.map((s, i) => (
                  <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.name}</a></span>
                ))}
              </p>
            )}
          </div>
        </div>
      )}

      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 text-sm" role="group" aria-label="Tri">
            {(['distance', 'duration'] as SortBy[]).map((s) => (
              <button key={s} type="button" aria-pressed={props.sortBy === s} onClick={() => props.onSort(s)}
                className={`rounded-lg px-3 py-1.5 ${props.sortBy === s ? 'bg-brand-700 font-bold text-white' : 'font-semibold text-muted'}`}>
                {s === 'distance' ? 'Distance' : 'Durée'}
              </button>
            ))}
          </div>
          <button type="button" onClick={props.onComputeAll} disabled={props.computingAll || !props.origin}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700 disabled:opacity-50">
            {props.computingAll && <SpinnerIcon size={15} />} Calculer les trajets
          </button>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={props.showAllRoutes} onChange={(e) => props.onShowAllRoutes(e.target.checked)} className="h-4 w-4 accent-[#0b5d3b]" />
            Tous les itinéraires
          </label>
        </div>
      )}
      {props.sortBy === 'duration' && n > 0 && props.list.some((p) => p.estimatedTravelMinutes === null) && (
        <p className="text-xs text-muted">Les pharmacies dont la durée n’est pas encore calculée sont placées à la fin. Les numéros restent ceux du classement par proximité.</p>
      )}

      {n === 0 && !props.dataNotice && (
        <div className="rounded-2xl bg-white p-4 text-sm">
          <p className="font-semibold">Aucune pharmacie de garde trouvée dans un rayon de {props.radiusKm} km pour cette date.</p>
          {props.outside > 0 && <p className="mt-1 text-muted">{props.outside} pharmacie(s) de garde se trouvent au-delà de ce rayon.</p>}
          {props.filteredOutByType > 0 && <p className="mt-1 text-muted">{props.filteredOutByType} pharmacie(s) masquée(s) par le filtre « type de garde ».</p>}
          <button type="button" onClick={props.onEnlarge} className="mt-3 rounded-xl bg-brand-700 px-4 py-2.5 font-bold text-white">Élargir le rayon</button>
        </div>
      )}

      <div className="space-y-3">{props.list.map(card)}</div>

      {props.unlocated.length > 0 && (
        <details className="rounded-2xl bg-white p-3" open={n === 0}>
          <summary className="cursor-pointer text-sm font-bold">
            {props.unlocated.length} pharmacie(s) de garde sans position publiée (non classées, distance inconnue)
          </summary>
          <div className="mt-3 space-y-3">{props.unlocated.map(card)}</div>
        </details>
      )}

      {props.expired.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowExpired((v) => !v)} className="text-sm font-bold text-muted underline">
            {showExpired ? 'Masquer' : 'Afficher'} les gardes expirées dans le rayon ({props.expired.length})
          </button>
          {showExpired && <div className="mt-3 space-y-3">{props.expired.map(card)}</div>}
        </div>
      )}

      <div className="flex gap-2 rounded-xl bg-warn-50 p-3 text-xs font-semibold text-warn-600">
        <WarnIcon size={18} className="shrink-0" />
        <p>Informations collectées automatiquement sur des sites publics. En cas de doute, appelez la pharmacie avant de vous déplacer. En urgence vitale : 141 (SAMU) ou 15 (Protection civile).</p>
      </div>
    </section>
  );
}
