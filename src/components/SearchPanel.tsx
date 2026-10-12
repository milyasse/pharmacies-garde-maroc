import { useState, type FormEvent } from 'react';
import type { Place } from '../services/geocoding.ts';
import type { DutyFilter } from '../shared/search.ts';
import { CalendarIcon, GpsIcon, MapIcon, PinIcon, SpinnerIcon } from './icons.tsx';

export interface Origin {
  lat: number;
  lng: number;
  label: string;
  kind: 'gps' | 'address' | 'map';
  accuracyM?: number;
}

const RADII = [1, 2, 5, 10, 15, 20, 30];
const FILTERS: { v: DutyFilter; l: string }[] = [
  { v: 'all', l: 'Tous' },
  { v: 'day', l: 'Jour' },
  { v: 'night', l: 'Nuit' },
  { v: 'continuous', l: '24h/24' },
];

export function SearchPanel(props: {
  origin: Origin | null;
  locating: boolean;
  onLocate: () => void;
  onAddressSearch: (q: string) => Promise<Place[]>;
  onChoosePlace: (p: Place) => void;
  picking: boolean;
  onTogglePick: () => void;
  date: string;
  onDate: (d: string) => void;
  radiusKm: number;
  onRadius: (r: number) => void;
  dutyFilter: DutyFilter;
  onDutyFilter: (f: DutyFilter) => void;
  onSearch: () => void;
  searching: boolean;
  originError: string | null;
}) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [custom, setCustom] = useState(!RADII.includes(props.radiusKm));
  const [radiusErr, setRadiusErr] = useState<string | null>(null);

  async function submitAddress(e: FormEvent) {
    e.preventDefault();
    setGeoErr(null);
    setPlaces(null);
    setGeoBusy(true);
    try {
      const res = await props.onAddressSearch(query);
      if (res.length === 0) setGeoErr('Adresse introuvable. Essayez un quartier, une avenue ou touchez la carte.');
      else if (res.length === 1) props.onChoosePlace(res[0]);
      else setPlaces(res);
    } catch (err) {
      setGeoErr((err as Error).message);
    } finally {
      setGeoBusy(false);
    }
  }

  function setCustomRadius(v: string) {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return setRadiusErr('Indiquez un rayon positif en kilomètres.');
    if (n > 100) return setRadiusErr('Rayon limité à 100 km.');
    setRadiusErr(null);
    props.onRadius(Math.round(n * 10) / 10);
  }

  return (
    <section aria-label="Recherche" className="space-y-4 bg-white p-4 lg:px-6">
      {/* Position de départ */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-muted">Position de départ</span>
        {props.origin && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700" aria-live="polite">
            <PinIcon size={18} className="mt-0.5 shrink-0" />
            <span className="min-w-0">
              {props.origin.kind === 'gps' ? 'Ma position GPS' : props.origin.kind === 'map' ? 'Point choisi sur la carte' : props.origin.label}
              {props.origin.kind === 'gps' && props.origin.accuracyM ? <span className="font-medium"> (± {Math.round(props.origin.accuracyM)} m)</span> : null}
            </span>
          </p>
        )}
        <form onSubmit={submitAddress} className="flex items-center gap-2 rounded-xl border-[1.5px] border-line px-3 py-2 focus-within:border-brand-600">
          <PinIcon size={20} className="shrink-0 text-brand-600" />
          <label htmlFor="addr" className="sr-only">Adresse, quartier ou ville</label>
          <input
            id="addr"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Adresse, quartier ou ville"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-muted"
            autoComplete="street-address"
            enterKeyHint="search"
          />
          <button type="submit" disabled={geoBusy || query.trim().length < 3} className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-bold text-brand-700 disabled:opacity-50">
            {geoBusy ? <SpinnerIcon size={16} /> : 'Chercher'}
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={props.onLocate} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700">
            {props.locating ? <SpinnerIcon size={16} /> : <GpsIcon size={16} />} Ma position
          </button>
          <button
            type="button"
            onClick={props.onTogglePick}
            aria-pressed={props.picking}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${props.picking ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700'}`}
          >
            <MapIcon size={16} /> {props.picking ? 'Touchez la carte…' : 'Choisir sur la carte'}
          </button>
        </div>
        {places && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Adresses trouvées">
            {places.map((p) => (
              <li key={`${p.lat},${p.lng}`}>
                <button type="button" onClick={() => { props.onChoosePlace(p); setPlaces(null); }} className="w-full px-3 py-2 text-left text-sm hover:bg-bg">
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {(geoErr || props.originError) && <p role="alert" className="text-sm font-semibold text-danger-600">{geoErr || props.originError}</p>}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <label htmlFor="date" className="text-xs font-bold text-muted">Date recherchée</label>
        <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-line px-3 py-2.5 focus-within:border-brand-600">
          <CalendarIcon size={20} className="text-brand-600" />
          <input id="date" type="date" required value={props.date} onChange={(e) => e.target.value && props.onDate(e.target.value)} className="flex-1 bg-transparent text-sm font-semibold outline-none" />
        </div>
      </div>

      {/* Rayon */}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-bold text-muted">Rayon de recherche</legend>
        <div className="flex flex-wrap gap-1.5">
          {RADII.map((r) => {
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
            <label htmlFor="radius" className="sr-only">Rayon personnalisé en km</label>
            <input id="radius" type="number" inputMode="decimal" min={0.1} max={100} step={0.5} defaultValue={props.radiusKm}
              onChange={(e) => setCustomRadius(e.target.value)} className="w-28 rounded-xl border-[1.5px] border-line px-3 py-2 text-sm font-semibold" />
            <span className="text-sm font-semibold text-muted">km</span>
          </div>
        )}
        {radiusErr && <p role="alert" className="text-sm font-semibold text-danger-600">{radiusErr}</p>}
      </fieldset>

      {/* Type de garde */}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-bold text-muted">Type de garde</legend>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-bg p-1">
          {FILTERS.map((f) => {
            const on = props.dutyFilter === f.v;
            return (
              <button key={f.v} type="button" aria-pressed={on} onClick={() => props.onDutyFilter(f.v)}
                className={`rounded-lg py-2 text-sm ${on ? 'bg-white font-extrabold text-brand-700 shadow-sm' : 'font-semibold text-muted'}`}>
                {f.l}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button type="button" onClick={props.onSearch} disabled={props.searching || !!radiusErr}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 py-3.5 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-60">
        {props.searching && <SpinnerIcon />} Rechercher les pharmacies de garde
      </button>
    </section>
  );
}
