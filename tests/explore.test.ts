import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data';
import { LOCATIONS } from '../src/data/world';
import { BOUNDS, EXITS, spotX, spots, talkEvents } from '../src/engine/explore';
import { at, know } from './helpers';

describe('探索マップ', () => {
  it('出口は相互に行き来でき、全ての場所に歩いてたどり着ける', () => {
    for (const [from, e] of Object.entries(EXITS)) {
      for (const to of [...e.L, ...e.R]) {
        if (from === 'underground' || to === 'underground') continue;
        expect([...EXITS[to as keyof typeof EXITS].L, ...EXITS[to as keyof typeof EXITS].R], `${to}→${from}`).toContain(from);
      }
    }
    const seen = new Set(['home']); const q = ['home'];
    while (q.length) { const c = q.pop()! as keyof typeof EXITS; for (const n of [...EXITS[c].L, ...EXITS[c].R]) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    for (const l of LOCATIONS) if (l.id !== 'underground') expect(seen.has(l.id), l.id).toBe(true); // 地下は入口(扉)から
  });
  it('調べるイベントは全て場所を持ち、画面内に重ならず配置される', () => {
    const look = EVENTS.filter((e) => e.kind === 'look');
    for (const e of look) expect(e.cond.at, e.id).toBeDefined();
    for (const l of LOCATIONS) {
      const xs = look.filter((e) => e.cond.at === l.id).map(spotX).sort((a, b) => a - b);
      xs.forEach((x) => { expect(x).toBeGreaterThanOrEqual(BOUNDS.x0); expect(x).toBeLessThanOrEqual(BOUNDS.x1); });
    }
  });
  it('同時に利用可能な調査ポイントは近接しすぎない（誤操作防止）', () => {
    for (const l of LOCATIONS) for (const t of [9 * 60, 15 * 60, 20 * 60]) {
      const s = at(l.id, 0, t); s.loop = 4;
      know(s, 'station_3pm', 'warehouse_empty', 'saeki_empty_patient', 'door_code', 'capsules', 'has_all');
      const xs = spots(s).map((p) => p.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `${l.id}@${t}`).toBeGreaterThanOrEqual(24);
    }
  });
  it('「15時に駅が閉まる」は、時間内に駅の定位置へ行けば調べられる', () => {
    const s = at('station', 14, 52);
    expect(spots(s).map((p) => p.key)).toContain('st_close');
    s.time = 16 * 60;
    expect(spots(s).map((p) => p.key)).not.toContain('st_close');
  });
  it('地下への入口は、鍵と隠し扉を知る17時以降の駅に現れる', () => {
    const s = at('station', 17, 30); know(s, 'key_basement', 'hatch_known');
    expect(spots(s).some((p) => p.kind === 'entrance')).toBe(true);
    s.loc = 'park';
    expect(spots(s).some((p) => p.kind === 'entrance')).toBe(false);
  });
  it('話しかけられる相手は、その場にいる人だけ', () => {
    const s = at('park', 12, 0);
    expect([...talkEvents(s).keys()]).toEqual(['yu']);
  });
});
