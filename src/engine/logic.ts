// 条件評価・NPC行動・イベント抽出・移動。UI描画からは完全に分離。
import { EVENTS, FINALES, TELLS } from '../data';
import { DEDUCTIONS, FACT_LIST, THREADS } from '../data/facts';
import { LOCATIONS, NPCS, baseTravel } from '../data/world';
import { hasFlag, knows, learn, recCount } from './state';
import type { Cond, GameEvent, GameState, LocId, Node, NpcId } from './types';

export function ok(s: GameState, c?: Cond): boolean {
  if (!c) return true;
  if (c.any && !c.any.some((x) => ok(s, x))) return false;
  if (c.at && s.loc !== c.at) return false;
  if (c.t && (s.time < c.t[0] || s.time > c.t[1])) return false;
  if (c.loop && (s.loop < c.loop[0] || (c.loop[1] !== undefined && s.loop > c.loop[1]))) return false;
  if (c.has && !c.has.every((f) => knows(s, f))) return false;
  if (c.not && c.not.some((f) => knows(s, f))) return false;
  if (c.flag && !c.flag.every((f) => hasFlag(s, f))) return false;
  if (c.noFlag && c.noFlag.some((f) => hasFlag(s, f))) return false;
  if (c.done && !c.done.every((e) => (s.seen[e] ?? 0) > 0)) return false;
  if (c.notDone && c.notDone.some((e) => (s.seen[e] ?? 0) > 0)) return false;
  if (c.doneNow && !c.doneNow.every((e) => (s.seenNow[e] ?? 0) > 0)) return false;
  if (c.notDoneNow && c.notDoneNow.some((e) => (s.seenNow[e] ?? 0) > 0)) return false;
  if (c.rel) for (const [k, v] of Object.entries(c.rel)) if ((s.rel[k as NpcId] ?? 0) < (v as number)) return false;
  if (c.recs !== undefined && recCount(s) < c.recs) return false;
  if (c.since) {
    const at = s.flags[c.since[0]];
    if (at === undefined || s.time - at < c.since[1]) return false;
  }
  if (c.past && !c.past.every((f) => s.pflags[f] !== undefined && s.pflags[f] < s.loop)) return false;
  if (c.npc && where(s, c.npc) !== s.loc) return false;
  return true;
}

/** NPCの現在地（null = どこにもいない） */
export function where(s: GameState, id: NpcId): LocId | null {
  const def = NPCS.find((n) => n.id === id)!;
  for (const slot of def.schedule) {
    if (s.time >= slot.from && s.time < slot.to && ok(s, slot.cond)) return slot.loc;
  }
  return null;
}

export const presentNpcs = (s: GameState): NpcId[] =>
  NPCS.filter((n) => where(s, n.id) === s.loc).map((n) => n.id);

function eventAvailable(s: GameState, e: GameEvent): boolean {
  const once = e.once ?? 'loop';
  if (once === 'ever' && (s.seen[e.id] ?? 0) > 0) return false;
  if (once === 'loop' && (s.seenNow[e.id] ?? 0) > 0) return false;
  if (e.npc && where(s, e.npc) !== s.loc) return false;
  return ok(s, e.cond);
}

/** 今この場所で選べる行動（会話・調査） */
export function availableEvents(s: GameState): GameEvent[] {
  return EVENTS.filter((e) => e.kind !== 'auto' && eventAvailable(s, e));
}

/** 時間が経過して自動発生するイベント（最優先の1件） */
export function nextAuto(s: GameState): GameEvent | undefined {
  return EVENTS
    .filter((e) => e.kind === 'auto' && eventAvailable(s, e))
    .sort((a, b) => (a.pri ?? 5) - (b.pri ?? 5) || (a.cond.t?.[0] ?? 0) - (b.cond.t?.[0] ?? 0))[0];
}

export function markSeen(s: GameState, id: string) {
  s.seen[id] = (s.seen[id] ?? 0) + 1;
  s.seenNow[id] = (s.seenNow[id] ?? 0) + 1;
}

export function finaleFor(s: GameState) {
  return FINALES.find((f) => ok(s, f.cond))!;
}

// ───── 「誰に何を伝えたか」 ─────
export interface TellOption { npc: NpcId; fact: string; text: string; done: boolean }

