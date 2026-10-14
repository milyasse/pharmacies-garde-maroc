// Géolocalisation du navigateur, demandée uniquement quand l'utilisateur clique.
// La position n'est ni stockée ni envoyée ailleurs qu'aux services de carte/itinéraire.
//
// Robustesse :
//  1. essai précis (GPS) 10 s ; 2. si délai dépassé / indisponible : essai réseau (Wi-Fi / antenne) 20 s,
//     en acceptant une position récente (≤ 5 min) ;
//  3. message adapté à la cause : autorisation refusée (avec la marche à suivre selon l'appareil),
//     navigateur intégré à une autre application, localisation du téléphone désactivée, etc.

export interface GeoResult {
  lat: number;
  lng: number;
  accuracyM: number;
}

export type GeoErrorKind = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export class GeoError extends Error {
  kind: GeoErrorKind;
  help: string[];
  constructor(kind: GeoErrorKind, message: string, help: string[] = []) {
    super(message);
    this.kind = kind;
    this.help = help;
  }
}

/** Navigateur intégré à une application (Facebook, Instagram, WhatsApp, Messenger, TikTok, Gmail…), souvent sans géolocalisation. */
export function isInAppBrowser(ua = navigator.userAgent): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|GSA\/|Claude/i.test(ua) ||
    (/Android/i.test(ua) && /; wv\)/.test(ua));
}

function platformHelp(): string[] {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const help: string[] = [];
  if (isInAppBrowser(ua)) {
    help.push('Vous êtes dans le navigateur intégré d’une application : ouvrez la page dans ' + (ios ? 'Safari' : 'Chrome') + ' (menu ⋯ → « Ouvrir dans le navigateur »).');
  }
  if (ios) {
    help.push('iPhone : Réglages → Confidentialité et sécurité → Service de localisation → activé, puis « Sites Safari » (ou Chrome) → « Lorsque l’app est active ».');
    help.push('Dans Safari : touchez « aA » dans la barre d’adresse → Réglages du site web → Localisation → Autoriser, puis rechargez la page.');
  } else if (android) {
    help.push('Android : vérifiez que la localisation du téléphone est activée (volet rapide → Localisation).');
    help.push('Dans Chrome : touchez l’icône à gauche de l’adresse → Autorisations → Position → Autoriser, puis rechargez la page.');
  } else {
    help.push('Ordinateur : cliquez sur l’icône à gauche de l’adresse → Position → Autoriser, puis rechargez la page.');
  }
  help.push('En attendant : touchez une ville ci-dessus, saisissez une adresse ou choisissez un point sur la carte.');
  return help;
}

function once(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));
}

export async function getCurrentPosition(): Promise<GeoResult> {
  if (!('geolocation' in navigator)) {
    throw new GeoError('unsupported', 'La géolocalisation n’est pas disponible dans ce navigateur.', platformHelp());
  }
  if (!window.isSecureContext) {
    throw new GeoError('insecure', 'La géolocalisation exige une connexion sécurisée (https).', platformHelp());
  }
  // Autorisation déjà refusée : inutile d'attendre, le navigateur ne redemandera pas
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (st?.state === 'denied') {
      throw new GeoError('denied', 'L’accès à votre position est bloqué pour ce site.', platformHelp());
    }
  } catch (e) {
    if (e instanceof GeoError) throw e;
    /* API Permissions absente (Safari ancien) : on tente directement */
  }
  const toResult = (p: GeolocationPosition): GeoResult => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy });
  try {
    return toResult(await once({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }));
  } catch (err) {
    const e = err as GeolocationPositionError;
    if (e.code === e.PERMISSION_DENIED) {
      throw new GeoError('denied', 'Autorisation de localisation refusée.', platformHelp());
    }
    // GPS lent ou indisponible (intérieur, économie d'énergie) : position réseau, moins précise mais rapide
    try {
      return toResult(await once({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 5 * 60_000 }));
    } catch (err2) {
      const e2 = err2 as GeolocationPositionError;
      if (e2.code === e2.PERMISSION_DENIED) throw new GeoError('denied', 'Autorisation de localisation refusée.', platformHelp());
      if (e2.code === e2.TIMEOUT) throw new GeoError('timeout', 'La localisation a pris trop de temps.', platformHelp());
      throw new GeoError('unavailable', 'Position indisponible : la localisation du téléphone est peut-être désactivée.', platformHelp());
    }
  }
}
