import { EnemyKind } from '../config';

export type EnemyTier = 'fodder' | 'normal' | 'elite';
export type DropType = 'gold' | 'xp' | 'heal';

export interface Drop {
  type: DropType;
  value: number;
}

export const TIER_HP_MULT: Record<EnemyTier, number> = { fodder: 0.3, normal: 1, elite: 3.2 };
export const TIER_DMG_MULT: Record<EnemyTier, number> = { fodder: 0.7, normal: 1, elite: 1.35 };

const BASE_REWARD: Record<EnemyKind | 'boss', { gold: number; xp: number }> = {
  grunt: { gold: 4, xp: 6 },
  rusher: { gold: 6, xp: 9 },
  guard: { gold: 7, xp: 11 },
  boss: { gold: 90, xp: 90 },
};

const TIER_REWARD_MULT: Record<EnemyTier, { gold: number; xp: number }> = {
  fodder: { gold: 0.35, xp: 0.35 },
  normal: { gold: 1, xp: 1 },
  elite: { gold: 4, xp: 3 },
};

/** Splits `total` into at most `pieces` parts that sum exactly to `total`. */
export function splitValue(total: number, pieces: number): number[] {
  const t = Math.max(0, Math.round(total));
  if (t === 0) return [];
  const n = Math.max(1, Math.min(pieces, t));
  const base = Math.floor(t / n);
  const rem = t - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Rewards scale with depth so later rooms feel richer. */
export function zoneRewardMult(zone: number): number {
  return 1 + 0.35 * (zone - 1);
}

/** What an enemy drops when it dies. Gold and XP are split into several pickups for a satisfying shower. */
export function dropsFor(kind: EnemyKind | 'boss', tier: EnemyTier, zone: number, rand: () => number, goldMult = 1): Drop[] {
  const base = BASE_REWARD[kind];
  const t = TIER_REWARD_MULT[tier];
  const z = zoneRewardMult(zone);
  const gold = base.gold * t.gold * z * goldMult;
  const xp = base.xp * t.xp * z;
  const drops: Drop[] = [];
  const coinPieces = kind === 'boss' ? 14 : tier === 'elite' ? 6 : tier === 'fodder' ? 1 : 3;
  for (const v of splitValue(gold, coinPieces)) drops.push({ type: 'gold', value: v });
  for (const v of splitValue(xp, kind === 'boss' ? 8 : tier === 'elite' ? 4 : tier === 'fodder' ? 1 : 2)) drops.push({ type: 'xp', value: v });
  const healChance = kind === 'boss' ? 1 : tier === 'elite' ? 1 : tier === 'fodder' ? 0.02 : 0.05;
  if (rand() < healChance) drops.push({ type: 'heal', value: kind === 'boss' ? 30 : 12 });
  return drops;
}

export function sumDrops(drops: Drop[], type: DropType): number {
  return drops.filter((d) => d.type === type).reduce((a, d) => a + d.value, 0);
}

/** Props (crates) drop a little gold and sometimes a heart. */
export function crateDrops(zone: number, rand: () => number, goldMult = 1): Drop[] {
  const drops: Drop[] = splitValue(6 * zoneRewardMult(zone) * goldMult, 3).map((v) => ({ type: 'gold' as const, value: v }));
  drops.push({ type: 'xp', value: Math.round(3 * zoneRewardMult(zone)) });
  if (rand() < 0.15) drops.push({ type: 'heal', value: 10 });
  return drops;
}
