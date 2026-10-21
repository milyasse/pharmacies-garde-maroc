// Carte Leaflet / OpenStreetMap pilotée de façon impérative (contrôle fin des couches).
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CONFIG } from '../config.ts';
import type { VerificationStatus } from '../shared/types.ts';
import { formatKm, formatMinutes } from '../shared/distance.ts';
import { STATUS_LABEL } from '../shared/status.ts';
import { rankColor } from '../utils/colors.ts';
import type { RouteResult } from '../services/routing.ts';
import type { Origin } from './SearchPanel.tsx';
import { CloseIcon, ExpandIcon, GpsIcon, RouteIcon } from './icons.tsx';

/** Élément affichable sur la carte : une pharmacie ou un établissement de santé. */
export interface MapItem {
  id: string;
  name: string;
  rank: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceStraightLineKm: number | null;
  distanceRoadKm: number | null;
  estimatedTravelMinutes: number | null;
  coordinatesSource?: string | null;
  verificationStatus?: VerificationStatus;
  /** Libellé de statut affiché dans la bulle (sinon : statut de garde de la pharmacie). */
  statusLabel?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinIcon(p: MapItem, selected: boolean) {
  const c = rankColor(p.rank);
  const cls = ['rank-pin', selected ? 'is-selected' : '', p.verificationStatus === 'expired' ? 'is-expired' : '', p.coordinatesSource === 'district' ? 'is-approx' : ''].join(' ');
  return L.divIcon({
    className: 'rank-marker',
    html: `<div class="${cls}" style="background:${c.bg};color:${c.fg}">${p.rank ?? '·'}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function popupHtml(p: MapItem, mode: 'car' | 'foot') {
  const road = p.distanceRoadKm !== null
    ? `<div>${formatKm(p.distanceRoadKm)} par la route · ${formatMinutes(p.estimatedTravelMinutes)} ${mode === 'car' ? 'en voiture' : 'à pied'}</div>`
    : '<div style="color:#5b6b63">Distance routière : tracez l’itinéraire</div>';
  return `<div style="min-width:180px">
    <div style="font-weight:800;font-size:14px">${p.rank ? `${p.rank}. ` : ''}${esc(p.name)}</div>
    <div style="font-size:12px;margin-top:2px">${esc(p.statusLabel ?? (p.verificationStatus ? STATUS_LABEL[p.verificationStatus] : ''))}</div>
    <div style="font-size:12px;margin-top:4px">${p.coordinatesSource === 'district' ? '≈ ' : ''}${formatKm(p.distanceStraightLineKm)} à vol d’oiseau</div>
    ${p.coordinatesSource === 'district' ? '<div style="font-size:11px;color:#b45309">Position approximative (centre du quartier)</div>' : ''}
    <div style="font-size:12px">${road}</div>
  </div>`;
}

export function PharmacyMap(props: {
  origin: Origin | null;
  radiusKm: number;
  pharmacies: MapItem[];
  selectedId: string | null;
  /** Nom accessible de la carte. */
  ariaLabel?: string;
  routes: Record<string, RouteResult>;
  visibleRouteIds: string[];
  mode: 'car' | 'foot';
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
  onSelect: (id: string) => void;
  focusSignal: { id: string | null; n: number };
  routesShown: boolean;
  onToggleRoutes: () => void;
  canShowRoutes: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ origin?: L.Marker; circle?: L.Circle; markers: Map<string, L.Marker>; routes: L.LayerGroup | null }>({ markers: new Map(), routes: null });
  const pickRef = useRef(props.picking);
  const onPickRef = useRef(props.onPick);
  const onSelectRef = useRef(props.onSelect);
  const selectedRef = useRef(props.selectedId);
  selectedRef.current = props.selectedId;
  pickRef.current = props.picking;
  onPickRef.current = props.onPick;
  onSelectRef.current = props.onSelect;

  const [full, setFull] = useState(false);
  const [hint, setHint] = useState(false);
  const fullRef = useRef(false);
  fullRef.current = full;
  const markerKey = props.pharmacies.map((p) => `${p.id}:${p.rank}:${p.verificationStatus}:${p.latitude},${p.longitude}`).join('|');

  // Initialisation
  useEffect(() => {
    if (!el.current || map.current) return;
    // Écrans tactiles : un doigt fait défiler la PAGE, deux doigts déplacent/zooment la carte
    // (sinon la carte « capture » le doigt et on ne peut plus remonter ni descendre dans la page).
    const touch = L.Browser.touch && window.matchMedia('(pointer: coarse)').matches;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, dragging: !touch, tapHold: false, zoomSnap: 0.5 })
      .setView([CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng], 12);
    L.tileLayer(CONFIG.tileUrl, { maxZoom: 19, attribution: CONFIG.tileAttribution, keepBuffer: 2, updateWhenZooming: false }).addTo(m);
    const node = el.current;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    let hintsShown = 0; // l'aide « deux doigts » n'apparaît que quelques fois
    let hint1 = false;
    const onTouchStart = (e: TouchEvent) => {
      if (fullRef.current) return;
      if (e.touches.length >= 2) {
        m.dragging.enable();
        setHint(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (fullRef.current || e.touches.length !== 1 || m.dragging.enabled() || hintsShown >= 3) return;
      if (!hint1) { hint1 = true; hintsShown++; setHint(true); }
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { setHint(false); hint1 = false; }, 1600);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!fullRef.current && e.touches.length === 0 && touch) m.dragging.disable();
    };
    if (touch) {
      node.addEventListener('touchstart', onTouchStart, { passive: true });
      node.addEventListener('touchmove', onTouchMove, { passive: true });
      node.addEventListener('touchend', onTouchEnd, { passive: true });
    }
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (pickRef.current) onPickRef.current(e.latlng.lat, e.latlng.lng);
    });
    layers.current.routes = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      clearTimeout(hintTimer);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = { markers: new Map(), routes: null };
    };
  }, []);

  // Position de départ + cercle du rayon
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.origin?.remove();
    layers.current.circle?.remove();
    if (!props.origin) return;
    const ll: L.LatLngExpression = [props.origin.lat, props.origin.lng];
    layers.current.origin = L.marker(ll, {
      icon: L.divIcon({ className: 'origin-marker', html: '<div class="origin-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      zIndexOffset: 1000,
      title: 'Position de départ',
      keyboard: false,
    }).addTo(m).bindTooltip('Départ');
    layers.current.circle = L.circle(ll, {
      radius: props.radiusKm * 1000, color: '#127A4E', weight: 2, dashArray: '6 5', fillColor: '#127A4E', fillOpacity: 0.06, interactive: false,
    }).addTo(m);
    m.fitBounds(layers.current.circle.getBounds(), { padding: [16, 16], maxZoom: 16 });
  }, [props.origin, props.radiusKm]);

  // Marqueurs des pharmacies
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const store = layers.current.markers;
    store.forEach((mk) => mk.remove());
    store.clear();
    for (const p of props.pharmacies) {
      if (p.latitude === null || p.longitude === null) continue;
      const mk = L.marker([p.latitude, p.longitude], {
        icon: pinIcon(p, p.id === selectedRef.current),
        title: `${p.rank ? `Rang ${p.rank} — ` : ''}${p.name}`,
        alt: p.name,
        riseOnHover: true,
        zIndexOffset: 500 - (p.rank ?? 100),
      })
        .addTo(m)
        .bindPopup(popupHtml(p, props.mode), { autoPan: true });
      mk.on('click', () => onSelectRef.current(p.id));
      store.set(p.id, mk);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, props.mode]);

  // Mise en évidence de la sélection sans recréer les marqueurs (le popup reste ouvert)
  useEffect(() => {
    for (const p of props.pharmacies) {
      const mk = layers.current.markers.get(p.id);
      if (!mk) continue;
      const sel = p.id === props.selectedId;
      mk.setIcon(pinIcon(p, sel));
      mk.setZIndexOffset(sel ? 900 : 500 - (p.rank ?? 100));
      mk.setPopupContent(popupHtml(p, props.mode));
    }
  }, [props.selectedId, props.pharmacies, props.mode, markerKey]);

  // Itinéraires (couleur = couleur du rang)
  useEffect(() => {
    const g = layers.current.routes;
    if (!g) return;
    g.clearLayers();
    if (!props.routesShown) return;
    for (const id of props.visibleRouteIds) {
      const r = props.routes[id];
      const p = props.pharmacies.find((x) => x.id === id);
      if (!r || !p) continue;
      const c = rankColor(p.rank).bg;
      L.polyline(r.geometry, { color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }).addTo(g);
      L.polyline(r.geometry, { color: c, weight: 5, opacity: 0.95 })
        .bindTooltip(`${p.rank ? `${p.rank}. ` : ''}${esc(p.name)} — ${formatKm(r.distanceKm)} · ${formatMinutes(r.durationMin)}`, { sticky: true })
        .addTo(g);
    }
  }, [props.routes, props.visibleRouteIds, props.pharmacies, props.routesShown]);

  // Centrer sur une pharmacie (depuis la liste)
  useEffect(() => {
    const m = map.current;
    const id = props.focusSignal.id;
    if (!m || !id) return;
    const mk = layers.current.markers.get(id);
    if (!mk) return;
    m.setView(mk.getLatLng(), Math.max(m.getZoom(), 16), { animate: true });
    mk.openPopup();
  }, [props.focusSignal]);

  // Plein écran : la carte se manipule librement à un doigt
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const touch = L.Browser.touch && window.matchMedia('(pointer: coarse)').matches;
    if (full) {
      m.dragging.enable();
      document.body.style.overflow = 'hidden';
    } else {
      if (touch) m.dragging.disable();
      document.body.style.overflow = '';
    }
    setTimeout(() => m.invalidateSize(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  function recenter() {
    const m = map.current;
    if (!m) return;
    if (layers.current.circle) m.fitBounds(layers.current.circle.getBounds(), { padding: [16, 16], maxZoom: 16 });
    else m.setView([CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng], 12);
  }

  return (
    <div className={`${full ? 'fixed inset-0 z-[900] bg-bg' : 'relative h-full w-full'} ${props.picking ? 'map-picking' : ''}`}>
      <div ref={el} className="h-full w-full" role="application" aria-label={props.ariaLabel ?? 'Carte des pharmacies de garde'} />
      {hint && (
        <div className="pointer-events-none absolute inset-0 z-[600] flex items-center justify-center bg-black/35 p-6 text-center text-sm font-bold text-white">
          Utilisez deux doigts pour déplacer la carte, ou ouvrez-la en plein écran ⤢
        </div>
      )}
      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2" style={full ? { top: 'max(env(safe-area-inset-top), 12px)' } : undefined}>
        <button type="button" onClick={() => setFull((v) => !v)} className={`rounded-xl p-2.5 shadow-md ${full ? 'bg-brand-700 text-white' : 'bg-white text-brand-700'}`}
          title={full ? 'Quitter le plein écran' : 'Carte en plein écran'} aria-label={full ? 'Quitter le plein écran' : 'Carte en plein écran'} aria-pressed={full}>
          {full ? <CloseIcon size={20} /> : <ExpandIcon size={20} />}
        </button>
        <button type="button" onClick={props.onToggleRoutes} disabled={!props.canShowRoutes} aria-pressed={props.routesShown}
          className={`rounded-xl p-2.5 shadow-md disabled:opacity-50 ${props.routesShown ? 'bg-brand-700 text-white' : 'bg-white text-brand-700'}`}
          title={props.routesShown ? 'Masquer les itinéraires' : 'Afficher les itinéraires'} aria-label={props.routesShown ? 'Masquer les itinéraires' : 'Afficher les itinéraires'}>
          <RouteIcon size={20} />
        </button>
        <button type="button" onClick={recenter} className="rounded-xl bg-white p-2.5 text-brand-700 shadow-md" title="Revenir à la position de départ" aria-label="Revenir à la position de départ">
          <GpsIcon size={20} />
        </button>
        <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-md">
          <button type="button" onClick={() => map.current?.zoomIn()} className="px-3 py-2 text-lg font-extrabold text-brand-700" aria-label="Zoomer">+</button>
          <span className="h-px bg-line" />
          <button type="button" onClick={() => map.current?.zoomOut()} className="px-3 py-2 text-lg font-extrabold text-brand-700" aria-label="Dézoomer">−</button>
        </div>
      </div>
      {props.picking && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] mx-auto w-fit rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white shadow-lg">
          Touchez la carte pour choisir le départ
        </div>
      )}
    </div>
  );
}
