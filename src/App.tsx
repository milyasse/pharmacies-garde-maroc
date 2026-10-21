import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { SearchPanel, type Origin } from './components/SearchPanel.tsx';
import { PharmacyMap } from './components/PharmacyMap.tsx';
import { PharmacyList, type SortBy } from './components/PharmacyList.tsx';
import { MapLegend } from './components/MapLegend.tsx';
import { SourceStatus } from './components/SourceStatus.tsx';
import { CityOverview } from './components/CityOverview.tsx';
import { SpaceTabs, type Space } from './components/SpaceTabs.tsx';
import { HealthSpace } from './components/health/HealthSpace.tsx';
import type { RouteState } from './components/PharmacyCard.tsx';
import { getCurrentPosition, type GeoError } from './services/geolocation.ts';
import { searchPlace } from './services/geocoding.ts';
import { getRoute, type RouteResult, type TravelMode } from './services/routing.ts';
import { loadSnapshots, loadStatus } from './services/pharmacySearch.ts';
import { splashDone, splashStep } from './services/splash.ts';
import { buildResults, countByCity, selectPharmacies, sortByDuration, type CityCount, type DutyFilter, type SearchOutcome } from './shared/search.ts';
import type { CityId, CollectorStatus, Pharmacy } from './shared/types.ts';
import { addDays, formatFrDate, formatMoroccoDateTime, isIsoDate, moroccoDate } from './shared/dates.ts';
import { haversineKm } from './shared/distance.ts';
import { CITIES, CITY_NAME, CONNECTORS } from './shared/connectors/registry.ts';
import { CONFIG } from './config.ts';
import { ResultsSkeleton } from './components/ResultsSkeleton.tsx';
import { useMediaQuery, DESKTOP } from './hooks/useMediaQuery.ts';
import { APP_VERSION, BUILD_SHA } from './version.ts';

