import { addRel, advance, clearFlag, learn, setFlag } from './state';
import { ok } from './logic';
import type { Effect, GameState, Node, Step } from './types';

type Gen = Generator<Step, void, number | undefined>;

function* applyEffect(s: GameState, e: Effect): Gen {
  if (e.fact) for (const id of e.fact) if (learn(s, id)) yield { t: 'fact', id };
  if (e.flag) for (const f of e.flag) setFlag(s, f);
  if (e.unflag) for (const f of e.unflag) clearFlag(s, f);
  if (e.rel) addRel(s, e.rel[0], e.rel[1]);
  if (e.time) advance(s, e.time);
  if (e.goto) s.loc = e.goto;
  if (e.vis) yield { t: 'vis', v: e.vis };
  if (e.sfx) yield { t: 'sfx', id: e.sfx };
  if (e.end) {
    s.over = e.end;
    if (!s.endings.includes(e.end)) s.endings.push(e.end);
    yield { t: 'end', id: e.end };
  }
}

/** シナリオを1ステップずつ進めるジェネレータ。UIは Step を表示し、choice には選択番号を返す */
export function* run(s: GameState, nodes: Node[]): Gen {
  for (const n of nodes) {
    switch (n.k) {
      case 'say': yield { t: 'say', s: n.s, text: n.t }; break;
      case 'nar': yield { t: 'nar', text: n.t }; break;
      case 'fx': yield* applyEffect(s, n.fx); break;
      case 'if': yield* run(s, ok(s, n.c) ? n.then : n.else ?? []); break;
      case 'choice': {
        const shown = n.opts.filter((o) => !o.show || ok(s, o.show));
        if (shown.length === 0) break;
        const idx = yield { t: 'choice', opts: shown.map((o) => o.t) };
        yield* run(s, shown[Math.min(Math.max(idx ?? 0, 0), shown.length - 1)].then);
        break;
      }
    }
  }
}

/** テスト用：同期的に最後まで実行（選択は choices を順に消費） */
export function runAll(s: GameState, nodes: Node[], choices: number[] = []): Step[] {
  const out: Step[] = [];
  const g = run(s, nodes);
  let r = g.next();
  let ci = 0;
  while (!r.done) {
    out.push(r.value);
    r = g.next(r.value.t === 'choice' ? choices[ci++] ?? 0 : undefined);
  }
  return out;
}
