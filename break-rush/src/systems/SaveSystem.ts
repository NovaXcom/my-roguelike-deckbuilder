import { DIFFICULTY_ORDER, Difficulty, isDifficulty } from './Difficulty';
import { META_IDS, MetaLevels, metaLevel } from './Meta';

export interface SaveData {
  bestScore: Record<Difficulty, number>;
  bestCombo: number;
  clearedStage: number;
  /** Unlock ids, e.g. 'upgrade:vampire', 'difficulty:hard'. */
  unlocked: string[];
  difficulty: Difficulty;
  settings: { muted: boolean };
  /** Meta currency earned by every run. */
  shards: number;
  /** Permanent upgrade levels bought with shards. */
  meta: MetaLevels;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const SAVE_KEY = 'break-rush-save-v1';

export function emptySave(): SaveData {
  return {
    bestScore: { normal: 0, hard: 0, rush: 0 },
    bestCombo: 0,
    clearedStage: 0,
    unlocked: [],
    difficulty: 'normal',
    settings: { muted: false },
    shards: 0,
    meta: {},
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Turns anything read from storage into a valid SaveData (bad fields fall back to defaults). */
export function sanitizeSave(raw: unknown): SaveData {
  const s = emptySave();
  if (typeof raw !== 'object' || raw === null) return s;
  const d = raw as Record<string, unknown>;
  const best = (d.bestScore ?? {}) as Record<string, unknown>;
  for (const k of DIFFICULTY_ORDER) s.bestScore[k] = num(best[k]);
  s.bestCombo = num(d.bestCombo);
  s.clearedStage = num(d.clearedStage);
  if (Array.isArray(d.unlocked)) s.unlocked = [...new Set(d.unlocked.filter((u): u is string => typeof u === 'string'))];
  if (isDifficulty(d.difficulty)) s.difficulty = d.difficulty;
  const st = (d.settings ?? {}) as Record<string, unknown>;
  s.settings.muted = st.muted === true;
  s.shards = num(d.shards);
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  for (const id of META_IDS) {
    const lv = metaLevel({ [id]: Number(meta[id]) }, id);
    if (lv > 0) s.meta[id] = lv;
  }
  return s;
}

function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSave(store: Store | null = defaultStore()): SaveData {
  try {
    const raw = store?.getItem(SAVE_KEY);
    return raw ? sanitizeSave(JSON.parse(raw)) : emptySave();
  } catch {
    return emptySave();
  }
}

/** Storage can be unavailable (private mode, file://); failing to save must never break the game. */
export function writeSave(save: SaveData, store: Store | null = defaultStore()): boolean {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(save));
    return !!store;
  } catch {
    return false;
  }
}

export interface RunRecord {
  difficulty: Difficulty;
  runScore: number;
  maxCombo: number;
  /** Highest stage cleared in this run (0 if none). */
  clearedStage: number;
}

/** Folds a finished (or ended) run into the save. Does not mutate the input. */
export function recordRun(save: SaveData, r: RunRecord): { save: SaveData; bestBefore: number; newRecord: boolean } {
  const bestBefore = save.bestScore[r.difficulty];
  const newRecord = r.runScore > bestBefore;
  const next: SaveData = {
    ...save,
    bestScore: { ...save.bestScore, [r.difficulty]: Math.max(bestBefore, r.runScore) },
    bestCombo: Math.max(save.bestCombo, r.maxCombo),
    clearedStage: Math.max(save.clearedStage, r.clearedStage),
    unlocked: [...save.unlocked],
    meta: { ...save.meta },
  };
  return { save: next, bestBefore, newRecord };
}
