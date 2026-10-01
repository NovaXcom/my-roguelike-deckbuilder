// 1日の進行（行動→時間経過→自動イベント→23:59）。UIとテストで共用する。
import { finaleFor, markSeen, nextAuto, tellScript, travelOptions } from './logic';
import { run } from './runner';
import { advance, dayOver } from './state';
import type { StealthDef } from './stealth';
import type { GameEvent, GameState, LocId, NpcId, Step } from './types';

export type Gen = Generator<Step, void, number | undefined>;

/** 時刻が進んだ後の処理：自動イベントを時刻順に消化し、23:59なら最終局面へ */
export function* processTime(s: GameState): Gen {
  for (let guard = 0; guard < 20; guard++) {
    const a = nextAuto(s);
    if (!a) break;
    markSeen(s, a.id);
    yield { t: 'auto', id: a.id };
    yield* run(s, a.script);
    advance(s, a.cost);
    if (s.over) return;
  }
  if (dayOver(s) && !s.over) {
    const f = finaleFor(s);
    yield { t: 'finale', id: f.id };
    yield* run(s, f.script);
    if (!s.over) yield { t: 'dayend' };
  }
}

export function* playEvent(s: GameState, ev: GameEvent): Gen {
  markSeen(s, ev.id);
  yield* run(s, ev.script);
  advance(s, ev.cost);
  yield* processTime(s);
}

export function* travelTo(s: GameState, to: LocId): Gen {
  const opt = travelOptions(s).find((o) => o.id === to);
  if (!opt) return;
  advance(s, opt.cost);
  s.loc = to;
  yield { t: 'move', to };
  yield* processTime(s);
}

export function* waitMinutes(s: GameState, minutes: number): Gen {
  advance(s, minutes);
  yield* processTime(s);
}

export function* tellTo(s: GameState, npc: NpcId, fact: string): Gen {
  yield* run(s, tellScript(s, npc, fact));
  advance(s, 10);
  yield* processTime(s);
}

export const startDay = (s: GameState): Gen => processTime(s);

/** 追跡・隠れるに失敗した時（取り返しのつかない失敗ではない：少し時間を失うだけ） */
export function* stealthFail(s: GameState, def: StealthDef, why: 'caught' | 'lost'): Gen {
  yield* run(s, why === 'caught' ? def.caught : def.lost);
  advance(s, def.failCost);
  yield* processTime(s);
}
