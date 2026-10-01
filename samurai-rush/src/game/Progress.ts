export type Rank = 'S' | 'A' | 'B' | 'C';

export interface StageRecord {
  bestScore: number;
  bestTime: number;
  bestRank: Rank;
  clears: number;
}

export interface SaveData {
  version: 1;
  records: Record<string, StageRecord>;
  /** Highest stage number the player may start (1-based). */
  unlocked: number;
  volume: number;
  endlessBest: number;
  endlessKills: number;
}

export const STAGE_COUNT = 4;
const RANK_ORDER: Rank[] = ['C', 'B', 'A', 'S'];

export function newSave(): SaveData {
  return { version: 1, records: {}, unlocked: 1, volume: 0.7, endlessBest: 0, endlessKills: 0 };
}

/** Rank from the final score relative to the stage's par score. */
export function rankFor(score: number, par: number): Rank {
  const r = score / Math.max(1, par);
  if (r >= 1) return 'S';
  if (r >= 0.72) return 'A';
  if (r >= 0.48) return 'B';
  return 'C';
}

export function betterRank(a: Rank, b: Rank): Rank {
  return RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

/** Final score = points earned minus a penalty for damage taken. */
export function finalScore(points: number, damageTaken: number): number {
  return Math.max(0, Math.round(points - damageTaken * 3));
}

export interface ResultSummary {
  rank: Rank;
  newBest: boolean;
  previousBest: number | null;
}

export function applyResult(save: SaveData, stage: number, score: number, time: number, par: number): ResultSummary {
  const key = String(stage);
  const rank = rankFor(score, par);
  const prev = save.records[key];
  const newBest = !prev || score > prev.bestScore;
  save.records[key] = {
    bestScore: prev ? Math.max(prev.bestScore, score) : score,
    bestTime: prev ? Math.min(prev.bestTime, time) : time,
    bestRank: prev ? betterRank(prev.bestRank, rank) : rank,
    clears: (prev?.clears ?? 0) + 1,
  };
  save.unlocked = Math.min(STAGE_COUNT, Math.max(save.unlocked, stage + 1));
  return { rank, newBest, previousBest: prev ? prev.bestScore : null };
}

const KEY = 'samurairush.save.v1';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newSave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = newSave();
    return {
      version: 1,
      records: typeof d.records === 'object' && d.records ? (d.records as Record<string, StageRecord>) : base.records,
      unlocked: clamp(Number(d.unlocked) || 1, 1, STAGE_COUNT),
      volume: clamp(d.volume === undefined ? 0.7 : Number(d.volume), 0, 1),
      endlessBest: Math.max(0, Number(d.endlessBest) || 0),
      endlessKills: Math.max(0, Number(d.endlessKills) || 0),
    };
  } catch {
    return newSave();
  }
}

export function storeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: progress just won't persist */
  }
}
