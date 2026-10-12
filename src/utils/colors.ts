// Couleurs de rang (identiques aux tokens Figma « rank/* »).
// 1 vert foncé, 2 vert clair, 3 bleu, 4 orange, 5 violet, puis une palette distincte et lisible.

const RANKS: { bg: string; fg: string }[] = [
  { bg: '#0B6E3F', fg: '#FFFFFF' }, // 1 vert foncé
  { bg: '#5DBB63', fg: '#0F2418' }, // 2 vert clair
  { bg: '#1D6FD8', fg: '#FFFFFF' }, // 3 bleu
  { bg: '#E8760A', fg: '#FFFFFF' }, // 4 orange
  { bg: '#7B3FC4', fg: '#FFFFFF' }, // 5 violet
  { bg: '#C2185B', fg: '#FFFFFF' }, // 6 framboise
  { bg: '#00838F', fg: '#FFFFFF' }, // 7 bleu canard
  { bg: '#6D4C41', fg: '#FFFFFF' }, // 8 brun
  { bg: '#455A64', fg: '#FFFFFF' }, // 9 ardoise
  { bg: '#9E7700', fg: '#FFFFFF' }, // 10 ocre
  { bg: '#283593', fg: '#FFFFFF' }, // 11 indigo
  { bg: '#AD1457', fg: '#FFFFFF' }, // 12 prune
  { bg: '#2E7D32', fg: '#FFFFFF' }, // 13 vert sapin (contour pointillé côté carte)
  { bg: '#D84315', fg: '#FFFFFF' }, // 14 rouille
  { bg: '#5E35B1', fg: '#FFFFFF' }, // 15 améthyste
];

export function rankColor(rank: number | null): { bg: string; fg: string } {
  if (!rank || rank < 1) return { bg: '#6B7280', fg: '#FFFFFF' };
  return RANKS[(rank - 1) % RANKS.length];
}
