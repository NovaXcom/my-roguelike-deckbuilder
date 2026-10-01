import { DAY_START } from '../data/world';
import { WHISPERS } from '../data/facts';
import type { GameState } from './types';

export function newState(): GameState {
  return {
    loop: 1, time: DAY_START, loc: 'home',
    flags: {}, pflags: {}, facts: {}, newFacts: [],
    seen: {}, seenNow: {}, rel: {}, told: {},
    endings: [], focus: null, over: null,
  };
}

export const hasFlag = (s: GameState, name: string) =>
  name.startsWith('p:') ? s.pflags[name] !== undefined : s.flags[name] !== undefined;

export function setFlag(s: GameState, name: string) {
  if (name.startsWith('p:')) { if (s.pflags[name] === undefined) s.pflags[name] = s.loop; }
  else if (s.flags[name] === undefined) s.flags[name] = s.time;
}

export function clearFlag(s: GameState, name: string) {
  if (name.startsWith('p:')) delete s.pflags[name]; else delete s.flags[name];
}

/** 新しく知ったら true */
export function learn(s: GameState, id: string): boolean {
  if (s.facts[id] !== undefined) return false;
  s.facts[id] = s.loop;
  s.newFacts.push(id);
  return true;
}

export const knows = (s: GameState, id: string) => s.facts[id] !== undefined;
export const recCount = (s: GameState) => Object.keys(s.facts).filter((k) => k.startsWith('rec_')).length;

export function addRel(s: GameState, npc: keyof GameState['rel'], n: number) {
  s.rel[npc] = Math.max(0, (s.rel[npc] ?? 0) + n);
}

export const DAY_LAST_MINUTE = 23 * 60 + 59;
export function advance(s: GameState, minutes: number) {
  s.time = Math.min(DAY_LAST_MINUTE, s.time + Math.max(0, minutes));
}
export const dayOver = (s: GameState) => s.time >= DAY_LAST_MINUTE;

export interface LoopSummary { learned: string[]; whisper?: string }

/** 1日の終わり。何も得られなかった周回には「少女の囁き」を必ず与える（無駄な周回を作らない） */
export function nextLoop(s: GameState): LoopSummary {
  let whisper: string | undefined;
  if (s.newFacts.length === 0) {
    whisper = WHISPERS.find((w) => s.facts[w] === undefined);
    if (whisper) learn(s, whisper);
  }
  const learned = [...s.newFacts];
  s.loop += 1;
  s.time = DAY_START;
  s.loc = 'home';
  s.flags = {};
  s.seenNow = {};
  s.newFacts = [];
  s.focus = null;
  return { learned, whisper };
}

export function serialize(s: GameState): string { return JSON.stringify(s); }
export function deserialize(json: string): GameState | null {
  try {
    const o = JSON.parse(json);
    if (typeof o?.loop !== 'number' || typeof o?.facts !== 'object') return null;
    return { ...newState(), ...o };
  } catch { return null; }
}
