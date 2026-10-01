// シナリオ記述用の短縮ヘルパー
import type { Cond, Effect, Node, NpcId } from './types';

export const hm = (h: number, m = 0) => h * 60 + m;

type Item = string | [string, string] | Node;

/** 文字列=地の文, [話者, 台詞]=会話, それ以外はNodeそのまま */
export function sc(...items: Item[]): Node[] {
  return items.map((it): Node => {
    if (typeof it === 'string') return { k: 'nar', t: it };
    if (Array.isArray(it)) return it[0] === '' ? { k: 'nar', t: it[1] } : { k: 'say', s: it[0], t: it[1] };
    return it;
  });
}

export const fx = (e: Effect): Node => ({ k: 'fx', fx: e });
export const fact = (...ids: string[]): Node => fx({ fact: ids });
export const flag = (...ids: string[]): Node => fx({ flag: ids });
export const rel = (npc: NpcId, n = 1): Node => fx({ rel: [npc, n] });
export const vis = (v: NonNullable<Effect['vis']>): Node => fx({ vis: v });
export const sfx = (id: string): Node => fx({ sfx: id });
export const time = (n: number): Node => fx({ time: n });
export const ifc = (c: Cond, then: Node[], els?: Node[]): Node => ({ k: 'if', c, then, else: els });
export const choice = (...opts: { t: string; show?: Cond; then: Node[] }[]): Node => ({ k: 'choice', opts });
export const opt = (t: string, then: Node[], show?: Cond) => ({ t, then, show });
