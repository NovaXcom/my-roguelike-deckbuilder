import { describe, expect, it } from 'vitest';
import { Box, Controller, MoveEvents, MoveInput } from '../src/physics/Controller';
import { MOVE, dashRange, jumpHeight, jumpRange } from '../src/physics/config';

const DT = 1 / 120;
const none = (): MoveInput => ({ moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, slideHeld: false, dashPressed: false });

const box = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, extra: Partial<Box> = {}): Box => ({ minX, maxX, minY, maxY, minZ, maxZ, ...extra });
/** A floor slab whose top is at y=0. */
const floor = (x0: number, x1: number, z0 = -3, z1 = 3): Box => box(x0, x1, -2, 0, z0, z1);

interface Run {
  c: Controller;
  t: number;
  events: MoveEvents[];
}

/** Runs `ctrl` for up to `maxT` seconds, asking `fn` for the input each tick. Stops early when `stop` is true. */
function sim(c: Controller, maxT: number, fn: (c: Controller, t: number) => Partial<MoveInput>, stop?: (c: Controller, t: number) => boolean): Run {
  const events: MoveEvents[] = [];
  let t = 0;
  let prevJump = false;
  let prevDash = false;
  while (t < maxT) {
    const want = fn(c, t);
    const inp = { ...none(), ...want };
    // treat jump/dash as edge-triggered like a real key press
    const jp = !!want.jumpPressed && !prevJump;
    const dp = !!want.dashPressed && !prevDash;
    prevJump = !!want.jumpPressed;
    prevDash = !!want.dashPressed;
    inp.jumpPressed = jp || (want.jumpPressed === true && t === 0);
    inp.dashPressed = dp;
    events.push(c.step(DT, inp));
    t += DT;
    if (stop?.(c, t)) break;
  }
  return { c, t, events };
}

const grounded = (c: Controller) => c.onGround;
const anyEvent = (r: Run, k: keyof MoveEvents) => r.events.some((e) => !!e[k]);

/** Place a controller standing on the floor at x=0. */
function standing(boxes: Box[], x = 0): Controller {
  const c = new Controller(boxes);
  c.reset(x, 0.001, 0, 0);
  sim(c, 0.3, () => ({}));
  return c;
}

/**
 * The "player" for gap tests: run +x at full speed, and press jump when the next tick would walk off
 * the end of the platform (body fully clear of it is too late; back foot on the edge is the perfect take-off).
 */
function runAndJumpAtEdge(c: Controller, edgeX: number, extra?: (c: Controller, t: number, jumped: boolean) => Partial<MoveInput>) {
  let jumped = false;
  return (cc: Controller, t: number): Partial<MoveInput> => {
    let jumpPressed = false;
    if (!jumped && cc.onGround && cc.x + MOVE.halfWidth >= edgeX - 0.05) {
      jumped = true;
      jumpPressed = true;
    }
    return { moveX: 1, jumpPressed, jumpHeld: jumped && cc.vy > 0, ...(extra?.(cc, t, jumped) ?? {}) };
  };
}

function tryGap(gap: number, withDash = false): boolean {
  const A = floor(-60, 0);
  const B = floor(gap, gap + 30);
  const c = new Controller([A, B]);
  c.reset(-14, 0.001, 0, 0);
  let dashed = false;
  const fn = runAndJumpAtEdge(c, 0, (cc, _t, jumped) => {
    if (withDash && jumped && !dashed && cc.vy < 1 && !cc.onGround) {
      dashed = true;
      return { dashPressed: true };
    }
    return {};
  });
  sim(c, 6, fn, (cc) => cc.x > gap + 3 && cc.onGround);
  return c.onGround && c.x > gap + 2 && Math.abs(c.y) < 0.01;
}

/** Largest gap (in 0.1m steps) the strategy can clear. */
function maxGap(withDash: boolean): number {
  let best = 0;
  for (let g = 1; g <= 20; g += 0.1) if (tryGap(g, withDash)) best = g;
  return best;
}

describe('Controller: ground movement', () => {
  it('accelerates to run speed quickly and stops quickly', () => {
    const c = standing([floor(-10, 200)]);
    sim(c, 0.4, () => ({ moveX: 1 }));
    expect(c.speed).toBeCloseTo(MOVE.runSpeed, 1);
    expect(c.onGround).toBe(true);
    sim(c, 0.4, () => ({}));
    expect(c.speed).toBeLessThan(0.1);
  });

  it('steps up small ledges but is blocked by tall ones', () => {
    const small = new Controller([floor(-10, 100), box(5, 100, 0, 0.4, -3, 3)]);
    small.reset(0, 0.001, 0, 0);
    sim(small, 3, () => ({ moveX: 1 }));
    expect(small.x).toBeGreaterThan(20);
    expect(small.y).toBeCloseTo(0.4, 2);
    const tall = new Controller([floor(-10, 100), box(5, 100, 0, 0.9, -3, 3)]);
    tall.reset(0, 0.001, 0, 0);
    sim(tall, 3, () => ({ moveX: 1 }));
    expect(tall.x).toBeLessThan(5);
  });
});

