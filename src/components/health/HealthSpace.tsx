// Espace « Cliniques et hôpitaux » : mêmes briques que l'espace Pharmacies (position, rayon, carte,
// itinéraires OSRM, fiches), alimenté par public/data/sante/etablissements.json.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Origin } from '../SearchPanel.tsx';
import { OriginPicker } from '../search/OriginPicker.tsx';
import { RadiusPicker } from '../search/RadiusPicker.tsx';
import { PharmacyMap, type MapItem } from '../PharmacyMap.tsx';
import { MapLegend } from '../MapLegend.tsx';
import type { RouteState } from '../PharmacyCard.tsx';
import { EstablishmentList, type HealthSort } from './EstablishmentList.tsx';
import { ResultsSkeleton } from '../ResultsSkeleton.tsx';
import { useMediaQuery, DESKTOP } from '../../hooks/useMediaQuery.ts';
import { sortByDuration } from '../../shared/search.ts';
import { CONFIG } from '../../config.ts';
import { TYPE_LABEL } from '../../shared/health/labels.ts';
import { levelLabel } from './EstablishmentCard.tsx';
import { HospitalIcon, SpinnerIcon } from '../icons.tsx';
import { searchPlace } from '../../services/geocoding.ts';
import { getRoute, type RouteResult, type TravelMode } from '../../services/routing.ts';
import { loadHealthDataset } from '../../services/healthData.ts';
import { availableServices, searchEstablishments, type HealthOutcome } from '../../shared/health/search.ts';
import { SERVICE_LABEL, TYPE_FILTERS } from '../../shared/health/labels.ts';
import type { EstablishmentResult, EstablishmentType, HealthDataset, ServiceId } from '../../shared/health/types.ts';
import { CITIES } from '../../shared/connectors/registry.ts';
import { formatMoroccoDateTime, formatShortDate, moroccoDate } from '../../shared/dates.ts';
import { haversineKm } from '../../shared/distance.ts';
import type { CityId } from '../../shared/types.ts';

type State =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; error: string }
  | { state: 'done'; outcome: HealthOutcome; key: string; radiusKm: number; filtersActive: boolean };

const RADII = [2, 5, 10, 15, 20, 30];
const pref = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(`pgm.sante.${k}`); return v === null ? d : (JSON.parse(v) as T); } catch { return d; } };
const savePref = (k: string, v: unknown) => { try { localStorage.setItem(`pgm.sante.${k}`, JSON.stringify(v)); } catch { /* stockage indisponible */ } };

