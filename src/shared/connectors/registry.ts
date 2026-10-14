// Registre des sources. Ajouter/désactiver une source = modifier ce fichier
// (et, pour une source active, fournir son parseur + son entrée dans scripts/collect.ts).

import type { CityId, ConnectorInfo } from '../types.ts';

export const CITIES: { id: CityId; name: string; center: { lat: number; lng: number } }[] = [
  { id: 'rabat', name: 'Rabat', center: { lat: 34.0209, lng: -6.8416 } },
  { id: 'sale', name: 'Salé', center: { lat: 34.0531, lng: -6.7985 } },
  { id: 'temara', name: 'Témara', center: { lat: 33.9287, lng: -6.9063 } },
];

export const CITY_NAME: Record<CityId, string> = { rabat: 'Rabat', sale: 'Salé', temara: 'Témara' };

export const CONNECTORS: ConnectorInfo[] = [
  {
    id: 'annuaire-gratuit',
    name: 'annuaire-gratuit.ma',
    homepage: 'https://www.annuaire-gratuit.ma/',
    enabled: true,
    cities: ['rabat', 'sale', 'temara'],
    reason:
      'Liste du jour par ville + historique de garde daté (début/fin) sur chaque fiche. Pages autorisées par robots.txt. Collecte espacée (≥ 1,5 s entre requêtes), toutes les ~2 h.',
  },
  {
    id: 'guidepharmacies',
    name: 'guidepharmacies.ma',
    homepage: 'https://www.guidepharmacies.ma/pharmacies-de-garde.html',
    enabled: true,
    cities: ['rabat', 'sale', 'temara'],
    reason:
      'Planning hebdomadaire publié à l’avance (semaine en cours et suivante) : jours à venir disponibles. Position publiée = centre du quartier, complétée par la position exacte d’une autre source ou par l’adresse de la fiche.',
  },
  {
    id: 'manual',
    name: 'Saisie manuelle (tableau de garde officiel)',
    homepage: '',
    enabled: true,
    cities: ['rabat', 'sale', 'temara'],
    reason:
      'Fichiers manual/AAAA-MM-JJ.json : permet de saisir un tableau de garde officiel (Ordre / conseil régional) avec son URL ou sa référence.',
  },
  {
    id: 'lematin',
    name: 'lematin.ma',
    homepage: 'https://lematin.ma/pharmacie-garde/rabat',
    enabled: false,
    cities: ['rabat'],
    reason:
      'Désactivé : couvre Rabat uniquement (pas Salé ni Témara) et la liste est chargée par un point d’accès interdit par le robots.txt du site (/ajax/, /api/).',
  },
  {
    id: 'wadifapublic',
    name: 'wadifapublic.ma',
    homepage: 'https://www.wadifapublic.ma/fr/pharmacie-de-garde-maroc/rabat',
    enabled: false,
    cities: ['rabat', 'sale', 'temara'],
    reason:
      'Désactivé : listes sans date de validité explicite et dispositif anti-robot (« honeypot ») présent sur les pages ; nous ne contournons pas les protections.',
  },
  {
    id: 'med-ma',
    name: 'med.ma',
    homepage: 'https://www.med.ma/pharmacie/garde-24-24/rabat',
    enabled: false,
    cities: ['rabat', 'sale', 'temara'],
    reason: 'Non utilisé pour les gardes : annuaire sans date de validité ni horodatage de mise à jour.',
  },
];