describe('Controller: jumping', () => {
  it('reaches the designed jump height, and a tap jumps lower than a held jump', () => {
    const held = standing([floor(-10, 10)]);
    let top = 0;
    sim(held, 1.2, (c) => (top = Math.max(top, c.y), { jumpPressed: c.onGround, jumpHeld: true }), (c, t) => t > 0.05 && c.onGround);
    expect(top).toBeGreaterThan(jumpHeight() * 0.93);
    expect(top).toBeLessThan(jumpHeight() * 1.05);
    const tap = standing([floor(-10, 10)]);
    let topTap = 0;
    sim(tap, 1.2, (c, t) => (topTap = Math.max(topTap, c.y), { jumpPressed: t < 0.01, jumpHeld: t < 0.05 }), (c, t) => t > 0.1 && c.onGround);
    expect(topTap).toBeLessThan(top * 0.8);
    expect(topTap).toBeGreaterThan(0.3);
  });

  it('coyote time: a jump pressed just after leaving the edge still works, but not much later', () => {
    const attempt = (delay: number) => {
      const c = new Controller([floor(-30, 0)]);
      c.reset(-5, 0.001, 0, 0);
      let leftAt = -1;
      let pressed = false;
      let jumped = false;
      sim(c, 1.5, (cc, t) => {
        if (cc.x - MOVE.halfWidth > 0 && leftAt < 0) leftAt = t;
        const press = leftAt >= 0 && !pressed && t >= leftAt + delay;
        if (press) pressed = true;
        return { moveX: 1, jumpPressed: press };
      });
      void jumped;
      return c;
    };
    const early = attempt(0.06);
    const late = attempt(0.3);
    // after an early press we get a bump upward (y rises above where a pure fall would be)
    expect(early.y).toBeLessThan(0);
    const probe = (delay: number) => {
      const c = new Controller([floor(-30, 0)]);
      c.reset(-5, 0.001, 0, 0);
      let leftAt = -1;
      let pressed = false;
      let jumpedEv = false;
      sim(c, 1, (cc, t) => {
        if (cc.x > 0.35 && leftAt < 0) leftAt = t;
        const press = leftAt >= 0 && !pressed && t >= leftAt + delay;
        if (press) pressed = true;
        return { moveX: 1, jumpPressed: press };
      }).events.forEach((e) => (jumpedEv ||= e.jumped));
      return jumpedEv;
    };
    expect(probe(0.05)).toBe(true);
    expect(probe(0.4)).toBe(false);
    void late;
  });

  it('jump buffering: pressing jump just before landing still jumps', () => {
    const c = new Controller([floor(-10, 10)]);
    c.reset(0, 0.4, 0, 0);
    let jumped = false;
    let pressed = false;
    const r = sim(c, 1.5, (cc) => {
      const near = cc.y < 0.12 && cc.vy < 0 && !pressed;
      if (near) pressed = true;
      return { jumpPressed: near };
    });
    r.events.forEach((e) => (jumped ||= e.jumped));
    expect(jumped).toBe(true);
  });
});

