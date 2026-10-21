// Liste des établissements, synchronisée avec la carte (même logique que la liste des pharmacies).
import { useEffect, useRef } from 'react';
import type { EstablishmentResult } from '../../shared/health/types.ts';
import type { SortOrder } from '../../shared/health/search.ts';
import type { LatLng } from '../../shared/distance.ts';
import type { TravelMode } from '../../services/routing.ts';
import type { RouteState } from '../PharmacyCard.tsx';
import { EstablishmentCard } from './EstablishmentCard.tsx';
import { RefreshIcon, WarnIcon } from '../icons.tsx';

export function EstablishmentList(props: {
  radiusKm: number;
  list: EstablishmentResult[];
  unlocated: EstablishmentResult[];
  outside: number;
  filteredOut: number;
  filtersActive: boolean;
  sort: SortOrder;
  onSort: (s: SortOrder) => void;
  selectedId: string | null;
  origin: LatLng | null;
  mode: TravelMode;
  routeStates: Record<string, RouteState>;
  onSelect: (id: string) => void;
  onShowOnMap: (id: string) => void;
  onRoute: (id: string) => void;
  onRefresh: () => void;
  onEnlarge: () => void;
  onClearFilters: () => void;
  dataNotice: string | null;
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (!props.selectedId) return;
    refs.current.get(props.selectedId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [props.selectedId]);

  const card = (e: EstablishmentResult) => (
    <EstablishmentCard
      key={e.id}
      ref={(el) => { if (el) refs.current.set(e.id, el); else refs.current.delete(e.id); }}
      e={e}
      selected={e.id === props.selectedId}
      origin={props.origin}
      mode={props.mode}
      route={props.routeStates[e.id]}
      onSelect={() => props.onSelect(e.id)}
      onShowOnMap={() => props.onShowOnMap(e.id)}
      onRoute={() => props.onRoute(e.id)}
    />
  );

  const n = props.list.length;
  return (
    <section aria-label="Résultats" className="space-y-3 p-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold" aria-live="polite">
            {n === 0 ? 'Aucun établissement' : `${n} établissement${n > 1 ? 's' : ''}`}
          </h2>
          <p className="text-xs font-medium text-muted">dans {props.radiusKm} km · {props.sort === 'asc' ? 'du plus proche au plus éloigné' : 'du plus éloigné au plus proche'}</p>
        </div>
        <button type="button" onClick={props.onRefresh} className="rounded-xl border-[1.5px] border-brand-700 p-2 text-brand-700" aria-label="Actualiser les résultats" title="Actualiser">
          <RefreshIcon size={18} />
        </button>
      </div>

      {props.dataNotice && (
        <div role="status" className="flex gap-2 rounded-xl bg-warn-50 p-3 text-sm font-semibold text-warn-600">
          <WarnIcon size={18} className="mt-0.5 shrink-0" />
          <p>{props.dataNotice}</p>
        </div>
      )}

      {n > 1 && (
        <div className="grid w-fit grid-cols-2 gap-1 rounded-xl bg-white p-1 text-sm" role="group" aria-label="Tri par distance">
          {(['asc', 'desc'] as SortOrder[]).map((s) => (
            <button key={s} type="button" aria-pressed={props.sort === s} onClick={() => props.onSort(s)}
              className={`rounded-lg px-3 py-1.5 ${props.sort === s ? 'bg-brand-700 font-bold text-white' : 'font-semibold text-muted'}`}>
              {s === 'asc' ? 'Plus proches d’abord' : 'Plus éloignés d’abord'}
            </button>
          ))}
        </div>
      )}

      {n === 0 && (
        <div className="rounded-2xl bg-white p-4 text-sm">
          <p className="font-semibold">Aucun établissement correspondant dans un rayon de {props.radiusKm} km.</p>
          {props.outside > 0 && <p className="mt-1 text-muted">{props.outside} établissement(s) correspondant(s) se trouvent au-delà de ce rayon.</p>}
          {props.filteredOut > 0 && props.filtersActive && <p className="mt-1 text-muted">{props.filteredOut} établissement(s) écarté(s) par les filtres (type, service, urgences).</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={props.onEnlarge} className="rounded-xl bg-brand-700 px-4 py-2.5 font-bold text-white">Élargir le rayon</button>
            {props.filtersActive && <button type="button" onClick={props.onClearFilters} className="rounded-xl bg-brand-50 px-4 py-2.5 font-bold text-brand-700">Retirer les filtres</button>}
          </div>
        </div>
      )}

      <div className="space-y-3">{props.list.map(card)}</div>

      {props.unlocated.length > 0 && (
        <details className="rounded-2xl bg-white p-3" open={n === 0}>
          <summary className="cursor-pointer text-sm font-bold">
            {props.unlocated.length} établissement(s) sans position publiée (distance inconnue, non classés)
          </summary>
          <div className="mt-3 space-y-3">{props.unlocated.map(card)}</div>
        </details>
      )}

      <div className="flex gap-2 rounded-xl bg-warn-50 p-3 text-xs font-semibold text-warn-600">
        <WarnIcon size={18} className="shrink-0" />
        <p>
          « Urgences déclarées » signifie qu’une source mentionne un service d’urgences : cela ne garantit ni son ouverture ni une garde.
          Un établissement n’est indiqué « de garde » que si une source officielle le désigne. Appelez avant de vous déplacer.
          En urgence vitale : 141 (SAMU) ou 15 (Protection civile).
        </p>
      </div>
    </section>
  );
}
