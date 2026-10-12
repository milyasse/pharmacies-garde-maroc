// Configuration publique (aucun secret). Surchargable via .env (voir .env.example).
const env = import.meta.env;

export const CONFIG = {
  dataUrl: (env.VITE_DATA_URL as string | undefined) || `${import.meta.env.BASE_URL}data`,
  tileUrl: (env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:
    (env.VITE_TILE_ATTRIBUTION as string | undefined) ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
  // OSRM (serveurs FOSSGIS, OpenStreetMap Allemagne) : voiture et piéton
  osrmCarUrl: (env.VITE_OSRM_CAR_URL as string | undefined) || 'https://routing.openstreetmap.de/routed-car',
  osrmFootUrl: (env.VITE_OSRM_FOOT_URL as string | undefined) || 'https://routing.openstreetmap.de/routed-foot',
  // Secours voiture : serveur de démonstration du projet OSRM
  osrmCarFallbackUrl: (env.VITE_OSRM_FALLBACK_CAR_URL as string | undefined) || 'https://router.project-osrm.org',
  nominatimUrl: (env.VITE_NOMINATIM_URL as string | undefined) || 'https://nominatim.openstreetmap.org',
  defaultCenter: { lat: 33.985, lng: -6.85 }, // entre Rabat, Salé et Témara
  maxRoutesBatch: 12,
};
