import { Enemy, PlayerCmd, World } from './World';

/** A simple but sensible player: counters blue attacks, dodges red ones and bullets, otherwise punches the nearest enemy. */
const stuck = new WeakMap<World, { x: number; z: number; n: number; side: number }>();

export function botCommand(w: World, mode: 'smart' | 'masher' | 'idle' = 'smart'): Partial<PlayerCmd> {
  if (mode === 'idle') return {};
  const p = w.player;
  if (w.status === 'perk' && w.perkChoices.length) w.choosePerk(w.perkChoices[0]);
  let near: Enemy | null = null;
  let nd = Infinity;
  for (const e of w.enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < nd) { nd = d; near = e; }
  }
  const cmd: Partial<PlayerCmd> = {};
  if (mode === 'smart') {
    for (const e of w.enemies) {
      if (e.state !== 'wind' || !e.atk) continue;
      const left = e.atk.wind - e.t;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.atk.ranged) continue;
      if (d > e.atk.range + e.atk.lunge + 0.8) continue;
      if (e.atk.icon === 'red' && left < 0.3) return { dodge: true, moveX: -Math.sign(e.x - p.x) || 1, moveZ: (e.z - p.z) > 0 ? -1 : 1 };
      if (e.atk.icon === 'blue' && left < 0.13 && left > 0 && p.state !== 'guard') return { counter: true };
    }
    for (const b of w.bullets) {
      if (b.reflected) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 4.5 && p.dodgeCd <= 0) return { dodge: true, moveZ: b.vz >= 0 ? -1 : 1 };
    }
    // step out of a gunman's aim line while it winds up
    for (const e of w.enemies) if (e.kind === 'gunman' && e.state === 'wind' && e.t > 0.5) return { moveZ: p.z > e.aimZ ? 1 : -1 };
  }
  if (mode === 'smart') {
    for (const e of w.enemies) {
      if (e.state === 'down' && e.hp <= e.maxHp * 0.4 && Math.hypot(e.x - p.x, e.z - p.z) < 2.2) return { ...cmd, heavy: true };
    }
    if (near && near.kind === 'shield' && nd < 2.3 && near.state !== 'hit' && w.shieldBlocks(near, p.x, p.z)) return { ...cmd, grab: true };
  }
  if (near) {
    const dx = near.x - p.x, dz = near.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    if (nd < 2.3) return { ...cmd, light: true, moveX: dx / l, moveZ: dz / l };
    // walk round obstacles: if we are not getting anywhere, slide sideways for a while
    let st = stuck.get(w);
    if (!st) { st = { x: p.x, z: p.z, n: 0, side: 1 }; stuck.set(w, st); }
    if (Math.hypot(p.x - st.x, p.z - st.z) < 0.02) st.n++; else st.n = 0;
    st.x = p.x; st.z = p.z;
    if (st.n > 20) { if (st.n === 21) st.side = Math.random() < 0.5 ? 1 : -1; return { ...cmd, moveX: dx / l * 0.3, moveZ: st.side }; }
    return { ...cmd, moveX: dx / l, moveZ: dz / l };
  }
  return cmd;
}

