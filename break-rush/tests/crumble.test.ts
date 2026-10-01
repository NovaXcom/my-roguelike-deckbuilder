import { describe, expect, it } from 'vitest';
import { Box, Controller } from '../src/physics/Controller';
import { Crumbler } from '../src/physics/Crumbler';
import { MOVE } from '../src/physics/config';

describe('Crumbler', () => {
  it('drops a tile after the delay, but not if you keep running over it', () => {
    const tile: Box = { minX: 0, maxX: 3, minY: -2, maxY: 0, minZ: -3, maxZ: 3, crumble: true };
    const solid: Box = { minX: -20, maxX: 0, minY: -2, maxY: 0, minZ: -3, maxZ: 3 };
    const after: Box = { minX: 3, maxX: 40, minY: -2, maxY: 0, minZ: -3, maxZ: 3 };
    const c = new Controller([solid, tile, after]);
    const cr = new Crumbler();
    c.reset(-10, 0.001, 0, 0);
    for (let i = 0; i < 120 * 4; i++) {
      c.step(1 / 120, { moveX: 1, moveZ: 0, jumpPressed: false, jumpHeld: false, slideHeld: false, dashPressed: false });
      cr.update(1 / 120, c.groundBox);
    }
    expect(c.x).toBeGreaterThan(20);
    expect(c.y).toBeCloseTo(0, 1);
    // standing still on it makes it fall
    const t2: Box = { ...tile };
    const d = new Controller([solid, t2]);
    const cr2 = new Crumbler();
    d.reset(1.5, 0.001, 0, 0);
    for (let i = 0; i < 120 * (MOVE.crumbleDelay + 0.3); i++) {
      d.step(1 / 120, { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, slideHeld: false, dashPressed: false });
      cr2.update(1 / 120, d.groundBox);
    }
    expect(t2.ghost).toBe(true);
    expect(d.y).toBeLessThan(0);
    cr2.reset([t2]);
    expect(t2.ghost).toBe(false);
  });
});