// Préférences non sensibles uniquement (jamais la position)
function pref<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem('pgm.' + k);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function savePref(k: string, v: unknown) {
  try {
    localStorage.setItem('pgm.' + k, JSON.stringify(v));
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

const FILTER_LABEL: Record<DutyFilter, string> = { all: 'tous types', day: 'garde de jour', night: 'garde de nuit', continuous: 'garde 24h/24' };

type SearchState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; error: string }
  | { state: 'done'; outcome: SearchOutcome; notice: string | null; date: string; radiusKm: number; dutyFilter: DutyFilter; originKey: string };

const originKey = (o: Origin | null) => (o ? `${o.lat.toFixed(5)},${o.lng.toFixed(5)}` : '');

export default function App() {
  // Espace affiché : « Pharmacies de garde » (URL inchangée) ou « Cliniques et hôpitaux » (#/cliniques)
  const [space, setSpaceState] = useState<Space>(() => (window.location.hash.startsWith('#/cliniques') ? 'sante' : 'pharmacies'));
  const [healthSignal, setHealthSignal] = useState(0);
  const isDesktop = useMediaQuery(DESKTOP); // la liste de résultats n'est rendue qu'une fois (à gauche sur ordinateur, sous la carte sur téléphone)
  const setSpace = useCallback((s: Space) => {
    setSpaceState(s);
    const url = s === 'sante' ? '#/cliniques' : window.location.pathname + window.location.search;
    if (s === 'sante') window.location.hash = '/cliniques';
    else window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onHash = () => setSpaceState(window.location.hash.startsWith('#/cliniques') ? 'sante' : 'pharmacies');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [originError, setOriginError] = useState<string | null>(null);
  const [geoHelp, setGeoHelp] = useState<{ message: string; help: string[] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(() => moroccoDate());
  const [radiusKm, setRadiusKm] = useState<number>(() => pref('radius', 5));
  const [dutyFilter, setDutyFilter] = useState<DutyFilter>(() => pref('filter', 'all'));
  const [mode, setMode] = useState<TravelMode>(() => pref('mode', 'car'));
  const [sortBy, setSortBy] = useState<SortBy>('distance');
  const [status, setStatus] = useState<CollectorStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ state: 'idle' });
  // La recherche ne démarre que sur une action explicite (bouton « Rechercher », ville, « Ma position » de l'en-tête)
  const [searchNonce, setSearchNonce] = useState(0);
  const requestSearch = useCallback(() => setSearchNonce((n) => n + 1), []);
  const [collapsed, setCollapsed] = useState(false);
  const [routes, setRoutes] = useState<Record<string, RouteResult>>({});
  const [routeStates, setRouteStates] = useState<Record<string, RouteState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [routesShown, setRoutesShown] = useState(true);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [computingAll, setComputingAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mapBox = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const [cityCounts, setCityCounts] = useState<CityCount[] | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const routeAbort = useRef<AbortController | null>(null);

  useEffect(() => savePref('radius', radiusKm), [radiusKm]);
  useEffect(() => savePref('filter', dutyFilter), [dutyFilter]);
  useEffect(() => savePref('mode', mode), [mode]);

  const refreshStatus = useCallback(async (force = false) => {
    try {
      setStatus(await loadStatus(force));
      setStatusError(null);
      splashStep(62, 'Vérification des sources…');
    } catch (e) {
      setStatusError((e as Error).message);
    }
  }, []);
  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // Synthèse par ville, chargée dès l'ouverture (sans position) et à chaque changement de date
  const loadCityCounts = useCallback(async (force = false) => {
    if (!isIsoDate(date)) return;
    setCityLoading(true);
    try {
      const { day, prev } = await loadSnapshots(date, force);
      const list = selectPharmacies(day?.records ?? [], prev?.records ?? [], date);
      setCityCounts(countByCity(list, CITIES.map((c) => c.id)));
      setCityError(null);
    } catch (e) {
      setCityError((e as Error).message);
    } finally {
      setCityLoading(false);
      splashStep(92, 'Préparation de la carte…');
      splashDone();
    }
  }, [date]);
  useEffect(() => { void loadCityCounts(); }, [loadCityCounts]);
  // Actualisation quand l'app revient au premier plan (données collectées toutes les ~2 h)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void loadCityCounts(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadCityCounts]);

  // ---------- Recherche
  const runSearch = useCallback(async (force = false) => {
    if (!origin) {
      setOriginError('Indiquez une position de départ : « Ma position », une adresse ou un point sur la carte.');
      return;
    }
    if (!isIsoDate(date)) {
      setSearch({ state: 'error', error: 'Date invalide.' });
      return;
    }
    if (!(radiusKm > 0 && radiusKm <= 100)) {
      setSearch({ state: 'error', error: 'Rayon invalide (entre 0,1 et 100 km).' });
      return;
    }
    const seq = ++searchSeq.current; // seule la dernière recherche lancée s'affiche
    setOriginError(null);
    setSearch({ state: 'loading' });
    setRoutes({});
    setRouteStates({});
    routeAbort.current?.abort();
    try {
      const [{ day, prev }, st] = await Promise.all([loadSnapshots(date, force), loadStatus(force).catch(() => null)]);
      if (seq !== searchSeq.current) return;
      if (st) setStatus(st);
      if (force) void loadCityCounts(true);
      const today = moroccoDate();
      const outcome = buildResults({
        dayRecords: day?.records ?? [],
        previousDayRecords: prev?.records ?? [],
        date,
        origin,
        radiusKm,
        dutyFilter,
      });
      const notices: string[] = [];
      if (!day && !prev) {
        if (date > today) notices.push(`Aucune garde publiée pour le ${formatFrDate(date)}. Les plannings sont en général disponibles jusqu’à la fin de la semaine suivante : réessayez plus près de cette date.`);
        else notices.push(`Aucune garde n’a été collectée pour le ${formatFrDate(date)} (historique conservé 60 jours).`);
      } else if (date > today) {
        notices.push('Date à venir : gardes issues du planning publié à l’avance — à revérifier le jour même.');
      }
      if (date === today && st) {
        const ageH = (Date.now() - new Date(st.generatedAt).getTime()) / 3.6e6;
        if (ageH > 6) notices.push(`Dernière collecte le ${formatMoroccoDateTime(st.generatedAt)} : les données peuvent ne pas être à jour.`);
        const failed = st.runs.filter((r) => !r.ok && !st.runs.some((o) => o.ok && o.city === r.city));
        if (failed.length) notices.push(`Source indisponible lors de la dernière collecte pour : ${[...new Set(failed.map((r) => CITIES.find((c) => c.id === r.city)?.name ?? r.city))].join(', ')}.`);
        // seules les listes « du jour » peuvent être périmées (un planning hebdomadaire commence le lundi)
        const stale = st.runs.filter((r) => r.ok && r.sourceId === 'annuaire-gratuit' && r.pageDate && r.pageDate < addDays(st.todayMorocco, -1));
        if (stale.length) notices.push(`La liste du jour de ${[...new Set(stale.map((r) => CITIES.find((c) => c.id === r.city)?.name))].join(', ')} affichait une date ancienne.`);
      }
      const nearest = Math.min(...CITIES.map((c) => haversineKm(origin, c.center)));
      if (nearest > 25) notices.push('Votre position est hors de la zone couverte au démarrage (Rabat, Salé, Témara).');
      setSearch({ state: 'done', outcome, notice: notices.join(' ') || null, date, radiusKm, dutyFilter, originKey: originKey(origin) });
      const first = outcome.ranked[0]?.id ?? null;
      setSelectedId(first);
      setCollapsed(true);
      // sur téléphone : amener la carte et les résultats à l'écran
      if (!window.matchMedia(DESKTOP).matches) setTimeout(() => mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) {
      if (seq !== searchSeq.current) return;
      setSearch({ state: 'error', error: (e as Error).message });
    }
  }, [origin, date, radiusKm, dutyFilter, loadCityCounts]);

  const pickCity = useCallback((id: CityId) => {
    const c = CITIES.find((x) => x.id === id);
    if (!c) return;
    setOrigin({ lat: c.center.lat, lng: c.center.lng, label: `Centre de ${c.name}`, kind: 'city', city: id });
    setRadiusKm((r) => (r < 10 ? 10 : r)); // couvrir la ville entière
    setPicking(false);
    requestSearch();
    if (window.matchMedia('(max-width: 1023px)').matches) setTimeout(() => mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [requestSearch]);

  // Exécute la recherche demandée explicitement, avec les critères à jour (pas de relance automatique)
  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;
  useEffect(() => {
    if (searchNonce > 0) void runSearchRef.current();
  }, [searchNonce]);
  const criteriaChanged = search.state === 'done' && (search.date !== date || search.radiusKm !== radiusKm || search.dutyFilter !== dutyFilter || search.originKey !== originKey(origin));

  // ---------- Position
  const locate = useCallback(async (andSearch = false): Promise<boolean> => {
    setLocating(true);
    setOriginError(null);
    setGeoHelp(null);
    try {
      const g = await getCurrentPosition();
      setOrigin({ lat: g.lat, lng: g.lng, label: 'Ma position', kind: 'gps', accuracyM: g.accuracyM });
      setPicking(false);
      if (andSearch) requestSearch();
      return true;
    } catch (e) {
      const err = e as GeoError;
      setGeoHelp({ message: err.message, help: err.help ?? [] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    } finally {
      setLocating(false);
    }
  }, [requestSearch]);

  // ---------- Itinéraires
  const allResults: Pharmacy[] = useMemo(() => {
    if (search.state !== 'done') return [];
    return [...search.outcome.ranked, ...search.outcome.expired, ...search.outcome.unlocated];
  }, [search]);

  const computeRoute = useCallback(async (id: string, signal?: AbortSignal) => {
    const p = allResults.find((x) => x.id === id);
    if (!p || !origin || p.latitude === null || p.longitude === null) return;
    if (routes[id]) return;
    setRouteStates((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const r = await getRoute(origin, { lat: p.latitude, lng: p.longitude }, mode, signal);
      setRoutes((m) => ({ ...m, [id]: r }));
      setRouteStates((s) => ({ ...s, [id]: {} }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setRouteStates((s) => ({ ...s, [id]: {} }));
        return;
      }
      setRouteStates((s) => ({ ...s, [id]: { error: `${(e as Error).message} Utilisez « Ouvrir dans Google Maps ».` } }));
    }
  }, [allResults, origin, mode, routes]);

  // Itinéraire par défaut vers la pharmacie sélectionnée
  useEffect(() => {
    if (!selectedId || !origin || search.state !== 'done') return;
    if (routes[selectedId] || routeStates[selectedId]?.loading || routeStates[selectedId]?.error) return;
    void computeRoute(selectedId);
  }, [selectedId, origin, search, routes, routeStates, computeRoute]);

  // Changement de mode de trajet : on recalcule
  useEffect(() => {
    setRoutes({});
    setRouteStates({});
  }, [mode]);

  async function computeAll() {
    if (search.state !== 'done' || !origin) return;
    routeAbort.current?.abort();
    const ac = new AbortController();
    routeAbort.current = ac;
    setComputingAll(true);
    for (const p of search.outcome.ranked.slice(0, CONFIG.maxRoutesBatch)) {
      if (ac.signal.aborted) break;
      if (routes[p.id]) continue;
      await computeRoute(p.id, ac.signal);
      await new Promise((r) => setTimeout(r, 350)); // ménage le service public
    }
    setComputingAll(false);
  }

  const withRoutes = useCallback(
    (list: Pharmacy[]) => list.map((p) => (routes[p.id] ? { ...p, distanceRoadKm: routes[p.id].distanceKm, estimatedTravelMinutes: routes[p.id].durationMin } : p)),
    [routes],
  );

  const view = useMemo(() => {
    if (search.state !== 'done') return null;
    const ranked = withRoutes(search.outcome.ranked);
    return {
      list: sortBy === 'duration' ? sortByDuration(ranked) : ranked,
      ranked,
      expired: withRoutes(search.outcome.expired),
      unlocated: search.outcome.unlocated,
    };
  }, [search, withRoutes, sortBy]);

  const mapPharmacies = useMemo(() => (view ? [...view.ranked, ...view.expired] : []), [view]);
  const visibleRouteIds = useMemo(
    () => (showAllRoutes ? Object.keys(routes) : selectedId ? [selectedId] : []),
    [showAllRoutes, routes, selectedId],
  );

  const select = (id: string) => setSelectedId(id);
  const showOnMap = (id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, n: f.n + 1 }));
    if (window.matchMedia('(max-width: 1023px)').matches) mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const traceRoute = (id: string) => {
    setSelectedId(id);
    setRoutesShown(true);
    // l'effet « itinéraire par défaut » relance le calcul (y compris après une erreur)
    setRouteStates((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
    if (window.matchMedia('(max-width: 1023px)').matches) mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // un lien par site source (page d'accueil des gardes)
  const sourceLinks = CONNECTORS.filter((c) => c.enabled && c.homepage).map((c) => ({ name: c.name, url: c.homepage }));

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <Header onLocate={() => { if (space === 'pharmacies') void locate(true); else void locate(false).then((ok) => ok && setHealthSignal((n) => n + 1)); }} locating={locating} onOpenSettings={() => setSettingsOpen(true)} />
      {geoHelp && (
        <div role="alert" className="border-b border-warn-600/30 bg-warn-50 px-4 py-3 text-sm text-warn-600 lg:px-6">
          <div className="flex items-start gap-2">
            <p className="flex-1 font-extrabold">📍 {geoHelp.message}</p>
            <button type="button" onClick={() => setGeoHelp(null)} className="rounded-lg px-2 font-bold" aria-label="Fermer">✕</button>
          </div>
          {geoHelp.help.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] font-semibold text-ink">
              {geoHelp.help.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
          <button type="button" onClick={() => void locate()} className="mt-2 rounded-xl bg-brand-700 px-3 py-2 text-sm font-bold text-white">Réessayer</button>
        </div>
      )}
      <SpaceTabs space={space} onChange={setSpace} />
      {space === 'sante' ? (
        <HealthSpace
          origin={origin}
          setOrigin={setOrigin}
          locating={locating}
          onLocate={() => locate(false)}
          mode={mode}
          searchSignal={healthSignal}
        />
      ) : (
      <main id="espace-pharmacies" className="flex-1 lg:grid lg:min-h-0 lg:grid-cols-[440px_1fr]">
        <div className="lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-line">
          <CityOverview
            date={date}
            counts={cityCounts}
            loading={cityLoading}
            error={cityError}
            activeCity={origin?.kind === 'city' ? origin.city ?? null : null}
            onPickCity={pickCity}
            compact={collapsed}
          />
          {collapsed && search.state === 'done' ? (
            <div className="flex items-center gap-3 bg-white px-4 py-3 lg:px-6">
              <p className="min-w-0 flex-1 text-sm">
                <b>{origin?.kind === 'gps' ? 'Ma position' : origin?.kind === 'map' ? 'Point sur la carte' : origin?.kind === 'city' ? CITY_NAME[origin.city!] : origin?.label.split(',')[0]}</b>
                <span className="text-muted"> · {formatFrDate(date)} · {radiusKm} km · {FILTER_LABEL[dutyFilter]}</span>
              </p>
              <button type="button" onClick={() => setCollapsed(false)} className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700">Modifier</button>
            </div>
          ) : (
            <SearchPanel
              origin={origin}
              locating={locating}
              onLocate={() => void locate(false)}
              onAddressSearch={(q) => searchPlace(q)}
              onChoosePlace={(p) => { setOrigin({ lat: p.lat, lng: p.lng, label: p.label, kind: 'address' }); setPicking(false); }}
              picking={picking}
              onTogglePick={() => { setPicking((v) => !v); mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              date={date}
              onDate={setDate}
              radiusKm={radiusKm}
              onRadius={setRadiusKm}
              dutyFilter={dutyFilter}
              onDutyFilter={setDutyFilter}
              onSearch={requestSearch}
              criteriaChanged={criteriaChanged}
              searching={search.state === 'loading'}
              originError={originError}
              availableDates={status?.dates ?? []}
              today={moroccoDate()}
            />
          )}

          {isDesktop && renderResults()}
        </div>

        <div className="flex flex-col lg:min-h-0">
          <div ref={mapBox} className="relative h-[48vh] min-h-[300px] scroll-mt-14 lg:h-auto lg:flex-1">
            <PharmacyMap
              origin={origin}
              radiusKm={radiusKm}
              pharmacies={mapPharmacies}
              selectedId={selectedId}
              routes={routes}
              visibleRouteIds={visibleRouteIds}
              mode={mode}
              picking={picking}
              onPick={(lat, lng) => { setOrigin({ lat, lng, label: 'Point choisi sur la carte', kind: 'map' }); setPicking(false); }}
              onSelect={select}
              focusSignal={focus}
              routesShown={routesShown}
              onToggleRoutes={() => setRoutesShown((v) => !v)}
              canShowRoutes={Object.keys(routes).length > 0}
            />
          </div>
          <div className="bg-white px-4 py-2"><MapLegend count={view?.ranked.length ?? 5} /></div>
          {!isDesktop && renderResults()}
        </div>
      </main>
      )}
      <footer className="border-t border-line bg-white px-4 py-2 text-center text-[11px] text-muted">
        Pharmacies de Garde Maroc · v{APP_VERSION} ({BUILD_SHA})
      </footer>
      <SourceStatus open={settingsOpen} onClose={() => setSettingsOpen(false)} status={status} statusError={statusError} mode={mode} onMode={setMode} />
    </div>
  );

  function renderResults() {
    if (search.state === 'idle') {
      return (
        <section className="space-y-2 p-4 text-sm lg:px-6">
          <h2 className="text-base font-extrabold">Trouver une pharmacie de garde</h2>
          <p>Choisissez votre position, la date et le rayon, puis lancez la recherche. Zone couverte au démarrage : <b>Rabat, Salé et Témara</b>.</p>
          <p className="text-muted">Sources actives : {CONNECTORS.filter((c) => c.enabled && c.homepage).map((c) => c.name).join(', ')}.</p>
        </section>
      );
    }
    if (search.state === 'loading') {
      return <ResultsSkeleton label="Recherche des gardes publiées…" />;
    }
    if (search.state === 'error') {
      return (
        <div role="alert" className="m-4 rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-600">
          {search.error}{' '}
          <button type="button" className="underline" onClick={() => void runSearch()}>Réessayer</button>
        </div>
      );
    }
    if (!view) return null;
    return (
      <PharmacyList
        date={search.date}
        radiusKm={search.radiusKm}
        list={view.list}
        expired={view.expired}
        unlocated={view.unlocated}
        outside={search.outcome.outside}
        filteredOutByType={search.outcome.filteredOutByType}
        dataNotice={search.notice}
        sortBy={sortBy}
        onSort={(s) => { setSortBy(s); if (s === 'duration') void computeAll(); }}
        selectedId={selectedId}
        origin={origin}
        mode={mode}
        routeStates={routeStates}
        onSelect={select}
        onShowOnMap={showOnMap}
        onRoute={traceRoute}
        onComputeAll={() => void computeAll()}
        computingAll={computingAll}
        showAllRoutes={showAllRoutes}
        onShowAllRoutes={setShowAllRoutes}
        onRefresh={() => void runSearch(true)}
        onEnlarge={() => { setRadiusKm((r) => Math.min(100, r < 5 ? 5 : r < 10 ? 10 : r < 20 ? 20 : r < 30 ? 30 : r * 2)); requestSearch(); }}
        sourceLinks={sourceLinks}
      />
    );
  }
}
