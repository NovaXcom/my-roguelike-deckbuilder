export type Rank = 'S' | 'A' | 'B' | 'C';

export interface StageRecord {
  bestTime: number;
  bestRank: Rank;
  clears: number;
}

export interface SaveData {
  version: 1;
  records: Record<string, StageRecord>;
  /** Highest stage number the player may start (1-based). */
  unlocked: number;
  assist: boolean;
  sens: number;
  volume: number;
}

export const STAGES = 5;
const RANK_ORDER: Rank[] = ['C', 'B', 'A', 'S'];

export function newSave(): SaveData {
  return { version: 1, records: {}, unlocked: 1, assist: false, sens: 1, volume: 0.7 };
}

/** Each death costs 2 seconds on the ranking clock (the real clock keeps running too). */
export function rankFor(time: number, deaths: number, par: number): Rank {
  const eff = time + deaths * 2;
  if (eff <= par) return 'S';
  if (eff <= par * 1.25) return 'A';
  if (eff <= par * 1.6) return 'B';
  return 'C';
}

export function betterRank(a: Rank, b: Rank): Rank {
  return RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
}

export interface ResultSummary {
  rank: Rank;
  newBest: boolean;
  previousBest: number | null;
}

/** Records a finished run. `stage` is 1-based; daily runs use stage 0 and do not unlock anything. */
export function applyResult(save: SaveData, key: string, stage: number, time: number, deaths: number, par: number): ResultSummary {
  const rank = rankFor(time, deaths, par);
  const prev = save.records[key];
  const newBest = !prev || time < prev.bestTime;
  save.records[key] = {
    bestTime: prev ? Math.min(prev.bestTime, time) : time,
    bestRank: prev ? betterRank(prev.bestRank, rank) : rank,
    clears: (prev?.clears ?? 0) + 1,
  };
  if (stage > 0) save.unlocked = Math.min(STAGES, Math.max(save.unlocked, stage + 1));
  return { rank, newBest, previousBest: prev ? prev.bestTime : null };
}

const KEY = 'breakrush3d.save.v2';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newSave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = newSave();
    return {
      version: 1,
      records: typeof d.records === 'object' && d.records ? (d.records as Record<string, StageRecord>) : base.records,
      unlocked: Math.min(STAGES, Math.max(1, Number(d.unlocked) || 1)),
      assist: !!d.assist,
      sens: clamp(Number(d.sens) || 1, 0.3, 3),
      volume: clamp(d.volume === undefined ? 0.7 : Number(d.volume), 0, 1),
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

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

/** Seed for the daily course: the same for everyone on a given (UTC) date. */
export function dailySeed(d = new Date()): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
