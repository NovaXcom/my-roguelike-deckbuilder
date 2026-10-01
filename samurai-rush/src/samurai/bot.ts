import { Cmd, Enemy, World } from './World';

/** A decent player for tests: parries blue attacks, jumps/dashes red ones, cuts arrows, dashes through crowds. */
export function botCommand(w: World, mode: 'smart' | 'masher' | 'idle' = 'smart'): Partial<Cmd> {
  if (mode === 'idle' || w.ko) return {};
  const p = w.p;
  const cmd: Partial<Cmd> = {};
  let near: Enemy | null = null;
  let nd = Infinity;
  for (const e of w.enemies) {
    if (e.state === 'dead' || e.state === 'enter') continue;
    const d = Math.abs(e.x - p.x);
    if (d < nd) { nd = d; near = e; }
  }
  const dirTo = (x: number) => (x >= p.x ? 1 : -1);

  if (mode === 'smart') {
    for (const e of w.enemies) {
      if (e.state !== 'wind' || !e.atk) continue;
      const left = e.atk.wind - e.t;
      const d = Math.abs(e.x - p.x);
      if (e.atk.proj) continue;
      if (e.atk.icon === 'blue' && d < e.atk.reach + 1.2 && left < 0.15 && left > -0.02 && p.state !== 'parry') return { ...cmd, parry: true, moveX: 0 };
      if (e.atk.icon === 'red' && left < 0.22) {
        const near2 = e.atk.aoe ? d < e.atk.aoe + 1 : d < e.atk.reach + 1.5;
        if (near2) {
          if (e.atk.aoe) return { ...cmd, jump: p.onGround, jumpHeld: true, moveX: dirTo(p.x - e.x) };
          if (p.pips >= 1) return { ...cmd, dash: true, moveX: dirTo(e.x) };
          return { ...cmd, jump: p.onGround, jumpHeld: true };
        }
      }
    }
    for (const q of w.projectiles) {
      if (q.owner !== 'enemy') continue;
      const d = q.x - p.x;
      if (Math.abs(d) < 3.2 && Math.sign(q.vx) !== Math.sign(d)) {
        if (q.y > p.y + 0.2 && q.y < p.y + 1.7) return { ...cmd, slash: true, moveX: Math.sign(d) };
      }
    }
    const crowd = w.enemies.filter((e) => e.state !== 'dead' && e.state !== 'enter' && Math.abs(e.x - p.x) < 11 && Math.sign(e.x - p.x) === p.face);
    if (p.pips >= 2 && crowd.length >= 5) return { ...cmd, iai: true };
    if (p.pips >= 1.2 && crowd.length >= 3 && p.dashCd <= 0) return { ...cmd, dash: true, moveX: p.face };
  }
  if (!near) {
    // nothing here: run on to the right
    return { ...cmd, moveX: 1 };
  }
  const dx = near.x - p.x;
  if (nd < 3.3) return { ...cmd, slash: true, moveX: Math.sign(dx), moveY: near.y > 1.5 ? 1 : 0 };
  return { ...cmd, moveX: Math.sign(dx) };
}
