import { EnemyKind } from '../config';
import { EnemyTier } from './Loot';
import { RoomType } from './RunMap';

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  tier?: EnemyTier;
}

export interface Encounter {
  /** The player crossing this x locks the screen and starts the fight. */
  x: number;
  spawns: SpawnGroup[];
  label?: string;
}

/** The screen locks to this window (relative to the trigger x) while an encounter is live. */
export const REGION_LEFT = 300;
export const REGION_RIGHT = 660;

export function encounterRegion(e: { x: number }): { min: number; max: number } {
  return { min: e.x - REGION_LEFT, max: e.x + REGION_RIGHT };
}

export interface RoomPlan {
  type: RoomType;
  length: number;
  start: number;
  /** x where the exit portal stands. */
  exitX: number;
  encounters: Encounter[];
  /** Weak mobs standing around between fights: mow them down while running. */
  fodder: Array<{ x: number; groups: SpawnGroup[] }>;
  crates: number[];
  /** Interactable in non-combat rooms. */
  station?: { kind: 'chest' | 'campfire' | 'merchant'; x: number };
}

export const START_X = 200;

function range(rand: () => number, lo: number, hi: number): number {
  return Math.floor(lo + rand() * (hi - lo + 1));
}

function mix(rand: () => number, depthRoom: number, weight: number): SpawnGroup[] {
  // Rusher/guard share rises with depth; the rest is grunts
  const rushers = depthRoom >= 1 ? range(rand, 0, 1 + Math.floor(depthRoom / 3)) : 0;
  const guards = depthRoom >= 2 ? range(rand, 0, 1 + Math.floor(depthRoom / 4)) : 0;
  const grunts = Math.max(2, weight - rushers * 2 - guards * 2);
  const groups: SpawnGroup[] = [{ kind: 'grunt', count: grunts }];
  if (rushers) groups.push({ kind: 'rusher', count: rushers });
  if (guards) groups.push({ kind: 'guard', count: guards });
  return groups;
}

/** Weak mobs standing in the stretches between locked fights, so the run between fights is never empty. */
function fodderInGaps(encounters: Encounter[], exitX: number, rand: () => number): RoomPlan['fodder'] {
  const regions = encounters.map(encounterRegion);
  const bounds: Array<[number, number]> = [];
  let cursor = START_X + 350;
  for (const r of regions) {
    bounds.push([cursor, r.min - 120]);
    cursor = r.max + 120;
  }
  bounds.push([cursor, exitX - 250]);
  return bounds
    .filter(([a, b]) => b - a >= 160)
    .map(([a, b]) => ({ x: Math.round((a + b) / 2), groups: [{ kind: 'grunt' as const, count: range(rand, 4, 7), tier: 'fodder' as const }] }));
}

function cratesFor(length: number, exitX: number, count: number, rand: () => number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < count; i++) xs.push(Math.round(START_X + 300 + ((exitX - START_X - 500) * (i + 0.3 + rand() * 0.5)) / count));
  return xs.filter((x) => x < length - 250);
}

/** Lays out a room. `depth` = rooms cleared so far in the run (drives how nasty the mixes get). */
export function planRoom(type: RoomType, depth: number, rand: () => number): RoomPlan {
  switch (type) {
    case 'boss':
      return { type, length: 1300, start: 260, exitX: 1180, encounters: [], fodder: [], crates: [] };
    case 'treasure':
      return { type, length: 1500, start: START_X, exitX: 1380, encounters: [], fodder: [], crates: [500, 1100], station: { kind: 'chest', x: 760 } };
    case 'rest':
      return { type, length: 1500, start: START_X, exitX: 1380, encounters: [], fodder: [], crates: [1050], station: { kind: 'campfire', x: 760 } };
    case 'shop':
      return { type, length: 1500, start: START_X, exitX: 1380, encounters: [], fodder: [], crates: [], station: { kind: 'merchant', x: 760 } };
    case 'elite': {
      const length = 4400;
      const exitX = length - 160;
      const eliteKind: EnemyKind = rand() < 0.5 ? 'guard' : 'rusher';
      const other: EnemyKind = eliteKind === 'guard' ? 'rusher' : 'guard';
      const encounters: Encounter[] = [
        { x: 1300, spawns: [...mix(rand, depth, 6), { kind: eliteKind, count: 1, tier: 'elite' }], label: 'ELITE!' },
        { x: 2900, spawns: [...mix(rand, depth + 1, 7), { kind: other, count: 1, tier: 'elite' }], label: 'ELITE!' },
      ];
      return { type, length, start: START_X, exitX, encounters, fodder: fodderInGaps(encounters, exitX, rand), crates: cratesFor(length, exitX, 6, rand) };
    }
    default: {
      const n = rand() < 0.5 ? 3 : 2;
      const xs = n === 3 ? [1300, 2800, 4300] : [1300, 2900];
      const length = n === 3 ? 5800 : 4600;
      const exitX = length - 160;
      const encounters: Encounter[] = xs.map((x, i) => ({ x, spawns: mix(rand, depth + i, 5 + Math.floor(depth / 2) + i * 2) }));
      return { type, length, start: START_X, exitX, encounters, fodder: fodderInGaps(encounters, exitX, rand), crates: cratesFor(length, exitX, 7, rand) };
    }
  }
}

export function planEnemyTotal(plan: RoomPlan): number {
  const sum = (gs: SpawnGroup[]) => gs.reduce((a, g) => a + g.count, 0);
  return plan.encounters.reduce((a, e) => a + sum(e.spawns), 0) + plan.fodder.reduce((a, f) => a + sum(f.groups), 0);
}