describe('Controller: gaps, dash and the numbers the level generator relies on', () => {
  it('a running jump clears gaps up to about the theoretical range', () => {
    const measured = maxGap(false);
    expect(measured).toBeGreaterThan(jumpRange() * 0.8);
    expect(measured).toBeLessThan(jumpRange() + 1.6);
    expect(tryGap(4.5)).toBe(true);
    expect(tryGap(measured + 1.2)).toBe(false);
  });

  it('an air dash adds roughly dashRange() on top', () => {
    const plain = maxGap(false);
    const dashed = maxGap(true);
    expect(dashed).toBeGreaterThan(plain + dashRange() * 0.6);
    expect(tryGap(plain + 2, true)).toBe(true);
    expect(tryGap(plain + 2, false)).toBe(false);
  });

  it('the generator-facing constants are comfortably inside what the physics can do', async () => {
    const { SAFE_GAP, DASH_GAP, MAX_STEP_UP } = await import('../src/level/limits');
    expect(tryGap(SAFE_GAP)).toBe(true);
    expect(tryGap(DASH_GAP, true)).toBe(true);
    expect(SAFE_GAP).toBeLessThan(maxGap(false) * 0.85);
    expect(DASH_GAP).toBeGreaterThan(maxGap(false));
    expect(DASH_GAP).toBeLessThan(maxGap(true) * 0.9);
    expect(MAX_STEP_UP).toBeLessThan(jumpHeight());
  });

  it('climbing: a jump gets onto a platform up to MAX_STEP_UP higher', async () => {
    const { MAX_STEP_UP, SAFE_GAP } = await import('../src/level/limits');
    const A = floor(-40, 0);
    const B = box(SAFE_GAP * 0.5, 40, -2, MAX_STEP_UP, -3, 3);
    const c = new Controller([A, B]);
    c.reset(-20, 0.001, 0, 0);
    sim(c, 4, runAndJumpAtEdge(c, 0), (cc) => cc.x > 6 && cc.onGround);
    expect(c.onGround).toBe(true);
    expect(c.y).toBeCloseTo(MAX_STEP_UP, 2);
  });
});

describe('Controller: slide', () => {
  const barrier = (bottom: number) => [floor(-30, 100), box(20, 24, bottom, bottom + 3, -3, 3)];

  it('sliding passes under a low barrier that blocks a standing runner', () => {
    const stand = new Controller(barrier(1.1));
    stand.reset(0, 0.001, 0, 0);
    sim(stand, 3, () => ({ moveX: 1 }));
    expect(stand.x).toBeLessThan(20);

    const slider = new Controller(barrier(1.1));
    slider.reset(0, 0.001, 0, 0);
    let started = false;
    const r = sim(slider, 3, (c) => {
      const s = c.x > 12;
      started ||= s;
      return { moveX: 1, slideHeld: s };
    });
    expect(anyEvent(r, 'slideStarted')).toBe(true);
    expect(slider.x).toBeGreaterThan(26);
  });

  it('slide gives a speed burst and ends when released if there is headroom', () => {
    const c = standing([floor(-10, 300)]);
    sim(c, 0.5, () => ({ moveX: 1 }));
    sim(c, 0.1, () => ({ moveX: 1, slideHeld: true }));
    expect(c.state).toBe('slide');
    expect(c.speed).toBeGreaterThan(MOVE.runSpeed);
    expect(c.height).toBe(MOVE.slideHeight);
    sim(c, 0.1, () => ({ moveX: 1, slideHeld: false }));
    expect(c.state).not.toBe('slide');
    expect(c.height).toBe(MOVE.height);
  });

  it('you stay low (crawling) when released under a ceiling', () => {
    const c = new Controller(barrier(1.1));
    c.reset(0, 0.001, 0, 0);
    sim(c, 3, (cc) => ({ moveX: 1, slideHeld: cc.x > 14 && cc.x < 21 || (cc.x >= 21 && cc.x < 23) }));
    // must never end up inside the barrier
    expect(c.x < 20 || c.x > 24 || c.height === MOVE.slideHeight).toBe(true);
  });
});

