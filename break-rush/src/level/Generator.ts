import { Box } from '../physics/Controller';
import { MOVE } from '../physics/config';
import { Rng } from '../game/Rng';
import { DASH_GAP, MAX_STEP_UP, SAFE_GAP } from './limits';

export type EnemyType = 'gunner' | 'charger' | 'drone' | 'shield';
export interface EnemySpawn {
  type: EnemyType;
  x: number;
  y: number;
  z: number;
}
export type RouteAct = 'run' | 'jump' | 'jumpdash' | 'slide' | 'wallrun' | 'walljump';
/** The intended line through the level. The autopilot (and the tests) follow it to prove it is completable. */
export interface Waypoint {
  x: number;
  z: number;
  act: RouteAct;
}
export interface Checkpoint {
  x: number;
  y: number;
  z: number;
}
export interface Level {
  seed: number;
  boxes: Box[];
  route: Waypoint[];
  enemies: EnemySpawn[];
  checkpoints: Checkpoint[];
  start: Checkpoint;
  finish: Checkpoint;
  length: number;
  /** Seconds a clean run should take; used for ranks. */
  parTime: number;
  modules: string[];
  /** Arenas lock their exit (boxes[gate]) until every listed enemy is dead. */
  arenas: { gate: number; ids: number[] }[];
  themeId: number;
}

export type ModuleName = 'pad' | 'crumble' | 'run' | 'gap' | 'dashgap' | 'climb' | 'slide' | 'wallrun' | 'pillars' | 'laser' | 'highlaser' | 'arena' | 'drop';

interface Cursor {
  x: number;
  y: number;
}

const FLOOR_DEPTH = 4;
const LANE = 3;

export interface GenOptions {
  stage: number; // 1..5 (daily runs pass 5)
  modules?: number;
  enemies?: boolean;
  theme?: number;
}

/** Which modules may appear at a given stage. Each stage has its own flavour. */
export function poolForStage(stage: number): ModuleName[] {
  switch (stage) {
    case 1: return ['run', 'gap', 'gap', 'climb', 'laser', 'slide', 'pillars', 'arena'];
    case 2: return ['gap', 'climb', 'slide', 'highlaser', 'laser', 'pad', 'pad', 'drop', 'arena', 'dashgap'];
    case 3: return ['gap', 'climb', 'pillars', 'crumble', 'crumble', 'wallrun', 'pad', 'slide', 'arena', 'drop', 'highlaser'];
    case 4: return ['dashgap', 'crumble', 'pad', 'wallrun', 'wallrun', 'drop', 'highlaser', 'arena', 'pillars', 'climb'];
    default: return ['run', 'gap', 'dashgap', 'climb', 'drop', 'slide', 'laser', 'highlaser', 'pillars', 'wallrun', 'pad', 'crumble', 'arena', 'arena'];
  }
}

/** Enemy kinds that can appear at a stage. */
export function enemyKinds(stage: number): EnemyType[] {
  if (stage <= 1) return ['gunner'];
  if (stage === 2) return ['gunner', 'charger'];
  if (stage === 3) return ['gunner', 'charger', 'drone'];
  return ['gunner', 'charger', 'drone', 'shield'];
}

