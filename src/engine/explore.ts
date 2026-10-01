// 歩き回り探索のためのロジック（UI非依存）：出口・調査ポイント・話しかけ可能な相手
import { EVENTS } from '../data';
import { STEALTH_IDS } from '../data/stealth';
import { availableEvents, undergroundRoute } from './logic';
import type { GameEvent, GameState, LocId, NpcId } from './types';

export const BOUNDS = { x0: 12, x1: 308, y0: 128, y1: 172 };

/** 画面の左端・右端から出られる隣の場所 */
export const EXITS: Record<LocId, { L: LocId[]; R: LocId[] }> = {
  home:        { L: ['shopping', 'park'], R: [] },
  shopping:    { L: ['home', 'park'], R: ['clinic', 'station', 'school'] },
  clinic:      { L: ['shopping'], R: [] },
  station:     { L: ['shopping'], R: ['beach'] },
  park:        { L: ['home', 'shrine'], R: ['school', 'shopping'] },
  school:      { L: ['park', 'shopping'], R: ['beach'] },
  beach:       { L: ['school', 'station'], R: [] },
  shrine:      { L: [], R: ['park'] },
  underground: { L: ['station', 'shrine'], R: [] },
};

/** 調べるポイントの位置（上書き）。未指定は場所ごとに等間隔で自動配置 */
const SPOT_OVERRIDE: Record<string, number> = {
  home_storeroom: 298, home_phone: 138,
  st_tail: 150, st_warehouse: 262, st_notice: 150, st_close: 112, st_overhear: 56, st_tracks: 262, st_figure: 60,
  gen_monument: 36, asa_ema: 262, shr_follow: 296, min_follow: 296,
};

const lookByLoc = new Map<LocId, GameEvent[]>();
for (const e of EVENTS) {
  if (e.kind !== 'look' || !e.cond.at) continue;
  const l = lookByLoc.get(e.cond.at) ?? [];
  l.push(e);
  lookByLoc.set(e.cond.at, l);
}

export function spotX(e: GameEvent): number {
  if (SPOT_OVERRIDE[e.id] !== undefined) return SPOT_OVERRIDE[e.id];
  const list = lookByLoc.get(e.cond.at!)!.filter((x) => SPOT_OVERRIDE[x.id] === undefined);
  const i = list.indexOf(e);
  return list.length === 1 ? 160 : Math.round(50 + (i * 220) / (list.length - 1));
}

export interface Spot {
  key: string;
  kind: 'look' | 'stealth' | 'entrance';
  x: number;
  label: string;
  cost: number;
  event?: GameEvent;
  to?: LocId;
}

/** 今この場所で調べられるポイント */
export function spots(s: GameState, avail: GameEvent[] = availableEvents(s)): Spot[] {
  const out: Spot[] = avail.filter((e) => e.kind === 'look')
    .map((e) => ({ key: e.id, kind: (STEALTH_IDS.has(e.id) ? 'stealth' : 'look') as 'look' | 'stealth', x: spotX(e), label: e.label, cost: e.cost, event: e }));
  const route = undergroundRoute(s);
  if (route && s.loc === route) {
    out.push({ key: 'entrance', kind: 'entrance', x: route === 'station' ? 262 : 176, to: 'underground', cost: 15,
      label: route === 'station' ? '倉庫の床の扉を開ける（地下へ）' : '石の扉をくぐる（地下へ）' });
  }
  return out;
}

/** 話しかけられる相手ごとの会話イベント */
export function talkEvents(s: GameState, avail: GameEvent[] = availableEvents(s)): Map<NpcId, GameEvent[]> {
  const m = new Map<NpcId, GameEvent[]>();
  for (const e of avail) if (e.kind === 'talk' && e.npc) m.set(e.npc, [...(m.get(e.npc) ?? []), e]);
  return m;
}

export const clampX = (x: number) => Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, x));
export const clampY = (y: number) => Math.min(BOUNDS.y1, Math.max(BOUNDS.y0, y));

/** 時間の流れ（現実の秒 / ゲーム内1分）。0 = 止める（行動した時だけ進む） */
export const TIME_SPEEDS = [
  { id: 'stop', name: '止める', sec: 0 },
  { id: 'slow', name: 'ゆっくり', sec: 3.0 },
  { id: 'normal', name: 'ふつう', sec: 2.0 },
  { id: 'fast', name: 'はやい', sec: 1.0 },
] as const;