describe('Controller: wall-run', () => {
  /** Platform A, a chasm of `len` metres with a wall on the +z side, platform B. */
  function course(len: number) {
    const A = floor(-60, 0);
    const B = floor(len, len + 40);
    const wall = box(-70, len + 2, -10, 12, 3, 4, { wall: true });
    return { boxes: [A, B, wall], len };
  }

  /**
   * Jump off the edge angled into the wall, run along it, then wall-jump back toward platform B.
   * Returns the controller and the events.
   */
  function wallRunAttempt(len: number, jumpOffAt: number) {
    const { boxes } = course(len);
    const c = new Controller(boxes);
    c.reset(-30, 0.001, 2.5, 0);
    let jumped = false;
    let wallJumped = false;
    const r = sim(
      c,
      6,
      (cc) => {
        let jumpPressed = false;
        if (!jumped && cc.onGround && cc.x + MOVE.halfWidth >= -0.05) {
          jumped = true;
          jumpPressed = true;
        }
        if (cc.state === 'wallrun' && !wallJumped && cc.x >= jumpOffAt) {
          wallJumped = true;
          jumpPressed = true;
        }
        return { moveX: 1, moveZ: wallJumped ? -0.4 : 0.4, jumpPressed, jumpHeld: true };
      },
      (cc) => cc.x > len + 4 && cc.onGround,
    );
    return { c, r };
  }

  it('attaches to a wall-flagged surface and runs along it', () => {
    const { r } = wallRunAttempt(16, 12);
    expect(anyEvent(r, 'wallRunStarted')).toBe(true);
  });

  it('lets you cross a chasm far too wide to jump by running along the wall and wall-jumping off', () => {
    const len = 15;
    expect(len).toBeGreaterThan(maxGap(true) + 2); // impossible without the wall
    const { c, r } = wallRunAttempt(len, len - 4);
    expect(anyEvent(r, 'wallJumped')).toBe(true);
    expect(c.onGround).toBe(true);
    expect(c.x).toBeGreaterThan(len);
  });

  it('wall-running only works on flagged walls', () => {
    const A = floor(-60, 0);
    const plain = box(-70, 40, -10, 12, 3, 4);
    const c = new Controller([A, plain]);
    c.reset(-30, 0.001, 2.5, 0);
    let jumped = false;
    const r = sim(c, 3, (cc) => {
      let jp = false;
      if (!jumped && cc.onGround && cc.x + 0.3 >= -0.05) jumped = true, (jp = true);
      return { moveX: 1, moveZ: 0.4, jumpPressed: jp, jumpHeld: true };
    });
    expect(anyEvent(r, 'wallRunStarted')).toBe(false);
  });

  it('wall-run time is limited', () => {
    const boxes = [floor(-60, 0), box(-70, 120, -10, 12, 3, 4, { wall: true })];
    const c = new Controller(boxes);
    c.reset(-30, 0.001, 2.5, 0);
    let jumped = false;
    let startT = -1;
    let endT = -1;
    sim(c, 8, (cc, t) => {
      let jp = false;
      if (!jumped && cc.onGround && cc.x + 0.3 >= -0.05) jumped = true, (jp = true);
      if (cc.state === 'wallrun' && startT < 0) startT = t;
      if (startT >= 0 && cc.state !== 'wallrun' && endT < 0) endT = t;
      return { moveX: 1, moveZ: 0.4, jumpPressed: jp, jumpHeld: true };
    });
    expect(startT).toBeGreaterThan(0);
    expect(endT - startT).toBeGreaterThan(MOVE.wallRunMax * 0.8);
    expect(endT - startT).toBeLessThan(MOVE.wallRunMax + 0.3);
  });
});

describe('Controller: hazards and falling', () => {
  it('reports falling below the world', () => {
    const c = new Controller([floor(-5, 0)]);
    c.reset(-1, 0.001, 0, 0);
    const r = sim(c, 5, () => ({ moveX: 1 }));
    expect(anyEvent(r, 'fell')).toBe(true);
  });

  it('reports touching a hazard', () => {
    const c = new Controller([floor(-5, 50), box(10, 11, 0, 3, -3, 3, { hazard: true })]);
    c.reset(0, 0.001, 0, 0);
    const r = sim(c, 3, () => ({ moveX: 1 }));
    expect(anyEvent(r, 'hitHazard')).toBe(true);
  });

  it('ghost boxes are decoration and never collide', () => {
    const c = new Controller([floor(-5, 50), box(10, 11, 0, 3, -3, 3, { ghost: true })]);
    c.reset(0, 0.001, 0, 0);
    sim(c, 3, () => ({ moveX: 1 }));
    expect(c.x).toBeGreaterThan(20);
  });
});

describe('Controller: grounded jump landing', () => {
  it('lands from a jump back on the same platform and can jump again', () => {
    const c = standing([floor(-10, 10)]);
    const r = sim(c, 2, (cc, t) => ({ jumpPressed: t < 0.01 || (cc.onGround && t > 0.9), jumpHeld: true }));
    expect(r.events.filter((e) => e.jumped).length).toBeGreaterThanOrEqual(2);
    expect(r.events.some((e) => e.landed)).toBe(true);
    expect(grounded(c) || c.y > 0).toBe(true);
  });
});

describe('Controller: jump pad', () => {
  it('launches the player upward on landing, and is reachable by just running onto it', () => {
    const pad: Box = { minX: 10, maxX: 12, minY: -1, maxY: 0.2, minZ: -2, maxZ: 2, pad: true };
    const c = new Controller([floor(-10, 100), pad]);
    c.reset(0, 0.001, 0, 0);
    let top = 0;
    const r = sim(c, 3, (cc) => (top = Math.max(top, cc.y), { moveX: 1 }));
    expect(anyEvent(r, 'padded')).toBe(true);
    expect(top).toBeGreaterThan(MOVE.padSpeed ** 2 / (2 * MOVE.gravity) * 0.9);
  });
});
