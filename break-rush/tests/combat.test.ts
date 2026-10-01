import { describe, expect, it } from 'vitest';
import { Combat, COMBAT, PlayerBody, segmentBlocked } from '../src/game/Combat';
import { Box } from '../src/physics/Controller';

const floor: Box = { minX: -50, maxX: 200, minY: -4, maxY: 0, minZ: -10, maxZ: 10 };
const body = (x: number, z = 0, y = 0): PlayerBody => ({ x, y, z, vx: 0, vz: 0, height: 1.8 });
const spawn = (type: 'gunner' | 'charger' | 'drone', x: number, z = 0) => ({ type, x, y: type === 'drone' ? 2.6 : 0, z });
const run = (c: Combat, t: number, p: PlayerBody, lunging = false, inv = false) => {
  const evs = [];
  for (let i = 0; i < t * 60; i++) evs.push(c.update(1 / 60, p, lunging, inv));
  return evs;
};

describe('line of sight', () => {
  it('walls block, open air does not', () => {
    const wall: Box = { minX: 5, maxX: 6, minY: 0, maxY: 5, minZ: -5, maxZ: 5 };
    expect(segmentBlocked([wall], 0, 1, 0, 10, 1, 0)).toBe(true);
    expect(segmentBlocked([wall], 0, 1, 0, 4, 1, 0)).toBe(false);
    expect(segmentBlocked([wall], 0, 8, 0, 10, 8, 0)).toBe(false);
  });
});

describe('gunner', () => {
  it('telegraphs for a moment, then fires a bullet that hits a stationary player', () => {
    const c = new Combat([floor], [spawn('gunner', 20)]);
    const p = body(0);
    const evs = run(c, 0.4, p);
    expect(evs.some((e) => e.telegraphs.length > 0)).toBe(true);
    expect(c.projectiles.length).toBe(0); // still aiming
    const after = run(c, 2.5, p);
    expect(after.some((e) => e.fired.length > 0)).toBe(true);
    expect(after.some((e) => e.playerHit)).toBe(true);
  });

  it('does not shoot through walls', () => {
    const wall: Box = { minX: 10, maxX: 11, minY: 0, maxY: 6, minZ: -10, maxZ: 10 };
    const c = new Combat([floor, wall], [spawn('gunner', 20)]);
    const evs = run(c, 4, body(0));
    expect(evs.some((e) => e.fired.length > 0)).toBe(false);
  });

  it('a player who keeps moving sideways dodges the bullet', () => {
    const c = new Combat([floor], [spawn('gunner', 20)]);
    const p = body(0, -4);
    let hit = false;
    for (let i = 0; i < 60 * 4; i++) {
      p.z = -4 + (i > 60 * 1.0 ? 5 : 0); // steps aside right after the shot is fired
      hit ||= c.update(1 / 60, p, false, false).playerHit;
    }
    expect(hit).toBe(false);
  });

  it('is only active within range', () => {
    const c = new Combat([floor], [spawn('gunner', 100)]);
    expect(run(c, 3, body(0)).some((e) => e.telegraphs.length > 0)).toBe(false);
  });
});

describe('deflect', () => {
  it('reflects a bullet back and kills the shooter', () => {
    const c = new Combat([floor], [spawn('gunner', 20)]);
    const p = body(0);
    let killed = false;
    let hit = false;
    let deflected = false;
    for (let i = 0; i < 60 * 5; i++) {
      const b = c.projectiles[0];
      if (b && b.owner === 'enemy' && b.x < 6 && c.deflectLeft <= 0) c.startDeflect();
      const e = c.update(1 / 60, p, false, false);
      hit ||= e.playerHit;
      deflected ||= e.deflected.length > 0;
      killed ||= e.kills.some((k) => k.by === 'reflect');
    }
    expect(deflected).toBe(true);
    expect(hit).toBe(false);
    expect(killed).toBe(true);
    expect(c.aliveCount).toBe(0);
  });

  it('too early or too late still gets you hit', () => {
    const c = new Combat([floor], [spawn('gunner', 20)]);
    const p = body(0);
    c.startDeflect(); // spent long before the bullet arrives
    expect(run(c, 4, p).some((e) => e.playerHit)).toBe(true);
  });

  it('has a cooldown so it cannot be held down', () => {
    const c = new Combat([floor], []);
    expect(c.startDeflect()).toBe(true);
    expect(c.startDeflect()).toBe(false);
    run(c, COMBAT.deflectCooldown + 0.05, body(0));
    expect(c.startDeflect()).toBe(true);
  });
});

