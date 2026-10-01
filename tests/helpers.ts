import { EVENTS } from '../src/data';
import { availableEvents } from '../src/engine/logic';
import { markSeen } from '../src/engine/logic';
import { runAll } from '../src/engine/runner';
import { newState } from '../src/engine/state';
import type { GameState, LocId, Step } from '../src/engine/types';

export function at(loc: LocId, h: number, m = 0, patch: Partial<GameState> = {}): GameState {
  const s = newState();
  s.loc = loc;
  s.time = h * 60 + m;
  return Object.assign(s, patch);
}

export const know = (s: GameState, ...ids: string[]) => { for (const i of ids) s.facts[i] = 1; return s; };

export function play(s: GameState, id: string, choices: number[] = []): Step[] {
  const ev = EVENTS.find((e) => e.id === id)!;
  if (!availableEvents(s).includes(ev) && ev.kind !== 'auto') throw new Error(`event not available: ${id}`);
  markSeen(s, id);
  return runAll(s, ev.script, choices);
}

export const ids = () => EVENTS.map((e) => e.id);
