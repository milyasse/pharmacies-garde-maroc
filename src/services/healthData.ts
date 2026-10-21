// Chargement des établissements de santé publiés par le collecteur (public/data/sante/etablissements.json).
import { CONFIG } from '../config.ts';
import type { HealthDataset } from '../shared/health/types.ts';
import { cachedJson, DataError } from './pharmacySearch.ts';

export async function loadHealthDataset(force = false): Promise<HealthDataset> {
  let d: HealthDataset | null;
  try {
    d = await cachedJson<HealthDataset>(`${CONFIG.dataUrl}/sante/etablissements.json`, force);
  } catch (e) {
    if (e instanceof DataError) throw new DataError(e.message.replace('données de garde', 'données des cliniques et hôpitaux').replace('Données de garde', 'Données des cliniques et hôpitaux'));
    throw e;
  }
  if (!d) throw new DataError('La liste des cliniques et hôpitaux n’est pas encore disponible (première collecte en attente).');
  return d;
}