export function generateLevel(seed: number, opts: GenOptions): Level {
  const rng = new Rng(seed * 7919 + opts.stage * 104729);
  const boxes: Box[] = [];
  const route: Waypoint[] = [];
  const enemies: EnemySpawn[] = [];
  const checkpoints: Checkpoint[] = [];
  const modules: string[] = [];
  const cur: Cursor = { x: 0, y: 0 };
  const withEnemies = opts.enemies !== false;

  const floor = (x0: number, x1: number, top: number, halfW = LANE) => {
    const b: Box = { minX: x0, maxX: x1, minY: top - FLOOR_DEPTH, maxY: top, minZ: -halfW, maxZ: halfW, tag: 'floor' };
    boxes.push(b);
    return b;
  };
  const wp = (x: number, z: number, act: RouteAct = 'run') => route.push({ x, z, act });

  // spawn platform
  floor(-8, 8, 0);
  const start: Checkpoint = { x: 0, y: 0, z: 0 };
  checkpoints.push({ ...start });
  cur.x = 8;
  wp(8, 0);

  const arenas: { gate: number; ids: number[] }[] = [];
  const kinds = enemyKinds(opts.stage);
  const enemyAt = (type: EnemyType, x: number, y: number, z: number): number => {
    if (!withEnemies) return -1;
    enemies.push({ type, x, y, z });
    return enemies.length - 1;
  };

  const mods: Record<ModuleName, () => void> = {
    run: () => {
      const len = rng.range(10, 16);
      floor(cur.x, cur.x + len, cur.y);
      if (opts.stage >= 2 && rng.next() < 0.6) enemyAt('gunner', cur.x + len - 1.5, cur.y, rng.range(-1.5, 1.5));
      cur.x += len;
      wp(cur.x - 0.5, 0);
    },
    gap: () => {
      const g = rng.range(2.5, SAFE_GAP);
      const edge = cur.x;
      wp(edge, 0, 'jump');
      cur.x += g;
      const len = rng.range(6, 9);
      floor(cur.x, cur.x + len, cur.y);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    dashgap: () => {
      const edge = cur.x;
      wp(edge, 0, 'jumpdash');
      cur.x += DASH_GAP;
      const len = rng.range(8, 11);
      floor(cur.x, cur.x + len, cur.y);
      if (opts.stage >= 3 && rng.next() < 0.5) enemyAt('gunner', cur.x + len - 1.5, cur.y, 0);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    climb: () => {
      const h = rng.range(1.2, MAX_STEP_UP);
      const edge = cur.x;
      wp(edge, 0, 'jump');
      cur.x += SAFE_GAP * 0.5;
      cur.y += h;
      const len = rng.range(7, 10);
      floor(cur.x, cur.x + len, cur.y);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    drop: () => {
      const h = rng.range(2, 4);
      const edge = cur.x;
      wp(edge, 0, 'jump');
      cur.x += rng.range(2, SAFE_GAP * 0.8);
      cur.y -= h;
      const len = rng.range(8, 11);
      floor(cur.x, cur.x + len, cur.y);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    slide: () => {
      const len = 16;
      floor(cur.x, cur.x + len, cur.y);
      // low ceiling to slide under
      boxes.push({ minX: cur.x + 6, maxX: cur.x + 10, minY: cur.y + 1.1, maxY: cur.y + 4, minZ: -LANE - 0.5, maxZ: LANE + 0.5, tag: 'ceiling' });
      wp(cur.x + 3.5, 0, 'slide');
      wp(cur.x + 10.5, 0, 'run');
      cur.x += len;
      wp(cur.x - 0.5, 0);
    },
    laser: () => {
      const len = 14;
      floor(cur.x, cur.x + len, cur.y);
      const hx = cur.x + 7;
      boxes.push({ minX: hx, maxX: hx + 0.4, minY: cur.y, maxY: cur.y + 0.6, minZ: -LANE, maxZ: LANE, hazard: true });
      wp(hx - 1.6, 0, 'jump');
      cur.x += len;
      wp(cur.x - 0.5, 0);
    },
    highlaser: () => {
      const len = 16;
      floor(cur.x, cur.x + len, cur.y);
      const hx = cur.x + 8;
      boxes.push({ minX: hx, maxX: hx + 0.4, minY: cur.y + 0.95, maxY: cur.y + 1.3, minZ: -LANE, maxZ: LANE, hazard: true });
      wp(hx - 4.5, 0, 'slide');
      wp(hx + 1.5, 0, 'run');
      cur.x += len;
      wp(cur.x - 0.5, 0);
    },
    pillars: () => {
      const n = rng.int(4, 6);
      const w = 3;
      const gap = rng.range(3, SAFE_GAP * 0.85);
      for (let i = 0; i < n; i++) {
        const z = i % 2 === 0 ? 0 : rng.pick([-1, 1]);
        // a pillar is a narrower floor centred on z
        const b: Box = { minX: cur.x, maxX: cur.x + w, minY: cur.y - FLOOR_DEPTH, maxY: cur.y, minZ: z - 1.5, maxZ: z + 1.5, tag: 'pillar' };
        boxes.push(b);
        wp(cur.x + w * 0.4, z);
        wp(cur.x + w, z, 'jump');
        cur.x += w + gap;
      }
      // landing
      const len = rng.range(7, 9);
      floor(cur.x, cur.x + len, cur.y);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    wallrun: () => {
      const lead = 8;
      const chasm = rng.range(12, 15);
      const tail = 7;
      const x0 = cur.x;
      floor(x0, x0 + lead, cur.y);
      floor(x0 + lead + chasm, x0 + lead + chasm + tail, cur.y);
      boxes.push({ minX: x0 - 1, maxX: x0 + lead + chasm + tail, minY: cur.y - 12, maxY: cur.y + 12, minZ: LANE, maxZ: LANE + 1, wall: true });
      wp(x0 + 1.5, 2.75);
      wp(x0 + lead, 2.75, 'wallrun');
      wp(x0 + lead + chasm - 4, 2.75, 'walljump');
      wp(x0 + lead + chasm + 3, 0);
      cur.x = x0 + lead + chasm + tail;
      wp(cur.x - 1, 0);
    },
    pad: () => {
      const lead = rng.range(7, 9);
      floor(cur.x, cur.x + lead, cur.y);
      boxes.push({ minX: cur.x + lead - 1.5, maxX: cur.x + lead, minY: cur.y - 1, maxY: cur.y + 0.25, minZ: -1.6, maxZ: 1.6, pad: true, tag: 'pad' });
      wp(cur.x + lead - 0.5, 0);
      const rise = rng.range(1, 3);
      cur.x += lead + 7;
      cur.y += rise;
      const len = rng.range(11, 13);
      floor(cur.x, cur.x + len, cur.y);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    crumble: () => {
      const n = rng.int(4, 6);
      const w = 3.2;
      for (let i = 0; i < n; i++) {
        if (i === 0) wp(cur.x, 0, 'jump');
        cur.x += i === 0 ? rng.range(2.5, 3) : rng.range(2.6, SAFE_GAP * 0.8);
        boxes.push({ minX: cur.x, maxX: cur.x + w, minY: cur.y - FLOOR_DEPTH, maxY: cur.y, minZ: -2.5, maxZ: 2.5, crumble: true, tag: 'crumble' });
        wp(cur.x + w * 0.3, 0);
        wp(cur.x + w, 0, 'jump');
        cur.x += w;
      }
      cur.x += rng.range(2.6, SAFE_GAP * 0.8);
      const len = rng.range(7, 9);
      floor(cur.x, cur.x + len, cur.y);
      cur.x += len;
      wp(cur.x - 1, 0);
    },
    arena: () => {
      const len = 24;
      const hw = 8;
      floor(cur.x, cur.x + len, cur.y, hw);
      // cover blocks
      for (let i = 0; i < 3; i++) {
        const bx = cur.x + 6 + i * 6;
        const bz = rng.pick([-4, 4]);
        boxes.push({ minX: bx, maxX: bx + 1.6, minY: cur.y, maxY: cur.y + 1.4, minZ: bz - 0.8, maxZ: bz + 0.8, tag: 'cover' });
      }
      const n = Math.min(2 + opts.stage, 7);
      const ids: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = kinds[(i + rng.int(0, 2)) % kinds.length];
        ids.push(enemyAt(t, cur.x + 8 + (i * 14) / n, cur.y + (t === 'drone' ? 2.6 : 0), rng.range(-6, 6)));
      }
      if (withEnemies) {
        // the exit stays shut until the arena is clear
        boxes.push({ minX: cur.x + len - 1.2, maxX: cur.x + len - 0.8, minY: cur.y, maxY: cur.y + 7, minZ: -hw, maxZ: hw, tag: 'gate' });
        arenas.push({ gate: boxes.length - 1, ids });
      }
      cur.x += len;
      wp(cur.x - 0.5, 0);
    },
  };

  const pool = poolForStage(opts.stage);
  const count = opts.modules ?? 7 + opts.stage * 2;
  let sinceCp = 0;
  let last: ModuleName | null = null;
  for (let i = 0; i < count; i++) {
    let m = rng.pick(pool);
    for (let k = 0; k < 4 && m === last; k++) m = rng.pick(pool);
    // each special module needs a solid approach: make sure we begin on a platform
    mods[m]();
    modules.push(m);
    last = m;
    sinceCp++;
    if (sinceCp >= 3 && i < count - 1) {
      const len = 6;
      floor(cur.x, cur.x + len, cur.y);
      checkpoints.push({ x: cur.x + len / 2, y: cur.y, z: 0 });
      cur.x += len;
      wp(cur.x - 0.5, 0);
      sinceCp = 0;
    }
  }
  // finish
  const fl = 10;
  floor(cur.x, cur.x + fl, cur.y);
  const finish: Checkpoint = { x: cur.x + fl / 2, y: cur.y, z: 0 };
  wp(finish.x, 0);

  // par: path length at ~80% of run speed
  let pathLen = 0;
  for (let i = 1; i < route.length; i++) pathLen += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  const parTime = pathLen / (MOVE.runSpeed * 0.85) + 6;
  return { seed, boxes, route, enemies, checkpoints, start, finish, length: finish.x, parTime, modules, arenas, themeId: opts.theme ?? (opts.stage - 1) % 5 };
}
