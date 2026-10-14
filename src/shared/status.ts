// Règles de fiabilité. Principe : on ne déclare « Confirmée » que ce qu'une source
// publie explicitement pour la date, et on n'invente jamais une garde.

import type { ConfidenceLevel, DutyRecord, SourceRef, VerificationStatus } from './types.ts';
import { addDays, moroccoDate, moroccoMinutes, parseHours } from './dates.ts';

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  confirmed: 'Confirmée',
  to_confirm: 'À confirmer',
  conflicting: 'Sources contradictoires',
  expired: 'Expirée',
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'Confiance élevée',
  medium: 'Confiance moyenne',
  low: 'Confiance faible',
};

/** Un signal « daté » d'une source pour la date D. */
export function sourceSignals(s: SourceRef, dutyDate: string, collectedOn: string | null) {
  const history = !!s.historyMatch;
  // La liste n'est un signal que si la page annonce une date de la garde ET que la collecte
  // a eu lieu pendant la garde (sinon la page est périmée). Fenêtre = [début, fin] publiés,
  // ou le seul jour de la garde si l'historique est muet.
  const start = s.historyMatch?.start ?? dutyDate;
  const end = s.historyMatch?.end ?? dutyDate;
  const within = (d: string | null) => !!d && start <= d && d <= end;
  const listing = within(s.sourcePublishedAt) && (collectedOn === null || within(collectedOn)) && (s.historyMatch ? true : s.sourcePublishedAt === dutyDate);
  return { history, listing };
}

/**
 * Statut « de base » (indépendant de l'heure de consultation) d'un enregistrement.
 * - confirmed : au moins un signal daté pour la date (historique de fiche ou liste du jour datée)
 * - conflicting : plusieurs sources se contredisent sur le type de garde ou les dates
 * - to_confirm : présent chez une source, sans date vérifiable
 */
export function computeBaseStatus(rec: Pick<DutyRecord, 'sources' | 'dutyDate'>): {
  status: VerificationStatus;
  confidence: ConfidenceLevel;
  notes: string[];
} {
  const notes: string[] = [];
  const perSource = rec.sources.map((s) => {
    const collectedOn = s.lastCheckedAt ? moroccoDate(new Date(s.lastCheckedAt)) : null;
    return { s, ...sourceSignals(s, rec.dutyDate, collectedOn) };
  });
  const dated = perSource.filter((p) => p.history || p.listing);
  const distinctSourcesDated = new Set(dated.map((p) => p.s.sourceId)).size;

  // Contradictions entre sources différentes sur le type de garde
  const types = new Set(rec.sources.map((s) => s.dutyType).filter(Boolean));
  const distinctSources = new Set(rec.sources.map((s) => s.sourceId)).size;
  if (distinctSources > 1 && types.size > 1) {
    notes.push('Les sources ne publient pas le même type de garde.');
    return { status: 'conflicting', confidence: 'low', notes };
  }
  // Contradiction sur les dates d'historique
  const ranges = new Set(rec.sources.map((s) => s.historyMatch?.start ?? null).filter(Boolean));
  if (ranges.size > 1) {
    notes.push('Les sources publient des périodes de garde différentes.');
    return { status: 'conflicting', confidence: 'low', notes };
  }

  if (dated.length === 0) {
    const stale = perSource.some((p) => p.s.sourcePublishedAt && p.s.sourcePublishedAt !== rec.dutyDate);
    if (stale) notes.push('La page source affichait une autre date que celle de la garde.');
    else notes.push('La source ne date pas cette garde de façon vérifiable.');
    return { status: 'to_confirm', confidence: 'low', notes };
  }

  let confidence: ConfidenceLevel;
  if (distinctSourcesDated >= 2) confidence = 'high';
  else if (dated.some((p) => p.history && p.listing)) confidence = 'medium';
  else confidence = 'low';
  const planning = (x: SourceRef) => /planning/i.test(x.historyMatch?.label ?? '');
  if (dated.every((p) => !p.history)) notes.push('Garde publiée dans la liste du jour, absente de l’historique de la fiche.');
  if (dated.every((p) => !p.listing)) {
    if (dated.every((p) => planning(p.s))) {
      const collected = dated.map((p) => (p.s.lastCheckedAt ? moroccoDate(new Date(p.s.lastCheckedAt)) : null)).filter(Boolean) as string[];
      notes.push(collected.length && collected.every((d) => d < rec.dutyDate)
        ? 'Planning publié à l’avance : à revérifier le jour même.'
        : 'Garde publiée dans le planning hebdomadaire de la source.');
    } else notes.push('Garde confirmée par l’historique daté de la fiche.');
  }
  return { status: 'confirmed', confidence, notes };
}

