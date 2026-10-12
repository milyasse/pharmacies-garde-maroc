// Géolocalisation du navigateur, demandée uniquement quand l'utilisateur clique.
// La position n'est ni stockée ni envoyée ailleurs qu'aux services de carte/itinéraire.

export interface GeoResult {
  lat: number;
  lng: number;
  accuracyM: number;
}

export class GeoError extends Error {}

export function getCurrentPosition(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoError('La géolocalisation n’est pas disponible sur cet appareil. Saisissez une adresse ou touchez la carte.'));
      return;
    }
    if (!window.isSecureContext) {
      reject(new GeoError('La géolocalisation exige une connexion sécurisée (https).'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Autorisation de localisation refusée. Saisissez une adresse ou choisissez un point sur la carte.'
            : err.code === err.TIMEOUT
              ? 'La localisation a pris trop de temps. Réessayez ou saisissez une adresse.'
              : 'Position indisponible. Saisissez une adresse ou choisissez un point sur la carte.';
        reject(new GeoError(msg));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
