export interface LevelState {
  level: number;
  xp: number;
}

/** XP needed to go from `level` to `level + 1`. Early levels come fast; later ones slow down. */
export function xpToNext(level: number): number {
  const n = level - 1;
  return 24 + 10 * n + 3 * n * n;
}

/** Adds XP, mutating the state. Returns how many levels were gained. */
export function addXp(s: LevelState, amount: number): number {
  s.xp += Math.max(0, amount);
  let gained = 0;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    gained++;
  }
  return gained;
}