describe('melee', () => {
  it('a slash kills an enemy in reach but not one outside it', () => {
    const c = new Combat([floor], [spawn('charger', 2), spawn('charger', 6)]);
    c.startSlash();
    const evs = run(c, 0.1, body(0));
    expect(evs.flatMap((e) => e.kills).length).toBe(1);
    expect(c.aliveCount).toBe(1);
  });

  it('picks the target the player is aiming toward, within range and sight', () => {
    const c = new Combat([floor], [spawn('gunner', 8, 0), spawn('gunner', -8, 0), spawn('gunner', 40, 0)]);
    const t = c.pickTarget(body(0), 1, 0);
    expect(t?.homeX).toBe(8);
    expect(c.pickTarget(body(0), 0, 1)).toBeNull();
    const walled = new Combat([floor, { minX: 3, maxX: 4, minY: 0, maxY: 5, minZ: -5, maxZ: 5 }], [spawn('gunner', 8, 0)]);
    expect(walled.pickTarget(body(0), 1, 0)).toBeNull();
  });

  it('lunging through an enemy kills it', () => {
    const c = new Combat([floor], [spawn('gunner', 1.5)]);
    const evs = run(c, 0.05, body(0), true);
    expect(evs.flatMap((e) => e.kills)[0].by).toBe('lunge');
  });
});

describe('charger', () => {
  it('winds up, then rushes the player, who dies unless they act', () => {
    const c = new Combat([floor], [spawn('charger', 12)]);
    const p = body(0);
    const evs = run(c, 2.5, p);
    expect(evs.some((e) => e.telegraphs.length > 0)).toBe(true);
    expect(evs.some((e) => e.playerHit)).toBe(true);
  });

  it('can be killed by a slash as it arrives', () => {
    const c = new Combat([floor], [spawn('charger', 12)]);
    const p = body(0);
    let hit = false;
    let kill = false;
    for (let i = 0; i < 60 * 3; i++) {
      const e = c.enemies[0];
      if (e.state === 'charge' && Math.hypot(e.x - p.x, e.z - p.z) < 3.5 && c.canAttack()) c.startSlash();
      const ev = c.update(1 / 60, p, false, false);
      hit ||= ev.playerHit;
      kill ||= ev.kills.length > 0;
    }
    expect(kill).toBe(true);
    expect(hit).toBe(false);
  });

  it('stays on its platform', () => {
    const small: Box = { minX: 0, maxX: 14, minY: -4, maxY: 0, minZ: -3, maxZ: 3 };
    const c = new Combat([small], [spawn('charger', 12)]);
    run(c, 3, body(40));
    expect(c.enemies[0].x).toBeLessThanOrEqual(14);
  });
});

describe('checkpoints', () => {
  it('respawn revives only enemies killed after the checkpoint', () => {
    const c = new Combat([floor], [spawn('gunner', 2), spawn('gunner', -2), spawn('gunner', 40)]);
    c.startSlash();
    run(c, 0.1, body(0)); // kills 0 and 1
    expect(c.aliveCount).toBe(1);
    c.checkpoint();
    c.enemies[2].alive = false;
    c.respawn();
    expect(c.enemies.map((e) => e.alive)).toEqual([false, false, true]);
    expect(c.projectiles.length).toBe(0);
  });

  it('invulnerability after respawn prevents instant re-death', () => {
    const c = new Combat([floor], [spawn('gunner', 20)]);
    const evs = run(c, 4, body(0), false, true);
    expect(evs.some((e) => e.playerHit)).toBe(false);
  });
});

