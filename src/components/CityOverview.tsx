// Synthèse : nombre de pharmacies de garde disponibles par ville pour la date choisie.
import type { CityId } from '../shared/types.ts';
import type { CityCount } from '../shared/search.ts';
import { CITY_NAME } from '../shared/connectors/registry.ts';
import { formatFrDate } from '../shared/dates.ts';
import { SpinnerIcon } from './icons.tsx';

export function CityOverview(props: {
  date: string;
  counts: CityCount[] | null;
  loading: boolean;
  error: string | null;
  activeCity: CityId | null;
  onPickCity: (c: CityId) => void;
  compact?: boolean;
}) {
  const total = props.counts?.reduce((n, c) => n + c.active, 0) ?? 0;
  return (
    <section aria-labelledby="cities-title" className={props.compact ? 'px-4 pt-3 lg:px-6' : 'px-4 pt-4 lg:px-6'}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cities-title" className="text-sm font-extrabold">
          Pharmacies de garde disponibles
        </h2>
        <span className="text-xs font-semibold text-muted">{formatFrDate(props.date)}</span>
      </div>

      {props.loading && !props.counts && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted" role="status"><SpinnerIcon size={16} /> Chargement des gardes…</p>
      )}
      {props.error && <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">{props.error}</p>}

      {props.counts && (
        <>
          <ul className="mt-2 grid grid-cols-3 gap-2" aria-label="Pharmacies de garde par ville">
            {props.counts.map((c) => {
              const on = props.activeCity === c.city;
              return (
                <li key={c.city}>
                  <button
                    type="button"
                    onClick={() => props.onPickCity(c.city)}
                    aria-pressed={on}
                    aria-label={`${CITY_NAME[c.city]} : ${c.active} pharmacie(s) de garde. Afficher sur la carte`}
                    className={`group flex w-full flex-col items-start rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                      on ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white hover:border-brand-600'
                    }`}
                  >
                    <span className={`text-xs font-bold ${on ? 'text-white/85' : 'text-muted'}`}>{CITY_NAME[c.city]}</span>
                    <span className="text-[26px] font-extrabold leading-tight tabular-nums">{c.active}</span>
                    <span className={`mt-0.5 text-[11px] font-semibold leading-snug ${on ? 'text-white/85' : 'text-muted'}`}>
                      {c.active === 0
                        ? 'aucune publiée'
                        : [c.continuous && `${c.continuous} 24h/24`, c.day && `${c.day} jour`, c.night && `${c.night} nuit`, c.unknownType && `${c.unknownType} type ?`]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            <b className="text-ink">{total}</b> au total · touchez une ville pour la voir sur la carte
            {props.counts.some((c) => c.expired > 0) && <> · {props.counts.reduce((n, c) => n + c.expired, 0)} garde(s) déjà terminée(s) non comptée(s)</>}
          </p>
        </>
      )}
    </section>
  );
}
