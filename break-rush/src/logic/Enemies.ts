export type EnemyKind = 'imp' | 'runner' | 'brute';

export interface EnemyDef {
  hp: number;
  speed: number;
  /** Contact damage. */
  dmg: number;
  radius: number;
  /** XP value of the gem it drops. */
  gem: number;
  color: number;
  scale: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  imp: { hp: 18, speed: 5.4, dmg: 6, radius: 0.55, gem: 1, color: 0xff4d6d, scale: 1 },
  runner: { hp: 11, speed: 8.4, dmg: 5, radius: 0.42, gem: 1, color: 0xffc233, scale: 1 },
  brute: { hp: 120, speed: 3.0, dmg: 15, radius: 1.05, gem: 8, color: 0xb06cff, scale: 1.9 },
};

export const ELITE_HP_MULT = 7;
export const ELITE_SCALE = 1.6;
export const ELITE_GEM = 25;
export const BOSS_GEM = 200;

/** Enemies get tougher as the run goes on (t in seconds). */
export function hpScale(t: number): number {
  const m = t / 60;
  return 1 + 0.9 * m + 0.16 * m * m;
}

export function dmgScale(t: number): number {
  return 1 + 0.35 * (t / 60);
}

/** Boss HP for the nth boss (0-based). */
export function bossHp(index: number): number {
  return 3800 * (1 + 0.9 * index) * (1 + 0.2 * index * index);
}

/** Enemies get faster as the run goes on, so late in the run you can no longer just kite everything. */
export function speedScale(t: number): number {
  return Math.min(1.65, 1 + 0.0014 * t);
}
