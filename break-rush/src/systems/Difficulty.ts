export type Difficulty = 'normal' | 'hard' | 'rush';

export interface DifficultyDef {
  name: string;
  desc: string;
  enemyHpMult: number;
  enemyDmgMult: number;
  /** Multiplies the number of enemies in every wave. */
  countMult: number;
  /** Added to the combo window (negative = harder to keep a combo). */
  comboWindowDelta: number;
  scoreMult: number;
}

export const DIFFICULTY_ORDER: Difficulty[] = ['normal', 'hard', 'rush'];

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  normal: { name: 'NORMAL', desc: 'The standard experience.', enemyHpMult: 1, enemyDmgMult: 1, countMult: 1, comboWindowDelta: 0, scoreMult: 1 },
  hard: { name: 'HARD', desc: 'Enemies hit 50% harder, +25% HP and count. Score x1.5', enemyHpMult: 1.25, enemyDmgMult: 1.5, countMult: 1.25, comboWindowDelta: 0, scoreMult: 1.5 },
  rush: { name: 'RUSH', desc: 'Double the enemies, weaker, but combo time -0.5s. Score x1.25', enemyHpMult: 0.8, enemyDmgMult: 0.8, countMult: 2, comboWindowDelta: -500, scoreMult: 1.25 },
};

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'normal' || v === 'hard' || v === 'rush';
}
