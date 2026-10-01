export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  name: string;
  desc: string;
  /** Multipliers on enemy HP, enemy damage, spawn rate, enemy speed, and coin rewards. */
  hp: number;
  dmg: number;
  spawn: number;
  speed: number;
  reward: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: { name: 'EASY', desc: 'Relax and smash', hp: 0.75, dmg: 0.6, spawn: 0.8, speed: 0.92, reward: 0.8 },
  normal: { name: 'NORMAL', desc: 'The real deal', hp: 1, dmg: 1, spawn: 1, speed: 1, reward: 1 },
  hard: { name: 'HARD', desc: 'More, faster, meaner. 1.5x coins', hp: 1.5, dmg: 1.6, spawn: 1.35, speed: 1.08, reward: 1.5 },
};
export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as DifficultyId[];

export function isDifficulty(v: unknown): v is DifficultyId {
  return typeof v === 'string' && (DIFFICULTY_IDS as string[]).includes(v);
}

/**
 * Difficulty multipliers fade in over the first `rampSec` seconds, so every run starts as a power
 * fantasy and only gets nasty once the hero has some upgrades.
 */
export function ramped(mult: number, t: number, rampSec = 180): number {
  return 1 + (mult - 1) * Math.min(1, Math.max(0, t / rampSec));
}
