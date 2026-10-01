import { DifficultyId, isDifficulty } from './Difficulty';
import { HERO_IDS, HeroId, META_IDS, MetaLevels, metaLevel } from './Meta';

export interface SaveData {
  coins: number;
  meta: MetaLevels;
  heroes: HeroId[];
  hero: HeroId;
  difficulty: DifficultyId;
  bestTime: number;
  bestKills: number;
  bestLevel: number;
  wins: number;
  runs: number;
  settings: { muted: boolean; lowFx: boolean };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const SAVE_KEY = 'break-rush-3d-save-v1';

export function emptySave(): SaveData {
  return { coins: 0, meta: {}, heroes: ['blaze'], hero: 'blaze', difficulty: 'normal', bestTime: 0, bestKills: 0, bestLevel: 0, wins: 0, runs: 0, settings: { muted: false, lowFx: false } };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Turns anything read from storage into valid SaveData. Bad fields fall back to defaults. */
export function sanitizeSave(raw: unknown): SaveData {
  const s = emptySave();
  if (typeof raw !== 'object' || raw === null) return s;
  const d = raw as Record<string, unknown>;
  s.coins = num(d.coins);
  s.bestTime = num(d.bestTime);
  s.bestKills = num(d.bestKills);
  s.bestLevel = num(d.bestLevel);
  s.wins = num(d.wins);
  s.runs = num(d.runs);
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  for (const id of META_IDS) {
    const lv = metaLevel({ [id]: Number(meta[id]) }, id);
    if (lv > 0) s.meta[id] = lv;
  }
  if (Array.isArray(d.heroes)) s.heroes = [...new Set(['blaze' as HeroId, ...d.heroes.filter((h): h is HeroId => HERO_IDS.includes(h as HeroId))])];
  if (HERO_IDS.includes(d.hero as HeroId) && s.heroes.includes(d.hero as HeroId)) s.hero = d.hero as HeroId;
  if (isDifficulty(d.difficulty)) s.difficulty = d.difficulty;
  const st = (d.settings ?? {}) as Record<string, unknown>;
  s.settings.muted = st.muted === true;
  s.settings.lowFx = st.lowFx === true;
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
  timeSec: number;
  kills: number;
  level: number;
  victory: boolean;
}

/** Folds a finished run into the save (bests, run count). Returns which records were beaten. */
export function recordRun(save: SaveData, r: RunRecord): { save: SaveData; newBestTime: boolean; newBestKills: boolean } {
  const next: SaveData = { ...save, meta: { ...save.meta }, heroes: [...save.heroes], settings: { ...save.settings } };
  const newBestTime = r.timeSec > save.bestTime;
  const newBestKills = r.kills > save.bestKills;
  next.bestTime = Math.max(save.bestTime, Math.floor(r.timeSec));
  next.bestKills = Math.max(save.bestKills, r.kills);
  next.bestLevel = Math.max(save.bestLevel, r.level);
  next.runs = save.runs + 1;
  next.wins = save.wins + (r.victory ? 1 : 0);
  return { save: next, newBestTime, newBestKills };
}
