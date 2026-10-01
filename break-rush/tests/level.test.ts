import { describe, expect, it } from 'vitest';
import { AutoPilot } from '../src/game/AutoPilot';
import { generateLevel, Level } from '../src/level/Generator';
import { Controller } from '../src/physics/Controller';
import { Crumbler } from '../src/physics/Crumbler';

function fly(level: Level, maxT = 240) {
  const c = new Controller(level.boxes);
  c.reset(level.start.x, level.start.y + 0.001, level.start.z, 0);
  const ap = new AutoPilot(level.route);
  const cr = new Crumbler();
  const dt = 1 / 120;
  let t = 0;
  let prevJ = false;
  let prevD = false;
  let death: string | null = null;
  let maxIndex = 0;
  while (t < maxT) {
    const raw = ap.input(c);
    const inp = { ...raw, jumpPressed: raw.jumpPressed && !prevJ || raw.jumpPressed, dashPressed: raw.dashPressed && !prevD || raw.dashPressed };
    prevJ = raw.jumpPressed;
    prevD = raw.dashPressed;
    const ev = c.step(dt, inp);
    cr.update(dt, c.groundBox);
    t += dt;
    maxIndex = Math.max(maxIndex, ap.index);
    if (ev.fell) { death = `fell at x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} wp=${ap.index}/${JSON.stringify(level.route[ap.index])}`; break; }
    if (ev.hitHazard) { death = `hazard at x=${c.x.toFixed(1)}`; break; }
    if (Math.abs(c.x - level.finish.x) < 1.5 && c.onGround) return { ok: true, t, death: null, x: c.x };
  }
  return { ok: false, t, death: death ?? `timeout x=${c.x.toFixed(1)} wp=${maxIndex}/${JSON.stringify(level.route[maxIndex])} state=${c.state}`, x: c.x };
}

describe('level generator', () => {
  it('is deterministic per seed', () => {
    const a = generateLevel(5, { stage: 2 });
    const b = generateLevel(5, { stage: 2 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(generateLevel(6, { stage: 2 }))).not.toBe(JSON.stringify(a));
  });

  it('has checkpoints and a finish further along than the start', () => {
    const l = generateLevel(1, { stage: 3 });
    expect(l.checkpoints.length).toBeGreaterThan(1);
    expect(l.finish.x).toBeGreaterThan(80);
    expect(l.parTime).toBeGreaterThan(10);
  });

  it('uses every module kind somewhere across stages', () => {
    const seen = new Set<string>();
    for (let st = 1; st <= 5; st++) for (let sd = 1; sd <= 30; sd++) generateLevel(sd, { stage: st }).modules.forEach((m) => seen.add(m));
    for (const m of ['run', 'gap', 'dashgap', 'climb', 'slide', 'wallrun', 'pillars', 'laser', 'highlaser', 'arena', 'drop', 'pad', 'crumble']) expect(seen.has(m)).toBe(true);
  });

  it('arenas lock their exit while enemies are listed', () => {
    const l = generateLevel(3, { stage: 4 });
    expect(l.arenas.length).toBeGreaterThan(0);
    for (const a of l.arenas) {
      expect(l.boxes[a.gate].tag).toBe('gate');
      expect(a.ids.length).toBeGreaterThan(0);
      for (const id of a.ids) expect(l.enemies[id]).toBeDefined();
    }
  });

  for (const stage of [1, 2, 3, 4, 5]) {
    it(`every module is completable by following the route (stage ${stage}, 40 seeds)`, () => {
      const fails: string[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        const level = generateLevel(seed, { stage, enemies: false });
        const r = fly(level);
        if (!r.ok) fails.push(`seed ${seed} [${level.modules.join(',')}]: ${r.death}`);
      }
      expect(fails).toEqual([]);
    });
  }
});