/**
 * Applique l'heure de consultation : passe en « Expirée » ce qui est terminé.
 * `requestedDate` = date demandée par l'utilisateur (YYYY-MM-DD, heure du Maroc).
 */
export function applyTimeStatus(rec: DutyRecord, requestedDate: string, now: Date = new Date()): DutyRecord {
  const today = moroccoDate(now);
  const notes = [...rec.notes];
  let status = rec.verificationStatus;
  const end = rec.dutyEndDate;
  const hours = parseHours(rec.hoursText);

  if (end && end < today) status = 'expired';
  else if (!end && rec.dutyDate < today && !(rec.dutyType !== 'day' && addDays(rec.dutyDate, 1) === today && moroccoMinutes(now) < 9 * 60)) {
    // garde rattachée à un jour passé, sans date de fin publiée
    status = 'expired';
  } else if (requestedDate === today && hours && rec.dutyDate === today && hours.endMin > hours.startMin && moroccoMinutes(now) > hours.endMin) {
    status = 'expired';
    notes.push(`Plage horaire publiée (${hours.text}) terminée.`);
  }
  // Garde de nuit/24h commencée la veille et qui se termine le matin de la date demandée
  if (rec.dutyEndDate === requestedDate && rec.dutyStartDate && rec.dutyStartDate < requestedDate && status !== 'expired') {
    if (requestedDate === today && moroccoMinutes(now) >= 12 * 60) {
      // Les gardes de nuit se terminent le matin (généralement vers 8h30-9h au Maroc).
      status = 'expired';
      notes.push('Garde de la nuit précédente, terminée ce matin (heure exacte de fin non publiée).');
    } else {
      notes.push('Garde commencée la veille, se termine le matin (heure exacte de fin non publiée).');
    }
  }
  return { ...rec, verificationStatus: status, notes: Array.from(new Set(notes)) };
}

/**
 * Sélectionne les enregistrements pertinents pour la date demandée à partir des
 * instantanés du jour J et de la veille (gardes de nuit qui débordent sur J).
 */
export function selectForDate(
  dayRecords: DutyRecord[],
  previousDayRecords: DutyRecord[],
  requestedDate: string,
  now: Date = new Date(),
): DutyRecord[] {
  const out: DutyRecord[] = [];
  const ids = new Set<string>();
  for (const r of dayRecords) {
    // Si la fenêtre publiée ne couvre pas la date, on ne l'affiche pas comme garde de J.
    if (r.dutyStartDate && r.dutyEndDate && !(r.dutyStartDate <= requestedDate && requestedDate <= r.dutyEndDate)) continue;
    out.push(applyTimeStatus(r, requestedDate, now));
    ids.add(r.id);
  }
  for (const r of previousDayRecords) {
    if (ids.has(r.id)) continue;
    if (r.dutyType === 'day') continue;
    if (r.dutyEndDate === requestedDate && r.dutyStartDate && r.dutyStartDate < requestedDate) {
      out.push(applyTimeStatus(r, requestedDate, now));
      ids.add(r.id);
    }
  }
  return out;
}

export const STATUS_ORDER: Record<VerificationStatus, number> = { confirmed: 0, conflicting: 1, to_confirm: 2, expired: 3 };
