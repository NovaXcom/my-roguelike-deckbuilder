import { Difficulty, isDifficulty } from './Difficulty';
import { SaveData } from './SaveSystem';
import { UPGRADE_IDS, UpgradeId } from './UpgradeSystem';

export interface UnlockRule {
  id: string;
  label: string;
  hint: string;
  test: (s: SaveData) => boolean;
}

export const UNLOCK_RULES: UnlockRule[] = [
  { id: 'difficulty:hard', label: 'HARD MODE', hint: 'Clear stage 1', test: (s) => s.clearedStage >= 1 },
  { id: 'difficulty:rush', label: 'RUSH MODE', hint: 'Clear stage 2', test: (s) => s.clearedStage >= 2 },
  { id: 'upgrade:vampire', label: 'VAMPIRE upgrade', hint: 'Reach a 30 combo', test: (s) => s.bestCombo >= 30 },
  { id: 'upgrade:armor', label: 'ARMOR upgrade', hint: 'Score 20,000 in a run', test: (s) => Math.max(...Object.values(s.bestScore)) >= 20000 },
];

/** Marks newly satisfied rules as unlocked. Returns the updated save and which rules just fired. */
export function evaluateUnlocks(save: SaveData): { save: SaveData; newly: UnlockRule[] } {
  const newly = UNLOCK_RULES.filter((r) => !save.unlocked.includes(r.id) && r.test(save));
  return { save: { ...save, unlocked: [...save.unlocked, ...newly.map((r) => r.id)] }, newly };
}

export function isDifficultyUnlocked(save: SaveData, d: Difficulty): boolean {
  return d === 'normal' || save.unlocked.includes(`difficulty:${d}`);
}

/** Selected difficulty, falling back to NORMAL if it is not unlocked. */
export function usableDifficulty(save: SaveData): Difficulty {
  return isDifficulty(save.difficulty) && isDifficultyUnlocked(save, save.difficulty) ? save.difficulty : 'normal';
}

export function unlockedUpgrades(save: SaveData): UpgradeId[] {
  return save.unlocked.filter((u) => u.startsWith('upgrade:')).map((u) => u.slice(8)).filter((id): id is UpgradeId => (UPGRADE_IDS as string[]).includes(id));
}

export function unlockHint(d: Difficulty): string {
  return UNLOCK_RULES.find((r) => r.id === `difficulty:${d}`)?.hint ?? '';
}