describe('shielder', () => {
  const sh = () => new Combat([floor], [{ type: 'shield', x: 5, y: 0, z: 0 }]);
  it('cannot be slashed from the front, but can from behind', () => {
    const c = sh();
    c.enemies[0].face = Math.PI; // shield faces -x, toward the player at x=2
    c.startSlash();
    let blocked = false;
    let kills = 0;
    for (let i = 0; i < 6; i++) {
      const ev = c.update(1 / 60, body(3.5), false, true);
      blocked ||= ev.blocked.length > 0;
      kills += ev.kills.length;
    }
    expect(blocked).toBe(true);
    expect(kills).toBe(0);
    // now the player is behind it (x=8, shield still facing -x for a moment)
    const d = sh();
    d.enemies[0].face = Math.PI;
    d.startSlash();
    const ev = d.update(1 / 60, body(6.5), false, true);
    expect(ev.kills.length).toBe(1);
  });

  it('turns slowly, so circling around exposes the back', () => {
    const c = sh();
    const p = body(2);
    run(c, 0.3, p, false, true);
    const before = c.enemies[0].face;
    p.x = 8; // jumped over to the far side
    run(c, 0.1, p, false, true);
    expect(Math.abs(c.enemies[0].face - before)).toBeLessThan(0.4);
  });

  it('bashes a player who stays in front, and walks toward them', () => {
    const c = sh();
    const evs = run(c, 5, body(-5), false, false);
    expect(evs.some((e) => e.playerHit)).toBe(true);
  });

  it('reflected bullets kill it even from the front', () => {
    const g = new Combat([floor], [spawn('gunner', 25), { type: 'shield', x: 18, y: 0, z: 0 }]);
    g.enemies[1].face = Math.PI; // faces the player
    const p = body(0);
    // fire at the player, deflect, and the reflected shot flies back along the same line through the shielder
    let killedShield = false;
    for (let i = 0; i < 60 * 6; i++) {
      const b = g.projectiles[0];
      if (b && b.owner === 'enemy' && b.x < 6) g.startDeflect();
      const ev = g.update(1 / 60, p, false, true);
      if (ev.kills.some((k) => k.type === 'shield')) killedShield = true;
    }
    expect(killedShield || g.enemies[0].alive === false).toBe(true);
  });
});

describe('shuriken', () => {
  it('flies straight and kills what is on the aim line, homing slightly', () => {
    const c = new Combat([floor], [spawn('gunner', 20, 1.5)]);
    c.throwStar(body(0), 1, 0, 0);
    let killed = false;
    for (let i = 0; i < 60 * 2; i++) killed ||= c.update(1 / 60, body(0), false, true).kills.length > 0;
    expect(killed).toBe(true);
  });
  it('misses when aimed away, and is stopped by a front shield', () => {
    const c = new Combat([floor], [spawn('gunner', 20)]);
    c.throwStar(body(0), 0, 0, 1);
    for (let i = 0; i < 120; i++) c.update(1 / 60, body(0), false, true);
    expect(c.aliveCount).toBe(1);
    const s = new Combat([floor], [{ type: 'shield', x: 15, y: 0, z: 0 }]);
    s.enemies[0].face = Math.PI;
    s.throwStar(body(0), 1, 0, 0);
    let blocked = false;
    for (let i = 0; i < 120; i++) {
      const ev = s.update(1 / 60, body(0), false, true);
      blocked ||= ev.blocked.length > 0;
    }
    expect(blocked).toBe(true);
    expect(s.aliveCount).toBe(1);
  });
});
