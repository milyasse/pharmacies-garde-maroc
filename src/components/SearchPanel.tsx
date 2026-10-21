import { useState } from 'react';
import { OriginPicker } from './search/OriginPicker.tsx';
import { RadiusPicker } from './search/RadiusPicker.tsx';
import type { Place } from '../services/geocoding.ts';
import type { CityId } from '../shared/types.ts';
import type { DutyFilter } from '../shared/search.ts';
import { CalendarIcon, SpinnerIcon } from './icons.tsx';
import { addDays } from '../shared/dates.ts';

export interface Origin {
  lat: number;
  lng: number;
  label: string;
  kind: 'gps' | 'address' | 'map' | 'city';
  accuracyM?: number;
  city?: CityId;
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
  /** Les critères ont changé depuis la dernière recherche affichée */
  criteriaChanged?: boolean;
  originError: string | null;
  availableDates: string[];
  today: string;
}) {
  const [radiusErr, setRadiusErr] = useState<string | null>(null);

  return (
    <section aria-label="Recherche" className="space-y-4 bg-white p-4 lg:px-6">
      {/* Position de départ */}
      <OriginPicker
        origin={props.origin}
        locating={props.locating}
        onLocate={props.onLocate}
        onAddressSearch={props.onAddressSearch}
        onChoosePlace={props.onChoosePlace}
        picking={props.picking}
        onTogglePick={props.onTogglePick}
        originError={props.originError}
      />

      {/* Date */}
      <div className="space-y-1.5">
        <label htmlFor="date" className="text-xs font-bold text-muted">Date recherchée</label>
        <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-line px-3 py-2.5 focus-within:border-brand-600">
          <CalendarIcon size={20} className="text-brand-600" />
          <input id="date" type="date" required value={props.date} onChange={(e) => e.target.value && props.onDate(e.target.value)} className="flex-1 bg-transparent text-sm font-semibold outline-none" />
        </div>
        <DateStrip today={props.today} value={props.date} available={props.availableDates} onPick={props.onDate} />
      </div>

      {/* Rayon */}
      <RadiusPicker radiusKm={props.radiusKm} onRadius={props.onRadius} onValidity={setRadiusErr} radii={RADII} />

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

      {props.criteriaChanged && !props.searching && (
        <p role="status" className="mb-2 rounded-lg bg-warn-50 px-3 py-2 text-[13px] font-semibold text-warn-600">
          Critères modifiés : appuyez sur « Rechercher » pour mettre à jour les résultats.
        </p>
      )}
      <button type="button" onClick={props.onSearch} disabled={props.searching || !!radiusErr}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 py-3.5 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-60 ${props.criteriaChanged ? 'ring-4 ring-warn-600/30' : ''}`}>
        {props.searching && <SpinnerIcon />} Rechercher les pharmacies de garde
      </button>
    </section>
  );
}

/** Raccourcis de dates : veille, aujourd'hui, prochains jours, avec indication des données disponibles. */
function DateStrip(props: { today: string; value: string; available: string[]; onPick: (d: string) => void }) {
  const days = [-1, 0, 1, 2, 3].map((k) => addDays(props.today, k));
  const fmt = (d: string, k: number) =>
    k === 0 ? 'Aujourd’hui' : k === 1 ? 'Demain' : k === -1 ? 'Hier' : new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Raccourcis de date">
      {days.map((d, i) => {
        const k = i - 1;
        const on = props.value === d;
        // aujourd'hui : la garde de la veille couvre la nuit, donc des données existent dès qu'hier ou aujourd'hui est collecté
        const has = props.available.includes(d) || (k === 0 && props.available.includes(addDays(d, -1)));
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => props.onPick(d)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-left text-xs font-bold ${on ? 'bg-brand-700 text-white' : 'bg-bg text-ink'}`}>
            {fmt(d, k)}
            <span className={`block text-[10px] font-semibold ${on ? 'text-white/80' : has ? 'text-brand-600' : 'text-muted'}`}>
              {has ? '● gardes connues' : k > 0 ? 'non publiées' : 'aucune donnée'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
