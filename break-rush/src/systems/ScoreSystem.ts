export const POINTS = { hit: 10, grunt: 100, break: 300, rush: 200, boss: 5000, noDamageBonus: 2000 };

const MULT_TABLE: Array<[number, number]> = [
  [200, 5],
  [100, 3],
  [50, 2],
  [25, 1.5],
  [10, 1.2],
];

export function scoreMultiplier(comboHits: number): number {
  for (const [hits, mult] of MULT_TABLE) if (comboHits >= hits) return mult;
  return 1;
}

export class ScoreSystem {
  total = 0;

  /** Adds points scaled by the combo multiplier. Returns the amount added. */
  add(points: number, comboHits: number): number {
    const gained = Math.round(points * scoreMultiplier(comboHits));
    this.total += gained;
    return gained;
  }

  addFlat(points: number): void {
    this.total += points;
  }
}

export interface RankInput {
  score: number;
  maxCombo: number;
  damageTaken: number;
  timeSec: number;
}

function tierUp(v: number, thresholds: number[]): number {
  return thresholds.filter((t) => v >= t).length;
}
function tierDown(v: number, thresholds: number[]): number {
  return thresholds.filter((t) => v <= t).length;
}

/** Each of the 4 factors gives 0-4 points; 16 total. */
export function calcRank(r: RankInput): 'S' | 'A' | 'B' | 'C' | 'D' {
  const pts =
    tierUp(r.score, [4000, 8000, 14000, 22000]) +
    tierUp(r.maxCombo, [10, 25, 50, 100]) +
    tierDown(r.damageTaken, [80, 50, 25, 0]) +
    tierDown(r.timeSec, [240, 180, 120, 90]);
  if (pts >= 14) return 'S';
  if (pts >= 11) return 'A';
  if (pts >= 8) return 'B';
  if (pts >= 5) return 'C';
  return 'D';
}
