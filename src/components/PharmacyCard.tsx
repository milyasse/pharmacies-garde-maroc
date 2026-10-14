import { forwardRef } from 'react';
import type { Pharmacy } from '../shared/types.ts';
import { formatKm, formatMinutes } from '../shared/distance.ts';
import { formatMoroccoDateTime, formatShortDate } from '../shared/dates.ts';
import { DUTY_TYPE_LABEL } from '../shared/duty.ts';
import { formatPhone } from '../shared/text.ts';
import { CITY_NAME } from '../shared/connectors/registry.ts';
import { rankColor } from '../utils/colors.ts';
import { googleMapsDirectionsUrl, type TravelMode } from '../services/routing.ts';
import type { LatLng } from '../shared/distance.ts';
import { StatusBadge } from './StatusBadge.tsx';
import { ExternalIcon, PhoneIcon, RouteIcon, SpinnerIcon } from './icons.tsx';

export interface RouteState {
  loading?: boolean;
  error?: string;
}

function dutyText(p: Pharmacy): string {
  const parts: string[] = [];
  parts.push(p.dutyType ? DUTY_TYPE_LABEL[p.dutyType] : p.dutyLabel ? p.dutyLabel : 'Type de garde non publié');
  if (p.hoursText && !(p.dutyType === 'continuous' && /24\s*h\s*\/\s*24/.test(p.hoursText))) parts.push(p.hoursText);
  if (p.dutyStart && p.dutyEnd && p.dutyStart !== p.dutyEnd) parts.push(`du ${formatShortDate(p.dutyStart)} au ${formatShortDate(p.dutyEnd)}`);
  else if (p.dutyStart) parts.push(`le ${formatShortDate(p.dutyStart)}`);
  else parts.push(`publiée pour le ${formatShortDate(p.dutyDate)}`);
  return parts.join(' · ');
}

export const PharmacyCard = forwardRef<HTMLElement, {
  p: Pharmacy;
  selected: boolean;
  origin: LatLng | null;
  mode: TravelMode;
  route: RouteState | undefined;
  onSelect: () => void;
  onShowOnMap: () => void;
  onRoute: () => void;
}>(function PharmacyCard({ p, selected, origin, mode, route, onSelect, onShowOnMap, onRoute }, ref) {
  const c = rankColor(p.rank);
  const located = p.latitude !== null && p.longitude !== null;
  const approx = p.coordinatesSource === 'district';
  const expired = p.verificationStatus === 'expired';
  return (
    <article
      ref={ref}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`rounded-2xl border bg-white p-4 shadow-[0_2px_8px_rgba(13,26,20,0.06)] transition ${selected ? 'border-2' : 'border-line'} ${expired ? 'opacity-75' : ''}`}
      style={selected ? { borderColor: p.rank ? c.bg : '#1d6fd8' } : undefined}
    >
      <div className="flex items-start gap-3">
        {p.rank ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-[15px] font-extrabold shadow" style={{ background: c.bg, color: c.fg }} aria-label={`Rang ${p.rank}`}>
            {p.rank}
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-xs font-bold text-muted" aria-label="Non classée">—</span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold leading-snug">{p.name}</h3>
          <p className="text-[13px] font-medium text-muted">{[p.district, CITY_NAME[p.city]].filter(Boolean).join(' · ')}</p>
          <div className="mt-1"><StatusBadge status={p.verificationStatus} confidence={p.confidenceLevel} /></div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-bg px-2.5 py-2">
          <p className="text-[15px] font-extrabold">{approx && p.distanceStraightLineKm !== null ? '≈ ' : ''}{formatKm(p.distanceStraightLineKm)}</p>
          <p className="text-[11px] font-medium text-muted">à vol d’oiseau</p>
        </div>
        <div className="rounded-lg bg-bg px-2.5 py-2">
          <p className="text-[15px] font-extrabold">{route?.loading ? <SpinnerIcon size={15} /> : formatKm(p.distanceRoadKm)}</p>
          <p className="text-[11px] font-medium text-muted">par la route</p>
        </div>
        <div className="rounded-lg bg-bg px-2.5 py-2">
          <p className="text-[15px] font-extrabold">{route?.loading ? <SpinnerIcon size={15} /> : formatMinutes(p.estimatedTravelMinutes)}</p>
          <p className="text-[11px] font-medium text-muted">{mode === 'car' ? 'en voiture' : 'à pied'}</p>
        </div>
      </div>
      {route?.error && <p role="alert" className="mt-2 text-xs font-semibold text-danger-600">{route.error}</p>}

      <p className="mt-3 text-[13px]">{p.address ?? <span className="italic text-muted">Adresse non communiquée par la source</span>}</p>
      <p className="mt-1 text-[13px] font-semibold text-brand-700">{dutyText(p)}</p>
      {p.notes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {p.notes.map((n) => <li key={n} className="text-xs text-warn-600">• {n}</li>)}
        </ul>
      )}
      {!located && <p className="mt-1 text-xs font-semibold text-warn-600">Position non publiée : impossible de la placer sur la carte ou de la classer.</p>}
      {approx && <p className="mt-1 text-xs font-semibold text-warn-600">Position approximative (centre du quartier) : distance et itinéraire indicatifs, fiez-vous à l’adresse ou appelez.</p>}

      <p className="mt-2 text-[11px] font-medium text-muted">
        Source :{' '}
        {p.sources.map((s, i) => (
          <span key={s.sourceId + s.sourceUrl}>
            {i > 0 && ', '}
            {s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{s.sourceName}</a> : s.sourceName}
            {s.sourcePublishedAt ? ` (page du ${formatShortDate(s.sourcePublishedAt)})` : ''}
          </span>
        ))}
        {p.lastCheckedAt && <> · vérifiée le {formatMoroccoDateTime(p.lastCheckedAt)}</>}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" disabled={!located} onClick={onShowOnMap} className="rounded-xl bg-brand-50 py-2.5 text-sm font-bold text-brand-700 disabled:opacity-40">
          Voir sur la carte
        </button>
        <button type="button" disabled={!located || !origin} onClick={onRoute} className="inline-flex items-center justify-center gap-1 rounded-xl bg-brand-700 py-2.5 text-sm font-bold text-white disabled:opacity-40">
          <RouteIcon size={16} /> Itinéraire
        </button>
        {p.phone ? (
          <a href={`tel:${p.phone}`} className="inline-flex items-center justify-center gap-1 rounded-xl border-[1.5px] border-brand-700 py-2.5 text-sm font-bold text-brand-700" aria-label={`Appeler ${p.name} au ${formatPhone(p.phone)}`}>
            <PhoneIcon size={16} /> Appeler
          </a>
        ) : (
          <span className="flex items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-[11px] font-semibold text-muted">Tél. non publié</span>
        )}
      </div>
      {located && (
        <a
          href={googleMapsDirectionsUrl(origin, { lat: p.latitude!, lng: p.longitude! }, mode)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-muted underline"
        >
          Ouvrir dans Google Maps <ExternalIcon size={13} />
        </a>
      )}
    </article>
  );
});
