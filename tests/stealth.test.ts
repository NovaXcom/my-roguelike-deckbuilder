import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data';
import { STEALTH } from '../src/data/stealth';
import { BOUNDS } from '../src/engine/explore';
import { STEALTH_SPEED, createStealth, inSpot, stepStealth, type StealthDef, type StealthState } from '../src/engine/stealth';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** 賢い操作：振り返りの前に物陰へ入って立ち止まり、対象の後ろを一定距離で付いていく */
function smart(def: StealthDef, st: StealthState, hx: number): { dx: number; stop: boolean } {
  const danger = st.warn || st.glancing > 0 || st.alert > 0.1; // 「？」が出たら物陰へ
  const nearSpot = def.spots.filter((s) => Math.abs(s.x - hx) < 50).sort((a, b) => Math.abs(a.x - hx) - Math.abs(b.x - hx))[0];
  if (inSpot(def, hx) && danger) return { dx: 0, stop: true };
  if (!inSpot(def, hx) && danger && nearSpot) return { dx: Math.sign(nearSpot.x - hx), stop: false };
  const desired = def.goal ? def.goal.x : st.x - st.dir * 50;
  const toward = Math.sign(desired - hx);
  const dist = Math.abs(st.x - hx);
  // 対象を追い越さない（手前で待つ）
  if ((st.x - hx) * toward > 0 && dist < 26) return { dx: 0, stop: true };
  if (def.mode === 'tail' && dist < def.tail!.min + 6) return { dx: 0, stop: true };
  if (Math.abs(desired - hx) < 2) return { dx: 0, stop: true };
  return { dx: toward, stop: false };
}

function simulate(def: StealthDef, policy: 'smart' | 'naive', fails = 0, seed = 7) {
  const st = createStealth(def, fails, seeded(seed));
  let hx = def.start;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 90 && st.status === 'run'; i++) {
    let dx: number, moving: boolean;
    if (policy === 'smart') { const a = smart(def, st, hx); dx = a.dx; moving = !a.stop && dx !== 0; }
    else { const gx = def.goal?.x ?? st.x - st.dir * 40; dx = Math.sign(gx - hx); moving = Math.abs(gx - hx) > 2; }
    if (moving) hx = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, hx + dx * STEALTH_SPEED * dt));
    stepStealth(st, dt, { x: hx, moving });
  }
  return st.status;
}

describe('追跡・隠れる', () => {
  it('定義：成功時に実行するイベントが実在し、場所が一致し、座標が画面内にある', () => {
    for (const d of STEALTH) {
      const ev = EVENTS.find((e) => e.id === d.id);
      expect(ev, d.id).toBeDefined();
      expect(ev!.cond.at, d.id).toBe(d.loc);
      for (const p of d.path) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(320); }
      expect(d.mode === 'hide' ? !!d.goal : !!d.tail, d.id).toBe(true);
      expect(d.spots.length).toBeGreaterThan(0);
    }
  });
  it('物陰で立ち止まらずに近づくと見つかる（隠れる操作に意味がある）', () => {
    for (const d of STEALTH.filter((x) => x.mode === 'hide')) {
      const results = [1, 2, 3, 4, 5].map((s) => simulate(d, 'naive', 0, s));
      expect(results.filter((r) => r === 'caught').length, d.id).toBeGreaterThanOrEqual(3);
    }
  });
  it('物陰を使えば全ての場面で成功できる（複数の乱数で）', () => {
    for (const d of STEALTH) for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(simulate(d, 'smart', 0, seed), `${d.id} seed${seed}`).toBe('success');
    }
  });
  it('失敗を重ねるほど判定が甘くなる', () => {
    expect(createStealth(STEALTH[0], 0).ease).toBe(1);
    expect(createStealth(STEALTH[0], 2).ease).toBeLessThan(1);
    expect(createStealth(STEALTH[0], 20).ease).toBe(0.55);
  });
  it('立ち止まって物陰にいる間は、隠れていると判定される（動くと隠れられない）', () => {
    const d = STEALTH[0], st = createStealth(d, 0, seeded());
    stepStealth(st, 0.1, { x: d.spots[0].x, moving: false });
    expect(st.hidden).toBe(true);
    stepStealth(st, 0.1, { x: d.spots[0].x, moving: true });
    expect(st.hidden).toBe(false);
    stepStealth(st, 0.1, { x: 5, moving: false });
    expect(st.hidden).toBe(false);
  });
  it('尾行：離れすぎると見失う', () => {
    const d = STEALTH.find((x) => x.mode === 'tail')!, st = createStealth(d, 0, seeded());
    for (let i = 0; i < 30 * 8 && st.status === 'run'; i++) stepStealth(st, 1 / 30, { x: 12, moving: false });
    expect(st.status).toBe('lost');
  });
  it('対象は予告（warn）の後に振り返る', () => {
    const d = STEALTH[0], st = createStealth(d, 0, seeded());
    let sawWarn = false, sawGlance = false;
    for (let i = 0; i < 30 * 12; i++) {
      stepStealth(st, 1 / 30, { x: d.spots[0].x, moving: false });
      if (st.warn) sawWarn = true;
      if (st.glancing > 0) { expect(sawWarn).toBe(true); sawGlance = true; break; }
    }
    expect(sawGlance).toBe(true);
  });
});