export function HealthSpace(props: {
  origin: Origin | null;
  setOrigin: (o: Origin) => void;
  locating: boolean;
  onLocate: () => Promise<boolean>;
  mode: TravelMode;
  /** Incrémenté quand l'utilisateur demande une recherche depuis l'en-tête (« Ma position »). */
  searchSignal: number;
}) {
  const { origin, setOrigin, mode } = props;
  const [dataset, setDataset] = useState<HealthDataset | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(() => pref('radius', 10));
  const [types, setTypes] = useState<EstablishmentType[]>([]);
  const [service, setService] = useState<ServiceId | null>(null);
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [sort, setSort] = useState<HealthSort>('asc');
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [computingAll, setComputingAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const routeAbort = useRef<AbortController | null>(null);
  const isDesktop = useMediaQuery(DESKTOP);
  const [picking, setPicking] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  const [radiusErr, setRadiusErr] = useState<string | null>(null);
  const [search, setSearch] = useState<State>({ state: 'idle' });
  const [nonce, setNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Record<string, RouteResult>>({});
  const [routeStates, setRouteStates] = useState<Record<string, RouteState>>({});
  const [focus, setFocus] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [routesShown, setRoutesShown] = useState(true);
  const mapBox = useRef<HTMLDivElement>(null);
  const requestSearch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => savePref('radius', radiusKm), [radiusKm]);

  const loadData = useCallback(async (force = false) => {
    try {
      const d = await loadHealthDataset(force);
      setDataset(d);
      setDataError(null);
      return d;
    } catch (e) {
      setDataError((e as Error).message);
      return null;
    }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  // Recherche depuis l'en-tête (position GPS obtenue)
  const firstSignal = useRef(props.searchSignal);
  useEffect(() => { if (props.searchSignal !== firstSignal.current) requestSearch(); }, [props.searchSignal, requestSearch]);

  const queryKey = `${origin?.lat.toFixed(5)},${origin?.lng.toFixed(5)}|${radiusKm}|${types.join(',')}|${service}|${emergencyOnly}`;

  const runSearch = useCallback(async (force = false) => {
    if (!origin) {
      setOriginError('Indiquez une position de départ : « Ma position », une adresse, une ville ou un point sur la carte.');
      return;
    }
    setOriginError(null);
    setSearch({ state: 'loading' });
    routeAbort.current?.abort();
    setComputingAll(false);
    setRoutes({});
    setRouteStates({});
    if (sort === 'duration') setSort('asc');
    const d = force || !dataset ? await loadData(force) : dataset;
    if (!d) {
      setSearch({ state: 'error', error: dataError ?? 'Données indisponibles.' });
      return;
    }
    const outcome = searchEstablishments(d.establishments, { origin, radiusKm, types, service, emergencyOnly, date: moroccoDate(), sort: 'asc' });
    setSearch({ state: 'done', outcome, key: queryKey, radiusKm, filtersActive: types.length > 0 || !!service || emergencyOnly });
    setSelectedId(outcome.ranked[0]?.id ?? null); // le plus proche
    setCollapsed(true);
    // sur téléphone : amener la carte et les résultats à l'écran
    if (!window.matchMedia(DESKTOP).matches) setTimeout(() => mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [origin, dataset, loadData, dataError, radiusKm, types, service, emergencyOnly, queryKey, sort]);

  const runRef = useRef(runSearch);
  runRef.current = runSearch;
  useEffect(() => { if (nonce > 0) void runRef.current(); }, [nonce]);

  // Le tri s'applique immédiatement aux résultats affichés (pas de nouvelle recherche)
  const outcome = search.state === 'done' ? search.outcome : null;
  const withRoutes = useCallback((list: EstablishmentResult[]) => list.map((e) => (routes[e.id] ? { ...e, distanceRoadKm: routes[e.id].distanceKm, estimatedTravelMinutes: routes[e.id].durationMin } : e)), [routes]);
  const list = useMemo(() => {
    if (!outcome) return [];
    const asc = withRoutes([...outcome.ranked].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));
    if (sort === 'duration') return sortByDuration(asc);
    return sort === 'asc' ? asc : asc.reverse();
  }, [outcome, sort, withRoutes]);
  const unlocated = outcome?.unlocated ?? [];
  const mapItems: MapItem[] = useMemo(() => list.map((e) => ({ ...e, statusLabel: levelLabel(e) })), [list]);
  const criteriaChanged = search.state === 'done' && search.key !== queryKey;

  // ---------- Itinéraires (même moteur OSRM que les pharmacies)
  const computeRoute = useCallback(async (id: string, signal?: AbortSignal) => {
    const e = list.find((x) => x.id === id);
    if (!e || !origin || e.latitude === null || e.longitude === null || routes[id]) return;
    setRouteStates((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const r = await getRoute(origin, { lat: e.latitude, lng: e.longitude }, mode, signal);
      setRoutes((m) => ({ ...m, [id]: r }));
      setRouteStates((s) => ({ ...s, [id]: {} }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') { setRouteStates((s) => ({ ...s, [id]: {} })); return; }
      setRouteStates((s) => ({ ...s, [id]: { error: `${(err as Error).message} Utilisez « Ouvrir dans Google Maps ».` } }));
    }
  }, [list, origin, mode, routes]);

  // « Calculer les trajets » : itinéraires routiers des établissements les plus proches, un par un (service public ménagé)
  async function computeAll() {
    if (!outcome || !origin) return;
    routeAbort.current?.abort();
    const ac = new AbortController();
    routeAbort.current = ac;
    setComputingAll(true);
    const nearest = [...outcome.ranked].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, CONFIG.maxRoutesBatch);
    for (const e of nearest) {
      if (ac.signal.aborted) break;
      if (routes[e.id]) continue;
      await computeRoute(e.id, ac.signal);
      await new Promise((r) => setTimeout(r, 350));
    }
    setComputingAll(false);
  }
  const visibleRouteIds = useMemo(() => (showAllRoutes ? Object.keys(routes) : selectedId ? [selectedId] : []), [showAllRoutes, routes, selectedId]);

  useEffect(() => {
    if (!selectedId || !origin || search.state !== 'done') return;
    if (routes[selectedId] || routeStates[selectedId]?.loading || routeStates[selectedId]?.error) return;
    void computeRoute(selectedId);
  }, [selectedId, origin, search, routes, routeStates, computeRoute]);
  useEffect(() => { setRoutes({}); setRouteStates({}); }, [mode]);

  const showOnMap = (id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, n: f.n + 1 }));
    if (window.matchMedia('(max-width: 1023px)').matches) mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const traceRoute = (id: string) => {
    setSelectedId(id);
    setRoutesShown(true);
    setRouteStates((s) => { const n = { ...s }; delete n[id]; return n; });
    void computeRoute(id);
    if (window.matchMedia('(max-width: 1023px)').matches) mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pickCity = (id: CityId) => {
    const c = CITIES.find((x) => x.id === id)!;
    setOrigin({ lat: c.center.lat, lng: c.center.lng, label: `Centre de ${c.name}`, kind: 'city', city: id });
    setRadiusKm((r) => (r < 10 ? 10 : r));
    setPicking(false);
    requestSearch();
  };

  const services = useMemo(() => (dataset ? availableServices(dataset.establishments) : []), [dataset]);
  const cityCounts = useMemo(() => {
    if (!dataset) return null;
    return CITIES.map((c) => ({
      ...c,
      n: dataset.establishments.filter((e) => e.latitude !== null && haversineKm(c.center, { lat: e.latitude, lng: e.longitude! }) <= 10).length,
      urg: dataset.establishments.filter((e) => e.emergency === 'yes' && e.latitude !== null && haversineKm(c.center, { lat: e.latitude, lng: e.longitude! }) <= 10).length,
    }));
  }, [dataset]);

  const toggleType = (t: EstablishmentType) => setTypes((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  const nearest = origin ? Math.min(...CITIES.map((c) => haversineKm(origin, c.center))) : 0;
  const dataNotice = [
    dataset?.lastError ?? null,
    origin && nearest > 25 ? 'Votre position est hors de la zone couverte (Rabat, Salé, Témara).' : null,
  ].filter(Boolean).join(' ') || null;

  return (
    <main id="espace-sante" className="flex-1 lg:grid lg:min-h-0 lg:grid-cols-[440px_1fr]">
      <div className="lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-line">
        {/* Accès rapide par ville */}
        <section aria-label="Établissements par ville" className="bg-bg px-4 pb-1 pt-3 lg:px-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold">Cliniques et hôpitaux répertoriés</h2>
            <span className="text-xs font-medium text-muted">à 10 km du centre</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(cityCounts ?? CITIES.map((c) => ({ ...c, n: null as number | null, urg: null as number | null }))).map((c) => (
              <button key={c.id} type="button" onClick={() => pickCity(c.id)}
                className={`rounded-xl border bg-white px-3 py-2 text-left shadow-[0_1px_4px_rgba(13,26,20,0.05)] ${origin?.kind === 'city' && origin.city === c.id ? 'border-2 border-brand-700' : 'border-line'}`}>
                <span className="block text-xs font-bold text-muted">{c.name}</span>
                <span className="block text-xl font-extrabold text-ink">{c.n ?? (dataError ? '—' : <SpinnerIcon size={16} />)}</span>
                {c.urg !== null && <span className="block text-[11px] font-semibold text-danger-600">{c.urg} avec urgences déclarées</span>}
              </button>
            ))}
          </div>
          {dataset && (
            <p className="mt-2 text-[11px] font-medium text-muted">
              Sources : OpenStreetMap{dataset.osmBase ? ` (données du ${formatShortDate(dataset.osmBase.slice(0, 10))})` : ''} · ministère de la Santé, liste des hôpitaux{dataset.ministryDataDate ? ` (mise à jour du ${formatShortDate(dataset.ministryDataDate)})` : ''} · actualisé le {formatMoroccoDateTime(dataset.generatedAt)}
            </p>
          )}
          {dataError && <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">{dataError}</p>}
        </section>

        {/* Formulaire (replié en résumé après une recherche, comme l'espace Pharmacies) */}
        {collapsed && search.state === 'done' ? (
          <div className="flex items-center gap-3 bg-white px-4 py-3 lg:px-6">
            <p className="min-w-0 flex-1 text-sm">
              <b>{origin?.kind === 'gps' ? 'Ma position' : origin?.kind === 'map' ? 'Point sur la carte' : origin?.kind === 'city' ? origin.label.replace('Centre de ', '') : origin?.label.split(',')[0]}</b>
              <span className="text-muted"> · {radiusKm} km · {types.length ? types.map((t) => TYPE_LABEL[t]).join(', ') : 'tous types'}{service ? ` · ${SERVICE_LABEL[service]}` : ''}{emergencyOnly ? ' · urgences déclarées' : ''}</span>
            </p>
            <button type="button" onClick={() => setCollapsed(false)} className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700">Modifier</button>
          </div>
        ) : (
        <section aria-label="Recherche" className="space-y-4 bg-white p-4 lg:px-6">
          <OriginPicker
            idPrefix="sante-"
            origin={origin}
            locating={props.locating}
            onLocate={() => { void props.onLocate(); }}
            onAddressSearch={(q) => searchPlace(q)}
            onChoosePlace={(p) => { setOrigin({ lat: p.lat, lng: p.lng, label: p.label, kind: 'address' }); setPicking(false); }}
            picking={picking}
            onTogglePick={() => { setPicking((v) => !v); mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            originError={originError}
          />
          <RadiusPicker idPrefix="sante-" radiusKm={radiusKm} onRadius={setRadiusKm} onValidity={setRadiusErr} radii={RADII} />

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-muted">Type d’établissement</legend>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={types.length === 0} onClick={() => setTypes([])}
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${types.length === 0 ? 'bg-brand-700 text-white' : 'bg-bg text-ink hover:bg-brand-50'}`}>Tous</button>
              {TYPE_FILTERS.map((t) => {
                const on = types.includes(t.id);
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => toggleType(t.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-bold ${on ? 'bg-brand-700 text-white' : 'bg-bg text-ink hover:bg-brand-50'}`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="sante-service" className="text-xs font-bold text-muted">Service recherché</label>
              <select id="sante-service" value={service ?? ''} onChange={(e) => setService((e.target.value || null) as ServiceId | null)}
                className="w-full rounded-xl border-[1.5px] border-line bg-white px-3 py-2.5 text-sm font-semibold">
                <option value="">Tous les services</option>
                {services.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end rounded-xl bg-danger-50 px-3 py-2.5 text-sm font-bold text-danger-600">
              <input type="checkbox" checked={emergencyOnly} onChange={(e) => setEmergencyOnly(e.target.checked)} className="h-4 w-4 accent-[#b42318]" />
              Urgences déclarées uniquement
            </label>
          </div>
          <p className="text-[11px] text-muted">
            Les services ne sont affichés que lorsqu’une source les publie. La disponibilité en temps réel d’un service n’est publiée par aucune source consultée.
          </p>

          {criteriaChanged && search.state === 'done' && (
            <p role="status" className="rounded-lg bg-warn-50 px-3 py-2 text-[13px] font-semibold text-warn-600">
              Critères modifiés : appuyez sur « Rechercher » pour mettre à jour les résultats.
            </p>
          )}
          <button type="button" onClick={requestSearch} disabled={search.state === 'loading' || !!radiusErr}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 py-3.5 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-60 ${criteriaChanged ? 'ring-4 ring-warn-600/30' : ''}`}>
            {search.state === 'loading' ? <SpinnerIcon /> : <HospitalIcon size={18} />} Rechercher les établissements
          </button>
        </section>
        )}

        {isDesktop && renderResults()}
      </div>

      <div className="flex flex-col lg:min-h-0">
        <div ref={mapBox} className="relative h-[48vh] min-h-[300px] scroll-mt-14 lg:h-auto lg:flex-1">
          <PharmacyMap
            ariaLabel="Carte des cliniques et hôpitaux"
            origin={origin}
            radiusKm={search.state === 'done' ? search.radiusKm : radiusKm}
            pharmacies={mapItems}
            selectedId={selectedId}
            routes={routes}
            visibleRouteIds={visibleRouteIds}
            mode={mode}
            picking={picking}
            onPick={(lat, lng) => { setOrigin({ lat, lng, label: 'Point choisi sur la carte', kind: 'map' }); setPicking(false); }}
            onSelect={setSelectedId}
            focusSignal={focus}
            routesShown={routesShown}
            onToggleRoutes={() => setRoutesShown((v) => !v)}
            canShowRoutes={Object.keys(routes).length > 0}
          />
        </div>
        <div className="bg-white px-4 py-2"><MapLegend count={list.length || 5} approx={false} /></div>
        {!isDesktop && renderResults()}
      </div>
    </main>
  );

  function renderResults() {
    if (search.state === 'idle') {
      return (
        <section className="space-y-2 p-4 text-sm lg:px-6">
          <h2 className="text-base font-extrabold">Trouver une clinique ou un hôpital</h2>
          <p>Choisissez une ville ou votre position, le rayon et, si besoin, un type d’établissement ou un service, puis lancez la recherche.</p>
          <p className="text-muted">
            Chaque fiche indique ce qui est réellement publié : établissement <b>répertorié</b>, <b>urgences déclarées</b>, <b>horaires vérifiés</b>
            et, seulement si une source officielle le précise, <b>désignation de garde</b>.
          </p>
        </section>
      );
    }
    if (search.state === 'loading') {
      return <ResultsSkeleton label="Recherche des établissements…" />;
    }
    if (search.state === 'error') {
      return (
        <div role="alert" className="m-4 rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-600">
          {search.error}{' '}
          <button type="button" className="underline" onClick={() => void runSearch(true)}>Réessayer</button>
        </div>
      );
    }
    return (
      <EstablishmentList
        radiusKm={search.radiusKm}
        list={list}
        unlocated={unlocated}
        outside={search.outcome.outside}
        filteredOut={search.outcome.filteredOut}
        filtersActive={search.filtersActive}
        sort={sort}
        onSort={(s) => { setSort(s); if (s === 'duration') void computeAll(); }}
        onComputeAll={() => void computeAll()}
        computingAll={computingAll}
        showAllRoutes={showAllRoutes}
        onShowAllRoutes={setShowAllRoutes}
        selectedId={selectedId}
        origin={origin}
        mode={mode}
        routeStates={routeStates}
        onSelect={setSelectedId}
        onShowOnMap={showOnMap}
        onRoute={traceRoute}
        onRefresh={() => void runSearch(true)}
        onEnlarge={() => { setRadiusKm((r) => Math.min(100, r < 5 ? 5 : r < 10 ? 10 : r < 20 ? 20 : r < 30 ? 30 : r * 2)); requestSearch(); }}
        onClearFilters={() => { setTypes([]); setService(null); setEmergencyOnly(false); requestSearch(); }}
        dataNotice={dataNotice}
      />
    );
  }
}
