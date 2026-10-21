// Libellés français et correspondances de vocabulaire (OpenStreetMap → services).
import type { EstablishmentType, InfoSource, ServiceId } from './types.ts';

export const TYPE_LABEL: Record<EstablishmentType, string> = {
  public_hospital: 'Hôpital public',
  military_hospital: 'Hôpital militaire',
  private_hospital: 'Hôpital privé',
  private_clinic: 'Clinique privée',
  hospital: 'Hôpital (statut non publié)',
  other: 'Autre établissement de soins',
};

/** Filtres de type proposés à l'utilisateur (l'ordre compte). */
export const TYPE_FILTERS: { id: EstablishmentType; label: string }[] = [
  { id: 'public_hospital', label: 'Hôpital public' },
  { id: 'private_clinic', label: 'Clinique privée' },
  { id: 'private_hospital', label: 'Hôpital privé' },
  { id: 'military_hospital', label: 'Hôpital militaire' },
  { id: 'hospital', label: 'Statut non publié' },
  { id: 'other', label: 'Autre' },
];

export const SERVICE_LABEL: Record<ServiceId, string> = {
  emergency: 'Urgences',
  maternity: 'Maternité',
  gynaecology: 'Gynécologie-obstétrique',
  paediatrics: 'Pédiatrie',
  cardiology: 'Cardiologie',
  surgery: 'Chirurgie',
  orthopaedics: 'Orthopédie',
  trauma: 'Traumatologie',
  oncology: 'Oncologie',
  neurology: 'Neurologie',
  ophthalmology: 'Ophtalmologie',
  nephrology: 'Néphrologie',
  general: 'Médecine générale',
  internal: 'Médecine interne',
  pulmonology: 'Pneumologie',
  gastroenterology: 'Gastro-entérologie',
  endocrinology: 'Endocrinologie',
  infectious: 'Maladies infectieuses',
  psychiatry: 'Psychiatrie',
  radiology: 'Radiologie',
  nuclear: 'Médecine nucléaire',
  dentistry: 'Dentisterie',
  biology: 'Biologie médicale',
  rheumatology: 'Rhumatologie',
  rehabilitation: 'Rééducation',
};

/** Valeurs de la clé OSM `healthcare:speciality` → service. Les valeurs inconnues sont ignorées. */
export const OSM_SPECIALITY: Record<string, ServiceId> = {
  emergency: 'emergency',
  gynaecology: 'gynaecology',
  obstetrics: 'maternity',
  paediatrics: 'paediatrics',
  pediatrics: 'paediatrics',
  cardiology: 'cardiology',
  surgery: 'surgery',
  general_surgery: 'surgery',
  vascular_surgery: 'surgery',
  plastic_surgery: 'surgery',
  cardiothoracic_surgery: 'surgery',
  orthopaedics: 'orthopaedics',
  trauma: 'trauma',
  oncology: 'oncology',
  neurology: 'neurology',
  ophthalmology: 'ophthalmology',
  nephrology: 'nephrology',
  general: 'general',
  internal: 'internal',
  pulmonology: 'pulmonology',
  gastroenterology: 'gastroenterology',
  endocrinology: 'endocrinology',
  infectious_diseases: 'infectious',
  psychiatry: 'psychiatry',
  radiology: 'radiology',
  nuclear: 'nuclear',
  dentistry: 'dentistry',
  biology: 'biology',
  rheumatology: 'rheumatology',
  physiatry: 'rehabilitation',
};

export const INFO_SOURCE_LABEL: Record<InfoSource, string> = {
  ministere: 'ministère de la Santé',
  osm: 'OpenStreetMap',
  nom: 'nom de l’établissement',
  manuel: 'vérification manuelle',
};