export function tellOptions(s: GameState): TellOption[] {
  const out: TellOption[] = [];
  const facts = FACT_LIST.filter((f) => f.tell && (knows(s, f.id) || f.rumor));
  for (const n of presentNpcs(s)) {
    if (n === 'shiori' && s.loc !== 'shrine' && s.loc !== 'underground') continue;
    for (const f of facts) {
      out.push({ npc: n, fact: f.id, text: (f.rumor && !knows(s, f.id) ? '（噂）' : '') + f.title, done: (s.seenNow[`tell:${n}|${f.id}`] ?? 0) > 0 });
    }
  }
  return out;
}

const DEFAULT_REACT: Record<string, string> = {
  mina: 'ふうん……そうなんだ。覚えておくね。',
  kuroda: '……そうか。', saeki: 'なるほど。興味深い話だね。', yu: 'うん。……知ってるよ。',
  shiori: '……うん。', tadokoro: 'へえ、そうなんすか。', shinohara: 'ほう。それは面白い。',
  asagiri: 'ふむ……。', gen: 'そうかい、そうかい。', hanako: 'あら、そうなの。', kubo: 'あらあら。', shiina: '……それは、どこで？',
};

/** 「伝える」を実行するスクリプト。伝えた事実は永続フラグとして次の周回にも残る */
export function tellScript(s: GameState, npc: NpcId, factId: string): Node[] {
  const key = `${npc}|${factId}`;
  const specific = TELLS[key];
  const name = NPCS.find((n) => n.id === npc)!.name;
  const f = FACT_LIST.find((x) => x.id === factId)!;
  const nodes: Node[] = [
    { k: 'nar', t: `${name}に「${f.title}」のことを伝えた。` },
    { k: 'fx', fx: { flag: [`told:${key}`, `p:told:${key}`] } },
    ...(specific ?? [{ k: 'say', s: name, t: DEFAULT_REACT[npc] ?? '……そうか。' } as Node]),
  ];
  s.told[key] = s.loop;
  markSeen(s, `tell:${key}`);
  return nodes;
}

// ───── 移動 ─────
export function undergroundRoute(s: GameState): 'station' | 'shrine' | null {
  if (knows(s, 'key_basement') && knows(s, 'hatch_known') && s.time >= 17 * 60) return 'station';
  if (knows(s, 'shrine_hatch') && s.time >= 22 * 60) return 'shrine';
  return null;
}

export interface TravelOption { id: LocId; name: string; cost: number; blocked?: string }

export function travelOptions(s: GameState): TravelOption[] {
  const out: TravelOption[] = [];
  for (const l of LOCATIONS) {
    if (l.id === s.loc) continue;
    if (l.id === 'underground') {
      const route = undergroundRoute(s);
      if (!route) continue;
      out.push({ id: l.id, name: l.name, cost: baseTravel(s.loc, route) + 15 });
      continue;
    }
    if (s.loc === 'underground') { out.push({ id: l.id, name: l.name, cost: 20 + baseTravel('station', l.id) / 2 | 0 }); continue; }
    out.push({ id: l.id, name: l.name, cost: baseTravel(s.loc, l.id) });
  }
  return out;
}

// ───── 周回ごとの方針・ヒント ─────
export function currentLead(s: GameState, threadId: string): string | null {
  const th = THREADS.find((t) => t.id === threadId);
  if (!th) return null;
  for (const st of th.steps) {
    if (knows(s, st.done)) continue;
    if (!ok(s, st.req)) continue;
    return st.lead;
  }
  return null;
}

export function availableThreads(s: GameState) {
  return THREADS.map((t) => ({ id: t.id, name: t.name, lead: currentLead(s, t.id) })).filter((t) => t.lead);
}

export const hintNow = (s: GameState): string | null => {
  if (s.focus) { const l = currentLead(s, s.focus); if (l) return l; }
  return availableThreads(s)[0]?.lead ?? null;
};

// ───── 推理：2つの情報を繋げる ─────
export interface ConnectResult { result?: string; msg: string; fresh: boolean }

export function connect(s: GameState, a: string, b: string): ConnectResult {
  const d = DEDUCTIONS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!d || !knows(s, a) || !knows(s, b)) return { msg: 'この二つには、まだ繋がりが見えない。', fresh: false };
  if (knows(s, d.result)) return { result: d.result, msg: 'もう気づいている。', fresh: false };
  learn(s, d.result);
  return { result: d.result, msg: d.msg, fresh: true };
}
